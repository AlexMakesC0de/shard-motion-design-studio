// One scene → the prompt Seedance 2.5 gets, in Dan Kieft's sections, plus its
// reference images in order. Image N in the prompt is refs[N-1].
import { join } from "node:path";
import { heightWords, sheetOf } from "../core/assets.mjs";
import { IMAGE, LIBRARY, STORED, attachLibraryMentions, refLabel, speakerIds, scriptLines, stageLines, MAX_REFS } from "./mentions.mjs";
import { CARD_MAX_S } from "../lib/ffmpeg.mjs";
import { stageTimes } from "./scenes.mjs";
import { loadMenu, entry } from "./menu.mjs";
import { stageWords, pickSentence, hasPicks } from "./picks.mjs";

export const DEFAULT_REF_TOKEN = "[Image {n}]";
export const DEFAULT_AUDIO_TOKEN = "[Audio {n}]";
export const DEFAULT_VIDEO_TOKEN = "[Video {n}]";
/** A voice card's seconds: the card's own once it is made for this voice, else the voice's, at most 15 (director/voice-make.mjs cardSeconds). */
const cardS = (voice) => {
  const c = voice.card;
  if (c?.voiceSha256 === voice.sha256 && c.seconds <= CARD_MAX_S) return c.seconds;
  return Math.min(CARD_MAX_S, Math.max(2, Math.ceil((voice.durationS ?? 0) - 1e-9)));
};

/** "Voice: …" from a character's voice profile: how they sound, in the profile's own words. */
function voiceWords(profile = {}) {
  const parts = [profile.age, profile.accent && (/\baccent\b/i.test(profile.accent) ? profile.accent : `${profile.accent} accent`), profile.tone, profile.energy].map((x) => x?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

// Written once for every scene where someone speaks: speech pulls captions in
// from social video, and Seedance 2.5 adds music under dialogue unless told not to.
const NO_TEXT = "No on-screen text of any kind, at any point: no captions, subtitles, burned-in dialogue, karaoke text, titles, lower thirds, names, watermarks, logos or timecode.";
const NO_MUSIC = "No music, no score, no singing, no humming, no ambient pad, no swell, no drone, no laugh track, and no voices besides the scripted lines.";
const ASKS_MUSIC = /\b(music|score|song|soundtrack|singing|melody|beat)\b/i;
const KIND_WORD = { character: "character", product: "prop", location: "location", style: "style" };
// What a Library reference gives the video, and nothing else: a sheet's flat
// light, framing and backdrop otherwise leak in (Higgsfield's reference lines,
// docs/research/2026-11-20-higgsfield-blog-lessons.md, lesson 2).
const ROLE_WORDS = {
  character: "Take only who they are from it, lit by this scene's light, never the sheet's flat studio light.",
  product: "Take only this object's shape, colour and markings from it, sized and lit to fit the scene.",
  location: "Take only the place, its materials and its light from it, filmed from this scene's own camera positions.",
  style: "Take only the look from it: colour, texture and finish, none of its people, objects or framing.",
};
const listWords = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Why a picture of `width`×`height` would be refused, or null. `limits` is a route's refLimits.image. */
function sizeProblem(what, size, limits) {
  if (!limits || !size?.width || !size?.height) return null;
  const { width: w, height: h } = size;
  if (Math.min(w, h) < limits.minSide || Math.max(w, h) > limits.maxSide) {
    return `${what} is ${w}×${h}; Seedance needs ${limits.minSide} to ${limits.maxSide}px on each side. Use a ${Math.min(w, h) < limits.minSide ? "bigger" : "smaller"} picture.`;
  }
  const aspect = w / h;
  if (aspect > limits.maxAspect) return `${what} is ${aspect.toFixed(2)}:1 wide; Seedance takes ${limits.minAspect}:1 to ${limits.maxAspect}:1. Make ${what.startsWith("@") ? "the sheet" : "it"} less wide.`;
  if (aspect < limits.minAspect) return `${what} is ${aspect.toFixed(2)}:1 tall; Seedance takes ${limits.minAspect}:1 to ${limits.maxAspect}:1. Make ${what.startsWith("@") ? "the sheet" : "it"} less tall.`;
  return null;
}

/**
 * `limits` and `sizeOf(path)` are optional: with them, pictures the model
 * would refuse are named here, in the preview, rather than at submit.
 */
export function compileScene(input, { film, library, refToken = DEFAULT_REF_TOKEN, audioToken: audioTokenFormat = DEFAULT_AUDIO_TOKEN, videoToken: videoTokenFormat = DEFAULT_VIDEO_TOKEN, limits = null, audioLimits = null, videoLimits = null, sizeOf = () => null, menu = loadMenu() }) {
  const scene = attachLibraryMentions(input);
  const problems = [];
  const token = (i) => refToken.replace("{n}", String(i + 1));
  const audioToken = (i) => audioTokenFormat.replace("{n}", String(i + 1));
  const videoToken = (i) => videoTokenFormat.replace("{n}", String(i + 1));
  const item = (name) => {
    try {
      return library.get(name);
    } catch {
      return null;
    }
  };

  const resolved = scene.refs.map((r, i) => {
    if (!r.source) return problems.push(`image ${i + 1} is empty. Choose a picture or remove it.`) && null;
    if (r.source.startsWith("library:")) {
      const name = refLabel(r);
      const a = item(name);
      if (!a) return problems.push(`@library:${name} is not in the Library. Make it in the Library first.`) && null;
      const sheet = sheetOf(a);
      if (!sheet) return problems.push(`@library:${name} has no sheet yet. Make one in the Library.`) && null;
      const tooBig = sizeProblem(`@library:${name}'s sheet`, sheet, limits);
      if (tooBig) return problems.push(tooBig) && null;
      // Never a person's name: models drift on names, and may write them on screen.
      const what = a.kind === "character" ? "character" : `${name}, ${KIND_WORD[a.kind] ?? a.kind}`;
      const keep = r.keep ?? a.keep ?? a.description;
      // Sheets have nothing to measure against; the real height keeps two characters' sizes apart.
      const tall = a.kind === "character" && a.heightCm ? ` This person is ${heightWords(a.heightCm)} tall.` : "";
      const role = ROLE_WORDS[a.kind] ? ` ${ROLE_WORDS[a.kind]}` : "";
      return {
        kind: a.kind,
        send: { source: `${name}#${sheet.n}`, role: "identity" },
        line: `${token(i)} — ${what}. Preserve ${keep}${/[.!?]$/.test(keep) ? "" : "."}${tall}${role}`,
      };
    }
    const rel = r.source.slice("file:".length);
    const tooBig = sizeProblem(refLabel(r), sizeOf(join(film, rel)), limits);
    if (tooBig) return problems.push(tooBig) && null;
    return { send: { source: join(film, rel), role: "identity" }, line: `${token(i)} — ${refLabel(r)}.${r.keep ? ` Preserve ${r.keep}.` : ""}` };
  });
  if (scene.refs.length > MAX_REFS) problems.push(`A scene holds at most ${MAX_REFS} images.`);

  // A character with a voice who has a line gets that voice sent along, so the
  // model copies how they sound. By default (voiceAs "clip") that is their
  // talking clip, which carries face, voice and manner together, or their voice
  // card (a black video with the name and voice) until they have one; "card"
  // always sends the card, "file" the bare audio. Videos are numbered [Video 1]
  // and on, audio [Audio 1] and on.
  const mode = scene.voiceAs ?? "clip";
  const voices = [];
  const profiles = new Map();
  for (const id of speakerIds(scene)) {
    const i = scene.refs.findIndex((r) => r.id === id);
    const r = scene.refs[i];
    if (!r?.source?.startsWith("library:")) continue;
    const a = item(refLabel(r));
    if (a?.voiceProfile) profiles.set(i, voiceWords(a.voiceProfile));
    if (!a?.voice) continue;
    const clip = a.voice.clip?.voiceSha256 === a.voice.sha256 ? a.voice.clip : null;
    const sends = mode === "file" ? "file" : mode === "clip" && clip ? "clip" : "card";
    voices.push({ name: a.name, image: i, durationS: a.voice.durationS, cardS: cardS(a.voice), sends, videoS: sends === "clip" ? clip.seconds : sends === "card" ? cardS(a.voice) : 0 });
  }
  let videos = 0;
  let audios = 0;
  for (const v of voices) v.token = v.sends === "file" ? audioToken(audios++) : videoToken(videos++);
  const voiceOf = (i) => voices.findIndex((v) => v.image === i);
  const sourceOf = (n) => voices[n].token;
  // A speaker's line in REFERENCES says how they sound: the voice sent, and the profile's words.
  for (const [i, r] of resolved.entries()) {
    if (!r) continue;
    const n = voiceOf(i);
    const said = profiles.get(i);
    if (n >= 0) r.line += ` Voice: exactly the voice in ${sourceOf(n)}${said ? ` (${said})` : ""}.`;
    else if (said) r.line += ` Voice: ${said}.`;
  }
  const audioS = voices.reduce((n, v) => n + (v.sends === "file" ? (v.durationS ?? 0) : 0), 0);
  const videoS = voices.reduce((n, v) => n + v.videoS, 0);
  if (videoLimits && videoS > videoLimits.maxTotalS) {
    const what = voices.some((v) => v.sends === "clip") ? "voice cards and talking clips" : "voice cards";
    problems.push(`The speaking characters' ${what} last ${videoS}s together; Seedance takes at most ${videoLimits.maxTotalS}s of reference video in one scene. Send the voices as files, or use shorter voices.`);
  }
  if (audioLimits && audioS > audioLimits.maxTotalS) {
    problems.push(`The speaking characters' voices last ${audioS.toFixed(1)}s together; Seedance takes at most ${audioLimits.maxTotalS}s of reference voice in one scene. Use shorter voice recordings.`);
  }
  const SAME = "use exactly this voice: the same timbre, pitch, accent, pace and way of speaking, never replaced, deepened, brightened or made generic. Do not copy its words; say only the lines in [SCRIPT].";
  const voiceLines = voices.map((v) =>
    v.sends === "clip"
      ? `${v.token} — ${token(v.image)} talking: the single source for this person's face, hair, outfit, voice and the way they react. Whenever ${token(v.image)} speaks, ${SAME} They emote as they do in this clip: the same size of expression, brows, eyes and head movement. Never reproduce its grey background, framing or words.`
      : v.sends === "card"
        ? `${v.token} — the voice of ${token(v.image)}: a black screen with a name, and this person's voice. Whenever ${token(v.image)} speaks, ${SAME} Never show this black screen or its text.`
        : `${v.token} — the voice of ${token(v.image)}. Whenever ${token(v.image)} speaks, ${SAME}`,
  );
  const says = [scene.cards.goal, scene.cards.scene, ...scene.cards.stages.flatMap((s) => [s.camera, s.action])].some((t) => t?.trim()) || hasPicks(scene.cards);
  if (!says) problems.push("Write the Goal, or what happens in a stage, first.");

  const render = (t) =>
    t
      .replace(STORED, (m, id) => {
        const i = scene.refs.findIndex((r) => r.id === id);
        return i < 0 ? m : token(i);
      })
      .replace(LIBRARY, (m, name) => {
        const i = scene.refs.findIndex((r) => r.source === `library:${name}`);
        return i < 0 ? m : token(i);
      })
      .replace(IMAGE, (m, n) => {
        problems.push(`${m}: there is no image ${n} in this scene.`);
        return m;
      })
      .trim();

  const c = scene.cards;
  // The words, kept apart from how they are said: numbered once in [SCRIPT],
  // then again in [AUDIO] with whose voice says them.
  // With no named speakers, the lines said in the stages, each by whoever that stage shows.
  const named = scriptLines(scene).map((l) => ({ ...l, i: scene.refs.findIndex((r) => r.id === l.id) })).filter((l) => l.i >= 0);
  const lines = named.length ? named : stageLines(scene).map((l) => ({ ...l, i: -1 }));
  const speaker = (l) => (l.i >= 0 ? token(l.i) : `the person in stage ${l.stage + 1}`);
  // When a line is said: its stage's seconds. Without them Seedance tends to
  // hold a line written after the action until the stage's last moment.
  const times = stageTimes(scene);
  const when = (l) => (l.stage != null && times[l.stage] ? `, ${times[l.stage].fromS}–${times[l.stage].toS}s` : "");
  // A pick's words. An id the menu no longer has becomes a problem and no words.
  const pick = (group, id) => entry(menu, group, id);
  const words = (fn) => {
    try {
      return fn();
    } catch (err) {
      problems.push(err.message);
      return "";
    }
  };
  const lead = (first, typed) => [first, typed].filter(Boolean).join(" ");
  const lightWords = words(() => (c.picks?.light ? pickSentence(pick("lights", c.picks.light)) : ""));
  const lensWords = words(() => (c.picks?.lens ? pickSentence(pick("lenses", c.picks.lens)) : ""));
  const out = [];
  const section = (head, body) => {
    if (body) out.push(`[${head}]`, body, "");
  };
  section("GOAL", render(c.goal));
  if (resolved.length) {
    out.push("[REFERENCES]", ...resolved.filter(Boolean).map((r) => r.line), ...voiceLines, "Do not reproduce reference-sheet panels, grey studio backgrounds or labels.", ...(lines.length ? [NO_TEXT] : []), "");
  }
  if (lines.length) {
    out.push(
      "[SCRIPT]",
      "These are the only words spoken in this video, exactly as written, in this order, each by its speaker. Nothing improvised, added, changed, reordered or skipped, and no extra words before or after any line.",
      ...(lines.some((l) => when(l)) ? ["Each line starts at the beginning of its seconds, while the speaker keeps doing what they are doing, and their lips move in sync with every word; it is never held back to the end."] : []),
      ...(resolved.length ? [] : [NO_TEXT]),
      ...lines.map((l, n) => `${n + 1}. ${speaker(l)}${when(l)}: "${render(l.text)}"`),
      "",
    );
  }
  section("SCENE", lead(lightWords, render(c.scene)));
  c.stages.forEach((s, i) => {
    const camera = lead(words(() => stageWords(s.picks, pick)), render(s.camera));
    const lines = [["Camera", camera], ["Action", render(s.action)], ["End", render(s.end)]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    out.push(`[STAGE ${i + 1} | ${times[i].fromS}–${times[i].toS} SECONDS | ${(s.title || `Stage ${i + 1}`).toUpperCase()}]`, ...lines, "");
  });
  section("VISUAL STYLE", lead(lensWords, render(c.style)));
  // Every line again, with the voice that says it; then what else may be heard.
  const said = lines.map((l, n) => {
    const v = l.i >= 0 ? voiceOf(l.i) : -1;
    return `Line ${n + 1} — ${speaker(l)}${when(l)}${v >= 0 ? `, in the voice from ${sourceOf(v)}` : ""}: "${render(l.text)}"`;
  });
  const typed = render(c.audio);
  const speech = lines.length ? [...said, `These are the only words spoken.${ASKS_MUSIC.test(typed) ? "" : ` ${NO_MUSIC}`}`] : [];
  section("AUDIO", [typed, ...speech].filter(Boolean).join("\n"));
  if (resolved.length) {
    // Each character once: one sheet otherwise comes back as twins or a crowd of clones.
    const people = resolved.flatMap((r, i) => (r?.kind === "character" ? [token(i)] : []));
    const once = people.length === 1 ? `${people[0]} appears as exactly one person; nobody else in the video looks like them.` : people.length > 1 ? `${listWords(people)} each appear as exactly one person; nobody else in the video looks like any of them.` : null;
    out.push("[LOCKS]", "Keep every person, product and place exactly as in their reference images in every stage.", ...(once ? [once] : []));
  } else if (out.at(-1) === "") out.pop();

  const unique = [...new Set(problems)];
  const ROLE = { clip: "voiceclip", card: "voicecard", file: "voice" };
  const SUFFIX = { clip: "@voiceclip", card: "@voicecard", file: "@voice" };
  const sends = [...resolved.map((r) => r?.send), ...voices.map((v) => ({ source: `${v.name}${SUFFIX[v.sends]}`, role: ROLE[v.sends] }))];
  return {
    prompt: out.join("\n"),
    refs: unique.length ? [] : sends,
    problems: unique,
    voices: voices.map((v) => ({ name: v.name, durationS: v.durationS, cardS: v.cardS, sends: v.sends, videoS: v.videoS })),
    voiceAs: mode,
    audioS: Math.round(audioS * 100) / 100,
    videoS,
  };
}
