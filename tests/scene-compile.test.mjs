import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { png } from "./fixtures/images.mjs";
import { openLibrary } from "../cli/core/assets.mjs";
import { compileScene } from "../cli/director/scene.mjs";
import { loadMenu, entry } from "../cli/director/menu.mjs";

const dir = mkdtempSync(join(tmpdir(), "kie-compile-"));
const img = (name, w = 600, h = 400) => { const p = join(dir, name); writeFileSync(p, png(w, h)); return p; };
const library = openLibrary(join(dir, "library"));
library.save({ name: "alexandros", kind: "character", description: "A man with a beard.", keep: "exact face and glasses", images: [img("a.png"), { path: img("sheet.png", 900, 300), role: "sheet" }] });
library.save({ name: "jumpsuit", kind: "product", description: "A neon green jumpsuit.", images: [{ path: img("j.png"), role: "sheet" }] });
library.save({ name: "maya", kind: "character", description: "Maya.", images: [img("m.png")] });

const scene = (over = {}) => ({
  id: "s1", title: "Freefall", durationS: 8, ratio: "9:16",
  refs: [{ id: "r1", source: "library:alexandros" }, { id: "r2", source: "file:refs/door.png", keep: "the door frame" }],
  cards: {
    goal: "@{r1} leaves the plane.",
    scene: "Over the Alps.",
    stages: [
      { title: "Exit", seconds: 4, camera: "Behind him, framed like @{r2}", action: "He drops.", end: "Hard cut." },
      { title: "Freefall", seconds: 4, camera: "Facing him.", action: "@library:jumpsuit flaps.", end: "" },
    ],
    style: "Film grain.", audio: "<wind>",
  },
  ...over,
});

const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
const light = (id) => entry(loadMenu(), "lights", id).words;
const lens = (id) => entry(loadMenu(), "lenses", id).words;

describe("compileScene", () => {
  test("a character's height is said on its reference line, so two people keep their sizes", () => {
    library.update("alexandros", { heightCm: 188 });
    try {
      const { prompt } = compileScene(scene(), { film: "sky", library });
      assert.match(prompt, /\[Image 1\] — character\. Preserve exact face and glasses\. This person is 188 cm \(6 ft 2 in\) tall\./);
    } finally {
      library.update("alexandros", { heightCm: null });
    }
  });

  test("two characters are each locked to one person, so a sheet never comes back as twins", () => {
    library.save({ name: "lena", kind: "character", description: "A woman.", keep: "her face", images: [{ path: img("l.png", 900, 300), role: "sheet" }] });
    const refs = [{ id: "r1", source: "library:alexandros" }, { id: "r2", source: "file:refs/door.png" }, { id: "r3", source: "library:lena" }];
    const { prompt, problems } = compileScene(scene({ refs }), { film: "sky", library });
    assert.deepEqual(problems, []);
    assert.match(prompt, /\n\[Image 1\] and \[Image 3\] each appear as exactly one person; nobody else in the video looks like any of them\.$/);
  });

  test("Dan's sections, in order, with every mention as the model's token", () => {
    const { prompt, refs, problems } = compileScene(scene(), { film: "sky", library });
    assert.deepEqual(problems, []);
    assert.equal(prompt, [
      "[GOAL]", "[Image 1] leaves the plane.", "",
      "[REFERENCES]",
      "[Image 1] — character. Preserve exact face and glasses. Take only who they are from it, lit by this scene's light, never the sheet's flat studio light.",
      "[Image 2] — door.png. Preserve the door frame.",
      "[Image 3] — jumpsuit, prop. Preserve A neon green jumpsuit. Take only this object's shape, colour and markings from it, sized and lit to fit the scene.",
      "Do not reproduce reference-sheet panels, grey studio backgrounds or labels.", "",
      "[SCENE]", "Over the Alps.", "",
      "[STAGE 1 | 0–4 SECONDS | EXIT]", "Camera: Behind him, framed like [Image 2]", "Action: He drops.", "End: Hard cut.", "",
      "[STAGE 2 | 4–8 SECONDS | FREEFALL]", "Camera: Facing him.", "Action: [Image 3] flaps.", "",
      "[VISUAL STYLE]", "Film grain.", "",
      "[AUDIO]", "<wind>", "",
      "[LOCKS]", "Keep every person, product and place exactly as in their reference images in every stage.",
      "[Image 1] appears as exactly one person; nobody else in the video looks like them.",
    ].join("\n"));
    assert.deepEqual(refs, [
      { source: "alexandros#2", role: "identity" },
      { source: join("sky", "refs/door.png"), role: "identity" },
      { source: "jumpsuit#1", role: "identity" },
    ]);
  });

  test("picks are written before the typed words of their line", () => {
    const s = scene();
    s.cards.picks = { light: "golden-hour", lens: "85mm" };
    s.cards.stages[0].picks = { move: "push-in", speed: "slow", size: "close-up", angle: "low" };
    const { prompt, problems } = compileScene(s, { film: "sky", library });
    assert.deepEqual(problems, []);
    assert.match(prompt, /\[SCENE\]\nWarm, low golden-hour sunlight\. Over the Alps\.\n/);
    assert.match(prompt, /\nCamera: Close-up, low angle; the camera slowly pushes in\. Behind him, framed like \[Image 2\]\n/);
    assert.match(prompt, /\nCamera: Facing him\.\n/);
    assert.match(prompt, /\[VISUAL STYLE\]\n85mm portrait lens\. Film grain\.\n/);
  });

  test("picks with empty boxes still make their line and section", () => {
    const s = scene({ refs: [] });
    s.cards = { goal: "", scene: "", style: "", audio: "", picks: { light: "neon", lens: "24mm" }, stages: [{ title: "", seconds: 8, camera: "", action: "", end: "", picks: { move: "static" } }] };
    const { prompt, problems } = compileScene(s, { film: "sky", library });
    assert.deepEqual(problems, []);
    assert.equal(prompt, [
      "[SCENE]", `${cap(light("neon"))}.`, "",
      "[STAGE 1 | 0–8 SECONDS | STAGE 1]", "Camera: The camera holds still.", "",
      "[VISUAL STYLE]", `${cap(lens("24mm"))}.`,
    ].join("\n"));
  });

  test("a scene with no images keeps its stage lines in a script, with no text or music", () => {
    const s = scene({ refs: [] });
    s.cards = {
      goal: "", scene: "", style: "", audio: "Wind.",
      stages: [
        { title: "Painter", seconds: 4, camera: "", action: "A painter looks up and says softly: \"I've always seen it...\"", end: "" },
        { title: "Pilot", seconds: 4, camera: "", action: "A pilot says, \"...and watch it fly.\" The jet climbs.", end: "" },
      ],
    };
    const { prompt, problems } = compileScene(s, { film: "sky", library });
    assert.deepEqual(problems, []);
    assert.match(prompt, /\[SCRIPT\]\n.*\nEach line starts at the beginning of its seconds[^\n]*lips move in sync[^\n]*\nNo on-screen text of any kind[^\n]*\n1\. the person in stage 1, 0–4s: "I've always seen it\.\.\."\n2\. the person in stage 2, 4–8s: "\.\.\.and watch it fly\."\n/);
    assert.match(prompt, /Line 2 — the person in stage 2, 4–8s: "\.\.\.and watch it fly\."\nThese are the only words spoken\. No music/);
    assert.doesNotMatch(prompt, /LOCKS|MAINTAIN CONSISTENCY|reference images/);
  });

  test("a line keeps its place when several words of how come before it", () => {
    const s = scene({ refs: [] });
    s.cards = {
      goal: "", scene: "", style: "", audio: "",
      stages: [
        { title: "Strike", seconds: 1, camera: "", action: "A blacksmith strikes the steel.", end: "" },
        { title: "Line", seconds: 3, camera: "", action: "He looks up and says with a slight, knowing smile: \"Now I just say it...\"", end: "" },
      ],
    };
    const { prompt } = compileScene(s, { film: "sky", library });
    assert.match(prompt, /\n1\. the person in stage 2, 1–4s: "Now I just say it\.\.\."\n/);
  });

  test("a pick the menu no longer has is a problem, not a crash", () => {
    const s = scene();
    s.cards.stages[0].picks = { move: "moonwalk" };
    const { problems } = compileScene(s, { film: "sky", library });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /"moonwalk" is not on the director's moves menu/);
  });

  test("reordering refs renumbers the prompt", () => {
    const s = scene();
    const { prompt } = compileScene({ ...s, refs: [s.refs[1], s.refs[0]] }, { film: "sky", library });
    assert.match(prompt, /^\[GOAL\]\n\[Image 2\] leaves the plane\./);
  });

  test("the token comes from the model's profile", () => {
    const { prompt } = compileScene(scene(), { film: "sky", library, refToken: "@Image {n}" });
    assert.match(prompt, /@Image 1 leaves the plane/);
  });

  test("empty sections are left out", () => {
    const s = scene();
    const { prompt } = compileScene({ ...s, cards: { ...s.cards, style: "", audio: " " } }, { film: "sky", library });
    assert.doesNotMatch(prompt, /VISUAL STYLE|\[AUDIO\]/);
  });

  test("refusals name the item and what to do, and send no refs", () => {
    const s = scene({ refs: [{ id: "r1", source: null }, { id: "r2", source: "library:maya" }, { id: "r3", source: "library:ghost" }] });
    const { refs, problems } = compileScene({ ...s, cards: { ...s.cards, goal: "@image7 and @{r1}" } }, { film: "sky", library });
    assert.deepEqual(refs, []);
    assert.deepEqual(problems, [
      "image 1 is empty. Choose a picture or remove it.",
      "@library:maya has no sheet yet. Make one in the Library.",
      "@library:ghost is not in the Library. Make it in the Library first.",
      "@image7: there is no image 7 in this scene.",
    ]);
  });

  test("pictures the model would refuse are caught in the preview, before any spend", () => {
    const limits = { minSide: 300, maxSide: 6000, minAspect: 0.4, maxAspect: 2.5 };
    const sizeOf = (path) => (path === join("sky", "refs/door.png") ? { width: 200, height: 200 } : null);
    const { refs, problems } = compileScene(scene(), { film: "sky", library, limits, sizeOf });
    assert.deepEqual(refs, []);
    assert.deepEqual(problems, [
      "@library:alexandros's sheet is 3.00:1 wide; Seedance takes 0.4:1 to 2.5:1. Make the sheet less wide.",
      "door.png is 200×200; Seedance needs 300 to 6000px on each side. Use a bigger picture.",
    ]);
  });

  test("a scene that says nothing is refused", () => {
    const blank = { goal: " ", scene: "", stages: [{ title: "Exit", seconds: 4, camera: "", action: "", end: "" }], style: "Film grain.", audio: "" };
    const { refs, problems } = compileScene(scene({ refs: [], cards: blank }), { film: "sky", library });
    assert.deepEqual(refs, []);
    assert.deepEqual(problems, ["Write the Goal, or what happens in a stage, first."]);
  });

  test("without limits, sizes are not checked", () => {
    assert.deepEqual(compileScene(scene(), { film: "sky", library }).problems, []);
  });
});
