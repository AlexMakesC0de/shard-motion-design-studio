import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "kie-cut-")));
const RUNS = join(tmp, "runs");
process.env.KIE_RUNS_DIR = RUNS;
process.env.KIE_LIBRARY_DIR = join(tmp, "library");
mkdirSync(RUNS, { recursive: true });

const { EXIT } = await import("../cli/lib/errors.mjs");
const { probe } = await import("../cli/lib/ffmpeg.mjs");
const { loadCatalog } = await import("../cli/lib/models.mjs");
const { openJobs } = await import("../cli/core/jobs.mjs");
const { saveBrief } = await import("../cli/director/brief.mjs");
const { savePlan, readPlan } = await import("../cli/director/plan.mjs");
const { cutPlan, cutFilm } = await import("../cli/director/cut.mjs");
const { saveReview, readReviews, reviewShot } = await import("../cli/director/review.mjs");
const { shotMedia } = await import("../cli/director/media.mjs");

const catalog = loadCatalog();
const brief = { takeaway: "Calm mornings", durationS: 9, aspectRatio: "16:9", filmType: "live-action" };
const look = { palette: "teal", grade: "soft", filmLook: "35mm grain", lensFamily: "anamorphic", keyLightSide: "left" };
const shot = (id, durationS, extra = {}) => ({
  id, durationS, purpose: "p", subject: id, action: "Waves roll under the pier", why: "w",
  size: "wide", angle: "eye-level", lens: "35mm", depth: "deep", move: { type: "truck-left", speed: "slow" },
  light: "golden-hour", cut: "hard", job: "cinematic", screenDirection: "none", checks: ["the pier reads"], ...extra,
});
const plan = () => ({ look, shots: [shot("s1", 3, { cut: "dissolve" }), shot("s2", 3, { size: "medium" }), shot("s3", 3, { size: "close-up", lens: "85mm", cut: "fade-out" })] });

/** A synthetic take, `seconds` long, with or without a tone. */
function clip(path, seconds, { audio = false } = {}) {
  const args = ["-hide_banner", "-y", "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=320x180:rate=24`];
  if (audio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:a", "aac");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(seconds), path);
  execFileSync("ffmpeg", args, { stdio: "ignore" });
}

const store = openJobs(join(tmp, "jobs"));
function take(film, shotId, file, seconds, opts) {
  clip(join(RUNS, film, file), seconds, opts);
  const j = store.create({ run: film, shot: shotId, stage: "take", capability: "video", model: "seedance-2-5", provider: "kie", estimateUsd: 1 });
  store.transition(j.id, "sending");
  store.transition(j.id, "submitted", { upstreamTaskId: "t" });
  return store.transition(j.id, "succeeded", { artifacts: [join(RUNS, film, file)] });
}

describe("the cut plan", () => {
  const p = plan();
  const media = { s1: { take: "s1-take.mp4" }, s2: { take: "s2-take.mp4" }, s3: { take: "s3-take.mp4" } };
  const lengths = { "s1-take.mp4": 4, "s2-take.mp4": 4, "s3-take.mp4": 4 };

  test("each take trimmed to its planned length past the pad; joins from the plan's cuts", () => {
    const c = cutPlan(p, media, {}, lengths);
    assert.deepEqual(c.segments.map((s) => [s.shot, s.file, s.startS, s.durationS]), [
      ["s1", "s1-take.mp4", 0.5, 3],
      ["s2", "s2-take.mp4", 0.5, 3],
      ["s3", "s3-take.mp4", 0.5, 3],
    ]);
    assert.deepEqual(c.joins, [{ after: "s1", type: "xfade", transition: "fade", durationS: 0.5 }, { after: "s2", type: "cut" }]);
    assert.equal(c.fadeOutS, 0.8);
    assert.equal(c.totalS, 8.5);
  });

  test("a reviewed best window wins, and a window past the end is pulled back", () => {
    const c = cutPlan(p, media, { s2: { take: "s2-take.mp4", bestWindow: { startS: 0.9 } }, s3: { take: "s3-take.mp4", bestWindow: { startS: 3.5 } } }, lengths);
    assert.equal(c.segments[1].startS, 0.9);
    assert.equal(c.segments[2].startS, 1);
  });

  test("a review of an older take is ignored", () => {
    const c = cutPlan(p, media, { s2: { take: "s2-take-2.mp4", bestWindow: { startS: 0.9 } } }, lengths);
    assert.equal(c.segments[1].startS, 0.5);
  });

  test("a take shorter than its shot is used whole, and the note says so", () => {
    const c = cutPlan(p, media, {}, { ...lengths, "s2-take.mp4": 2 });
    assert.deepEqual([c.segments[1].startS, c.segments[1].durationS], [0, 2]);
    assert.match(c.notes.join(), /s2's take is 2s; the shot is planned at 3s/);
  });

  test("a take judged redo, or not reviewed, is still cut but named", () => {
    const reviews = { s1: { take: "s1-take.mp4", verdict: "pass" }, s2: { take: "s2-take.mp4", verdict: "redo" }, s3: { take: "s3-take-old.mp4", verdict: "pass" } };
    const c = cutPlan(p, media, reviews, lengths);
    assert.equal(c.segments.length, 3);
    assert.match(c.notes.join("\n"), /^s2's take was judged redo; this cut uses it until it is refilmed\.$/m);
    assert.match(c.notes.join("\n"), /^s3's take has not been reviewed\.$/m);
    assert.doesNotMatch(c.notes.join("\n"), /s1/);
  });

  test("shots without a take are named, and nothing is cut", () => {
    assert.throws(() => cutPlan(p, { ...media, s2: { take: null } }, {}, lengths), (e) => e.code === EXIT.USAGE && /s2 has no take yet/.test(e.message));
  });

  test("lip-sync shots keep their sound; copy is listed for the code renderer", () => {
    const q = plan();
    q.shots[1] = shot("s2", 3, { size: "medium", job: "lip-sync", line: "Hello there.", copy: ["Free for 14 days"] });
    const c = cutPlan(q, media, {}, lengths);
    assert.deepEqual(c.segments.map((s) => s.keepAudio), [false, true, false]);
    assert.match(c.notes.join(), /s2 has on-screen copy/);
  });
});

describe("the editor pass", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  test("cuts real takes into film.mp4 at the film's size, records cut.json, and numbers a second cut", async () => {
    saveBrief("sea", brief);
    savePlan(catalog, "sea", plan());
    take("sea", "s1", "s1-take.mp4", 4);
    take("sea", "s2", "s2-take.mp4", 4, { audio: true });
    take("sea", "s3", "s3-take.mp4", 4);
    const r = await cutFilm("sea", { store });
    assert.equal(r.out, join(RUNS, "sea", "film.mp4"));
    const info = await probe(r.out);
    assert.equal(info.width, 1920);
    assert.equal(info.height, 1080);
    assert.ok(Math.abs(info.durationS - 8.5) < 0.2, `film is ${info.durationS}s`);
    assert.equal(info.hasAudio, true, "a silent track keeps every player happy");
    const record = JSON.parse(readFileSync(join(RUNS, "sea", "cut.json"), "utf8"));
    assert.equal(record.out, "film.mp4");
    assert.deepEqual(record.segments.map((s) => s.shot), ["s1", "s2", "s3"]);
    const again = await cutFilm("sea", { store });
    assert.equal(again.out, join(RUNS, "sea", "film-2.mp4"));
  });
});

describe("review", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  test("the contact sheet and frames of the take a shot uses", async () => {
    const r = await reviewShot("sea", "s1", { store });
    assert.equal(r.take, "s1-take.mp4");
    assert.deepEqual(r.checks, ["the pier reads"]);
    assert.ok(existsSync(r.sheet) && existsSync(r.first) && existsSync(r.last));
  });

  test("a verdict is checked, saved against its take, and read back", () => {
    assert.throws(() => saveReview("sea", "s1", { verdict: "maybe", checks: [] }), /verdict must be pass or redo/);
    assert.throws(() => saveReview("sea", "s1", { verdict: "pass", checks: [{ check: "the pier reads" }] }), /each check needs ok/);
    const media = shotMedia(store, "sea", readPlan("sea"));
    const saved = saveReview("sea", "s1", { verdict: "redo", checks: [{ check: "the pier reads", ok: false, note: "the pier melts at 2s" }], bestWindow: { startS: 0.7 } }, { take: media.s1.take });
    assert.equal(saved.take, "s1-take.mp4");
    assert.deepEqual(readReviews("sea").s1.checks, [{ check: "the pier reads", ok: false, note: "the pier melts at 2s" }]);
  });
});
