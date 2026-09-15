# Professional Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand LyricForge's existing real effect stack into a categorized professional editor with richer adjustment, transform, blur, distortion, stylize, light, time, and audio-reactive effects that render consistently in preview and export.

**Architecture:** Extend the existing creative registry rather than introduce a parallel effect system. Add category/description metadata to built-in effects, keep ordinary single-frame effects in `render-effects.ts`, move heavier professional pixel/geometry kernels into a focused `render-effects-pro.ts`, and add a deterministic temporal sampling layer for Posterize Time and Echo that can render prior stack prefixes at alternate sample times without relying on editor-only frame dropping. The inspector becomes a searchable categorized browser while preserving clip/master scope, effect ordering, enable/disable, duplicate/remove, and existing keyframe semantics.

**Tech Stack:** TypeScript 5.9, React 19, Canvas 2D/OffscreenCanvas, existing renderer/render-surface pool, Vitest 5, current creative registry/keyframe runtime.

**Spec:** `docs/superpowers/specs/2026-09-14-lyric-alignment-pro-effects-design.md`

## Global Constraints

- Effects must be real renderer effects used by both preview and export; no UI-only CSS effects.
- Existing effect instances and old project files must continue to load and render.
- Effect order remains meaningful and deterministic.
- Effects preserve enable/disable, reorder, duplicate, remove, clip/master scope, and keyframes where supported.
- Expensive effects must explicitly support existing `preview-low`, `preview-high`, and `export` quality behavior.
- Installed creative definitions must remain restricted to trusted built-in runtimes.
- Mobile portrait controls must remain touch-usable and scroll correctly.
- Full Adobe Premiere Pro parity, arbitrary shaders, optical flow, and a new native/GPU backend are out of scope.
- Node remains `>=22.13.0`; package manager remains `pnpm@11.25.0`.

---

## File Structure

- Modify `lib/lyricforge/creative-registry.ts`: add effect category/description metadata while preserving compatibility with installed definitions.
- Modify `lib/lyricforge/creative-presets.ts`: add categorized built-in definitions for professional effects.
- Modify `lib/lyricforge/effect-runtime.ts`: carry category-neutral resolved params as today; no UI-only branches.
- Create `lib/lyricforge/render-effects-pro.ts`: color adjustment, transform/crop, directional blur, lens distortion, light leak, strobe helpers.
- Modify `lib/lyricforge/render-effects.ts`: register new trusted handlers and delegate professional kernels.
- Create `lib/lyricforge/temporal-effects.ts`: pure Posterize Time sample calculation and Echo sample/decay planning.
- Modify `lib/lyricforge/renderer.ts`: process temporal effects in stack order by rendering stack prefixes at alternate times, with bounded recursion and surface reuse.
- Modify `components/editor/CreativeInspector.tsx`: searchable grouped effect browser and descriptions.
- Modify `app/mobile-portrait.css`: touch-friendly category/search/effect controls.
- Modify `lib/lyricforge/__tests__/creative-presets.test.ts`, `effect-runtime.test.ts`, `creative-store.test.ts`, `renderer-creative-order.test.ts`, `render-operations.test.ts`, `project-migration.test.ts`.
- Create `lib/lyricforge/__tests__/professional-effects.test.ts`.
- Create `lib/lyricforge/__tests__/temporal-effects.test.ts`.
- Create `lib/lyricforge/__tests__/effects-ui.test.ts`.

---

### Task 1: Effect Categories and Registry Metadata

**Files:**
- Modify: `lib/lyricforge/creative-registry.ts:1`
- Modify: `lib/lyricforge/creative-presets.ts:1`
- Modify: `lib/lyricforge/__tests__/creative-presets.test.ts`
- Modify: `lib/lyricforge/__tests__/creative-registry.test.ts`

**Interfaces:**
- Produces:

```ts
export type EffectCategory='adjust'|'transform'|'blur-sharpen'|'distort'|'stylize'|'light'|'time'|'audio-reactive';
```

- Extends `CreativeDefinition` with optional `category?:EffectCategory` and `description?:string`.
- Built-in `effect` definitions must always provide category and description; text animation/transition definitions may omit them.

- [ ] **Step 1: Write failing category tests**

Add tests that every preferred built-in effect has a valid category and a non-empty human-readable description:

```ts
for(const effect of creativeRegistry.preferred('effect')){
  expect(effect.category).toMatch(/^(adjust|transform|blur-sharpen|distort|stylize|light|time|audio-reactive)$/);
  expect(effect.description?.trim().length).toBeGreaterThan(8);
}
```

Also assert `cloneDefinition` preserves metadata for installed/built-in definitions.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/creative-presets.test.ts lib/lyricforge/__tests__/creative-registry.test.ts
```

Expected: FAIL because category/description fields do not exist.

- [ ] **Step 3: Add metadata types and cloning**

Extend `CreativeDefinition`, `cloneDefinition`, and built-in definitions. Categorize all existing effects rather than only the new ones, for example:

```ts
glow -> stylize
bloom -> light
blur -> blur-sharpen
brightness/contrast/saturation/hue-shift -> adjust
rgb-split/noise-displacement/shake -> distort
vhs/glitch/posterize/pixelate -> stylize
beat-reactive -> audio-reactive
```

- [ ] **Step 4: Run and verify GREEN**

Run the focused tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/creative-registry.ts lib/lyricforge/creative-presets.ts lib/lyricforge/__tests__/creative-presets.test.ts lib/lyricforge/__tests__/creative-registry.test.ts
git commit -m "feat: categorize creative effects"
```

---

### Task 2: Professional Color Adjust Effect

**Files:**
- Create: `lib/lyricforge/render-effects-pro.ts`
- Modify: `lib/lyricforge/creative-presets.ts:1`
- Modify: `lib/lyricforge/render-effects.ts:1`
- Create: `lib/lyricforge/__tests__/professional-effects.test.ts`
- Modify: `lib/lyricforge/__tests__/effect-runtime.test.ts`

**Interfaces:**
- Built-in ID: `builtin.effect.color-adjust`.
- Runtime: `effect.color-adjust`.
- Params:

```ts
exposure: -5..5 default 0
temperature: -100..100 default 0
tint: -100..100 default 0
highlights: -100..100 default 0
shadows: -100..100 default 0
whites: -100..100 default 0
blacks: -100..100 default 0
gamma: .1..3 default 1
saturation: 0..3 default 1
fade: 0..1 default 0
```

All are keyframeable and neutral values must bypass the effect.

- [ ] **Step 1: Write failing registry/runtime tests**

Assert the definition exists, targets clip and master scopes, all params normalize/clamp, neutral values bypass, and keyframes affect resolved values.

- [ ] **Step 2: Add failing deterministic pixel tests**

Use a tiny in-memory canvas fixture if the current Vitest canvas environment supports pixel reads; otherwise test the exported pure pixel transform helper directly:

```ts
const rgba=applyColorAdjustPixel([100,120,140,255],{exposure:1,temperature:20,tint:0,highlights:0,shadows:0,whites:0,blacks:0,gamma:1,saturation:1,fade:0});
expect(rgba[0]).toBeGreaterThan(100);
expect(rgba[2]-rgba[0]).toBeLessThan(40);
```

- [ ] **Step 3: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/professional-effects.test.ts lib/lyricforge/__tests__/effect-runtime.test.ts
```

Expected: FAIL on missing definition/helper.

- [ ] **Step 4: Implement one-pass color adjustment**

In `render-effects-pro.ts`, expose a pure `applyColorAdjustPixel()` and a handler that reads ImageData once, transforms RGB in a single loop, and writes once. Use exposure multiplier `2 ** exposure`; temperature shifts red/blue in opposite directions; tint shifts green vs magenta; highlights/shadows/whites/blacks use luminance-weighted masks; gamma is applied after tonal offsets; saturation blends around luminance; fade lifts blacks toward midgray. Clamp every channel to `0..255`.

- [ ] **Step 5: Register and verify GREEN**

Register `effect.color-adjust` in `EFFECT_HANDLERS`, run focused tests, expected PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/render-effects-pro.ts lib/lyricforge/render-effects.ts lib/lyricforge/creative-presets.ts lib/lyricforge/__tests__/professional-effects.test.ts lib/lyricforge/__tests__/effect-runtime.test.ts
git commit -m "feat: add professional color adjustment effect"
```

---

### Task 3: Transform and Crop Effect

**Files:**
- Modify: `lib/lyricforge/render-effects-pro.ts`
- Modify: `lib/lyricforge/render-effects.ts:1`
- Modify: `lib/lyricforge/creative-presets.ts:1`
- Modify: `lib/lyricforge/__tests__/professional-effects.test.ts`

**Interfaces:**
- Built-in ID: `builtin.effect.transform-crop`.
- Runtime: `effect.transform-crop`.
- Params:

```ts
x:-1..1 default 0
y:-1..1 default 0
scale:.05..8 default 1
scaleX:.05..8 default 1
scaleY:.05..8 default 1
rotation:-360..360 default 0
anchorX:0..1 default .5
anchorY:0..1 default .5
cropLeft:0..0.49 default 0
cropRight:0..0.49 default 0
cropTop:0..0.49 default 0
cropBottom:0..0.49 default 0
opacity:0..1 default 1
```

All numeric params are keyframeable.

- [ ] **Step 1: Add failing transform geometry tests**

Test a pure exported `resolveTransformCrop(env,params)` helper for pixel translation, anchor position, effective scale, crop rectangle, and opacity. Verify neutral params are identity.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/professional-effects.test.ts
```

Expected: FAIL because the transform runtime is missing.

- [ ] **Step 3: Implement geometry and rendering**

Resolve normalized x/y against frame dimensions, clip to crop rectangle, translate to anchor, rotate, scale, and draw source. Use `ctx.save()/restore()` and never mutate source media. Crop applies before transformed drawing through a clipping path.

- [ ] **Step 4: Run and verify GREEN**

Run the focused tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/render-effects-pro.ts lib/lyricforge/render-effects.ts lib/lyricforge/creative-presets.ts lib/lyricforge/__tests__/professional-effects.test.ts
git commit -m "feat: add transform and crop effect"
```

---

### Task 4: Directional Blur, Lens Distortion, Chromatic Aberration, Strobe, Light Leak

**Files:**
- Modify: `lib/lyricforge/render-effects-pro.ts`
- Modify: `lib/lyricforge/render-effects.ts:1`
- Modify: `lib/lyricforge/creative-presets.ts:1`
- Modify: `lib/lyricforge/__tests__/professional-effects.test.ts`

**Interfaces:**
- New runtimes/IDs:

```ts
builtin.effect.directional-blur -> effect.directional-blur
builtin.effect.lens-distortion -> effect.lens-distortion
builtin.effect.chromatic-aberration -> effect.chromatic-aberration
builtin.effect.strobe -> effect.strobe
builtin.effect.light-leak -> effect.light-leak
```

- Directional blur params: `amount 0..80`, `angle -180..180`, `samples 2..24`.
- Lens distortion params: `amount -1..1`, `centerX 0..1`, `centerY 0..1`.
- Chromatic aberration params: `amount 0..40`, `angle -180..180`.
- Strobe params: `rateHz .1..30`, `duty .05..1`, `intensity 0..1`, `color`.
- Light leak params: `intensity 0..1`, `position 0..1`, `width .05..1`, `angle -180..180`, `color`.

- [ ] **Step 1: Add failing definition and pure-plan tests**

Assert parameter ranges, categories, preview quality rules, and deterministic render plans. For directional blur, verify preview-low clamps effective samples to 4 while export uses configured samples up to 24.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/professional-effects.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
```

Expected: FAIL because the effects are missing.

- [ ] **Step 3: Implement directional blur and aberration**

Directional blur composites evenly spaced source draws along angle vector with normalized alpha. Chromatic aberration performs red/green/blue-tinted screen passes offset along the angle vector; keep existing RGB Split for backward compatibility.

- [ ] **Step 4: Implement lens distortion, strobe, and light leak**

Lens distortion uses deterministic strip/mesh sampling rather than arbitrary shaders: split into a quality-dependent grid, map each cell radially around center, and draw from source to distorted destination. Strobe draws source then overlays color only when `(timeMs/1000*rateHz)%1 < duty`, scaled by intensity. Light leak draws a rotated linear/radial gradient in `screen` blend mode over the source.

- [ ] **Step 5: Run and verify GREEN**

Run the focused tests. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/render-effects-pro.ts lib/lyricforge/render-effects.ts lib/lyricforge/creative-presets.ts lib/lyricforge/__tests__/professional-effects.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
git commit -m "feat: add professional blur distort and light effects"
```

---

### Task 5: Temporal Effect Planning

**Files:**
- Create: `lib/lyricforge/temporal-effects.ts`
- Create: `lib/lyricforge/__tests__/temporal-effects.test.ts`
- Modify: `lib/lyricforge/creative-presets.ts:1`

**Interfaces:**
- New built-ins:

```ts
builtin.effect.posterize-time -> effect.posterize-time
builtin.effect.echo -> effect.echo
```

- Posterize Time param: `fps 1..60 default 12`.
- Echo params: `delayMs 10..2000 default 120`, `trails 1..12 default 4`, `decay 0..1 default .6`.
- Produces:

```ts
export function posterizeSampleTime(timeMs:number,fps:number):number;
export function echoSamples(timeMs:number,delayMs:number,trails:number,decay:number,quality:CreativeQuality):{timeMs:number;alpha:number}[];
```

- [ ] **Step 1: Write failing deterministic timing tests**

```ts
expect(posterizeSampleTime(99,10)).toBe(0);
expect(posterizeSampleTime(101,10)).toBe(100);
expect(echoSamples(1000,100,3,.5,'export')).toEqual([
 {timeMs:900,alpha:.5},{timeMs:800,alpha:.25},{timeMs:700,alpha:.125},
]);
```

Assert preview-low reduces trail count but export keeps the configured count.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/temporal-effects.test.ts
```

Expected: FAIL because helper module is missing.

- [ ] **Step 3: Implement pure temporal planning**

Use frame duration `1000/fps` and floor to the previous sample boundary. Echo returns no negative sample times, clamps trail count `1..12`, and applies geometric alpha `decay ** (index+1)`. Preview-low caps trails at 3; preview-high caps at 6; export uses full configured count.

- [ ] **Step 4: Run and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/temporal-effects.ts lib/lyricforge/creative-presets.ts lib/lyricforge/__tests__/temporal-effects.test.ts
git commit -m "feat: define posterize time and echo sampling"
```

---

### Task 6: Temporal Effects in Stack Order

**Files:**
- Modify: `lib/lyricforge/renderer.ts:1`
- Modify: `lib/lyricforge/render-effects.ts:1`
- Modify: `lib/lyricforge/__tests__/renderer-creative-order.test.ts`
- Modify: `lib/lyricforge/__tests__/render-operations.test.ts`
- Modify: `lib/lyricforge/__tests__/temporal-effects.test.ts`

**Interfaces:**
- Extend internal effect processing with a prefix renderer:

```ts
type RenderPrefix=(sampleTimeMs:number,endExclusive:number)=>CanvasImageSource;
```

- Temporal effects are handled by `Renderer.applyEffects` rather than `EFFECT_HANDLERS`; ordinary effects remain delegated to `renderEffect`.

- [ ] **Step 1: Write failing stack-order tests**

Construct stacks such as `color-adjust -> posterize-time -> glow` and assert recorded operations preserve that order. Add a test proving Posterize Time samples the source/prefix at quantized time, not merely the final canvas. Add `echo` after a transform and assert each historical sample includes the prior transform prefix.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/renderer-creative-order.test.ts lib/lyricforge/__tests__/render-operations.test.ts lib/lyricforge/__tests__/temporal-effects.test.ts
```

Expected: FAIL because renderer does not know temporal runtimes.

- [ ] **Step 3: Refactor `applyEffects` into bounded prefix processing**

Implement an internal function conceptually equivalent to:

```ts
applyRange(baseAtTime,effects,time,startIndex,endExclusive,key)
```

For ordinary effects, process current canvas as today. For Posterize Time at index `i`, compute quantized time and call the prefix renderer for `effects[0..i)` at that alternate time, then continue with `i+1`. For Echo at index `i`, composite current plus each `echoSamples(...)` prefix result for `effects[0..i)` before continuing.

Recursion must always decrease `endExclusive`, so temporal effects cannot recurse indefinitely.

- [ ] **Step 4: Make alternate-time source rendering deterministic**

For clip scope, the base callback redraws that clip at `sampleTimeMs`. For master scope, it redraws the scene at `sampleTimeMs` without applying master effects, then processes only the requested master prefix. Suppress editor-only bounds/guides while generating temporal samples so historical frames do not pollute current selection bounds.

- [ ] **Step 5: Run and verify GREEN**

Run focused renderer tests. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/renderer.ts lib/lyricforge/render-effects.ts lib/lyricforge/__tests__/renderer-creative-order.test.ts lib/lyricforge/__tests__/render-operations.test.ts lib/lyricforge/__tests__/temporal-effects.test.ts
git commit -m "feat: render temporal effects in stack order"
```

---

### Task 7: Searchable Categorized Effect Browser

**Files:**
- Modify: `components/editor/CreativeInspector.tsx:1`
- Modify: `app/mobile-portrait.css`
- Create: `lib/lyricforge/__tests__/effects-ui.test.ts`
- Modify: `lib/lyricforge/__tests__/creative-store.test.ts`

**Interfaces:**
- UI categories map directly to `EffectCategory`.
- Existing `store.addClipEffect`, `addMasterEffect`, `move*`, `duplicate*`, `remove*`, and `patch*` methods remain the mutation API.

- [ ] **Step 1: Write failing UI regression tests**

Assert CreativeInspector source includes Search Effects, categories, description rendering, clip/master scope, reorder/duplicate/remove, and keyframe button behavior. Assert mobile CSS provides wrapping/scrolling controls and 44 px minimum touch targets.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/effects-ui.test.ts lib/lyricforge/__tests__/creative-store.test.ts
```

Expected: FAIL on missing browser UI.

- [ ] **Step 3: Implement category and search state**

Replace the single flat preset Choice with:

- a search input;
- compact category chips/select (`All`, Adjust, Transform, Blur & Sharpen, Distort, Stylize, Light, Time, Audio-Reactive);
- a filtered list/grid of effect definitions showing name and description;
- one explicit Add action per selected effect.

Do not change the existing effect cards or mutation semantics.

- [ ] **Step 4: Preserve parameter editing and keyframes**

Keep `ParamControl` and current keyframe insertion behavior unchanged. New effects automatically receive controls from their registry definitions.

- [ ] **Step 5: Add mobile portrait styling**

Search stays full width; category row scrolls horizontally or wraps; effect choices and action buttons are at least 44 px tall; expanded parameter cards remain vertically scrollable.

- [ ] **Step 6: Run and verify GREEN**

Run focused tests. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/editor/CreativeInspector.tsx app/mobile-portrait.css lib/lyricforge/__tests__/effects-ui.test.ts lib/lyricforge/__tests__/creative-store.test.ts
git commit -m "feat: add categorized professional effects browser"
```

---

### Task 8: Backward Compatibility and Trusted Runtime Regression

**Files:**
- Modify: `lib/lyricforge/__tests__/project-migration.test.ts`
- Modify: `lib/lyricforge/__tests__/creative-registry.test.ts`
- Modify: `lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts`
- Modify only if needed: project loading/validation files implicated by failing tests.

**Interfaces:**
- No project schema migration may require existing effect definitions to contain category metadata.
- Installed packages still cannot introduce an untrusted runtime.

- [ ] **Step 1: Add backward-compatibility tests**

Load/construct an old project with existing `builtin.effect.glow`, brightness, VHS, and no new metadata. Assert all resolve and render as before. Assert a catalog definition referencing `effect.color-adjust` may only use that trusted built-in runtime and cannot invent `effect.external-shader`.

- [ ] **Step 2: Run and verify tests**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts
```

Expected after implementation: PASS.

- [ ] **Step 3: Fix only compatibility defects exposed by the tests**

Keep category/description optional at the project/package data boundary; only built-in preferred effect definitions are required to supply them. Preserve old effect IDs and versions.

- [ ] **Step 4: Re-run and verify GREEN**

Run the same focused tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts
git commit -m "test: preserve creative effect compatibility"
```

---

### Task 9: Full Effects and Production Verification

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- No new interfaces; this is the integration gate.

- [ ] **Step 1: Run all effects-focused tests**

```bash
pnpm exec vitest run \
  lib/lyricforge/__tests__/professional-effects.test.ts \
  lib/lyricforge/__tests__/temporal-effects.test.ts \
  lib/lyricforge/__tests__/effect-runtime.test.ts \
  lib/lyricforge/__tests__/creative-presets.test.ts \
  lib/lyricforge/__tests__/creative-registry.test.ts \
  lib/lyricforge/__tests__/creative-store.test.ts \
  lib/lyricforge/__tests__/renderer-creative-order.test.ts \
  lib/lyricforge/__tests__/render-operations.test.ts \
  lib/lyricforge/__tests__/effects-ui.test.ts \
  lib/lyricforge/__tests__/project-migration.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full automated suite**

```bash
pnpm test:run
pnpm test:legacy
pnpm catalog:build
pnpm catalog:validate
pnpm typecheck
pnpm build
```

Expected: every command exits 0.

- [ ] **Step 3: Verify preview/export parity contracts**

Retain tests that prove each newly registered effect has export quality `full`, temporal sample calculations are deterministic regardless of seek order, and preview simplifications affect only declared quality behavior rather than parameter values.

- [ ] **Step 4: Commit any verification fixes**

If verification finds a defect, commit the minimal fix plus regression test with a descriptive `fix:` message. Do not create an empty commit when verification is already green.

- [ ] **Step 5: Request code review**

Use the `requesting-code-review` skill against the completed effects diff before integration.
