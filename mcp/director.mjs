// The director's planning tools: brief, shot plan, checker, model picker and
// per-model wording. All of them are free; nothing here reaches a provider.
import { z } from "zod";
import { loadMenu, ids, GROUPS } from "../cli/director/menu.mjs";
import { ASPECTS, MAX_FILM_S, readBrief, saveBrief } from "../cli/director/brief.mjs";
import { readPlan, savePlan, updateShot, findShot, fillSuggestions } from "../cli/director/plan.mjs";
import { checkPlan } from "../cli/director/check.mjs";
import { costPlan } from "../cli/director/cost.mjs";
import { suggestModel, suggestStillModel } from "../cli/director/pick.mjs";
import { shotWording } from "../cli/director/wording.mjs";
import { briefLines, planLines, findingLines } from "../cli/director/show.mjs";
import { ok } from "./results.mjs";

const LOOK = { readOnlyHint: true, openWorldHint: false };
const LOCAL_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export function registerDirector(tool, { catalog, ctx }) {
  const menu = loadMenu();
  const pick = (group) => z.enum(ids(menu, group));
  const run = z.string().describe("The film's run folder slug: lowercase letters, digits, hyphens.");

  const Brief = z.object({
    takeaway: z.string().describe("The one thing the viewer should leave with."),
    durationS: z.number().int().min(1).max(MAX_FILM_S),
    aspectRatio: z.enum(ASPECTS),
    filmType: pick("filmTypes"),
    audience: z.string().optional(),
    tone: z.string().optional(),
    mustShow: z.array(z.string()).optional(),
    copy: z.array(z.string()).optional().describe("Exact on-screen text. The edit renders it in code; models never draw it."),
    sound: z.object({ music: z.string().optional(), voice: z.string().optional(), sfx: z.string().optional() }).optional(),
  });
  const Shot = z.looseObject({
    id: z.string().describe("Short id such as s1."),
    durationS: z.number().positive().describe("Seconds this shot holds in the cut."),
    purpose: z.string(),
    subject: z.string(),
    action: z.string().describe("What happens, in words. No quoted text, prices or percentages; those go in copy."),
    why: z.string().describe("Why this framing and move tell the story."),
    size: pick("sizes"),
    angle: pick("angles"),
    lens: pick("lenses"),
    depth: pick("depths"),
    move: z.object({ type: pick("moves"), speed: pick("speeds").optional() }).describe("One move per shot."),
    light: pick("lights"),
    cut: pick("cuts").describe("How this shot cuts to the next."),
    job: pick("jobs").describe("Drives the model picker."),
    screenDirection: pick("screenDirections"),
    checks: z.array(z.string()).min(1).max(3).describe("Pass/fail sentences a reviewer can judge from the take."),
    cast: z.array(z.string()).optional().describe("Library asset names in this shot."),
    copy: z.array(z.string()).optional(),
    model: z.string().optional().describe("Leave out to let the picker choose."),
    stillModel: z.string().optional(),
    keyLightSide: pick("keyLightSides").optional(),
    lightReason: z.string().optional(),
    crossesLine: z.string().optional().describe("Why this shot deliberately breaks screen direction."),
    line: z.string().optional().describe("What a lip-sync shot's subject says, word for word. Only on job lip-sync."),
  });
  const Plan = z.object({
    look: z.looseObject({
      palette: z.string(),
      grade: z.string(),
      filmLook: z.string(),
      lensFamily: pick("lensLooks"),
      keyLightSide: pick("keyLightSides"),
      cast: z.array(z.object({ asset: z.string(), role: z.string() })).optional(),
    }),
    shots: z.array(Shot).min(1),
  });
  const Finding = z.object({ shot: z.string().nullable(), rule: z.string(), message: z.string() });
  const Check = { errors: z.array(Finding), warnings: z.array(Finding) };
  const Cost = z.object({
    shots: z.array(
      z.object({
        id: z.string().nullable(),
        stillModel: z.string().nullable(),
        stillUsd: z.number().nullable(),
        continuesFrom: z.string().optional(),
        model: z.string().nullable(),
        generatedS: z.number().nullable(),
        takeUsd: z.number().nullable(),
      }),
    ),
    stillsUsd: z.number(),
    filmUsd: z.number(),
    totalUsd: z.number(),
    complete: z.boolean(),
    availableTodayUsd: z.number().nullable(),
  });
  const Data = z.record(z.string(), z.unknown());

  /** The plan with its checker results and cost, the way get_plan and the saves report it. */
  const planView = (film, plan, { store, limits, library }) => {
    const brief = readBrief(film);
    const check = checkPlan(plan, { catalog, brief, assets: library.list(), menu });
    const cost = costPlan(catalog, plan, { brief, store, limits });
    return { text: planLines({ film, brief, plan, check, cost }).join("\n"), data: { brief, plan, check, cost } };
  };
  const PlanOut = { brief: Data.nullable(), plan: Data.nullable(), check: z.object(Check), cost: Cost };

  tool(
    "get_menu",
    {
      title: "Director's menu",
      description:
        "Every shot size, angle, lens, depth, camera move, speed, light, cut, screen direction, job and film type a plan may use, each with when to use it. Free.",
      inputSchema: {},
      outputSchema: { menu: Data },
      annotations: LOOK,
    },
    async () => {
      const text = GROUPS.map((g) => `${g}: ${menu[g].map((e) => `${e.id} (${e.when})`).join("; ")}`).join("\n");
      return ok(text, { menu });
    },
  );

  tool(
    "get_brief",
    {
      title: "Get brief",
      description: "The film's brief: takeaway, length, frame, film type, audience, tone, must-shows, exact copy and sound. Free.",
      inputSchema: { run },
      outputSchema: { brief: Data.nullable() },
      annotations: LOOK,
    },
    async (a) => {
      const brief = readBrief(a.run);
      return ok(briefLines(brief).join("\n"), { brief });
    },
  );

  tool(
    "save_brief",
    {
      title: "Save brief",
      description:
        "Write the film's brief, replacing the old one (kept in .history). Agree it with the user first: develop a vague idea into a takeaway, offer two or three directions when unsure. Free.",
      inputSchema: { run, brief: Brief },
      outputSchema: { brief: Data },
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const brief = saveBrief(a.run, a.brief, { menu });
      return ok(`Saved runs/${a.run}/brief.json\n${briefLines(brief).join("\n")}`, { brief });
    },
  );

  tool(
    "get_plan",
    {
      title: "Get plan",
      description: "The film's shot plan with the checker's errors and warnings and the cost of every still and take. Free.",
      inputSchema: { run },
      outputSchema: PlanOut,
      annotations: LOOK,
    },
    async (a) => {
      const c = ctx();
      const plan = readPlan(a.run);
      if (!plan) return ok(`runs/${a.run} has no plan yet.`, { brief: readBrief(a.run), plan: null, check: { errors: [], warnings: [] }, cost: costPlan(catalog, null, {}) });
      const v = planView(a.run, plan, c);
      return ok(v.text, v.data);
    },
  );

  tool(
    "save_plan",
    {
      title: "Save plan",
      description:
        "Write the whole shot plan. Needs a saved brief. Leave model out on a shot to let the picker choose. A plan the checker finds errors in is refused with every reason; fix them and save again. Free.",
      inputSchema: { run, plan: Plan },
      outputSchema: PlanOut,
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const c = ctx();
      const { plan } = savePlan(catalog, a.run, a.plan, { assets: c.library.list(), menu });
      const v = planView(a.run, plan, c);
      return ok(`Saved runs/${a.run}/shots.json (v${plan.version}).\n${v.text}`, v.data);
    },
  );

  tool(
    "update_shot",
    {
      title: "Update shot",
      description:
        "Change some fields of one shot and save the plan, refused like save_plan if it breaks a rule. Changing job or durationS without a model asks the picker again. Free.",
      inputSchema: { run, shot: z.string(), changes: Shot.partial() },
      outputSchema: PlanOut,
      annotations: LOCAL_WRITE,
    },
    async (a) => {
      const c = ctx();
      const { plan } = updateShot(catalog, a.run, a.shot, a.changes, { assets: c.library.list(), menu });
      const v = planView(a.run, plan, c);
      return ok(`Updated ${a.shot} (v${plan.version}).\n${v.text}`, v.data);
    },
  );

  tool(
    "check_plan",
    {
      title: "Check plan",
      description: "Run the checker on a plan without saving it, or on the saved plan when plan is left out. Errors block; warnings are craft notes. Free.",
      inputSchema: { run, plan: Plan.optional() },
      outputSchema: Check,
      annotations: LOOK,
    },
    async (a) => {
      const { library } = ctx();
      const brief = readBrief(a.run);
      const assets = library.list();
      // An unsaved plan gets the models saving would give it, so a left-out model is not reported as unfit.
      const plan = a.plan ? fillSuggestions(catalog, a.plan, { brief, assets, menu }) : readPlan(a.run);
      if (!plan) return ok(`runs/${a.run} has no plan yet.`, { errors: [], warnings: [] });
      const check = checkPlan(plan, { catalog, brief, assets, menu });
      return ok(findingLines(check).join("\n"), check);
    },
  );

  tool(
    "suggest_model",
    {
      title: "Suggest model",
      description:
        "Recommend the video model to film one shot of a saved plan, from Alex's ratings for the shot's job: the pick, its tier and why, the generated length and estimated price, " +
        "every rated model ruled out and why, and the image model for the shot's still. " +
        "Use it shot by shot when choosing or explaining models; list_models shows the whole catalog and estimate prices any other option. " +
        "Needs a saved plan (save_plan); an unknown shot fails with error 3 and names the plan's shots. Free; reads only.",
      inputSchema: { run, shot: z.string().describe("A shot id from the saved plan, such as s1.") },
      outputSchema: {
        shot: z.string(),
        model: z.string().nullable(),
        tier: z.string().nullable(),
        reason: z.string(),
        generatedS: z.number().nullable(),
        estimateUsd: z.number().nullable(),
        ruledOut: z.array(z.object({ model: z.string(), tier: z.string(), why: z.string() })),
        stillModel: z.string(),
        stillReason: z.string(),
      },
      annotations: LOOK,
    },
    async (a) => {
      const plan = readPlan(a.run);
      const shot = findShot(plan, a.shot);
      const brief = readBrief(a.run);
      const s = suggestModel(catalog, shot, { brief, plan, assets: ctx().library.list(), menu });
      const still = suggestStillModel(shot, { brief, catalog });
      const data = {
        shot: shot.id,
        model: s.model,
        tier: s.tier,
        reason: s.reason,
        generatedS: s.generatedS,
        estimateUsd: s.estimateUsd,
        ruledOut: s.ruledOut,
        stillModel: still.model,
        stillReason: still.reason,
      };
      const lines = [`${shot.id}: ${s.model ?? "no model"} — ${s.reason}`, ...s.ruledOut.map((r) => `not ${r.model} (${r.tier}): ${r.why}`), `still: ${still.model} — ${still.reason}`];
      return ok(lines.join("\n"), data);
    },
  );

  tool(
    "shot_wording",
    {
      title: "Shot wording",
      description:
        "One saved shot's prompt, worded the way its model reads best, with the params it needs (audio off) and its length against the model's limit. Pass prompt and params to generate_video unchanged. Free.",
      inputSchema: { run, shot: z.string() },
      outputSchema: {
        shot: z.string(),
        model: z.string(),
        family: z.string(),
        prompt: z.string(),
        params: Data,
        chars: z.number(),
        maxChars: z.number().nullable(),
        problems: z.array(z.string()),
      },
      annotations: LOOK,
    },
    async (a) => {
      const { library } = ctx();
      const plan = readPlan(a.run);
      const w = shotWording(catalog, plan, findShot(plan, a.shot), { menu, assets: library.list() });
      return ok(`${w.shot} · ${w.model} · ${w.family}\n${w.prompt}`, w);
    },
  );
}
