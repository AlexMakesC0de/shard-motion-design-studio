import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "kie-director-cli-")));
const KIE = new URL("../cli/kie.mjs", import.meta.url).pathname;
const env = { ...process.env, KIE_RUNS_DIR: join(tmp, "runs"), KIE_LIBRARY_DIR: join(tmp, "library"), KIE_LIMITS_FILE: join(tmp, "limits.json") };
mkdirSync(env.KIE_RUNS_DIR);
const kie = (...args) => {
  const r = spawnSync(process.execPath, [KIE, ...args], { env, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const file = (name, data) => {
  const p = join(tmp, name);
  writeFileSync(p, JSON.stringify(data));
  return p;
};

const look = { palette: "teal", grade: "soft", filmLook: "35mm grain", lensFamily: "anamorphic", keyLightSide: "left" };
const shot = (id, durationS, extra = {}) => ({
  id, durationS, purpose: "p", subject: "mara", action: "Mara walks along the pier", why: "w",
  size: "wide", angle: "eye-level", lens: "35mm", depth: "deep", move: { type: "truck-left", speed: "slow" },
  light: "overcast", cut: "hard", job: "cinematic", screenDirection: "left-to-right", checks: ["ok"], ...extra,
});

describe("kie brief and kie plan", () => {
  test("a plan before a brief is refused with code 1", () => {
    const r = kie("plan", "--run", "sea", "--file", file("p.json", { look, shots: [shot("s1", 10)] }));
    assert.equal(r.code, 1);
    assert.match(r.err, /runs\/sea has no brief yet/);
  });

  test("brief --file saves and shows it", () => {
    const r = kie("brief", "--run", "sea", "--file", file("b.json", { takeaway: "Calm mornings", durationS: 10, aspectRatio: "16:9", filmType: "live-action" }));
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^saved runs\/sea\/brief\.json\ntakeaway: Calm mornings\nfilm:     10s 16:9 live-action\n/);
  });

  test("plan --file saves a sound plan and prints shots, checker and cost", () => {
    const r = kie("plan", "--run", "sea", "--file", file("p.json", { look, shots: [shot("s1", 4), shot("s2", 6, { size: "close-up", lens: "85mm", screenDirection: "none" })] }));
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^saved runs\/sea\/shots\.json \(v1\)\nsea · v1 · 2 shot\(s\) · 10s of 10s · 16:9 live-action\n/);
    assert.match(r.out, /film: {2}seedance-2-5 5s \$\d+\.\d\d {2}\(S tier for cinematic\.\)/);
    assert.match(r.out, /\nerrors: none\n/);
    assert.match(r.out, /\ncost: stills \$\d+\.\d\d \+ film \$\d+\.\d\d = \$\d+\.\d\d\n/);
  });

  test("a bad plan file exits 1 with every reason; a file that is not JSON says so", () => {
    const r = kie("plan", "--run", "sea", "--file", file("bad.json", { look: {}, shots: [] }));
    assert.equal(r.code, 1);
    assert.match(r.err, /look\.palette is missing[\s\S]*The plan has no shots\./);
    writeFileSync(join(tmp, "torn.json"), "{");
    assert.match(kie("plan", "--run", "sea", "--file", join(tmp, "torn.json")).err, /torn\.json is not valid JSON/);
  });

  test("--json gives brief, plan, check and cost", () => {
    const r = kie("plan", "--run", "sea", "--json");
    const j = JSON.parse(r.out);
    assert.deepEqual(Object.keys(j), ["brief", "plan", "check", "cost"]);
    assert.equal(j.plan.version, 1);
  });

  test("--file with --json keeps stdout pure JSON", () => {
    const r = kie("plan", "--run", "sea", "--json", "--file", file("p2.json", { look, shots: [shot("s1", 4), shot("s2", 6, { size: "close-up", lens: "85mm", screenDirection: "none" })] }));
    assert.equal(r.code, 0, r.err);
    assert.equal(JSON.parse(r.out).plan.version, 2);
    assert.match(r.err, /saved runs\/sea\/shots\.json \(v2\)/);
  });

  test("--wording prints each shot's prompt and the params to pass", () => {
    const r = kie("plan", "--run", "sea", "--wording", "--shot", "s1");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /── s1 · seedance-2-5 · seedance · \d+\/6000 chars\n/);
    assert.match(r.out, /Shot 1: The camera slowly trucks left after the subject, starting late as they turn and walk off in profile, and catching up until they are back in the centre, wide shot/);
    assert.match(r.out, /--param generate_audio=false/);
    assert.doesNotMatch(r.out, /── s2/);
  });

  test("--suggest gives the pick and its reason", () => {
    const r = kie("plan", "--run", "sea", "--suggest");
    assert.match(r.out, /^s1 {2}film: seedance-2-5 \$\d+\.\d\d {2}S tier for cinematic\./m);
    assert.match(r.out, /still: nano-banana-2 {2}Nano Banana 2 for photoreal people and places\./);
  });

  test("--menu lists the groups; an unknown shot names the real ones", () => {
    assert.match(kie("plan", "--menu").out, /\nsizes\n {2}extreme-wide {7}/);
    const r = kie("plan", "--run", "sea", "--wording", "--shot", "s9");
    assert.equal(r.code, 3);
    assert.match(r.err, /No shot "s9"\. Shots: s1, s2/);
  });
});

describe("kie shots, film, review and cut", () => {
  test("film all without --max-usd is refused before anything is read from a provider", () => {
    const r = kie("film", "--run", "sea");
    assert.equal(r.code, 1);
    assert.match(r.err, /max_usd \(--max-usd\)/);
    assert.equal(kie("film", "--run", "sea", "--max-usd", "lots").code, 1);
  });

  test("shots lists each shot with no still and no take yet", () => {
    const r = kie("shots", "--run", "sea");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^sea · v2 · 2 shot\(s\)\ns1 {2}4s {2}no still · no take\ns2 {2}6s {2}no still · no take\n/);
  });

  test("filming before the stills names the shots that need one", () => {
    const r = kie("film", "--run", "sea", "--max-usd", "50");
    assert.equal(r.code, 1);
    assert.match(r.err, /Every shot needs its still before filming: s1, s2/);
  });

  test("auto-redo needs the total to switch on, and shows on the storyboard", () => {
    let r = kie("auto-redo", "on", "--run", "sea");
    assert.equal(r.code, 1);
    assert.match(r.err, /Auto-redo needs max_usd/);
    r = kie("auto-redo", "on", "--run", "sea", "--max-usd", "6");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /auto-redo on for sea: .*up to 2 times a shot, .*within \$6\.00 in all/);
    assert.match(kie("shots", "--run", "sea").out, /auto-redo on: up to 2 redos a shot, takes within \$6\.00 in all/);
    r = kie("auto-redo", "off", "--run", "sea");
    assert.equal(r.code, 0, r.err);
    assert.doesNotMatch(kie("shots", "--run", "sea").out, /auto-redo/);
  });

  test("kie still confines the style still to the allowed folders, links included", async () => {
    const { png } = await import("./fixtures/images.mjs");
    writeFileSync(join(tmp, "outside.png"), png(1280, 720));
    assert.equal(kie("brief", "--run", "styled", "--file", file("sb.json", { takeaway: "Calm", durationS: 4, aspectRatio: "16:9", filmType: "live-action" })).code, 0);
    const r0 = kie("plan", "--run", "styled", "--file", file("sp.json", { look: { ...look, styleStill: "look.png" }, shots: [shot("s1", 4)] }));
    assert.equal(r0.code, 0, r0.err);
    symlinkSync(join(tmp, "outside.png"), join(env.KIE_RUNS_DIR, "styled", "look.png"));
    // No key anywhere, so nothing could reach a provider even before the refusal.
    const r = spawnSync(process.execPath, [KIE, "still", "--run", "styled", "--shot", "s1", "--dry-run"], { env: { ...env, HOME: tmp, KIE_API_KEY: "", WAVESPEED_API_KEY: "" }, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /outside the folders files may be read from/);
  });

  test("kie still --no-wait makes only the still that sets the look when none exists yet", () => {
    // No key anywhere: the one submit is refused locally, after the choice is made.
    const r = spawnSync(process.execPath, [KIE, "still", "--run", "sea", "--no-wait"], { env: { ...env, HOME: tmp, KIE_API_KEY: "", WAVESPEED_API_KEY: "" }, encoding: "utf8" });
    assert.match(r.stderr, /s1's still sets the look for the rest, so only it is made now\. Once it lands, run kie still --run sea again for s2\./);
    assert.equal(r.stderr.match(/No usable route/g)?.length, 1);
  });

  test("review and cut work on takes already filmed", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
    process.env.KIE_RUNS_DIR = env.KIE_RUNS_DIR;
    const { openJobs } = await import("../cli/core/jobs.mjs");
    const store = openJobs();
    for (const [id, seconds] of [["s1", 5], ["s2", 7]]) {
      const path = join(env.KIE_RUNS_DIR, "sea", `${id}-take.mp4`);
      spawnSync("ffmpeg", ["-hide_banner", "-y", "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=320x180:rate=24`, "-pix_fmt", "yuv420p", path]);
      const j = store.create({ run: "sea", shot: id, stage: "take", capability: "video", model: "seedance-2-5", provider: "kie", estimateUsd: 1 });
      store.transition(j.id, "sending");
      store.transition(j.id, "submitted", { upstreamTaskId: "t" });
      store.transition(j.id, "succeeded", { artifacts: [path] });
    }
    let r = kie("review", "--run", "sea", "--shot", "s1");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^s1 · s1-take\.mp4 · 5\.\d\ds\n {2}sheet {2}.+\n {2}first {2}.+\n {2}last {3}.+\nchecks:\n {2}· ok\n/);

    r = kie("review", "--run", "sea", "--shot", "s1", "--file", file("rv.json", { take: "s1-take.mp4", verdict: "pass", checks: [{ check: "ok", ok: true }], bestWindow: { startS: 0.8 } }));
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /saved s1: pass for s1-take\.mp4\n {2}✓ ok/);

    r = kie("cut", "--run", "sea");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /s1 {2}s1-take\.mp4 {2}0\.8s \+4s\n {2}s2 {2}s2-take\.mp4 {2}0\.5s \+6s\n/);
    assert.match(r.out, /→ .+\/runs\/sea\/film\.mp4 {2}\(10s\)/);

    r = kie("shots", "--run", "sea");
    assert.match(r.out, /s1 {2}4s {2}no still · take s1-take\.mp4 · pass\ns2 {2}6s {2}no still · take s2-take\.mp4 · not reviewed\n\ncut: film\.mp4 · 10s/);
  });
});
