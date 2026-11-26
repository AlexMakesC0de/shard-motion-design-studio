// The director's making tools: casting sheets, stills, takes, review and the
// cut. Sheets, stills and takes spend kie credits; review and the cut are
// local ffmpeg and free.
import { z } from "zod";
import { runDir } from "../cli/lib/run.mjs";
import { usage } from "../cli/lib/errors.mjs";
import { uploadFile } from "../cli/lib/upload.mjs";
import { makeStill, makeSheet, adoptSheet } from "../cli/director/still.mjs";
import { makeVoice, adoptVoice, saveRecordedVoice, saveVoiceProfile, voiceSettings, voicePrice, makeLocalVoice, keepLocalVoice, makeVoiceClip, adoptVoiceClip, voiceClipPrices, voiceClipProblems, CLIP_RESOLUTIONS } from "../cli/director/voice-make.mjs";
import { voiceStudioStatus } from "../cli/core/voicestudio.mjs";
import { presetVoices } from "../cli/core/voice.mjs";
import { voiceTools } from "../cli/lib/ffmpeg.mjs";
import { filmShot, filmReady } from "../cli/director/film.mjs";
import { reviewShot, saveReview } from "../cli/director/review.mjs";
import { cutFilm } from "../cli/director/cut.mjs";
import { board, boardLines } from "../cli/director/board.mjs";
import { MAX_REDOS, afterReview } from "../cli/director/redo.mjs";
import { imagePreview } from "./preview.mjs";
import { ok } from "./results.mjs";
import { stoppable } from "./stop.mjs";

const LOOK = { readOnlyHint: true, openWorldHint: false };
const LOCAL_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const SPEND = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

export function registerMaking(tool, { catalog, ctx, deps = {}, runFile }) {
  const run = z.string().describe("The film's run folder slug.");
  const shot = z.string().describe("A shot id from the plan, such as s1.");
  const dryRun = z.boolean().optional().describe("Plan the job and its price; submit nothing, spend nothing.");
  const Data = z.record(z.string(), z.unknown());

  /**
   * The making context for one call: the store, limits, Library and uploads,
   * with the server's stubs in tests. `extra.signal` (the call cancelled)
   * stops core before it reserves and submits.
   */
  const making = (a, extra = {}) => {
    const c = ctx();
    return {
      ...c,
      upload: deps.upload ?? ((path, opts) => uploadFile(catalog, path, opts)),
      deps: stoppable(deps.generate, extra.signal),
      via: "mcp",
      dryRun: a.dry_run ?? false,
    };
  };

  const Submitted = {
    localJobId: z.string().nullable(),
    dryRun: z.boolean(),
    model: z.string(),
    estimateUsd: z.number(),
    route: z.string(),
    refMapping: z.array(z.string()),
    notes: z.array(z.string()),
    next: z.string(),
    detail: Data,
  };
  /** One submitted (or dry-run) director job, as every spending tool reports it. */
  const submitted = (r, what, detail) => {
    const data = {
      localJobId: r.job?.id ?? null,
      dryRun: Boolean(r.dryRun),
      model: r.model,
      estimateUsd: r.estimateUsd,
      route: r.label,
      refMapping: r.refMapping ?? [],
      notes: r.notes ?? [],
      next: r.dryRun ? "Dry run: nothing was submitted or spent." : `Call wait_job with job_id "${r.job.id}".`,
      detail,
    };
    const head = r.dryRun ? `dry run: ${what} on ${data.route}, about $${data.estimateUsd.toFixed(2)}` : `submitted ${what} as ${data.localJobId} on ${data.route}, about $${data.estimateUsd.toFixed(2)}`;
    return ok([head, ...data.refMapping.map((m) => `ref ${m}`), ...data.notes, data.next].join("\n"), data);
  };

  tool(
    "get_shots",
    {
      title: "Storyboard",
      description:
        "Get a film's storyboard: for each planned shot, the still and take in use, every attempt, takes still filming or failed, and the review of the take in use, plus the brief, the plan and the last cut. " +
        "Use it to show the user progress and to decide what to film, review or cut next. " +
        "For the plan alone use get_plan, for a run's raw files and costs get_run, and for Seedance scene cards list_scenes. Free; reads only.",
      inputSchema: { run },
      outputSchema: { film: z.string(), brief: Data.nullable(), plan: Data.nullable(), shots: z.array(Data), production: Data, cut: Data.nullable() },
      annotations: LOOK,
    },
    async (a) => {
      const { store, library } = ctx();
      const b = board(store, a.run, { assets: library.list() });
      return ok(boardLines(b).join("\n"), b);
    },
  );

  tool(
    "make_sheet",
    {
      title: "Make a reference sheet",
      description:
        "Spends kie credits. A reference sheet for a Library character, product or location, made from its own images, so every still keeps them the same. " +
        "Only when the user asked to cast. Returns a job id at once; wait_job, show it, then adopt_sheet if the user likes it.",
      inputSchema: { run, asset: z.string().describe("The Library asset's name."), model: z.string().optional(), dry_run: dryRun },
      outputSchema: Submitted,
      annotations: SPEND,
    },
    async (a, extra) => {
      const r = await makeSheet(catalog, a.run, a.asset, { ...making(a, extra), model: a.model });
      return submitted(r, `${r.asset}'s sheet`, { asset: r.asset, prompt: r.prompt });
    },
  );

  tool(
    "adopt_sheet",
    {
      title: "Adopt a reference sheet",
      description:
        "Make a finished reference sheet the first image of the Library asset it was made for, keeping up to three of the asset's earlier images after it; the previous version stays in the asset's history. " +
        "Call it after make_sheet and wait_job, once the user has seen the sheet and wants it. To keep a scene version use choose_version instead. " +
        "Refused if the job is not a sheet or has not finished. Free; changes the local Library only.",
      inputSchema: { job_id: z.string().describe("The local job id make_sheet returned and wait_job finished.") },
      outputSchema: { name: z.string(), images: z.array(z.string()) },
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const { library, store } = ctx();
      const asset = adoptSheet(library, store, a.job_id);
      const images = asset.images.map((im) => im.path);
      return ok(`${asset.name} now leads with its sheet:\n${images.join("\n")}`, { name: asset.name, images });
    },
  );

  tool(
    "list_voices",
    {
      title: "List voices",
      description:
        "Voices a character's voice can be made in. Default: ElevenLabs preset voices, each with a free preview link. " +
        'source "voicestudio": the voices the user made in VoiceStudio, a free app on this computer (with whether it is open). Free.',
      inputSchema: { source: z.enum(["elevenlabs", "voicestudio"]).optional() },
      outputSchema: { voices: z.array(Data), running: z.boolean().optional() },
      annotations: LOOK,
    },
    async (a = {}) => {
      if (a.source === "voicestudio") {
        const s = await voiceStudioStatus();
        if (!s.running) return ok(`VoiceStudio isn't open at ${s.url}. Ask the user to open it; it is free and runs on their computer.`, { voices: [], running: false });
        return ok(["default (the engine's own voice)", ...s.voices.map((v) => `${v.name} (${v.id})`)].join("\n"), { voices: s.voices, running: true });
      }
      const { voices } = presetVoices();
      return ok(voices.map((v) => `${v.name} (${v.id}): ${v.description}`).join("\n"), { voices });
    },
  );

  tool(
    "get_voice",
    {
      title: "A character's voice",
      description:
        "A Library character's voice (its recording's length and origin, if any), its voice settings and the script a sample would read, with the sample's price. Free.",
      inputSchema: { asset: z.string().describe("The Library character's name.") },
      outputSchema: { voice: Data.nullable(), settings: Data, price: Data },
      annotations: LOOK,
    },
    async (a) => {
      const asset = ctx().library.get(a.asset);
      const settings = voiceSettings(asset);
      const price = voicePrice(catalog, settings.script);
      const voice = asset.voice ? { ...asset.voice, upload: undefined } : null;
      const head = voice ? `${asset.name}'s voice: ${voice.durationS}s, ${voice.origin}` : `${asset.name} has no voice yet.`;
      const { store, limits } = ctx();
      const clip = asset.voice ? { problems: voiceClipProblems(asset), prices: voiceClipPrices(catalog, asset, { store, limits }), has: Boolean(asset.voice.clip && asset.voice.clip.voiceSha256 === asset.voice.sha256) } : null;
      const clipLine = clip ? `\nTalking clip: ${clip.has ? "made" : "none yet"}; a new one costs $${clip.prices["720p"].usd} at 720p or $${clip.prices["480p"].usd} at 480p${clip.problems.length ? `. First: ${clip.problems.join(" ")}` : "."}` : "";
      return ok(`${head}\nA sample of this script costs $${price.usd}.${clipLine}\n\n${settings.script}`, { voice, settings, price, clip });
    },
  );

  tool(
    "save_voice_settings",
    {
      title: "Save voice settings",
      description:
        "A character's voice settings: language, accent, age, tone, energy, the preset voice (voiceId, a name or id from list_voices), the script a sample reads, cardName (the name shown on the voice card scenes send) and cardWords (the exact words heard on the card, which a talking clip lip-syncs to). " +
        "Only the fields given change. A script for a language other than English must be written out. Free.",
      inputSchema: {
        asset: z.string(),
        language: z.string().optional(),
        accent: z.string().optional(),
        age: z.string().optional(),
        tone: z.string().optional(),
        energy: z.string().optional(),
        voiceId: z.string().optional(),
        script: z.string().optional(),
        cardName: z.string().optional(),
        cardWords: z.string().optional(),
      },
      outputSchema: { settings: Data },
      annotations: LOCAL_WRITE,
    },
    async ({ asset: name, ...changes }) => {
      const { library } = ctx();
      const asset = library.get(name);
      const saved = saveVoiceProfile(library, name, { ...(asset.voiceProfile ?? {}), ...changes });
      return ok(`Saved ${saved.name}'s voice settings.`, { settings: saved.voiceProfile ?? {} });
    },
  );

  tool(
    "make_voice",
    {
      title: "Make a voice sample",
      description:
        "Spends kie credits. A few cents (get_voice shows the price): an ElevenLabs v3 sample of the character's script in its chosen preset voice. " +
        "Only when the user asked for it. Returns a job id at once; wait_job, let the user listen, then adopt_voice if they like it.",
      inputSchema: { asset: z.string(), dry_run: dryRun },
      outputSchema: Submitted,
      annotations: SPEND,
    },
    async (a, extra) => {
      const r = await makeVoice(catalog, a.asset, making(a, extra));
      return submitted(r, `${r.asset}'s voice sample`, { asset: r.asset, voiceId: r.voiceId });
    },
  );

  tool(
    "adopt_voice",
    {
      title: "Keep a voice sample",
      description:
        "Keep a finished voice sample as the character's voice: job_id for an ElevenLabs sample, or take for a make_local_voice take. " +
        "Also keeps a finished talking clip (job_id from make_voice_clip). Scenes where the character speaks then send it. What it replaces is kept in history. Free.",
      inputSchema: { job_id: z.string().optional(), take: z.string().optional() },
      outputSchema: { name: z.string(), durationS: z.number(), path: z.string() },
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const { library, store } = ctx();
      if (!a.job_id === !a.take) throw usage("Pass either job_id (an ElevenLabs sample) or take (a VoiceStudio take).");
      if (a.job_id && store.get(a.job_id).stage === "voiceclip") {
        const kept = await adoptVoiceClip(library, store, a.job_id, voiceTools);
        return ok(`${kept.name}'s talking clip is kept (${kept.voice.clip.seconds}s); scenes where they speak send it from now on.`, { name: kept.name, durationS: kept.voice.clip.seconds, path: kept.voice.clip.path });
      }
      const asset = a.take ? await keepLocalVoice(library, a.take, voiceTools) : await adoptVoice(library, store, a.job_id, voiceTools);
      return ok(`${asset.name} now speaks with ${asset.voice.voiceName ?? "the sample"} (${asset.voice.durationS}s).`, { name: asset.name, durationS: asset.voice.durationS, path: asset.voice.path });
    },
  );

  tool(
    "make_voice_clip",
    {
      title: "Make a talking clip",
      description:
        "Spends kie credits. Its price is in get_voice. One Seedance 2.5 clip of the character saying their voice card's words (cardWords) in their voice, lip-synced to the card. " +
        "Scenes then send this clip instead of the card, so face, voice and manner travel together. Only when the user asked for it and agreed the price: max_usd is that price. " +
        "Returns a job id at once; wait_job, let the user watch it, then adopt_voice with the job id if they like it.",
      inputSchema: {
        asset: z.string(),
        resolution: z.enum(CLIP_RESOLUTIONS).optional().describe("720p (default) or 480p, the cheaper draft."),
        max_usd: z.number().positive().describe("The price the user agreed to for this clip, in dollars."),
        dry_run: dryRun,
      },
      outputSchema: Submitted,
      annotations: SPEND,
    },
    async (a, extra) => {
      const r = await makeVoiceClip(catalog, a.asset, { ...making(a, extra), card: voiceTools.card, resolution: a.resolution ?? "720p", maxUsd: a.max_usd });
      return submitted(r, `${r.asset}'s talking clip`, { asset: r.asset, seconds: r.seconds });
    },
  );

  tool(
    "make_local_voice",
    {
      title: "Make a voice with VoiceStudio",
      description:
        "Free, on this computer: VoiceStudio (a voice app the user runs themselves) reads the character's script in one of the user's VoiceStudio voices " +
        '(list_voices with source "voicestudio"; "default" if none). Mood tags VoiceStudio cannot read are left out. Can take minutes; the first time also downloads its model. ' +
        "Returns a take; let the user listen, then adopt_voice with that take if they like it.",
      inputSchema: { asset: z.string(), voice: z.string().optional(), script: z.string().optional() },
      outputSchema: { take: z.string(), path: z.string(), durationS: z.number().nullable(), voice: z.string() },
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const { library } = ctx();
      const t = await makeLocalVoice(library, a.asset, { voice: a.voice ?? "default", script: a.script ?? null, probe: voiceTools.probe });
      return ok(`VoiceStudio read ${a.asset}'s script in "${t.voice}"${t.durationS != null ? ` (${t.durationS}s)` : ""}: ${t.path}\nIf the user likes it: adopt_voice with take "${t.id}".`, {
        take: t.id,
        path: t.path,
        durationS: t.durationS,
        voice: t.voice,
      });
    },
  );

  tool(
    "save_voice_recording",
    {
      title: "Use a recording as the voice",
      description:
        "Use the user's own recording (2 to 30 seconds; WAV, MP3, AAC, OGG, or M4A which becomes MP3) as the character's voice. " +
        "The path must be inside runs/, library/ or a folder the user allowed. Free.",
      inputSchema: { asset: z.string(), path: z.string() },
      outputSchema: { name: z.string(), durationS: z.number(), path: z.string() },
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const { library, roots } = ctx();
      const asset = await saveRecordedVoice(library, a.asset, runFile(runDir("."), a.path, roots), { roots, ...voiceTools, script: library.get(a.asset).voiceProfile?.script ?? null });
      return ok(`${asset.name} now speaks with the recording (${asset.voice.durationS}s).`, { name: asset.name, durationS: asset.voice.durationS, path: asset.voice.path });
    },
  );

  tool(
    "make_still",
    {
      title: "Make a still",
      description:
        "Spends kie credits. One shot's still: its first frame, worded from the plan on the shot's still model, with its cast and the film's style still as references. " +
        "The plan must pass the checker. Make the first shot's still first: it sets the look for the rest. Only when the user asked for stills. Returns a job id at once; then wait_job.",
      inputSchema: { run, shot, dry_run: dryRun },
      outputSchema: Submitted,
      annotations: SPEND,
    },
    async (a, extra) => {
      const r = await makeStill(catalog, a.run, a.shot, making(a, extra));
      return submitted(r, `${r.shot}'s still`, { shot: r.shot, prompt: r.prompt, style: r.style });
    },
  );

  tool(
    "film_shot",
    {
      title: "Film a shot",
      description:
        "Spends kie credits. Film one shot from its still (or, on a continuous cut, from the last frame of the shot before), worded for its model, padded for trimming, audio off unless it is lip-sync. " +
        "Also how a failed or rejected take is redone. Only when the user asked. Returns a job id at once; then wait_job.",
      inputSchema: { run, shot, dry_run: dryRun },
      outputSchema: Submitted,
      annotations: SPEND,
    },
    async (a, extra) => {
      const r = await filmShot(catalog, a.run, a.shot, making(a, extra));
      return submitted(r, `${r.shot}'s take (${r.generatedS}s)`, { shot: r.shot, prompt: r.prompt, params: r.params, generatedS: r.generatedS, firstFrame: r.firstFrame });
    },
  );

  tool(
    "film_all",
    {
      title: "Film all",
      description:
        "Spends kie credits. Submit every shot that is ready, in order, and return at once; call again with the same max_usd after wait_job settles takes, for the shots that continue from them. " +
        "Only when the user asked to film, after they have seen the storyboard and stated a total: max_usd must be the total the user stated in this conversation. " +
        "It films only the shots left when that total was agreed, each at no more than its price then; a shot added since, or one whose price rose, stops it, and the user must agree a new total. Never refilms a failed take; it reports it.",
      inputSchema: {
        run,
        max_usd: z.number().min(0).describe("The total the user stated for filming, in dollars: their figure, never one you worked out or carried over."),
        dry_run: dryRun,
      },
      outputSchema: {
        submitted: z.array(Data),
        filming: z.array(z.string()),
        waiting: z.array(z.string()),
        done: z.array(z.string()),
        failed: z.array(Data),
        stopped: Data.nullable(),
        remainingUsd: z.number(),
        agreement: Data,
        dryRun: z.boolean(),
      },
      annotations: SPEND,
    },
    async (a, extra) => {
      const r = await filmReady(catalog, a.run, { ...making(a, extra), maxUsd: a.max_usd });
      const lines = [
        ...r.submitted.map((s) => `${s.shot}: ${r.dryRun ? "would film" : `filming ${s.jobId}`} on ${s.model}, ${s.generatedS}s, about $${s.estimateUsd.toFixed(2)}`),
        ...(r.filming.length ? [`filming: ${r.filming.join(", ")}`] : []),
        ...(r.waiting.length ? [`waiting for the shot before: ${r.waiting.join(", ")}`] : []),
        ...(r.done.length ? [`done: ${r.done.join(", ")}`] : []),
        ...r.failed.map((f) => `${f.shot}'s take ${f.state}: ${f.error ?? "no message"}. Not refilmed; ask the user, then film_shot.`),
        ...(r.stopped ? [`stopped at ${r.stopped.shot}: ${r.stopped.message}`] : []),
        r.dryRun ? "Dry run: nothing was submitted or spent." : "Call wait_job for each submitted job, then film_all again for the shots waiting.",
      ];
      return ok(lines.join("\n"), r);
    },
  );

  tool(
    "review_shot",
    {
      title: "Review a shot",
      description:
        "The contact sheet (shown) and first and last frames of the take a shot uses, with the shot's checks. Judge each check from the sheet, then save_review. Free, local.",
      inputSchema: { run, shot },
      outputSchema: { shot: z.string(), take: z.string(), sheet: z.string(), first: z.string(), last: z.string(), durationS: z.number(), checks: z.array(z.string()) },
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const r = await reviewShot(a.run, a.shot, { store: ctx().store });
      const sheet = await imagePreview(r.sheet, { width: 1024 });
      const text = [`${r.shot} · ${r.take} · ${r.durationS.toFixed(2)}s`, "checks:", ...r.checks.map((c) => `- ${c}`)].join("\n");
      return ok(text, r, sheet ? [sheet] : []);
    },
  );

  tool(
    "save_review",
    {
      title: "Save a review",
      description:
        "Record the verdict on the take a shot uses: pass or redo, every check judged with a note on what failed, and optionally the best window to keep (bestWindow.startS, used by the cut). Free, " +
        "unless the film has auto-redo on: then a redo verdict refilms the shot at once (spends kie credits), at most twice a shot and within the total the user set; then wait_job.",
      inputSchema: {
        run,
        shot,
        take: z.string().describe("The take file judged, as review_shot named it."),
        verdict: z.enum(["pass", "redo"]),
        checks: z.array(z.object({ check: z.string(), ok: z.boolean(), note: z.string().optional() })),
        best_window_start_s: z.number().min(0).optional(),
      },
      outputSchema: { take: z.string(), verdict: z.string(), checks: z.array(Data), bestWindow: Data.optional(), at: z.string(), redo: Data.nullable() },
      annotations: SPEND,
    },
    async (a, extra) => {
      const saved = saveReview(a.run, a.shot, {
        take: a.take,
        verdict: a.verdict,
        checks: a.checks,
        ...(a.best_window_start_s != null ? { bestWindow: { startS: a.best_window_start_s } } : {}),
      });
      const redo = await afterReview(catalog, a.run, a.shot, saved, making(a, extra));
      const lines = [`${a.shot}: ${saved.verdict} for ${saved.take}`];
      if (redo?.submitted) lines.push(`auto-redo: refilming ${a.shot} (redo ${redo.redo} of ${MAX_REDOS}) as ${redo.jobId} on ${redo.model}, about $${redo.estimateUsd.toFixed(2)}. Call wait_job with job_id "${redo.jobId}", then review it.`);
      else if (redo) lines.push(`auto-redo held back: ${redo.reason}`);
      return ok(lines.join("\n"), { ...saved, redo });
    },
  );

  tool(
    "cut_film",
    {
      title: "Cut the film",
      description:
        "The editor pass: trim each shot's take (its reviewed best window, else past the padding), join them with the plan's cuts, add an end card, music and voice-over, and deliver film.mp4 in the run folder (numbered, never overwritten). Free, local.",
      inputSchema: {
        run,
        music: z.string().optional().describe("A music file in the run folder."),
        vo: z.string().optional().describe("A voice-over file in the run folder."),
        end_card: z.string().optional().describe("A rendered end card (kie render) in the run folder."),
      },
      outputSchema: { out: z.string(), totalS: z.number(), segments: z.array(Data), joins: z.array(Data), notes: z.array(z.string()) },
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const dir = runDir(a.run, { create: false });
      const { roots, store } = ctx();
      const r = await cutFilm(a.run, {
        store,
        music: a.music ? runFile(dir, a.music, roots) : null,
        vo: a.vo ? runFile(dir, a.vo, roots) : null,
        endCard: a.end_card ? runFile(dir, a.end_card, roots) : null,
      });
      const text = [...r.segments.map((s) => `${s.shot} ${s.file} ${s.startS}s +${s.durationS}s`), ...r.notes, `→ ${r.out} (${r.totalS}s)`].join("\n");
      return ok(text, { out: r.out, totalS: r.totalS, segments: r.segments, joins: r.joins, notes: r.notes });
    },
  );
}
