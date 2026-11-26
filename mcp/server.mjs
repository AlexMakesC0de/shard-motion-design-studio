#!/usr/bin/env node
// MCP server over the kie harness, for Claude Code and Codex over stdio.
// Thin by design: validate input, call cli/core or cli/lib, shape the result.
// stdout carries the protocol, so nothing in here may print to it.

import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadCatalog, resolveModel, validateVideoRequest } from "../cli/lib/models.mjs";
import { loadPresets, findPreset, routeFor } from "../cli/lib/presets.mjs";
import { RUNS_DIR, runDir, outPath, writeRecord } from "../cli/lib/run.mjs";
import { uploadFile } from "../cli/lib/upload.mjs";
import { probe, measureLoudness, dimsFor, RATIOS } from "../cli/lib/ffmpeg.mjs";
import { extractFrames } from "../cli/lib/frames.mjs";
import { assemble } from "../cli/lib/assemble.mjs";
import { makeVariants, MODES } from "../cli/lib/variants.mjs";
import { burnCaptions } from "../cli/lib/caption.mjs";
import { render, TEMPLATES } from "../cli/lib/render.mjs";
import { unknown, usage } from "../cli/lib/errors.mjs";
import { applyVideoPicks } from "../cli/director/video-picks.mjs";
import { loadLooks, lookView } from "../cli/director/looks.mjs";
import { openJobs } from "../cli/core/jobs.mjs";
import { readLimits } from "../cli/core/spend.mjs";
import { submitJob, waitJob } from "../cli/core/generate.mjs";
import { openLibrary, KINDS } from "../cli/core/assets.mjs";
import { expandRefs } from "../cli/core/refs.mjs";
import { allowedRoots, confinePath, confineProps } from "../cli/core/inputs.mjs";
import { status, listModels, listPresets, estimate, listRuns, getRun } from "../cli/core/views.mjs";
import { ok, fail } from "./results.mjs";
import { artifactPreview, imagePreview } from "./preview.mjs";
import { registerDirector } from "./director.mjs";
import { registerMaking } from "./making.mjs";
import { registerScenes } from "./scenes.mjs";
import { registerSkills } from "./skills.mjs";
import { registerExplore, EXPLORE_INSTRUCTIONS, EXPLORE_TOOLS } from "./explore.mjs";
import { stoppable } from "./stop.mjs";
import { VERSION } from "./version.mjs";

const INSTRUCTIONS =
  "Shard, a motion-design studio over kie.ai. Look first (status, list_models, list_presets, estimate), " +
  "then generate_image or generate_video, then wait_job until it finishes. Generating spends real money " +
  "against a per-job budget and a daily cap. Error 2 means nothing was spent: ask the user. " +
  "Error 5 means a job may exist: never resubmit it. " +
  "If a call times out or its result is lost, call status before generating again: an unsettled job may already exist. " +
  "Relative paths are inside runs/; only runs/, library/ and folders the user allowed can be read. " +
  "To make a film, direct it: agree a brief (save_brief), plan the shots from the menu (get_menu, save_plan), " +
  "and let the checker, the model picker and shot_wording do the craft; all of these are free. " +
  "Then make it only as far as the user asked: make_still for each shot (first shot first), show the storyboard (get_shots), " +
  "film_all with the total the user agreed as max_usd, wait_job, review_shot and save_review for every take, then cut_film. " +
  "A take judged redo waits for the user (film_shot) unless they switched auto-redo on in the studio or with kie auto-redo. " +
  "Scenes are one Seedance 2.5 generation each, kept per film (a film's Scenes step; Create's scratch scenes are run \"create\"): " +
  "save_idea (what the film is about and its scene list), list_scenes, save_scene " +
  "(change only the fields the user named), get_scene_prompt (free: the exact prompt, its problems and prices), then " +
  "draft_scene or final_scene only when the user agreed that spend, then wait_job. copy_scene moves a scene from Create into a film. " +
  "A Library character can have a voice: get_voice, save_voice_settings and list_voices are free; save_voice_recording uses the user's own recording; make_local_voice is free through VoiceStudio on their computer; make_voice spends a few cents. adopt_voice keeps a take or sample. " +
  "With a voice, make_voice_clip (spends; after cardWords is saved) makes a talking clip: the character saying their voice card's words. adopt_voice keeps it. " +
  "A scene sends a character's voice when that character has a line, written @{r1} says {\"line\"}: their talking clip by default, else their voice card (a black video with their name and voice); voiceAs card always sends the card, voiceAs file the bare voice. " +
  "The user keeps a skill library (list_skills): when a request matches a skill's description, load it with get_skill and follow it.";

/** Every tool that can reserve and submit a paid job. Explore mode registers none of them. */
export const SPENDING_TOOLS = new Set(["generate_image", "generate_video", "make_sheet", "make_still", "film_shot", "film_all", "save_review", "draft_scene", "final_scene", "make_voice", "make_voice_clip"]);
/** A tool spends when it is named above or annotated like one (open world, not read-only, not idempotent). */
export const spends = (name, config) => {
  const a = config?.annotations ?? {};
  return SPENDING_TOOLS.has(name) || (a.openWorldHint === true && a.readOnlyHint !== true && a.idempotentHint !== true);
};

const LOOK = { readOnlyHint: true, openWorldHint: false };
const LOCAL_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const SPEND = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const Job = z.object({
  id: z.string(),
  state: z.string(),
  run: z.string(),
  model: z.string(),
  provider: z.string(),
  upstreamTaskId: z.string().nullable(),
  estimateUsd: z.number().nullable(),
  actualUsd: z.number().nullable(),
  createdAt: z.string(),
});

const Asset = {
  name: z.string(),
  kind: z.string(),
  description: z.string(),
  keep: z.string().nullable(),
  heightCm: z.number().int().nullable(),
  images: z.array(
    z.object({
      n: z.number().int(),
      role: z.string(),
      file: z.string(),
      path: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      bytes: z.number(),
      uploadedAt: z.string().nullable(),
    }),
  ),
  usedIn: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
};

const assetView = (a) => ({
  name: a.name,
  kind: a.kind,
  description: a.description,
  keep: a.keep ?? null,
  heightCm: a.heightCm ?? null,
  images: a.images.map((im) => ({
    n: im.n,
    role: im.role ?? "source",
    file: im.file,
    path: im.path,
    width: im.width ?? null,
    height: im.height ?? null,
    bytes: im.bytes,
    uploadedAt: im.upload?.at ?? null,
  })),
  usedIn: a.usedIn ?? [],
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

/**
 * Build the server. `deps` replaces anything that would reach a provider:
 * `generate` (preflight, createTask, waitForTask, download, creditsAfter),
 * `upload` and `credits` (the balance read). Tests pass stubs; production
 * passes nothing.
 */
export function createServer({ deps = {}, catalog = loadCatalog(), mode = process.env.KIE_MCP_MODE === "explore" ? "explore" : "full" } = {}) {
  const explore = mode === "explore";
  const server = new McpServer({ name: "motion-design", version: VERSION }, { instructions: explore ? EXPLORE_INSTRUCTIONS : INSTRUCTIONS });

  // `extra` carries the call's signal, aborted when the client cancels it: spending tools pass it to stoppable().
  // In Explore mode only the free tools that read are registered (and never one that can spend), so no client of this server can spend or change anything.
  const tool = (name, config, fn) =>
    explore && (spends(name, config) || !EXPLORE_TOOLS.has(name))
      ? null
      : server.registerTool(name, config, async (args, extra) => {
      try {
        return await fn(args ?? {}, extra ?? {});
      } catch (err) {
        return fail(err);
      }
    });

  /** Per call, so a limits change or a new run folder is seen without a restart. */
  const ctx = () => {
    const limits = readLimits();
    return { limits, store: openJobs(), roots: allowedRoots(limits), library: openLibrary() };
  };

  /** A path a client named: relative means inside runs/; the real path must sit in an allowed root. */
  const clientPath = (p, roots) => confinePath(isAbsolute(p) ? p : join(RUNS_DIR, p), roots);

  /** A file of a run: a bare name is looked for in the run folder; anything else is a client path. */
  const runFile = (dir, name, roots) =>
    name.includes("/") || isAbsolute(name) ? clientPath(name, roots) : confinePath(join(dir, name), roots);

  /** Outputs land in the run folder under a plain name, never a path, and never over a file already there. */
  const outName = (dir, name) => {
    if (name == null) return undefined;
    if (/[\\/]/.test(name) || name.startsWith(".")) {
      throw unknown(`out must be a plain file name inside the run folder, got "${name}".`);
    }
    if (existsSync(join(dir, name))) {
      throw unknown(`${name} already exists in the run; choose another name or omit out to number it.`);
    }
    return name;
  };

  const Ref = z.object({
    source: z
      .string()
      .describe('An asset name ("zed"), one of its images ("zed#2"), an https:// URL, or a file inside runs/ (relative) or library/.'),
    role: z.enum(catalog.roles),
  });

  registerLook();
  registerAssets();
  registerAssetEdits();
  registerGenerate(); // Task 5
  registerFinish(); // Task 6
  registerDirector(tool, { catalog, ctx });
  registerMaking(tool, { catalog, ctx, deps, runFile });
  registerScenes(tool, { catalog, ctx, deps });
  registerSkills(tool, server);
  if (explore) registerExplore(tool, { catalog, ctx });
  return server;

  function registerLook() {
    tool(
      "status",
      {
        title: "Status",
        description:
          "Report Shard's state before any spending: which provider API keys are set and each provider's live credit balance (fetched from the provider, the only network call), " +
          "how old the local price catalog is (stale after 30 days, when prices may be out of date), today's spend against the daily cap, and jobs not yet settled. " +
          "Call it first in a session, and again after a timeout or lost result before resubmitting, since an unsettled job may already exist. " +
          "For one job's price use estimate; for a past run use get_run. Free.",
        inputSchema: {},
        outputSchema: {
          providers: z.array(
            z.object({
              name: z.string(),
              label: z.string(),
              keyConfigured: z.boolean(),
              balance: z.number().nullable(),
              unit: z.string().nullable(),
            }),
          ),
          catalog: z.object({ captured: z.string().nullable(), ageDays: z.number().nullable(), stale: z.boolean() }),
          today: z.object({ capUsd: z.number(), spentUsd: z.number(), availableUsd: z.number() }),
          unsettled: z.array(Job),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async () => {
        const { store, limits } = ctx();
        const s = await status(catalog, { store, limits, credits: deps.credits });
        const lines = [
          `today: $${s.today.spentUsd.toFixed(2)} spent or held of $${s.today.capUsd.toFixed(2)}; $${s.today.availableUsd.toFixed(2)} available`,
          ...s.providers.map(
            (p) => `${p.label}: ${p.keyConfigured ? "key configured" : "no key"}${p.balance != null ? `, ${p.balance} ${p.unit ?? ""}` : ""}`,
          ),
          `catalog captured ${s.catalog.captured}${s.catalog.stale ? " (stale: prices may be out of date)" : ""}`,
          s.unsettled.length ? `not settled: ${s.unsettled.map((j) => `${j.id} ${j.state}`).join(", ")}` : "no unsettled jobs",
        ];
        return ok(lines.join("\n"), s);
      },
    );

    tool(
      "list_models",
      {
        title: "List models",
        description:
          "List the generation models Shard can use, with each model's durations, aspect ratios, resolutions, reference roles and native audio, " +
          "and for every provider route its price and whether it is verified and usable. " +
          "Use it to choose a model and valid options before estimate, generate_image or generate_video. " +
          "For a recommendation for one planned shot use suggest_model; for ready-made styles use list_presets or list_looks. Free; reads the local catalog.",
        inputSchema: {
          capability: z.enum(["video", "image", "audio"]).optional().describe("Only models of this kind. Omit to list every model."),
        },
        outputSchema: {
          models: z.array(
            z.object({
              id: z.string(),
              capability: z.string(),
              durationsS: z.array(z.number()),
              aspectRatios: z.array(z.string()),
              resolutions: z.array(z.string()),
              refRoles: z.array(z.string()),
              nativeAudio: z.boolean(),
              audioOff: z.object({ param: z.string(), value: z.unknown() }).nullable(),
              notes: z.string().nullable(),
              routes: z.array(
                z.object({
                  provider: z.string(),
                  price: z.string(),
                  verified: z.boolean(),
                  usable: z.boolean(),
                  skipReason: z.string().nullable(),
                }),
              ),
            }),
          ),
        },
        annotations: LOOK,
      },
      async ({ capability }) => {
        const models = listModels(catalog, { capability });
        return ok(models.map((m) => `${m.id} (${m.capability}): ${m.routes.map((r) => `${r.provider} ${r.price}`).join("; ")}`).join("\n"), { models });
      },
    );

    tool(
      "list_presets",
      {
        title: "List presets",
        description:
          "List the gallery presets, ready-made ad styles, each with its default duration and aspect ratio, the model it runs on, " +
          "whether that model is the original (native) or an adaptation, and the source prompt and guide to adapt from. " +
          "Use it when the user wants a proven style to start from: a preset's template replaces your prompt, " +
          "while a look from list_looks only adds a style line to your own prompt; list_models lists the raw models. Free; returns every preset.",
        inputSchema: {},
        outputSchema: {
          presets: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              tagline: z.string().nullable(),
              bestFor: z.string().nullable(),
              durationS: z.number().nullable(),
              aspectRatio: z.string().nullable(),
              model: z.string().nullable(),
              fidelity: z.string().nullable(),
              sourcePromptPath: z.string().nullable(),
              guide: z.string().nullable(),
            }),
          ),
        },
        annotations: LOOK,
      },
      async () => {
        const presets = listPresets(catalog);
        return ok(presets.map((p) => `${p.id}: ${p.title} [${p.fidelity ?? "unrouted"}]`).join("\n"), { presets });
      },
    );

    tool(
    "list_looks",
    {
      title: "List looks",
      description:
        "Short styles for generate_video's look: each sets camera picks (used when you send no picks) and adds a look, pacing and sound line after the prompt. Unlike presets, a look never replaces your prompt. Free.",
      inputSchema: {},
      outputSchema: {
        looks: z.array(
          z.object({
            id: z.string(), title: z.string(), category: z.string(), tagline: z.string(), bestFor: z.string(),
            picks: z.record(z.string(), z.string()), look: z.string(), pacing: z.string(), sound: z.string(), swatch: z.array(z.string()),
          }),
        ),
      },
      annotations: LOOK,
    },
    async () => {
      const looks = loadLooks().looks.map(lookView);
      return ok(looks.map((l) => `${l.id}: ${l.title} (${l.category}) — ${l.tagline}`).join("\n"), { looks });
    },
  );

  tool(
      "estimate",
      {
        title: "Estimate",
        description:
          "Price a generation job before spending: the estimated cost on its route, and whether it fits the per-job budget, the per-job limit and today's remaining daily cap, with the problems that would stop it. " +
          "Call it with the same arguments you would pass to generate_image or generate_video, to check a job or compare options before asking the user to approve the spend. " +
          "It reserves nothing and calls no provider; status shows the day's totals. Free.",
        inputSchema: {
          model: z.string().describe("A model id from list_models, such as seedance-2-5."),
          duration_s: z.number().int().positive().optional().describe("Video length in seconds: one of the model's durationsS."),
          resolution: z.string().optional().describe("Output resolution, such as 480p or 1080p: one of the model's resolutions."),
          aspect_ratio: z.string().optional().describe("Frame shape, such as 16:9 or 9:16: one of the model's aspectRatios."),
          refs: z.array(Ref).optional().describe("The reference images or clips the job would send, as passed to generate_*."),
          params: z.record(z.string(), z.unknown()).optional().describe("Extra model parameters, passed as they would be to generate_*."),
          budget_usd: z.number().positive().optional().describe("Your ceiling for this one job in USD. Omit to use the catalog's default budget for the model's kind."),
          provider: z.string().optional().describe("Price this provider's route (a provider from list_models routes). Omit for the route generating would use."),
        },
        outputSchema: {
          model: z.string(),
          provider: z.string().nullable(),
          providerModel: z.string().nullable(),
          routeUsable: z.boolean(),
          estimateUsd: z.number().nullable(),
          basis: z.string().nullable(),
          budgetUsd: z.number().nullable(),
          withinBudget: z.boolean(),
          perJobUsd: z.number().nullable(),
          withinPerJob: z.boolean(),
          availableTodayUsd: z.number(),
          withinDailyCap: z.boolean(),
          problems: z.array(z.string()),
          allowed: z.boolean(),
        },
        annotations: LOOK,
      },
      async (a) => {
        const { store, limits } = ctx();
        const e = estimate(
          catalog,
          {
            model: a.model,
            durationS: a.duration_s,
            resolution: a.resolution,
            aspectRatio: a.aspect_ratio,
            refs: a.refs ?? [],
            params: a.params ?? {},
            budgetUsd: a.budget_usd,
            provider: a.provider,
          },
          { store, limits },
        );
        const head = e.estimateUsd == null ? "no estimate" : `$${e.estimateUsd.toFixed(2)} (${e.basis})`;
        const verdict = e.allowed ? "allowed" : `not allowed${e.problems.length ? `: ${e.problems.join("; ")}` : ""}`;
        return ok(`${e.model} via ${e.provider ?? "?"}: ${head}; $${e.availableTodayUsd.toFixed(2)} available today; ${verdict}`, e);
      },
    );

    tool(
      "list_runs",
      {
        title: "List runs",
        description:
          "List every run folder in runs/ (each generation or film has one), newest first, with its last change time and file and take counts. " +
          "Use it to find a run's slug, then get_run for one run's prompt, jobs and cost, get_shots for a film's storyboard, or list_scenes for its scenes. " +
          "Returns all runs; reads the local folder only. Free.",
        inputSchema: {},
        outputSchema: {
          runs: z.array(z.object({ run: z.string(), modified: z.string(), files: z.number(), takes: z.number() })),
        },
        annotations: LOOK,
      },
      async () => {
        const runs = listRuns();
        return ok(runs.map((r) => `${r.run}  ${r.takes} take(s)  ${r.modified}`).join("\n") || "no runs yet", { runs });
      },
    );

    tool(
      "get_run",
      {
        title: "Get run",
        description:
          "Read one run folder: its prompt (cut at 20,000 characters), settings, files, takes, job records, cost and review notes. " +
          "Use it to see what a past generation made and what it cost; find slugs with list_runs, and use get_shots instead for a film's storyboard. " +
          "An unknown slug fails with error 3 and names recent runs. Free; reads only.",
        inputSchema: { run: z.string().describe("A run folder slug, as listed by list_runs (such as my-film).") },
        outputSchema: {
          run: z.string(),
          prompt: z.string().nullable(),
          inputs: z.record(z.string(), z.unknown()).nullable(),
          files: z.array(z.object({ name: z.string(), bytes: z.number() })),
          artifacts: z.array(z.string()),
          jobs: z.array(Job),
          cost: z.record(z.string(), z.unknown()).nullable(),
          review: z.string().nullable(),
        },
        annotations: LOOK,
      },
      async ({ run }) => {
        const { store } = ctx();
        const r = getRun(run, { store });
        return ok(`${r.run}: ${r.artifacts.length} take(s), ${r.jobs.length} job(s)`, r);
      },
    );
  }

  function registerAssets() {
    tool(
      "save_asset",
      {
        title: "Save asset",
        description:
          "Save 1-4 images as a named reference (character, product, location or style) to reuse in any job as refs [{ source: name, role }]. " +
          "Images are files inside runs/ (relative paths, e.g. my-film/out.png) or library/. The description is reused word for word in prompts. Free.",
        inputSchema: {
          name: z.string(),
          kind: z.enum(KINDS),
          description: z.string().min(1),
          images: z.array(z.string()).min(1).max(4),
          replace: z.boolean().optional(),
        },
        outputSchema: Asset,
        annotations: LOCAL_WRITE,
      },
      async ({ name, kind, description, images, replace }) => {
        const { library, roots } = ctx();
        const paths = images.map((p) => (isAbsolute(p) ? p : join(RUNS_DIR, p)));
        library.save({ name, kind, description, images: paths, replace: replace ?? false }, { roots });
        const a = assetView(library.get(name));
        return ok(`saved ${a.name} (${a.kind}) with ${a.images.length} image(s); use it as refs [{ source: "${a.name}", role }]`, a);
      },
    );

    tool(
      "list_assets",
      {
        title: "List assets",
        description:
          "List the Library: every saved character, product, location and style reference, with its kind, description, image count, " +
          "and whether it has a reference sheet or a voice. " +
          "Use it to find an asset's name before passing it as refs [{ source: name, role }], and get_asset to see one asset's images. " +
          "Returns all assets; reads the local Library only. Free.",
        inputSchema: {},
        outputSchema: {
          assets: z.array(
            z.object({
              name: z.string(),
              kind: z.string(),
              description: z.string(),
              // An AI influencer's display name, chips and extra words; null for a plain asset.
              persona: z.record(z.string(), z.unknown()).nullable(),
              imageCount: z.number(),
              hasSheet: z.boolean(),
              hasVoice: z.boolean(),
              updatedAt: z.string(),
            }),
          ),
        },
        annotations: LOOK,
      },
      async () => {
        const { library } = ctx();
        const assets = library.list();
        return ok(assets.map((a) => `${a.name} (${a.kind}, ${a.imageCount} image(s)): ${a.description}`).join("\n") || "no assets yet", { assets });
      },
    );

    tool(
      "get_asset",
      {
        title: "Get asset",
        description:
          "Show one Library asset: its kind and description, and every image as a preview numbered #1..#n. " +
          "In refs, the bare name (zed) sends the asset and name#n (zed#2) sends just that image. " +
          "Find names with list_assets; an unknown name fails with error 3 and lists the saved ones. Free; reads only.",
        inputSchema: { name: z.string().describe("The asset's saved name, without a #n suffix (such as zed).") },
        outputSchema: Asset,
        annotations: LOOK,
      },
      async ({ name }) => {
        const { library } = ctx();
        const a = assetView(library.get(name));
        const previews = [];
        for (const im of a.images) {
          const p = await imagePreview(im.path);
          if (p) previews.push(p);
        }
        const lines = [`${a.name} (${a.kind}): ${a.description}`, ...a.images.map((im) => `#${im.n} ${im.file} ${im.width ?? "?"}×${im.height ?? "?"}`)];
        return ok(lines.join("\n"), a, previews);
      },
    );
  }

  function registerAssetEdits() {
    tool(
      "update_asset",
      {
        title: "Update asset",
        description:
          "Change a Library item's kind, description, keep (what a scene preserves from it) or a character's height without touching its images. Free. " +
          "Height is said in every prompt the character's sheet goes into, so two characters keep their real sizes.",
        inputSchema: {
          name: z.string(),
          kind: z.enum(KINDS).optional(),
          description: z.string().min(1).optional(),
          keep: z.string().optional().describe("Empty text clears it."),
          heightCm: z.number().int().min(50).max(250).nullable().optional().describe("A character's real height in whole centimetres (183); null clears it."),
        },
        outputSchema: Asset,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async ({ name, ...changes }) => {
        const { library } = ctx();
        const given = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
        const a = assetView(library.update(name, given));
        return ok(`updated ${a.name}`, a);
      },
    );

    tool(
      "remove_asset",
      {
        title: "Remove asset",
        description: "Take an item out of the Library. Its folder moves to library/.trash, so it can be recovered by hand. Only when the user asked. Free.",
        inputSchema: { name: z.string() },
        outputSchema: { name: z.string(), trashed: z.string() },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      },
      async ({ name }) => {
        const { library } = ctx();
        const r = library.remove(name);
        return ok(`removed ${r.name}; its files are in library/${r.trashed}`, r);
      },
    );
  }

  function registerGenerate() {
    const Submit = {
      localJobId: z.string(),
      upstreamTaskId: z.string().nullable(),
      state: z.string(),
      provider: z.string(),
      providerModel: z.string(),
      estimateUsd: z.number(),
      basis: z.string(),
      refMapping: z.array(z.string()),
      next: z.string(),
    };
    const common = {
      run: z.string().describe("Run folder slug: lowercase letters, digits, hyphens."),
      prompt: z.string().min(1).describe("The full prompt. Never edited by the server."),
      refs: z.array(Ref).optional(),
      resolution: z.string().optional(),
      aspect_ratio: z.string().optional(),
      params: z.record(z.string(), z.unknown()).optional().describe("Route fields such as generate_audio, checked against the route's captured contract."),
      budget_usd: z.number().positive().optional().describe("Per-job budget; defaults to the catalog's."),
      provider: z.string().optional().describe("Only this provider (e.g. kie)."),
    };

    /** Expand refs, record the inputs, then reserve and submit through the core (not once `signal` is aborted). */
    async function submit(capability, model, a, values, { promptFile, inputsFile, artifactBase, useI2v, extra = {}, jobRecord = {}, signal }) {
      const dir = runDir(a.run);
      const { store, limits, roots, library } = ctx();
      const expanded = await expandRefs(a.refs ?? [], {
        catalog,
        library,
        roots,
        baseDir: RUNS_DIR,
        upload: deps.upload ?? ((path, opts) => uploadFile(catalog, path, opts)),
      });
      await writeRecord(dir, promptFile, a.prompt);
      await writeRecord(dir, inputsFile, {
        model: model.id,
        ...extra,
        refs: expanded.refs,
        refMapping: expanded.refMapping,
        params: a.params ?? {},
        via: "mcp",
      });

      const sub = await submitJob(
        catalog,
        {
          capability,
          model,
          run: a.run,
          artifactBase,
          budgetUsd: a.budget_usd,
          only: a.provider,
          values: { ...values, refs: expanded.refs, params: a.params ?? {}, _useI2v: useI2v(expanded.refs) },
          record: { refMapping: expanded.refMapping, assets: expanded.assets, via: "mcp", ...jobRecord },
        },
        { store, limits, deps: stoppable(deps.generate, signal) },
      );
      // The job is submitted and paid for: nothing after this point may throw, or the
      // client loses the job id. A failed bookkeeping write becomes a warning.
      const warnings = [];
      for (const name of expanded.assets) {
        try {
          library.recordUse(name, a.run);
        } catch (err) {
          warnings.push(`warning: could not record that asset "${name}" was used in ${a.run} (${err.message}); the job is submitted.`);
        }
      }

      const out = {
        localJobId: sub.job.id,
        upstreamTaskId: sub.job.upstreamTaskId == null ? null : String(sub.job.upstreamTaskId),
        state: sub.job.state,
        provider: sub.job.provider,
        providerModel: sub.job.providerModel,
        estimateUsd: sub.estimateUsd,
        basis: sub.basis,
        refMapping: expanded.refMapping,
        next: `Call wait_job with job_id "${sub.job.id}".`,
      };
      const text = [
        `submitted ${out.localJobId} (${out.provider} · ${out.providerModel}), estimate $${out.estimateUsd.toFixed(2)}`,
        ...(out.refMapping.length ? [`refs: ${out.refMapping.join("; ")}`] : []),
        ...warnings,
        out.next,
      ];
      return ok(text.join("\n"), out);
    }

    tool(
      "generate_image",
      {
        title: "Generate image",
        description:
          "Spends kie credits. Generates a still. Reserves the estimate against the daily cap, submits, and returns a local job id at once; then call wait_job. " +
          "refs: [{ source, role }] with an asset name, name#n, an https URL or a file in runs/. Write the prompt against the returned refMapping (@Image1 = zed#1).",
        inputSchema: {
          ...common,
          model: z.string().optional().describe("Defaults to gpt-image-2. See list_models."),
          quality: z.string().optional(),
          background: z.string().optional(),
        },
        outputSchema: Submit,
        annotations: SPEND,
      },
      async (a, { signal }) => {
        const model = resolveModel(catalog, a.model ?? "gpt-image-2", "image");
        if (a.resolution && model.resolutions && !model.resolutions.includes(a.resolution)) {
          throw unknown(`${model.id} supports resolutions ${model.resolutions.join(", ")}.`);
        }
        if (a.quality && model.qualities && !model.qualities.includes(a.quality)) {
          throw unknown(`${model.id} supports qualities ${model.qualities.join(", ")}.`);
        }
        return submit(
          "image",
          model,
          a,
          { prompt: a.prompt, resolution: a.resolution, quality: a.quality, aspect_ratio: a.aspect_ratio, background: a.background },
          { promptFile: "image-prompt.txt", inputsFile: "image-inputs.json", artifactBase: "ref", useI2v: (refs) => refs.length > 0, signal },
        );
      },
    );

    tool(
      "generate_video",
      {
        title: "Generate video",
        description:
          "Spends kie credits. Generates a video. Reserves the estimate against the daily cap, submits, and returns a local job id at once; then call wait_job. " +
          "A preset supplies model, duration and aspect ratio defaults only: the prompt is always yours (adapt the preset's source prompt; never send it unmodified). " +
          "A first_frame ref makes it image-to-video. Write the prompt against the returned refMapping. " +
          "picks adds a camera move, shot size, angle, lens and light from get_menu after your prompt, worded for the model. " +
          "look adds a style from list_looks (its picks, unless you send picks, plus a look, pacing and sound line).",
        inputSchema: {
          ...common,
          model: z.string().optional(),
          preset: z.string().optional(),
          look: z.string().optional().describe("An id from list_looks."),
          duration_s: z.number().int().positive().optional(),
          // passthrough: an unknown key reaches the check, which names the six.
          picks: z
            .object({
              move: z.string().optional().describe("An id from get_menu's moves."),
              speed: z.string().optional().describe("An id from get_menu's speeds; needs a move other than static."),
              size: z.string().optional().describe("An id from get_menu's sizes."),
              angle: z.string().optional().describe("An id from get_menu's angles."),
              lens: z.string().optional().describe("An id from get_menu's lenses."),
              light: z.string().optional().describe("An id from get_menu's lights."),
            })
            .passthrough()
            .optional(),
        },
        outputSchema: Submit,
        annotations: SPEND,
      },
      async (a, { signal }) => {
        let modelId = a.model;
        let durationS = a.duration_s;
        let aspectRatio = a.aspect_ratio;
        let presetId = null;
        if (a.preset) {
          const preset = findPreset(loadPresets(), a.preset);
          const route = routeFor(preset, catalog, { override: a.model });
          modelId ??= route.modelId;
          durationS ??= route.defaults.duration_s;
          aspectRatio ??= route.defaults.aspect_ratio;
          presetId = preset.id;
        }
        if (!modelId) throw usage("Need model, or a preset that supplies one. See list_models and list_presets.");

        const model = resolveModel(catalog, modelId, "video");
        const problems = validateVideoRequest(catalog, model, { durationS, aspectRatio, refs: a.refs ?? [] });
        if (problems.length) {
          throw unknown(`Refused before submitting — nothing was spent:\n${problems.map((p) => `  · ${p}`).join("\n")}`);
        }
        // Before any record is written or anything reserved: a bad pick or an over-long prompt costs nothing.
        const worded = applyVideoPicks(a.prompt, a.picks, model, { look: a.look ?? null });
        const { look: _look, ...rest } = a;
        const sent = { ...rest, prompt: worded.prompt };
        const withPicks = worded.typedPrompt !== null ? { picks: worded.picks, look: worded.look, typedPrompt: worded.typedPrompt } : {};
        return submit(
          "video",
          model,
          sent,
          { prompt: sent.prompt, duration: durationS, aspect_ratio: aspectRatio, resolution: a.resolution },
          {
            promptFile: "prompt.txt",
            inputsFile: "inputs.json",
            artifactBase: "out",
            useI2v: (refs) => refs.some((r) => r.role === "first_frame"),
            extra: { preset: presetId, durationS, aspectRatio, ...withPicks },
            jobRecord: withPicks,
            signal,
          },
        );
      },
    );

    tool(
      "wait_job",
      {
        title: "Wait for a job",
        description:
          "Wait for any generating job (generate_image, generate_video, make_still, make_sheet, film_shot, film_all), up to max_wait_s (default 60, at most 120). Still running is a normal result (outcome pending): call again. " +
          "On success the files are in the run folder, the actual cost is recorded, and a preview is shown. Free.",
        inputSchema: {
          job_id: z.string(),
          max_wait_s: z.number().int().min(1).max(120).optional(),
        },
        outputSchema: {
          localJobId: z.string(),
          outcome: z.enum(["succeeded", "failed", "pending", "no-artifact"]),
          state: z.string(),
          artifacts: z.array(z.string()),
          estimateUsd: z.number().nullable(),
          actualUsd: z.number().nullable(),
          costSource: z.string().nullable(),
          message: z.string(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async ({ job_id, max_wait_s }) => {
        const { store } = ctx();
        const w = await waitJob(catalog, store, job_id, { timeoutMs: (max_wait_s ?? 60) * 1000, deps: deps.generate });
        const job = w.job;
        const charged = job.state !== "failed-confirmed-free";
        const message = {
          succeeded: `Done: ${(w.artifacts ?? []).join(", ") || "no files"}.`,
          pending: `${w.message ?? "Still running."} Call wait_job again with job_id "${job.id}".`,
          failed:
            `Job ended ${job.state}: ${job.error ?? "no message"}. ` +
            (charged
              ? "It may have been charged; tell the user before generating again."
              : "Nothing was charged; generating again is safe."),
          "no-artifact": w.message ?? "The task succeeded but returned no file. Do not resubmit; tell the user.",
        }[w.outcome];
        const out = {
          localJobId: job.id,
          outcome: w.outcome,
          state: job.state,
          artifacts: w.artifacts ?? [],
          estimateUsd: job.estimateUsd ?? null,
          actualUsd: job.actualUsd ?? null,
          costSource: job.costSource ?? null,
          message,
        };
        const preview = w.outcome === "succeeded" && out.artifacts.length ? await artifactPreview(out.artifacts[0]) : null;
        const cost = out.actualUsd != null ? ` Cost $${out.actualUsd.toFixed(2)} (${out.costSource}).` : "";
        return ok(`${message}${cost}`, out, preview ? [preview] : []);
      },
    );
  }
  function registerFinish() {
    const Run = z.string().describe("Run folder slug.");
    const InRun = (what) => z.string().describe(`${what}: a file name in the run folder, or a path inside runs/ or library/.`);
    const Ratio = z.enum(Object.keys(RATIOS));

    tool(
      "frames",
      {
        title: "Frames",
        description: "An 8-frame contact sheet plus first and last frame PNGs of a video, written into the run folder; the sheet is shown. Free, local.",
        inputSchema: { run: Run, video: InRun("The video") },
        outputSchema: {
          sheet: z.string(),
          first: z.string(),
          last: z.string(),
          times: z.array(z.number()),
          durationS: z.number(),
        },
        annotations: LOCAL_WRITE,
      },
      async ({ run, video }) => {
        const dir = runDir(run, { create: false });
        const path = runFile(dir, video, ctx().roots);
        const r = await extractFrames(path, { outDir: join(dir, `${basename(path, extname(path))}-frames`) });
        const sheet = await imagePreview(r.sheet, { width: 1024 });
        const out = { sheet: r.sheet, first: r.first, last: r.last, times: r.times, durationS: r.durationS };
        return ok(`${r.sheet}\nfirst ${r.first}\nlast ${r.last}`, out, sheet ? [sheet] : []);
      },
    );

    tool(
      "probe",
      {
        title: "Probe",
        description:
          "Measure a video or audio file with ffprobe: duration, width and height, frame rate, video and audio codecs, file size, " +
          "and for files with sound their loudness (LUFS and true peak). " +
          "Use it to check a take or film before assemble, caption or variants, for example its length or whether it has audio. " +
          "Needs ffmpeg; a missing or unreadable file, or one outside runs/, library/ and the allowed folders, is refused. Free; local, changes nothing.",
        inputSchema: { run: Run, file: InRun("The file") },
        outputSchema: {
          path: z.string(),
          durationS: z.number().nullable(),
          width: z.number().nullable(),
          height: z.number().nullable(),
          fps: z.number().nullable(),
          videoCodec: z.string().nullable(),
          hasAudio: z.boolean(),
          audioCodec: z.string().nullable(),
          sizeBytes: z.number().nullable(),
          lufs: z.number().nullable(),
          truePeakDb: z.number().nullable(),
        },
        annotations: LOOK,
      },
      async ({ run, file }) => {
        const path = runFile(runDir(run, { create: false }), file, ctx().roots);
        const info = await probe(path);
        const loud = info.hasAudio ? await measureLoudness(path) : null;
        const out = {
          path: info.path,
          durationS: info.durationS,
          width: info.width,
          height: info.height,
          fps: info.fps,
          videoCodec: info.videoCodec,
          hasAudio: info.hasAudio,
          audioCodec: info.audioCodec,
          sizeBytes: info.sizeBytes,
          lufs: loud?.inputI ?? null,
          truePeakDb: loud?.inputTp ?? null,
        };
        return ok(`${out.path}: ${out.durationS}s ${out.width}×${out.height} @ ${out.fps}fps${out.hasAudio ? `, audio ${out.audioCodec}` : ", no audio"}`, out);
      },
    );

    tool(
      "assemble",
      {
        title: "Assemble",
        description:
          "Join video files into one film with ffmpeg, in the order given, with optional music, voice-over and crossfades, fitted to one aspect ratio and loudness-normalised. " +
          "Use it to cut your own list of files; for a planned film use cut_film, which follows the plan and its reviews. " +
          "Writes film.mp4 (film-2.mp4 and so on if taken) and assembly.json into the run, never overwriting; a named out that exists is refused. " +
          "Blocks until done, which can take a minute for a long film. Needs ffmpeg. Free; local.",
        inputSchema: {
          run: Run,
          shots: z.array(InRun("A shot")).min(1).describe("The clips to join, in playing order."),
          music: InRun("Music").optional(),
          vo: InRun("Voice-over").optional(),
          transition: z
            .object({
              kind: z.string().regex(/^[a-z0-9]+$/).default("fade").describe("An ffmpeg xfade name: fade, wipeleft, circleopen..."),
              seconds: z.number().positive().describe("Crossfade length in seconds."),
            })
            .optional()
            .describe("A crossfade between every pair of shots. Omit for straight cuts."),
          aspect_ratio: Ratio.optional().describe("The film's frame; shots are fitted to it. Default 16:9."),
          shot_audio: z
            .enum(["auto", "keep", "drop"])
            .optional()
            .describe("The shots' own sound. auto (default) keeps it only when there is no music or voice-over; keep always keeps it; drop silences it."),
          out: z.string().optional().describe("A plain file name; defaults to film.mp4, numbered if taken."),
        },
        outputSchema: { out: z.string(), totalS: z.number(), width: z.number(), height: z.number() },
        annotations: LOCAL_WRITE,
      },
      async (a) => {
        const dir = runDir(a.run, { create: false });
        const { roots } = ctx();
        const name = outName(dir, a.out);
        const shots = a.shots.map((s) => runFile(dir, s, roots));
        const ratio = a.aspect_ratio ?? "16:9";
        const [width, height] = dimsFor(ratio);
        const result = await assemble({
          shots,
          music: a.music ? runFile(dir, a.music, roots) : null,
          vo: a.vo ? runFile(dir, a.vo, roots) : null,
          out: outPath(dir, name, "film", ".mp4"),
          transitionS: a.transition?.seconds ?? 0,
          transition: a.transition?.kind ?? "fade",
          ratio,
          width,
          height,
          shotAudio: a.shot_audio ?? "auto",
        });
        await writeRecord(dir, "assembly.json", result);
        return ok(`${result.out} (${result.totalS}s, ${width}×${height})`, { out: result.out, totalS: result.totalS, width, height });
      },
    );

    tool(
      "variants",
      {
        title: "Variants",
        description: "Reframe a video to other aspect ratios (blur, crop or pad), written into the run folder. Free, local.",
        inputSchema: { run: Run, video: InRun("The video"), ratios: z.array(Ratio).min(1), mode: z.enum(MODES).optional() },
        outputSchema: {
          variants: z.array(z.object({ out: z.string(), width: z.number(), height: z.number(), mode: z.string() })),
        },
        annotations: LOCAL_WRITE,
      },
      async (a) => {
        const dir = runDir(a.run, { create: false });
        const video = runFile(dir, a.video, ctx().roots);
        const result = await makeVariants({ video, ratios: a.ratios, outDir: dir, mode: a.mode ?? "blur" });
        await writeRecord(dir, "variants.json", result);
        const variants = result.variants.map((v) => ({ out: v.out, width: v.width, height: v.height, mode: v.mode }));
        return ok(variants.map((v) => `${v.out} (${v.width}×${v.height}, ${v.mode})`).join("\n"), { variants });
      },
    );

    tool(
      "caption",
      {
        title: "Caption",
        description:
          "Burn subtitles from an SRT file into a video, drawn with the render package, and write the result into the run folder. " +
          "Use it after assemble or cut_film when the film needs on-screen captions; for titles and other exact text use render. " +
          "Writes captioned.mp4 (numbered if taken) and captions.json, never overwriting; a named out that exists is refused, and so is an SRT with no readable cues. " +
          "Needs the render package installed (npm install in render/). Free; local.",
        inputSchema: {
          run: Run,
          video: InRun("The video"),
          srt: InRun("The SRT file"),
          style: z
            .enum(["social", "subtle"])
            .optional()
            .describe("social (default): text on a dark rounded box, for feeds. subtle: plain text with no box."),
          out: z.string().optional().describe("A plain file name; defaults to captioned.mp4, numbered if taken."),
        },
        outputSchema: { out: z.string(), cues: z.number(), style: z.string(), warnings: z.array(z.string()) },
        annotations: LOCAL_WRITE,
      },
      async (a) => {
        const dir = runDir(a.run, { create: false });
        const { roots } = ctx();
        const result = await burnCaptions({
          video: runFile(dir, a.video, roots),
          srt: runFile(dir, a.srt, roots),
          out: outPath(dir, outName(dir, a.out), "captioned", ".mp4"),
          style: a.style ?? "social",
        });
        await writeRecord(dir, "captions.json", result);
        const out = { out: result.out, cues: result.cues, style: result.style, warnings: result.warnings ?? [] };
        return ok(`${out.out} (${out.cues} cues, ${out.style})`, out);
      },
    );

    tool(
      "render",
      {
        title: "Render",
        description: "Render a code template (exact text, logos, numbers) to video in the run folder. Use instead of a video model when copy must land exactly. Free, local.",
        inputSchema: {
          run: Run,
          template: z.enum(Object.keys(TEMPLATES)),
          props: z.record(z.string(), z.unknown()).optional(),
          aspect_ratio: Ratio.optional(),
          duration_s: z.number().positive().max(60).optional(),
          brand: z.string().regex(/^[a-z0-9-]+$/).optional().describe("A brand kit name from brand/."),
          alpha: z.boolean().optional(),
          out: z.string().optional(),
        },
        outputSchema: { out: z.string(), width: z.number(), height: z.number() },
        annotations: LOCAL_WRITE,
      },
      async (a) => {
        const dir = runDir(a.run);
        const outFile = outPath(dir, outName(dir, a.out), a.template, a.alpha ? ".mov" : ".mp4");
        let propsPath;
        if (a.props) {
          // The renderer turns any image path in props into a file:// URL for a headless
          // browser, so every such path is confined like any other file a client names.
          const props = confineProps(a.props, ctx().roots);
          propsPath = join(dir, `props-${a.template}.json`);
          writeFileSync(propsPath, JSON.stringify(props, null, 2) + "\n");
        }
        const result = await render({
          template: a.template,
          propsPath,
          out: outFile,
          ratio: a.aspect_ratio ?? "16:9",
          durationS: a.duration_s,
          brand: a.brand,
          alpha: a.alpha ?? false,
        });
        await writeRecord(dir, `render-${a.template}.json`, result);
        return ok(`${result.out} (${result.width}×${result.height})`, { out: result.out, width: result.width, height: result.height });
      },
    );
  }
}

const entry = process.argv[1] ? realpathSync(process.argv[1]) : null;
if (entry && entry === realpathSync(fileURLToPath(import.meta.url))) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
