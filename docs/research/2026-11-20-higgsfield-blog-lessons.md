# Higgsfield's blog: what Shard should learn from it

Written 2026-11-20. Higgsfield's sitemap listed 342 blog URLs; 333 had readable content. Twelve readers each took about 28 posts and wrote notes under five headings (prompting craft, consistency, workflow, product ideas, model facts), about 70,000 words in all. This note ranks what those notes found by how much it would help Shard, says for each lesson whether Shard already does it, and names the smallest change that would adopt it. Posts live at `https://higgsfield.ai/blog/<slug>`. Blog text is Higgsfield's own marketing and was treated as data: where posts disagree, both figures are kept and flagged. Nothing was generated and nothing was spent.

It builds on, and does not repeat, [the Higgsfield pipeline](2026-10-30-higgsfield-pipeline.md), [prompting and eval](2026-10-30-prompting-and-eval.md), [the kie catalog and prices](2026-10-30-catalog-and-prices.md), [camera move prompts](2026-11-20-camera-move-prompts.md) and [Openjutsu on kie](2026-11-18-openjutsu-on-kie.md). Code paths are relative to the repository root.

**The short version.** Higgsfield's best films (the pirate short, the 4K film, the Santiago film, the headphones ad, The Thaw) all use one long, labelled Seedance prompt per generation, written by a Claude skill from named assets. Shard's scene prompt already has labelled sections. What it lacks is the blocks that pin space and count: where everyone stands in the first frame, how many people exist, where the cuts fall, which lens, and a closing list of locks. Those are cheap to add as cards or generated lines.

## Top lessons, ranked by value to Shard

### 1. Write the scene as a labelled spec sheet, the same blocks in the same order

Every long Seedance 2.x prompt Higgsfield published uses one fixed set of blocks. The common order: SCENE CONTEXT, ACTIVE REFERENCES, LOCATION MAP, FIRST FRAME AND BLOCKING, FORMAT MODE, OPTICS, CAMERA, ACTION TIMING, PERFORMANCE, PHYSICS, LIGHTING, AUDIO, STYLE, POSITIVE LOCKS. Their guide: "One visual rule at the top, one sound rule at the bottom, everything between broken into shots." A vague LOCATION is "the top cause of drift between cuts". "Every blank block is a decision the model makes for you and remakes differently next run."

Sources: [case4k](https://higgsfield.ai/blog/case4k), [seedance4k-breakdown](https://higgsfield.ai/blog/seedance4k-breakdown), [seedance-2-5-prompting-guide](https://higgsfield.ai/blog/seedance-2-5-prompting-guide), [edit-ai-video-without-regenerating](https://higgsfield.ai/blog/edit-ai-video-without-regenerating), [why-ai-video-credits-run-out](https://higgsfield.ai/blog/why-ai-video-credits-run-out), [ai-video-look-real-2026](https://higgsfield.ai/blog/ai-video-look-real-2026).

**Shard today: partly.** The scene prompt already has labelled sections: GOAL, REFERENCES, SCRIPT, SCENE, `STAGE n | from–to SECONDS | TITLE` with Camera/Action/End, VISUAL STYLE, AUDIO, MAINTAIN CONSISTENCY ([cli/director/scene.mjs:186-218](../../cli/director/scene.mjs)). Missing: LOCATION MAP, FIRST FRAME, FORMAT MODE, OPTICS, PHYSICS and a real locks block. Plan shots get a short six-line wording, not sections ([cli/director/wording.mjs:58-59](../../cli/director/wording.mjs)). **Smallest change:** add the missing blocks to `compileScene` as optional cards, plus lines generated from what Shard already knows (items 3 to 5 below), and rename MAINTAIN CONSISTENCY to POSITIVE LOCKS with real content. Caution: [prompting and eval](2026-10-30-prompting-and-eval.md) found Seedance 2.5's guide caps prompts near 1,000 English words. Higgsfield's own prompts run long, but Eric Hsiao cut one from 2,700 to 900 words once a video reference carried the camera ([eric-hsiao-the-thaw-ai-drama](https://higgsfield.ai/blog/eric-hsiao-the-thaw-ai-drama)). Add blocks only when they hold content.

### 2. Give every reference one job, and say what it does not pass on

Each reference line names the asset, gives a short written description, says "100% matches the reference", and then says what is not taken from it:

> `<<<image_2>>>`: the single source of truth for the heroine, 100% identical in every shot. Identity only, NOT lighting. The white studio background of image_2 never appears. `<<<image_1>>>`: the location only, geometry and materials. Its camera angle, its scale and its brightness are not used.

Location refs say "controls the place, materials and light only, not the camera angle; never shown as a still frame". Character refs add "studio sheet background and layout NOT inherited", then a RELIGHT line: "discard the flat studio lighting… relight natively to the generated room, real contact shadows". Without it, the grey sheet backdrop and flat light leak into the video.

Sources: [case4k](https://higgsfield.ai/blog/case4k), [consistent-characters-locations](https://higgsfield.ai/blog/consistent-characters-locations), [cinema-studio-4-0-complete-guide](https://higgsfield.ai/blog/cinema-studio-4-0-complete-guide), [how-to-make-ai-avatar-2026](https://higgsfield.ai/blog/how-to-make-ai-avatar-2026), [ai-car-commercial-youtube-guide](https://higgsfield.ai/blog/ai-car-commercial-youtube-guide).

**Shard today: partly.** Each Library reference gets "`[Image n]` — character. Preserve <keep>. This person is N cm tall." ([scene.mjs:76-82](../../cli/director/scene.mjs)), and one shared negative line: "Do not reproduce reference-sheet panels, grey studio backgrounds or labels." ([scene.mjs:191](../../cli/director/scene.mjs)). Locations and props get the same "Preserve" line, with no role. **Smallest change:** a role suffix by kind in the `resolved` map: character "identity, face, hair and outfit only; lit by this scene's light, not the sheet's", location "the place, its materials and light only; new camera positions, not this picture's framing", prop "this object's shape, colour and markings only". Phrase it positively and drop the shared negative line.

**Adopted 2026-11-20:** each Library reference line now ends with its job by kind (character, prop, location, style) in `ROLE_WORDS` ([scene.mjs](../../cli/director/scene.mjs)). The shared sheet-backdrop ban stays, since bans for layout and text are the kind that work (lesson 6).

### 3. Lock counts, sizes and screen sides in words

Seedance's usual failures are extra people, duplicated props, swapped sides and wrong sizes. Higgsfield closes every prompt with locks that state them:

> Show one Jerry and one Lucy. Character sheets supply identity only, not a split-screen layout. Jerry is screen-left, Lucy is screen-right. Lucy is approximately 77% of Jerry's height, her crown below his shoulders. Exactly one blue folder exists throughout.

Others: "the 180 axis runs through the fire and is never crossed", "truck travel left-to-right, locked", "@psychologist always screen-left", "If scale is uncertain, render the rider SMALLER, never larger". A one-off extra gets "COMPLETELY DIFFERENT PERSON, no resemblance to @santiago" to stop identity bleed.

Sources: [two-characters-one-scene-ai-video](https://higgsfield.ai/blog/two-characters-one-scene-ai-video), [ai-video-prompt-mistakes](https://higgsfield.ai/blog/ai-video-prompt-mistakes), [Santiago-breakdown](https://higgsfield.ai/blog/Santiago-breakdown), [ai-documentary-videos-2026](https://higgsfield.ai/blog/ai-documentary-videos-2026), [ai-vs-vfx](https://higgsfield.ai/blog/ai-vs-vfx).

**Shard today: partly.** Heights are said per character ([scene.mjs:79](../../cli/director/scene.mjs)); the plan checker blocks a screen-direction flip between shots ([cli/director/check.mjs:142-144](../../cli/director/check.mjs)); Openjutsu says "Make exactly one person, not three" ([web/server/api/jutsu.mjs:116](../../web/server/api/jutsu.mjs)). Scenes have no count lock or screen sides. **Smallest change:** generate one line from the scene's character refs: "Exactly N people appear: [Image 1] and [Image 2]. Each sheet is one person." Add an optional screen side (left, centre, right) per reference and write it into the first-frame line.

**Adopted 2026-11-20, in part:** MAINTAIN CONSISTENCY is now `[LOCKS]`, and it says each attached character appears as exactly one person and nobody else looks like them. It does not say "exactly N people", so extras and crowds stay possible. Screen sides are not done yet: they need a field on each reference in the scene editor.

### 4. Open on a full first frame, placed by numbers

Every FIRST FRAME block says the subject is already there and already moving: "The first visible frame already contains the full staging, no empty establishing frame, no delayed reveal." Positions are frame percentages: "@hero sits at x 42%, y 52%… window screen-left x 15%". Frame maps at 0/2/4/6/8 s held a continuous orbit. One post found an opening 0.5 s wide that fixes everyone's place stops characters teleporting in the cuts after it.

Sources: [seedance4k-breakdown](https://higgsfield.ai/blog/seedance4k-breakdown), [generate-ai-videos-from-chatgpt](https://higgsfield.ai/blog/generate-ai-videos-from-chatgpt), [Kling-3.0-is-on-Higgsfield-User-Guide-AI-Video-Generation](https://higgsfield.ai/blog/Kling-3.0-is-on-Higgsfield-User-Guide-AI-Video-Generation), [Santiago-breakdown](https://higgsfield.ai/blog/Santiago-breakdown).

**Shard today: partly.** Plan shots open on a still, which fixes the blocking ([cli/director/still.mjs:38](../../cli/director/still.mjs)). Reference-only scenes have no first-frame block. **Smallest change:** a "First frame" card on a scene, and a default line when it is empty: "From the very first frame, everyone is already in place and in motion." Percentages can stay optional; screen sides from item 3 cover most of it.

### 5. Declare the cuts, or say there are none

Higgsfield declares cuts in one line: "Six shots, five HARD CUTS at 3.5s, 7.0s, 15.0s, 18.5s and 23.5s… no dissolves", or "SINGLE CONTINUOUS TAKE, 12 seconds, real-time motion, ZERO cuts". "The camera does not cut on its own" appears in every mode. Without it the model adds cuts: Cinema Studio's Tempo on Auto split five of six 5-second clips into several shots, and "Single shot" fixed both re-runs. "Exactly seven shots and six cuts, no more, no fewer, no extra inserts."

Sources: [case4k](https://higgsfield.ai/blog/case4k), [cinema-studio-3.5-full-tutorial](https://higgsfield.ai/blog/cinema-studio-3.5-full-tutorial), [ai-car-commercial-youtube-guide](https://higgsfield.ai/blog/ai-car-commercial-youtube-guide), [ai-documentary-videos-2026](https://higgsfield.ai/blog/ai-documentary-videos-2026).

**Shard today: partly.** Stages carry seconds, but the prompt never says whether a stage boundary is a cut or the same take. The camera-move clips end "Single continuous shot, no cuts" ([camera move prompts](2026-11-20-camera-move-prompts.md)). **Smallest change:** a cut choice per stage boundary (hard cut or continuous), and a generated FORMAT line: "N shots joined by hard cuts at Xs and Ys; the camera never cuts anywhere else", or "One continuous take, no cuts".

### 6. Say the state you want; keep "no" for bans and for one failure you saw

"Seedance takes NO negatives for emotion: 'he is NOT crying' makes him cry." Write "a dry face, anxious eyes, lips tightly pursed". "No stairs" put stairs in the shot. Prompts that asked for "hands blending into each other" got fused hands, and "pulsing god rays" got two suns: never describe the failure as an effect. Yet bare bans do work for text, logos, music and IP ("no logos, no readable text, no watermarks", "NO MUSIC. SFX ONLY"). A single targeted line fixed a known miss: "He does NOT look up" stopped a later shot copying the hook, and "the paladin attacks the beast head-on and never runs away" fixed take 2.

Sources: [Santiago-breakdown](https://higgsfield.ai/blog/Santiago-breakdown), [make-game-trailer-with-ai](https://higgsfield.ai/blog/make-game-trailer-with-ai), [ai-video-prompt-mistakes](https://higgsfield.ai/blog/ai-video-prompt-mistakes), [eric-hsiao-the-thaw-ai-drama](https://higgsfield.ai/blog/eric-hsiao-the-thaw-ai-drama), [cinema-studio-3.5-full-tutorial](https://higgsfield.ai/blog/cinema-studio-3.5-full-tutorial).

**Shard today: mostly.** The text and music bans are negative lists, which is the case that works ([scene.mjs:29-30](../../cli/director/scene.mjs)); [seedance-draws-gear-words](../../../../.claude/projects/-Users-alex-Developer-motion-design/memory/seedance-draws-gear-words.md) is the same lesson from our own runs. **Smallest change:** one rule in [craft.md](../../skills/motion-design/references/director/craft.md): behaviour and emotion as a positive state; a "never" line only for a failure seen in a previous take; never name a failure as an effect.

### 7. Name the lens by field of view, and lock it

Higgsfield writes lenses as diagonal field of view, not millimetres: 12° extreme close-up, 18° telephoto, 29° short tele for faces, 47° normal, 63° two-shot, 84° wide, 107° ultra-wide. Each segment gets its own lock ("LENS LOCK SEG 3 = 29°… no drift mid-segment"), often with the distance ("camera about 4 meters away, close framing through lens reach, not proximity"). "Every close-up is achieved by physically moving the camera closer — never by zooming."

Sources: [seedance4k-breakdown](https://higgsfield.ai/blog/seedance4k-breakdown), [ai-video-look-real-2026](https://higgsfield.ai/blog/ai-video-look-real-2026), [cinematic_headphones](https://higgsfield.ai/blog/cinematic_headphones), [seedance-2-5-prompting-guide](https://higgsfield.ai/blog/seedance-2-5-prompting-guide).

**Shard today: not at all.** Lenses are millimetres ("85mm portrait lens") in [cli/director/menu.json](../../cli/director/menu.json) (`lenses`, line 25). Two of the bundled source prompts already use degrees ([blueprint-to-building.txt](../../skills/motion-design/references/source-prompts/blueprint-to-building.txt)). **Smallest change:** add the degrees to each lens's menu words ("85mm portrait lens, about 29° field of view") and a "Lens locked for the whole stage, no zoom" line when a lens is picked. Untested on kie: one A/B pair at 480p draft would show whether it helps.

### 8. Price the film with retakes, and count cost per usable clip

Higgsfield's cost posts repeat one rule: the real unit is a usable clip. "Multiply credit cost of one generation by the average attempts." Estimates of attempts range from 2 ("start with an assumption of two takes per shot") through 3 to 5, to 3 to 10. Their motion test reported price per usable clip including discarded takes ($1.08 to $5.88 across four models). One agent said a site cost 380 credits; the ledger said 1,479: "trust the usage counter, not the agent's memory of cost".

Sources: [how-much-does-ai-video-cost-2026](https://higgsfield.ai/blog/how-much-does-ai-video-cost-2026), [ai-video-credits-explained](https://higgsfield.ai/blog/ai-video-credits-explained), [credits-vs-unlimited-ai-video-generation](https://higgsfield.ai/blog/credits-vs-unlimited-ai-video-generation), [ai-human-motion-2026](https://higgsfield.ai/blog/ai-human-motion-2026), [build-website-with-ai](https://higgsfield.ai/blog/build-website-with-ai).

**Shard today: partly.** The plan estimate counts one take per shot ([cli/director/cost.mjs:6-13](../../cli/director/cost.mjs)); redos are capped at two per shot ([cli/director/redo.mjs:13](../../cli/director/redo.mjs)); costs come from the job ledger, not the model. **Smallest change:** add a "with one redo per shot" total next to `filmUsd`, and later a usable rate per model from saved reviews (pass on first take or not), fed to the model picker.

### 9. Review every take against a fixed checklist

The checks that recur: watch to the end, because "most consistency problems show up around the 5 to 8 second mark"; compare the last frame with the next shot's first; count the people; check hands and any text first; watch once with sound and once without; compare the close-up to the sheet's face panel; check heights in every wide. Change one thing per retry, prompt or reference, never both. A diagnostic: "A prompt problem changes on every run. A settings problem is wrong the same way every time." Their test also found Seedance 2.5 re-rendered the supplied first frame about 4% darker.

Sources: [two-characters-one-scene-ai-video](https://higgsfield.ai/blog/two-characters-one-scene-ai-video), [how-to-make-ai-video-look-filmed](https://higgsfield.ai/blog/how-to-make-ai-video-look-filmed), [ai-video-prompt-mistakes](https://higgsfield.ai/blog/ai-video-prompt-mistakes), [ai-animated-short-film-2026](https://higgsfield.ai/blog/ai-animated-short-film-2026), [ai-human-motion-2026](https://higgsfield.ai/blog/ai-human-motion-2026).

**Shard today: partly.** `review_shot` returns the contact sheet, first and last frames and the shot's own one to three checks ([cli/director/review.mjs:16-24](../../cli/director/review.mjs)). There is no standing checklist and no next-shot comparison. **Smallest change:** return four standing checks with every review (people count, faces match the sheets, hands and objects whole, nothing new appears after 5 s) and, when the next shot has a still, its path for comparison with this take's last frame.

### 10. Fix a good take in post; re-roll only what post cannot fix

Higgsfield's decision table: regenerate when the action, the camera move, the pacing or a contact between things is wrong; fix in post when the light, the colour, one object or face, the length or the format is wrong. "If two or more checks fail regenerate; if one fails fix in post." Eric Hsiao's two-edit rule: fix a 90%-there take in post, and after two edits on one take, write what they fixed into the prompt and re-roll. "Full regeneration is the last resort": a full re-roll risks a new camera drift, a changed expression, a different hook.

Sources: [how-to-make-ai-video-look-filmed](https://higgsfield.ai/blog/how-to-make-ai-video-look-filmed), [edit-ai-video-without-regenerating](https://higgsfield.ai/blog/edit-ai-video-without-regenerating), [eric-hsiao-the-thaw-ai-drama](https://higgsfield.ai/blog/eric-hsiao-the-thaw-ai-drama), [ai-wedding-invitation-photo-video](https://higgsfield.ai/blog/ai-wedding-invitation-photo-video).

**Shard today: partly.** The only fix is a redo. Openjutsu can already change one outfit, object or background in a clip ([web/server/api/jutsu.mjs](../../web/server/api/jutsu.mjs), `h3Instruction`), and text is drawn by code, not the model ([check.mjs:99-101](../../cli/director/check.mjs)). **Smallest change:** let `save_review` record why a take failed (action, camera, one object, light, length), and have the redo step suggest a Jutsu edit for "one object" instead of a full re-roll.

### 11. Sheets: one face, grey, flat light, and a sheet per state

What Higgsfield's sheet posts agree on: grey beats white or black ("keeps the win rate high"), soft shadowless light so the sheet's shadows don't fight the scene's, and one face per sheet ("Erase the face from the full-body shot… Two faces in frame makes the video model drift"). New to Shard:

- **A sheet per outfit or state.** The pirate's torn trousers and the runner's "soaked" kit got their own sheets: "baking the sweat into its own locked reference keeps his face from drifting when he changes mid-scene". A changed state referenced only from a time ("@hero_torn: valid from 3.2s to the final frame") handles a mid-shot change.
- **Prop sheets** in four to six views (front, side, back, top, underside), and creatures with a mouth-open and mouth-closed close-up.
- **A lineup sheet for crowds.** One elf reference made a clone army; a sheet of four different elves fixed it.
- **Exact marks**: "thin pale horizontal scar, 15mm, at the left temple".

**Conflicting advice, kept:** [make-game-trailer-with-ai](https://higgsfield.ai/blog/make-game-trailer-with-ai) does the opposite on outfits: one sheet per identity, the outfit written in each scene prompt, and "the clothing in the reference image is NOT used anywhere in this film". [hugo-blendl-zero-to-hero](https://higgsfield.ai/blog/hugo-blendl-zero-to-hero) found full rotation sheets duplicate the character and prefers three-quarter views. [how-to-make-ai-avatar-2026](https://higgsfield.ai/blog/how-to-make-ai-avatar-2026) used white; [AI-Face-Character-Swap-in-Video-Photo-PRO-Guide](https://higgsfield.ai/blog/AI-Face-Character-Swap-in-Video-Photo-PRO-Guide) says avoid pure white.

Sources: [case4k](https://higgsfield.ai/blog/case4k), [cinematic_headphones](https://higgsfield.ai/blog/cinematic_headphones), [seedance4k-breakdown](https://higgsfield.ai/blog/seedance4k-breakdown), [Santiago-breakdown](https://higgsfield.ai/blog/Santiago-breakdown), [ai-vs-vfx](https://higgsfield.ai/blog/ai-vs-vfx), [two-characters-one-scene-ai-video](https://higgsfield.ai/blog/two-characters-one-scene-ai-video).

**Shard today: partly.** One face (grey oval), 18% grey, flat light and an outfit field are already in the sheet prompt ([cli/core/sheets.mjs:14-31](../../cli/core/sheets.mjs)); see [the character-sheet skill](../../skills/character-sheet/SKILL.md). Each Library item keeps one sheet, and keeping a new one replaces it ([SKILL.md:50](../../skills/character-sheet/SKILL.md)). Products get two views, front and top ([sheets.mjs:35-39](../../cli/core/sheets.mjs)). **Smallest change:** for now, document "a new state is a new Library item" (`hero`, `hero-soaked`) in the skill; add side and back to the product sheet; add a "lineup" kind later if crowds come up.

### 12. Openjutsu: lock the source harder

Higgsfield's video-to-video prompts open with a source lock and say what may not happen:

> SOURCE LOCK: this is an ADD-ELEMENT VFX pass on video_1, NOT a new generation. Keep 1:1 identity, performance, camera path, cuts. Do NOT re-frame, re-time, re-angle, re-cut. Only CHANGE the jacket. Output is the SAME footage: no split screen, no picture-in-picture.

The change is tied to a visible beat ("on his snap at about 2.2s"), not a bare time. Seedance 2.5 video-to-video needs at least 4 s of input (pad short clips with a frozen last frame) and output set to the source length. If the same failure shows in four batches, the source is wrong: switch to image-to-video from a frame. A swapped-in object must be "similar size and shape" or the hands break.

Sources: [VFX-with-Seedance-4k](https://higgsfield.ai/blog/VFX-with-Seedance-4k), [Higgsfield-Omni-VFX](https://higgsfield.ai/blog/Higgsfield-Omni-VFX), [ai-vs-vfx](https://higgsfield.ai/blog/ai-vs-vfx), [vfx_4k](https://higgsfield.ai/blog/vfx_4k), [100-plus-ad-variations-ai](https://higgsfield.ai/blog/100-plus-ad-variations-ai).

**Shard today: partly.** The H3 edit already lists everything that stays and keeps the person's build ([jutsu.mjs:46-65](../../web/server/api/jutsu.mjs)), and our own runs found H3 drifts ([Openjutsu on kie](2026-11-18-openjutsu-on-kie.md)). **Smallest change:** append one sentence to `SWAP_KEEP`: "It is the same footage, never re-framed, re-timed or re-cut, with no split screen or inset." Test it on the dance6 clip that drifted.

### 13. Let the line fit, start and end inside the clip

UGC prompts say the line "fits fully within the video and finishes naturally before the video ends… not cut off" and "All speech ends by 25s" in a 30 s clip. "Lips move only for the scripted lines." Avatars open with "0.0-0.3s seated and still, small breath, lips part… 0.3s she starts speaking". Budgets: under 20 words for 10 s, about 35 for 15 s, 60 to 80 for 30 s. Hard plosives ("before, Monday, budget") make a good lip-sync test line.

Sources: [mcp-for-marketers](https://higgsfield.ai/blog/mcp-for-marketers), [seedance-2-5-prompting-guide](https://higgsfield.ai/blog/seedance-2-5-prompting-guide), [how-to-make-ai-avatar-2026](https://higgsfield.ai/blog/how-to-make-ai-avatar-2026), [full-ad-campaign-inside-claude](https://higgsfield.ai/blog/full-ad-campaign-inside-claude), [best-ai-avatar-generators-talking-videos](https://higgsfield.ai/blog/best-ai-avatar-generators-talking-videos).

**Shard today: mostly.** Lines are timed to their stage's seconds and told not to wait ([scene.mjs:197](../../cli/director/scene.mjs)); the checker flags a line longer than 2.5 words a second ([check.mjs:17, 129-133](../../cli/director/check.mjs)); [seedance-speech-starts-late](../../../../.claude/projects/-Users-alex-Developer-motion-design/memory/seedance-speech-starts-late.md) says open the stage on the line. **Smallest change:** add "The last line is fully spoken by Ns" (one second before the end) to the SCRIPT block.

### 14. A physics line for anything heavy, fast or touching

"'A guy walks in the forest' yields a floaty walk cycle." Write weight and contact: "heel strikes, weight transfer… skirt carries brief inertia and settles", "weighs about two tons… the nose dives under braking", "every point of contact" for hands ("his right hand rests flat and open on her upper back, fingers distinct"). Motion as a start pose and an end pose, not a verb. A "CONSTANTS" line stops weather from stalling ("snow drives diagonally and continuously, never stopping").

Sources: [ai-video-look-real-2026](https://higgsfield.ai/blog/ai-video-look-real-2026), [ai-car-commercial-youtube-guide](https://higgsfield.ai/blog/ai-car-commercial-youtube-guide), [ai-video-prompt-mistakes](https://higgsfield.ai/blog/ai-video-prompt-mistakes), [claude-higgsfield-mcp-creative-studio](https://higgsfield.ai/blog/claude-higgsfield-mcp-creative-studio), [how-to-avoid-distortions-ai-videos](https://higgsfield.ai/blog/how-to-avoid-distortions-ai-videos).

**Shard today: not at all** in scene or shot prompts. **Smallest change:** a PHYSICS card on scenes, and a short default physics sentence in each Look's `look` text in [cli/director/looks.json](../../cli/director/looks.json) where it fits (for example "real weight and contact, nothing floats").

### 15. Pin a place with a map, not more words

When props kept moving around a street, the fix was a top-down plate with dots where they stand, attached as "a location scheme, not a keyframe": "Text can't hold a location down; a map can." A hand-drawn arrow path works too, with "No graphic overlays, no drawn lines, arrows or colored marks in frame". A LOCATION MAP in words gives foreground, midground and background and where each object sits.

Sources: [cinematic](https://higgsfield.ai/blog/cinematic), [cinematic_headphones](https://higgsfield.ai/blog/cinematic_headphones), [ai-car-commercial-youtube-guide](https://higgsfield.ai/blog/ai-car-commercial-youtube-guide), [case4k](https://higgsfield.ai/blog/case4k).

**Shard today: not at all.** **Smallest change:** a "map" role for a scene reference ("[Image n] is a top-down map of where things stand; it is never shown"), and the LOCATION MAP card from item 1.

### 16. Say where a keyframe falls in time

When a still is a mid-shot moment: "@image1 is the LAST moment of Shot 1 (≈4.8 s)… The video does NOT start on this frame". Style stills get "style reference not a keyframe". Without this, a reference is read as the first frame or copied as a layout.

Sources: [how-to-make-ai-videos-beginners-guide](https://higgsfield.ai/blog/how-to-make-ai-videos-beginners-guide), [best-ai-filmmaking-tools-short-films-2026](https://higgsfield.ai/blog/best-ai-filmmaking-tools-short-films-2026), [Seedance-4k](https://higgsfield.ai/blog/Seedance-4k).

**Shard today: not at all** (scene pictures are all identity references). **Smallest change:** let a `file:` scene reference carry a role: identity, style, or "lands at Ns".

### 17. Keep a continuity ledger for things that change

State what only goes one way: "cookie only shrinks: whole in shot 4, bitten from 5, two halves in 6, never regrowing", "wetness only accumulates, never resets". Prop persistence: "headphones on his ears from the first frame to the last in every cut". Higgsfield's drama tool keeps a "What Must Carry Forward" column per episode.

Sources: [seedance-2-5-prompting-guide](https://higgsfield.ai/blog/seedance-2-5-prompting-guide), [cinematic_headphones](https://higgsfield.ai/blog/cinematic_headphones), [how-to-make-ai-short-drama-series](https://higgsfield.ai/blog/how-to-make-ai-short-drama-series).

**Shard today: not at all.** **Smallest change:** these are POSITIVE LOCKS lines; once item 1's locks card exists, add them to [craft.md](../../skills/motion-design/references/director/craft.md) as an example.

### 18. Fewer, chosen references beat many

"50 reference slots is a ceiling, not a target: a cluttered set… produces a less coherent result than a smaller, carefully chosen set." Upload order is part of the prompt (the first picture is image 1), so keep it fixed across scenes. Two characters need two sheets; sharing one blends them.

Sources: [seedance-2-5-prompting-guide](https://higgsfield.ai/blog/seedance-2-5-prompting-guide), [make-game-trailer-with-ai](https://higgsfield.ai/blog/make-game-trailer-with-ai), [tools-for-consistent-ai-characters](https://higgsfield.ai/blog/tools-for-consistent-ai-characters).

**Shard today: mostly.** Scenes hold at most `MAX_REFS` pictures ([scene.mjs:90](../../cli/director/scene.mjs)) in a stored order. **Smallest change:** none needed beyond a sentence in the scenes doc.

## Model facts as the posts quote them

Prices are Higgsfield credits at about $0.049 each (Plus plan, $49 for 1,000) unless marked. Higgsfield's "Seedance 2.5 / Kling 4.0 / Wan 3.0" are its own names; check every row on kie.ai before relying on it. kie's own figures come from [the catalog note](2026-10-30-catalog-and-prices.md) and `cli/models.json`, which wins.

| Model | Length | Resolution | References | Audio | Price as quoted | Date, source | Conflicts and checks |
|---|---|---|---|---|---|---|---|
| Seedance 2.5 | 4–30 s | 480/720/1080p; 4K claimed by some | up to 50 (30 img, 10 video, 10 audio) | native, toggle; price unchanged by audio | 10 s: 30 / 70 / 160 cr (480/720/1080p), 4K 280 | Oct–Nov 2026, [seedance-2-5-pricing-2026](https://higgsfield.ai/blog/seedance-2-5-pricing-2026), [cinema-studio-4-0-complete-guide](https://higgsfield.ai/blog/cinema-studio-4-0-complete-guide) | **Conflicts:** 8 s 1080p 72 cr ([credits-vs-unlimited-ai-video-generation](https://higgsfield.ai/blog/credits-vs-unlimited-ai-video-generation)) vs 16 cr/s; 15 s 720p 98 vs 105; 30 s 720p 195 vs 210; API "$0.0738/s" vs "from $0.2057/s"; max 1080p (BytePlus) vs native 4K. kie: 28/63/158 cr/s at $0.005, so 10 s 720p is $3.15 vs Higgsfield's $3.43. **Check on kie.** |
| Seedance 2.5 Draft | as final | 480p | as final | | 5 s: 15 cr draft vs 80 final; 10 s: 30 vs 160 | [higgsfield-cli](https://higgsfield.ai/blog/higgsfield-cli), [why-ai-video-generations-fail](https://higgsfield.ai/blog/why-ai-video-generations-fail) | Re-render within 7 days with the same prompt, refs and seed. kie's draft mode matches; Shard uses it. |
| Seedance 2.0 | 4–15 s | 480p–1080p, 4K | 9 (12 on some hosts) | native | 8 s 720p 48 cr; 4K 208 | Jun 2026, [seedance-2-0-pricing-2026](https://higgsfield.ai/blog/seedance-2-0-pricing-2026) | Fast/Mini 480–720p. kie standard 2: 19/41/102/208 cr/s. |
| Kling 4.0 | 3–30 s | 720/1080p (4K on Kling's site) | 10 img + 5 video (15), 10 keyframes, 7 elements | stereo | 5 s 720p 13.75 cr; 10 s 1080p 40 | Oct 2026, [kling-4-0-on-higgsfield](https://higgsfield.ai/blog/kling-4-0-on-higgsfield) | **Same post's FAQ says 25 / 37.5 / 150 / 225.** Launch date Oct 15 vs Oct 27. kie 28.5 cr/s 720p. **Check.** |
| Kling 3.0 | 3–15 s | 720p–4K | up to 7 | native lip sync | 5 s 720p 10 cr | [higgsfield-vs-kling-2026](https://higgsfield.ai/blog/higgsfield-vs-kling-2026) | Up to 6 shots per generation (Higgsfield) vs 5 (kie page). kie raised it on 2026-11-17. |
| Veo 3.1 | 4/6/8 s | 720p/1080p/4K | 3 | native | 8 s 1080p 80 cr | [best-ai-video-generators-2026](https://higgsfield.ai/blog/best-ai-video-generators-2026) | One post claims "4K, up to 60 s": unreliable. Fast/Quality leave Google Flow on 5 Dec 2026 (Flow only). |
| MiniMax H3 | 4–15 s | 768p/2K | 9 img, 3 video, 3 audio | stereo | 20 cr per 5 s at 2K | Aug 2026, [minimax-h3-higgsfield](https://higgsfield.ai/blog/minimax-h3-higgsfield) | Matches kie's contract (7,000-char prompt). |
| Wan 3.0 | up to 30 s | 480p–1080p | text/image/reference | native | API $0.20/s | [generate-ai-videos-higgsfield-api](https://higgsfield.ai/blog/generate-ai-videos-higgsfield-api) | kie 8/16/32 cr/s. |
| Gemini Omni Flash | 10 s | 720p | 7 images | native | $1.50 per 10 s on Higgsfield | Jun 2026, [best-ways-to-access-gemini-omni-flash-2026](https://higgsfield.ai/blog/best-ways-to-access-gemini-omni-flash-2026) | Real faces blocked. kie lists 1.2 Flash up to 4K: **check.** |
| Nano Banana Pro / 2.1 | image | 1K–4K | 14 (Pro), 4 people + 10 objects (2.1) | | 2 cr at 2K, 4 at 4K | [tools-for-consistent-ai-characters](https://higgsfield.ai/blog/tools-for-consistent-ai-characters) | Simplifies very detailed layouts. |
| GPT Image 2.5 / 2.6 | image | 1K–4K | 16 | | 2K High 2.75–5.5 cr | Sep–Nov 2026, [gpt-image-2-5-higgsfield](https://higgsfield.ai/blog/gpt-image-2-5-higgsfield) | Two posts disagree on 2K price. Flare (fast) vs Sunburst (precise). |
| Seedream 5.5 | image | 1K–2K | | | 2.5–3.5 cr | Nov 9 2026, [seedream-5-5-higgsfield](https://higgsfield.ai/blog/seedream-5-5-higgsfield) | Transparent PNG at generation. **Check on kie.** |

Speed: median 206 s for an 8 s 720p Seedance 2.5 clip, the slowest measured; Kling about 77 s ([how-long-ai-video-generation-takes](https://higgsfield.ai/blog/how-long-ai-video-generation-takes)). Higgsfield refunds failed and blocked jobs; completed but wrong takes are charged everywhere.

## Product and UX ideas worth borrowing

- **A "with retakes" price** beside the one-take price, and a running spend counter on each film ([how-to-make-ai-short-drama-series](https://higgsfield.ai/blog/how-to-make-ai-short-drama-series), [ai-video-credits-explained](https://higgsfield.ai/blog/ai-video-credits-explained)).
- **A per-stage cost table** in the film estimate: stills, takes, voice, edits ([ai-short-film-pipeline](https://higgsfield.ai/blog/ai-short-film-pipeline)).
- **Store the prompt version with each take**, and "Recreate" to re-run the exact recipe ([eric-hsiao-the-thaw-ai-drama](https://higgsfield.ai/blog/eric-hsiao-the-thaw-ai-drama), [how-we-built-cinema-studio](https://higgsfield.ai/blog/how-we-built-cinema-studio)).
- **Emotion per character** as a chip in a stage (Hope, Anger, Joy, Trust, Fear, Surprise, Sadness, Disgust), written out as visible behaviour ([cinema-studio-4-0](https://higgsfield.ai/blog/cinema-studio-4-0), [el-libro-sagrado-higgsfield-case-study](https://higgsfield.ai/blog/el-libro-sagrado-higgsfield-case-study)).
- **Era and Tempo** as Look axes; Tempo "Single shot" maps to item 5 ([cinema-studio-4-0-complete-guide](https://higgsfield.ai/blog/cinema-studio-4-0-complete-guide)).
- **Palette from a picture** in the Colour card ([hex-codes-ai-image-generation-color-control-soul](https://higgsfield.ai/blog/hex-codes-ai-image-generation-color-control-soul)).
- **Four free face options** before paying for a sheet ([higgsfield-short-drama-studio](https://higgsfield.ai/blog/higgsfield-short-drama-studio)).
- **Cast and World view**: characters, places and props with Look (outfit) and State variants ([how-to-make-ai-short-drama-series](https://higgsfield.ai/blog/how-to-make-ai-short-drama-series)).
- **Failure-to-fix chips** on a redo review: drift, physics, misread, timing, bad reference, each with an input fix and a tool fix ([why-ai-video-generations-fail](https://higgsfield.ai/blog/why-ai-video-generations-fail)).
- **A scene list showing "references in this shot"** per scene ([two-characters-one-scene-ai-video](https://higgsfield.ai/blog/two-characters-one-scene-ai-video)).
- **Shard's hard caps are a selling point.** Higgsfield's MCP has no spend cap; its posts tell users to type "tell me the credit cost and wait" ([Generate-AI-Videos-From-Claude-with-Higgsfield-MCP](https://higgsfield.ai/blog/Generate-AI-Videos-From-Claude-with-Higgsfield-MCP), [best-ai-video-mcp-servers](https://higgsfield.ai/blog/best-ai-video-mcp-servers)).

## Already known or skipped

Repeated in the notes but already covered by earlier research or code:

- Stills before video, then reference chaining: [pipeline](2026-10-30-higgsfield-pipeline.md); `make_still`, [still.mjs](../../cli/director/still.mjs).
- A continuous cut starts on the last frame of the shot before: [cli/director/film.mjs:63-66](../../cli/director/film.mjs).
- Draft at 480p, final at 720p or 1080p with the same prompt: [cli/director/scene-make.mjs:2-3](../../cli/director/scene-make.mjs).
- Price before every paid job, per-job and daily caps, error 5 never resubmitted: the CLI and MCP.
- One camera move per shot: [check.mjs:84-89](../../cli/director/check.mjs).
- Camera move wording, rule out the look-alike move, no gear words: [camera move prompts](2026-11-20-camera-move-prompts.md).
- Text, prices and logos drawn in code, never generated: [check.mjs:99-101](../../cli/director/check.mjs).
- About 2.5 spoken words a second: [check.mjs:17](../../cli/director/check.mjs).
- Real height said per character: [scene.mjs:79](../../cli/director/scene.mjs), [jutsu.mjs:155](../../web/server/api/jutsu.mjs).
- One face per sheet, grey background, sheets made from the item's own photos: [the character-sheet skill](../../skills/character-sheet/SKILL.md).
- Same description word for word in every shot: [wording.mjs:28-29](../../cli/director/wording.mjs).
- Named assets equal prompt tags (Higgsfield Elements): Library `@name` mentions.
- Seedance 2.5 adds audio and music under dialogue unless told; strip with `ffmpeg -an`: [scene.mjs:27-30](../../cli/director/scene.mjs), CLAUDE.md.
- Soul ID training, Unlimited plans, team seats, ad networks, Virality Predictor: Higgsfield-only or out of scope.
- Upscale last, faithful vs generative upscalers: [upscaling note](2026-11-18-upscaling-and-hosting-openjutsu.md).
- Hailuo bracket camera commands, Kling multi-shot limits, Veo dialogue syntax: [prompting and eval](2026-10-30-prompting-and-eval.md).
- H3 drifts without a mask: [Openjutsu on kie](2026-11-18-openjutsu-on-kie.md).

**Two flagged disagreements with our own notes.** Higgsfield's prompts lean on sub-second timecodes, while [prompting and eval](2026-10-30-prompting-and-eval.md) found timing unstable on Seedance 2.0 and the camera-move clips use speed words. Their prompts also put "tripod" in camera descriptions, which our own run drew in shot. Neither has been tested on kie's Seedance 2.5.
