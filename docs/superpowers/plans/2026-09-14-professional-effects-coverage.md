# Professional Effects Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the professional effects scope by adding the three effects explicitly required by the approved design but not assigned a task in the main professional-effects plan: zoom/radial blur, unsharp-style sharpening, and film burn.

**Architecture:** These are ordinary single-frame renderer effects and therefore belong in the same trusted runtime path as the other professional kernels: definitions in `creative-presets.ts`, deterministic helpers/handlers in `render-effects-pro.ts`, registration in `render-effects.ts`, and coverage in `professional-effects.test.ts`. This plan is a required supplement to `2026-09-14-professional-effects.md` and should execute after its Task 4 and before its temporal-effects Task 5.

**Tech Stack:** TypeScript 5.9, Canvas 2D/OffscreenCanvas, existing render-surface pool, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-14-lyric-alignment-pro-effects-design.md`

## Global Constraints

- All three effects must render in both preview and export.
- Effects must use trusted built-in runtimes only.
- Numeric parameters must be keyframeable unless explicitly computational rather than creative.
- Preview-low may simplify sample counts/resolution; export must render full configured quality.
- Existing `Sharpen` and transition `Film Burn` remain backward-compatible; these new effect definitions do not replace old IDs.

---

### Task 1: Zoom / Radial Blur

**Files:**
- Modify: `lib/lyricforge/creative-presets.ts:1`
- Modify: `lib/lyricforge/render-effects-pro.ts`
- Modify: `lib/lyricforge/render-effects.ts:1`
- Modify: `lib/lyricforge/__tests__/professional-effects.test.ts`

**Interfaces:**
- Built-in ID: `builtin.effect.zoom-blur`.
- Runtime: `effect.zoom-blur`.
- Category: `blur-sharpen`.
- Params: `amount 0..1 default 0`, `centerX 0..1 default .5`, `centerY 0..1 default .5`, `samples 2..24 default 10`.

- [ ] **Step 1: Write failing definition and sampling tests**

Assert the definition exists, is clip/master compatible, `amount` is neutral at zero, and a pure helper computes deterministic sample scales around the requested center. Assert preview-low caps effective samples at 4, preview-high at 10, and export at the configured value up to 24.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/professional-effects.test.ts
```

Expected: FAIL because `builtin.effect.zoom-blur` and its helper do not exist.

- [ ] **Step 3: Implement zoom blur**

Composite `N` source draws with progressively increasing scale around `(centerX*width, centerY*height)`, spreading samples from scale `1` through `1 + amount*.35`. Normalize alpha to `1/N` so neutral brightness remains stable. Skip the effect entirely when `amount===0`.

- [ ] **Step 4: Run and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/creative-presets.ts lib/lyricforge/render-effects-pro.ts lib/lyricforge/render-effects.ts lib/lyricforge/__tests__/professional-effects.test.ts
git commit -m "feat: add zoom blur effect"
```

---

### Task 2: Unsharp-Style Sharpening

**Files:**
- Modify: `lib/lyricforge/creative-presets.ts:1`
- Modify: `lib/lyricforge/render-effects-pro.ts`
- Modify: `lib/lyricforge/render-effects.ts:1`
- Modify: `lib/lyricforge/__tests__/professional-effects.test.ts`

**Interfaces:**
- Built-in ID: `builtin.effect.unsharp-mask`.
- Runtime: `effect.unsharp-mask`.
- Category: `blur-sharpen`.
- Params: `amount 0..2 default .5`, `radius .5..12 default 2`, `threshold 0..1 default .05`.

- [ ] **Step 1: Write failing pure-pixel tests**

Use a small synthetic pixel row and assert flat-color regions stay unchanged while a high-contrast edge increases local contrast when amount is positive. Assert amount zero bypasses the effect.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/professional-effects.test.ts
```

Expected: FAIL because the runtime is missing.

- [ ] **Step 3: Implement bounded unsharp mask**

Create a blurred copy using the existing surface pool and Canvas blur filter at the configured radius, read original + blurred ImageData once, and apply per-channel:

```ts
delta = original - blurred;
out = Math.abs(delta/255) < threshold ? original : original + delta*amount;
```

Clamp channels to `0..255`. Preview-low halves radius and amount sampling cost; export uses full values.

- [ ] **Step 4: Run and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/creative-presets.ts lib/lyricforge/render-effects-pro.ts lib/lyricforge/render-effects.ts lib/lyricforge/__tests__/professional-effects.test.ts
git commit -m "feat: add unsharp mask effect"
```

---

### Task 3: Film Burn Effect

**Files:**
- Modify: `lib/lyricforge/creative-presets.ts:1`
- Modify: `lib/lyricforge/render-effects-pro.ts`
- Modify: `lib/lyricforge/render-effects.ts:1`
- Modify: `lib/lyricforge/__tests__/professional-effects.test.ts`

**Interfaces:**
- Built-in ID: `builtin.effect.film-burn`.
- Runtime: `effect.film-burn`.
- Category: `light`.
- Params: `intensity 0..1 default .6`, `position 0..1 default .5`, `spread .05..1 default .35`, `flicker 0..1 default .2`, `color` default `#ff6a20`.

- [ ] **Step 1: Write failing deterministic burn-plan tests**

Assert the effect definition is separate from the existing transition runtime, amount/intensity zero bypasses safely, and the burn gradient/flicker seed is deterministic for the same effect instance and frame time.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/professional-effects.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
```

Expected: FAIL because the effect definition/runtime is missing.

- [ ] **Step 3: Implement film burn rendering**

Draw the source, then overlay a moving radial/linear hot gradient in `screen` mode with an inner near-white core, configured burn color, and transparent outer edge. Modulate opacity by deterministic seeded flicker derived from `instanceId` and `timeMs`, never `Math.random()`, so preview/export agree frame-for-frame.

- [ ] **Step 4: Run and verify GREEN**

Run the focused tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/creative-presets.ts lib/lyricforge/render-effects-pro.ts lib/lyricforge/render-effects.ts lib/lyricforge/__tests__/professional-effects.test.ts
git commit -m "feat: add film burn effect"
```

---

### Task 4: Coverage Gate

**Files:**
- Modify only if a regression is found.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run the professional-effects focused tests**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/professional-effects.test.ts lib/lyricforge/__tests__/creative-presets.test.ts lib/lyricforge/__tests__/effect-runtime.test.ts
```

Expected: PASS with zoom blur, unsharp mask, and film burn registered and renderable.

- [ ] **Step 2: Verify catalog/trusted-runtime behavior**

```bash
pnpm catalog:build
pnpm catalog:validate
```

Expected: both commands exit 0.

- [ ] **Step 3: Commit only if verification exposes a defect**

If a defect is found, fix the smallest responsible code path, add a regression assertion, and commit with a descriptive `fix:` message. Otherwise do not create an empty commit.
