import { RUNS, KEY, deps, req, tmp } from "./helpers.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const { createApp } = await import("../server/app.mjs");
const { RENDER_DIR } = await import("../../cli/lib/render.mjs");
const { CORE_TOOLS } = await import("../server/api/finish.mjs");

// Both binaries, as the server's own check needs: a partial install can leave just one.
const hasFfmpeg = ["ffmpeg", "ffprobe"].every((bin) => spawnSync(bin, ["-version"]).status === 0);
const hasRender = existsSync(join(RENDER_DIR, "node_modules", "remotion"));
const FILM = join(RUNS, "finish-demo");
mkdirSync(FILM, { recursive: true });
mkdirSync(join(RUNS, "finish-gated"), { recursive: true });
const ffmpeg = (...args) => spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
if (hasFfmpeg) {
  // One-second clips with a tone, and a short music bed: tiny, so a real assemble takes a moment.
  for (const [name, hz] of [["a.mp4", 440], ["b.mp4", 660]]) {
    ffmpeg("-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=1", "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=1`, "-pix_fmt", "yuv420p", "-shortest", join(FILM, name));
  }
  ffmpeg("-f", "lavfi", "-i", "sine=frequency=220:duration=2", join(FILM, "bed.wav"));
}
// Not media, whatever the names say: refused by their content.
writeFileSync(join(RUNS, "finish-gated", "a.mp4"), "\x00\x00\x00\x18ftypisom");
writeFileSync(join(RUNS, "finish-gated", "notes.wav"), "plain text");
mkdirSync(join(RUNS, "finish-gated", ".hidden"), { recursive: true });
writeFileSync(join(RUNS, "finish-gated", ".hidden", "x.mp4"), "\x00\x00\x00\x18ftypisom");
writeFileSync(join(tmp, "outside.mp4"), "\x00\x00\x00\x18ftypisom");

const allOk = () => ({ ffmpeg: { ok: true, install: null }, render: { ok: true, install: null } });

/** A finishing tool that waits until the test lets it finish, and records what it was asked. */
function gated() {
  const calls = [];
  let release = () => {};
  const done = new Promise((r) => (release = r));
  const tool = async (args) => {
    calls.push(args);
    await done;
    writeFileSync(args.out ?? join(args.outDir, "x.mp4"), "made");
    return { out: args.out, variants: [] };
  };
  return { calls, tool, release };
}

/** The slow tools, stubbed: the caption overlay and text cards need a headless browser, which tests never start. */
const calls = { caption: [], variants: [], render: [] };
const stubs = {
  burnCaptions: async (a) => {
    calls.caption.push(a);
    writeFileSync(a.out, "made");
    return { out: a.out, cues: 2, style: a.style, warnings: ["1 cue(s) start after the film ends (1.00s) and were dropped."] };
  },
  makeVariants: async (a) => {
    calls.variants.push(a);
    return { source: { path: a.video }, variants: a.ratios.map((r) => ({ ratio: r, out: join(a.outDir, `x-${r.replace(":", "x")}.mp4`), width: 1, height: 1, mode: a.mode })) };
  },
  render: async (a) => {
    calls.render.push(a);
    writeFileSync(a.out, "made");
    return { out: a.out, template: a.template, width: 1920, height: 1080 };
  },
};
const SRT = "1\n00:00:00,000 --> 00:00:00,800\nHello\n";
writeFileSync(join(RUNS, "finish-gated", "captions.srt"), SRT);
writeFileSync(join(RUNS, "finish-gated", "notes.txt"), SRT);
writeFileSync(join(FILM, "captions.srt"), SRT);

let app, port, slow, slowApp, slowPort;
before(async () => {
  app = createApp({ key: KEY, deps, distDir: join(tmp, "nodist"), pollMs: 60_000 });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  port = app.address().port;
  slow = gated();
  slowApp = createApp({ key: KEY, deps, distDir: join(tmp, "nodist"), pollMs: 60_000, finish: { tools: { ...CORE_TOOLS, ...stubs, assemble: slow.tool }, check: allOk } });
  await new Promise((r) => slowApp.listen(0, "127.0.0.1", r));
  slowPort = slowApp.address().port;
});
after(async () => {
  slow.release();
  await slowApp.tasks.idle();
  await Promise.all([app.closeAll(), slowApp.closeAll()]);
});

const post = (p, path, body) => req(p, path, { method: "POST", body });

/** A finishing tool that ends only when its signal is aborted, and records what it was given. */
function abortable() {
  const calls = [];
  const tool = (args) => {
    calls.push(args);
    return new Promise((_, reject) => args.signal.addEventListener("abort", () => reject(new Error("ffmpeg was stopped before it finished."))));
  };
  return { calls, tool };
}

describe("stopping a finishing task", () => {
  let stopApp, stopPort, hang;
  before(async () => {
    hang = abortable();
    stopApp = createApp({
      key: KEY,
      deps,
      distDir: join(tmp, "nodist"),
      pollMs: 60_000,
      finish: { tools: { assemble: hang.tool, burnCaptions: hang.tool, makeVariants: hang.tool, render: hang.tool }, check: allOk },
    });
    await new Promise((r) => stopApp.listen(0, "127.0.0.1", r));
    stopPort = stopApp.address().port;
  });
  after(async () => {
    await stopApp.tasks.stopAll();
    await stopApp.closeAll();
  });

  test("every finishing endpoint hands its core function the task's signal", async () => {
    const starts = [
      ["assemble", { shots: ["a.mp4"] }],
      ["caption", { video: "a.mp4", srt: "captions.srt" }],
      ["variants", { video: "a.mp4", ratios: ["1:1"] }],
      ["card", { template: "lower-third", props: { name: "Zed" } }],
    ];
    for (const [i, [path, body]] of starts.entries()) {
      const r = await post(stopPort, `/api/films/finish-gated/${path}`, body);
      assert.equal(r.status, 200, r.text);
      // A text card writes its props file before it calls core.
      for (let waited = 0; hang.calls.length <= i && waited < 100; waited++) await new Promise((resolve) => setTimeout(resolve, 10));
      const args = hang.calls.at(-1);
      assert.ok(args.signal instanceof AbortSignal, `${path} passes a signal`);
      assert.equal(args.signal.aborted, false);
      await stopApp.tasks.stopAll();
      assert.equal(args.signal.aborted, true, `${path}: stopping the task aborts that signal`);
    }
    assert.equal(hang.calls.length, 4);
  });

  test("POST /api/tasks/:id/cancel stops a running task, which ends failed with 'Cancelled.', and frees the film", async () => {
    const started = await post(stopPort, "/api/films/finish-gated/assemble", { shots: ["a.mp4"] });
    assert.equal(started.status, 200, started.text);
    const again = await post(stopPort, "/api/films/finish-gated/assemble", { shots: ["a.mp4"] });
    assert.equal(again.status, 409, "the film is busy while it runs");
    const id = started.json.task.id;
    const cancel = await post(stopPort, `/api/tasks/${id}/cancel`);
    assert.equal(cancel.status, 200, cancel.text);
    assert.equal(cancel.json.task.id, id);
    await stopApp.tasks.idle();
    const listed = await req(stopPort, "/api/tasks?run=finish-gated");
    const task = listed.json.find((t) => t.id === id);
    assert.equal(task.state, "failed");
    assert.match(task.error, /^Cancelled/);
    const free = await post(stopPort, "/api/films/finish-gated/variants", { video: "a.mp4", ratios: ["1:1"] });
    assert.equal(free.status, 200, "the film lock was released");
    await stopApp.tasks.stopAll();
  });

  test("through core itself: cancelling a variants task kills ffmpeg, leaves no half-written file, and frees the film", async () => {
    const bin = join(tmp, "stand-in-bin");
    mkdirSync(bin, { recursive: true });
    const pidFile = join(tmp, "stand-in.pid");
    writeFileSync(join(bin, "ffprobe"), `#!/bin/sh\necho '{"streams":[{"codec_type":"video","width":1920,"height":1080,"r_frame_rate":"30/1"}],"format":{"duration":"2.0"}}'\n`, { mode: 0o755 });
    writeFileSync(join(bin, "ffmpeg"), `#!/bin/sh\necho $$ > "${pidFile}"\nfor last; do :; done\necho half > "$last"\nsleep 30\n`, { mode: 0o755 });
    const film = join(RUNS, "finish-core");
    mkdirSync(film, { recursive: true });
    writeFileSync(join(film, "clip.mp4"), "\x00\x00\x00\x18ftypisom");
    const realApp = createApp({ key: KEY, deps, distDir: join(tmp, "nodist"), pollMs: 60_000, finish: { check: allOk } });
    await new Promise((r) => realApp.listen(0, "127.0.0.1", r));
    const savedPath = process.env.PATH;
    process.env.PATH = `${bin}:${savedPath}`;
    try {
      const started = await post(realApp.address().port, "/api/films/finish-core/variants", { video: "clip.mp4", ratios: ["9:16"] });
      assert.equal(started.status, 200, started.text);
      for (let waited = 0; !existsSync(pidFile) && waited < 200; waited++) await new Promise((r) => setTimeout(r, 20));
      const pid = Number(readFileSync(pidFile, "utf8"));
      assert.ok(pid > 0, "the stand-in ffmpeg is running");
      assert.equal((await post(realApp.address().port, `/api/tasks/${started.json.task.id}/cancel`)).status, 200);
      await realApp.tasks.idle();
      assert.match(realApp.tasks.get(started.json.task.id).error, /^Cancelled/);
      let alive = true;
      for (let waited = 0; alive && waited < 200; waited++) {
        try {
          process.kill(pid, 0);
          await new Promise((r) => setTimeout(r, 20));
        } catch {
          alive = false;
        }
      }
      assert.equal(alive, false, "ffmpeg was killed");
      assert.equal(existsSync(join(film, "clip-9x16.mp4")), false, "no half-written variant is left");
      assert.equal(realApp.tasks.start("finish-core", "variants", "Variants", async () => ({ outputs: [] })).state, "running", "the film lock is free");
      await realApp.tasks.idle();
    } finally {
      process.env.PATH = savedPath;
      await realApp.closeAll();
    }
  });

  test("cancel of an unknown task is 404, of a finished one 409, and it needs the session key", async () => {
    assert.equal((await post(stopPort, "/api/tasks/t-nope/cancel")).status, 404);
    const started = await post(stopPort, "/api/films/finish-gated/variants", { video: "a.mp4", ratios: ["1:1"] });
    const id = started.json.task.id;
    assert.equal((await req(stopPort, `/api/tasks/${id}/cancel`, { method: "POST", key: null })).status, 403);
    assert.equal((await post(stopPort, `/api/tasks/${id}/cancel`)).status, 200);
    await stopApp.tasks.idle();
    assert.equal((await post(stopPort, `/api/tasks/${id}/cancel`)).status, 409);
  });
});

describe("GET /api/finish", () => {
  test("says whether ffmpeg and the render engine are installed, and lists what the tools take", async () => {
    const r = await req(port, "/api/finish");
    assert.equal(r.status, 200);
    assert.equal(r.json.tools.ffmpeg.ok, hasFfmpeg);
    assert.equal(r.json.tools.render.ok, hasRender);
    if (!hasRender) assert.match(r.json.tools.render.install, /npm install/);
    assert.deepEqual(r.json.ratios, ["16:9", "9:16", "1:1", "4:5", "4:3", "21:9"]);
    assert.deepEqual(r.json.variantModes, ["blur", "crop", "pad"]);
    assert.deepEqual(r.json.captionStyles, ["social", "subtle"]);
    assert.ok(r.json.transitions.includes("fade"));
    assert.deepEqual(r.json.templates.find((t) => t.id === "kinetic-type").fields.map((f) => f.name), ["lines", "kicker", "footer", "granularity", "align"]);
  });

  test("a missing tool comes with core's install instructions", async () => {
    const missing = createApp({
      key: KEY,
      deps,
      distDir: join(tmp, "nodist"),
      pollMs: 60_000,
      finish: { check: () => ({ ffmpeg: { ok: false, install: "ffmpeg not found on PATH. Finishing commands need it:\n  brew install ffmpeg" }, render: { ok: true, install: null } }) },
    });
    await new Promise((r) => missing.listen(0, "127.0.0.1", r));
    try {
      const r = await req(missing.address().port, "/api/finish");
      assert.equal(r.json.tools.ffmpeg.ok, false);
      assert.match(r.json.tools.ffmpeg.install, /brew install ffmpeg/);
    } finally {
      await missing.closeAll();
    }
  });
});

describe("POST /api/films/:slug/assemble", () => {
  test("joins the chosen shots with a crossfade and music into film.mp4 in the film, then numbers the next one", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
    const body = { shots: ["b.mp4", "a.mp4"], music: "bed.wav", transition: "fade", transition_s: 0.25, aspect_ratio: "1:1" };
    const r = await post(port, "/api/films/finish-demo/assemble", body);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.task.state, "running");
    assert.equal(r.json.task.tool, "assemble");
    await app.tasks.idle();
    const task = app.tasks.get(r.json.task.id);
    assert.equal(task.state, "done", task.error);
    assert.deepEqual(task.outputs, [{ name: "film.mp4", url: "/media/runs/finish-demo/film.mp4" }]);
    const record = JSON.parse(readFileSync(join(FILM, "assembly.json"), "utf8"));
    assert.deepEqual(record.shots.map((s) => s.path), [join(FILM, "b.mp4"), join(FILM, "a.mp4")]);
    assert.equal(record.totalS, 1.75);
    assert.equal(record.audio.loudnessTarget, "-16 LUFS / -1.5 dBTP (EBU R128), two-pass linear");

    const again = await post(port, "/api/films/finish-demo/assemble", { shots: ["a.mp4"], aspect_ratio: "1:1" });
    await app.tasks.idle();
    assert.equal(app.tasks.get(again.json.task.id).outputs[0].name, "film-2.mp4", "never over the first film");
  });

  test("a second finishing task in the same film is refused while the first runs", async () => {
    const first = await post(slowPort, "/api/films/finish-gated/assemble", { shots: ["a.mp4"] });
    assert.equal(first.status, 200, first.text);
    const second = await post(slowPort, "/api/films/finish-gated/assemble", { shots: ["a.mp4"] });
    assert.equal(second.status, 409);
    assert.match(second.json.error.message, /Assemble is still running in finish-gated/);
    const args = slow.calls[0];
    assert.equal(args.out, join(RUNS, "finish-gated", "film.mp4"), "the output is core's default name inside the film");
    assert.deepEqual([args.ratio, args.width, args.height, args.transitionS, args.shotAudio], ["16:9", 1920, 1080, 0, "auto"]);
    slow.release();
    await slowApp.tasks.idle();
  });

  test("transition_s 0 (the form's default) means straight cuts; a negative one is refused in seconds", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
    const zero = await post(port, "/api/films/finish-demo/assemble", { shots: ["a.mp4"], transition_s: 0 });
    assert.equal(zero.status, 200, zero.text);
    await app.tasks.idle();
    const negative = await post(port, "/api/films/finish-demo/assemble", { shots: ["a.mp4"], transition_s: -1 });
    assert.equal(negative.status, 400);
    assert.equal(negative.json.error.field, "transition_s");
    assert.equal(negative.json.error.message, "transition_s must be a number of seconds, 0 or more.");
    const card = await post(port, "/api/films/finish-demo/card", { template: "lower-third", props: { name: "Zed" }, duration_s: 0 });
    assert.equal(card.json.error.message, "duration_s must be a number of seconds above 0.");
  });

  test("a shot outside the allowed folders, or in a hidden folder, is refused on its field before any task starts", async () => {
    const before = slowApp.tasks.list().length;
    const outside = await post(slowPort, "/api/films/finish-gated/assemble", { shots: [join(tmp, "outside.mp4")] });
    assert.equal(outside.status, 400);
    assert.equal(outside.json.error.code, 3);
    assert.equal(outside.json.error.field, "shots");
    assert.match(outside.json.error.message, /outside the folders files may be read from/);
    const hidden = await post(slowPort, "/api/films/finish-gated/assemble", { shots: [".hidden/x.mp4"] });
    assert.equal(hidden.status, 400);
    assert.equal(slowApp.tasks.list().length, before);
  });

  test("music that is not audio is refused by its content", async () => {
    const r = await post(slowPort, "/api/films/finish-gated/assemble", { shots: ["a.mp4"], music: "notes.wav" });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, "music");
    assert.match(r.json.error.message, /is not an audio file/);
  });

  test("a transition outside the fixed list never reaches ffmpeg", async () => {
    const r = await post(slowPort, "/api/films/finish-gated/assemble", { shots: ["a.mp4", "a.mp4"], transition: "fade:duration=1,movie=/etc/hosts", transition_s: 0.5 });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, "transition");
  });

  test("no shots, an unknown ratio and an unknown film are refused", async () => {
    assert.equal((await post(slowPort, "/api/films/finish-gated/assemble", { shots: [] })).json.error.field, "shots");
    assert.equal((await post(slowPort, "/api/films/finish-gated/assemble", { shots: ["a.mp4"], aspect_ratio: "2:1" })).json.error.field, "aspect_ratio");
    const unknownFilm = await post(slowPort, "/api/films/no-such-film/assemble", { shots: ["a.mp4"] });
    assert.equal(unknownFilm.status, 400);
    assert.equal(unknownFilm.json.error.code, 3);
  });

  test("without ffmpeg it is refused with core's install message, and no task starts", async () => {
    const noFfmpeg = createApp({
      key: KEY,
      deps,
      distDir: join(tmp, "nodist"),
      pollMs: 60_000,
      finish: { check: () => ({ ffmpeg: { ok: false, install: "ffmpeg not found on PATH. Finishing commands need it:\n  brew install ffmpeg" }, render: { ok: true, install: null } }) },
    });
    await new Promise((r) => noFfmpeg.listen(0, "127.0.0.1", r));
    try {
      const r = await post(noFfmpeg.address().port, "/api/films/finish-gated/assemble", { shots: ["a.mp4"] });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 1);
      assert.equal(r.json.error.tool, "ffmpeg");
      assert.match(r.json.error.message, /brew install ffmpeg/);
      assert.deepEqual(noFfmpeg.tasks.list(), []);
    } finally {
      await noFfmpeg.closeAll();
    }
  });
});

describe("POST /api/films/:slug/caption", () => {
  test("burns a saved SRT into a video as captioned.mp4 in the film, passing on core's warnings", async () => {
    const r = await post(slowPort, "/api/films/finish-gated/caption", { video: "a.mp4", srt: "captions.srt", style: "subtle" });
    assert.equal(r.status, 200, r.text);
    await slowApp.tasks.idle();
    const task = slowApp.tasks.get(r.json.task.id);
    assert.equal(task.state, "done", task.error);
    assert.deepEqual(task.outputs, [{ name: "captioned.mp4", url: "/media/runs/finish-gated/captioned.mp4" }]);
    assert.deepEqual(task.warnings, ["1 cue(s) start after the film ends (1.00s) and were dropped."]);
    const a = calls.caption.at(-1);
    assert.deepEqual([a.video, a.srt, a.style], [join(RUNS, "finish-gated", "a.mp4"), join(RUNS, "finish-gated", "captions.srt"), "subtle"]);
    assert.equal(JSON.parse(readFileSync(join(RUNS, "finish-gated", "captions.json"), "utf8")).cues, 2);
  });

  test("the captions must be an .srt file inside the allowed folders", async () => {
    const notSrt = await post(slowPort, "/api/films/finish-gated/caption", { video: "a.mp4", srt: "notes.txt" });
    assert.equal(notSrt.status, 400);
    assert.equal(notSrt.json.error.field, "srt");
    assert.match(notSrt.json.error.message, /an \.srt file/);
    writeFileSync(join(tmp, "outside.srt"), SRT);
    const outside = await post(slowPort, "/api/films/finish-gated/caption", { video: "a.mp4", srt: join(tmp, "outside.srt") });
    assert.equal(outside.json.error.field, "srt");
    assert.match(outside.json.error.message, /outside the folders/);
  });

  test("without the render engine it is refused with core's install message", async () => {
    const noRender = createApp({
      key: KEY,
      deps,
      distDir: join(tmp, "nodist"),
      pollMs: 60_000,
      finish: { check: () => ({ ffmpeg: { ok: true, install: null }, render: { ok: false, install: "The graphic-motion renderer is not installed. One time only:\n  cd render && npm install" } }) },
    });
    await new Promise((r) => noRender.listen(0, "127.0.0.1", r));
    try {
      const r = await post(noRender.address().port, "/api/films/finish-gated/caption", { video: "a.mp4", srt: "captions.srt" });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.tool, "render");
      assert.match(r.json.error.message, /npm install/);
    } finally {
      await noRender.closeAll();
    }
  });
});

describe("POST /api/films/:slug/variants", () => {
  test("reframes a video to 9:16 and 1:1 beside it in the film", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
    const r = await post(port, "/api/films/finish-demo/variants", { video: "a.mp4", ratios: ["9:16", "1:1"] });
    assert.equal(r.status, 200, r.text);
    await app.tasks.idle();
    const task = app.tasks.get(r.json.task.id);
    assert.equal(task.state, "done", task.error);
    assert.deepEqual(task.outputs.map((o) => o.name), ["a-9x16.mp4", "a-1x1.mp4"]);
    const record = JSON.parse(readFileSync(join(FILM, "variants.json"), "utf8"));
    assert.deepEqual(record.variants.map((v) => [v.width, v.height, v.mode]), [[1080, 1920, "blur"], [1080, 1080, "blur"]]);
  });

  test("warns when the video already has captions burned in, using core's caption-order check", async () => {
    writeFileSync(join(RUNS, "finish-gated", "captions.json"), JSON.stringify({ out: join(RUNS, "finish-gated", "captioned.mp4") }));
    writeFileSync(join(RUNS, "finish-gated", "captioned.mp4"), "\x00\x00\x00\x18ftypisom");
    const r = await post(slowPort, "/api/films/finish-gated/variants", { video: "captioned.mp4", ratios: ["9:16"], mode: "pad" });
    assert.equal(r.status, 200, r.text);
    await slowApp.tasks.idle();
    const task = slowApp.tasks.get(r.json.task.id);
    assert.match(task.warnings[0], /already has captions burned in/);
    assert.equal(calls.variants.at(-1).mode, "pad");
    assert.equal(calls.variants.at(-1).outDir, join(RUNS, "finish-gated"));
  });

  test("no ratio, an unknown ratio or an unknown mode is refused on its field", async () => {
    assert.equal((await post(slowPort, "/api/films/finish-gated/variants", { video: "a.mp4", ratios: [] })).json.error.field, "ratios");
    assert.equal((await post(slowPort, "/api/films/finish-gated/variants", { video: "a.mp4", ratios: ["2:1"] })).json.error.field, "ratios");
    assert.equal((await post(slowPort, "/api/films/finish-gated/variants", { video: "a.mp4", ratios: ["1:1"], mode: "stretch" })).json.error.field, "mode");
  });
});

describe("POST /api/films/:slug/card", () => {
  test("renders a text card from a template and its props into the film", async () => {
    const r = await post(slowPort, "/api/films/finish-gated/card", { template: "kinetic-type", props: { lines: ["Exactly", "these words"], kicker: "ZED" }, aspect_ratio: "9:16", duration_s: 5 });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.task.label, "Text card (kinetic-type)");
    await slowApp.tasks.idle();
    const task = slowApp.tasks.get(r.json.task.id);
    assert.equal(task.state, "done", task.error);
    assert.deepEqual(task.outputs, [{ name: "kinetic-type.mp4", url: "/media/runs/finish-gated/kinetic-type.mp4" }]);
    const a = calls.render.at(-1);
    assert.deepEqual([a.template, a.ratio, a.durationS], ["kinetic-type", "9:16", 5]);
    assert.equal(a.propsPath, join(RUNS, "finish-gated", "props-kinetic-type.json"));
    assert.deepEqual(JSON.parse(readFileSync(a.propsPath, "utf8")), { lines: ["Exactly", "these words"], kicker: "ZED" });
    assert.ok(existsSync(join(RUNS, "finish-gated", "render-kinetic-type.json")));
  });

  test("an image in the props is confined like any other file, and saved as its real path", async () => {
    writeFileSync(join(RUNS, "finish-gated", "logo.png"), "png");
    const r = await post(slowPort, "/api/films/finish-gated/card", { template: "logo-reveal", props: { wordmark: "Zed", logo: "finish-gated/logo.png" } });
    assert.equal(r.status, 200, r.text);
    await slowApp.tasks.idle();
    assert.equal(JSON.parse(readFileSync(calls.render.at(-1).propsPath, "utf8")).logo, join(RUNS, "finish-gated", "logo.png"));

    writeFileSync(join(tmp, "logo.png"), "png");
    const outside = await post(slowPort, "/api/films/finish-gated/card", { template: "logo-reveal", props: { wordmark: "Zed", logo: join(tmp, "logo.png") } });
    assert.equal(outside.status, 400);
    assert.equal(outside.json.error.field, "props");
    assert.match(outside.json.error.message, /outside the folders/);
    const remote = await post(slowPort, "/api/films/finish-gated/card", { template: "logo-reveal", props: { wordmark: "Zed", logo: "https://example.com/logo.png" } });
    assert.match(remote.json.error.message, /remote URLs would be fetched from this machine/);
  });

  test("props cannot set the card's length, size or frame rate: durationS: 36000 would skip the one-minute limit", async () => {
    const rendered = calls.render.length;
    const tasks = slowApp.tasks.list().length;
    for (const [key, value] of [["durationS", 36000], ["width", 99999], ["height", 1], ["fps", 1000]]) {
      const r = await post(slowPort, "/api/films/finish-gated/card", { template: "lower-third", props: { name: "Zed", [key]: value } });
      assert.equal(r.status, 400, key);
      assert.equal(r.json.error.field, `props.${key}`);
      assert.match(r.json.error.message, new RegExp(key));
    }
    await slowApp.tasks.idle();
    assert.equal(calls.render.length, rendered, "nothing was rendered");
    assert.equal(slowApp.tasks.list().length, tasks, "no task started");
  });

  test("props naming a protocol-relative or other remote address are refused, not fetched by the renderer", async () => {
    for (const logo of ["//example.invalid/logo", "ftp://example.invalid/logo.png", "\\\\example.invalid\\logo"]) {
      const r = await post(slowPort, "/api/films/finish-gated/card", { template: "logo-reveal", props: { wordmark: "Zed", logo } });
      assert.equal(r.status, 400, logo);
      assert.equal(r.json.error.field, "props");
      assert.match(r.json.error.message, /remote URLs would be fetched from this machine/);
    }
    const steps = await post(slowPort, "/api/films/finish-gated/card", { template: "ui-demo", props: { steps: [{ image: "//example.invalid/shot" }] } });
    assert.equal(steps.json.error.field, "props");
  });

  test("a template, ratio or mode named like an Object.prototype key is unknown, not found on the prototype", async () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const card = await post(slowPort, "/api/films/finish-gated/card", { template: name, props: {} });
      assert.equal(card.status, 400, name);
      assert.equal(card.json.error.field, "template");
      const ratio = await post(slowPort, "/api/films/finish-gated/variants", { video: "a.mp4", ratios: [name] });
      assert.equal(ratio.status, 400, name);
      assert.equal(ratio.json.error.field, "ratios");
      const cardRatio = await post(slowPort, "/api/films/finish-gated/card", { template: "lower-third", props: { name: "Zed" }, aspect_ratio: name });
      assert.equal(cardRatio.json.error.field, "aspect_ratio");
      const mode = await post(slowPort, "/api/films/finish-gated/variants", { video: "a.mp4", ratios: ["1:1"], mode: name });
      assert.equal(mode.json.error.field, "mode");
      const style = await post(slowPort, "/api/films/finish-gated/caption", { video: "a.mp4", srt: "captions.srt", style: name });
      assert.equal(style.json.error.field, "style");
    }
    // The same text as a JSON key: a template named __proto__ in the body itself.
    const raw = await req(slowPort, "/api/films/finish-gated/card", { method: "POST", body: Buffer.from('{"template":"__proto__","props":{"__proto__":{"durationS":36000}}}') });
    assert.equal(raw.status, 400);
    assert.equal(raw.json.error.field, "template");
  });

  test("a missing required prop, an unknown template or a duration over a minute is refused on its field", async () => {
    const noLines = await post(slowPort, "/api/films/finish-gated/card", { template: "kinetic-type", props: { lines: [] } });
    assert.equal(noLines.status, 400);
    assert.equal(noLines.json.error.field, "props.lines");
    assert.match(noLines.json.error.message, /Lines is required for kinetic-type/);
    assert.equal((await post(slowPort, "/api/films/finish-gated/card", { template: "captions", props: {} })).json.error.field, "template");
    assert.equal((await post(slowPort, "/api/films/finish-gated/card", { template: "lower-third", props: { name: "Zed" }, duration_s: 600 })).json.error.field, "duration_s");
  });
});
