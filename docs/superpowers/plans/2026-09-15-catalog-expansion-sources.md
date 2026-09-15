# Catalog Expansion and Source Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the official catalog to at least 12 items in each existing category with explicit provider/source/license metadata and stronger build validation.

**Architecture:** Keep the existing curated, generated official catalog. Add optional structured source metadata to v1 manifests, teach search/UI to expose provider identity, strengthen validation for attribution-bearing licenses, and seed additional pinned content without introducing executable third-party runtimes.

**Tech Stack:** TypeScript, Zod, React, catalog build scripts, Vitest, static JSON/SVG assets.

**Spec:** `docs/superpowers/specs/2026-09-15-audio-aware-alignment-catalog-elements-design.md`

## Global Constraints

- Existing v1 catalog manifests remain readable.
- Effects/transitions/text animations may only reference trusted LyricForge runtimes.
- External assets must record source/provider/license metadata and pinned bytes/revisions.
- Openverse-discovered/Wikimedia items must link to the original work and retain required attribution.
- Initial target before Elements: at least 12 fonts, 12 effects, 12 transitions, 12 text animations.

---

### Task 1: Structured source metadata

**Files:**
- Modify: `lib/lyricforge/catalog-types.ts`
- Modify: `lib/lyricforge/catalog-validation.ts`
- Modify: `scripts/catalog-lib.mjs`
- Modify: `scripts/catalog-lib.d.mts`
- Test: `lib/lyricforge/__tests__/catalog-validation.test.ts`
- Test: `lib/lyricforge/__tests__/catalog-build.test.ts`

**Interfaces:**

Add:

```ts
export interface CatalogSourceDescriptor {
  provider:string;
  itemUrl:string;
  creator?:string;
  attribution?:string;
  discoveredVia?:string;
}
```

Add optional `source?: CatalogSourceDescriptor` to `CatalogAssetManifest` and build-source input. Keep existing `sourceUrl`, `author`, `license`, and `licenseUrl` intact.

- [ ] **Step 1: Write RED validation tests**

Cover accepted legacy manifests with no `source`, accepted new manifests with `source`, rejection of non-HTTPS `itemUrl`, and rejection of blank provider.

- [ ] **Step 2: Add RED attribution tests**

For licenses that require attribution in the seeded catalog policy, assert external entries fail build validation when creator/attribution metadata is absent.

- [ ] **Step 3: Run catalog validation/build tests and confirm RED**

Run: `pnpm vitest run lib/lyricforge/__tests__/catalog-validation.test.ts lib/lyricforge/__tests__/catalog-build.test.ts`

- [ ] **Step 4: Implement additive type/schema/build support**

Keep schemaVersion `1`; the new field is optional. Build scripts must copy source metadata into generated manifests without mutating older entries.

- [ ] **Step 5: Run focused tests and confirm GREEN**

- [ ] **Step 6: Commit**

`git commit -am "feat: add catalog source metadata"`

---

### Task 2: Provider-aware search and browsing

**Files:**
- Modify: `lib/lyricforge/catalog-service.ts`
- Modify: `components/editor/CatalogPanel.tsx`
- Modify: `app/globals.css`
- Modify: `app/mobile-portrait.css`
- Test: `lib/lyricforge/__tests__/catalog-service.test.ts`
- Test: `components/editor/__tests__/CatalogPanel.test.tsx`

**Interfaces:**
- Search corpus includes `source.provider`, `source.creator`, and `source.attribution` where present.
- Catalog cards/details display provider chips.
- Provider filter appears when the current asset type has more than one provider.

- [ ] **Step 1: Write RED service tests**

Assert `search('google fonts', ...)` and provider filters can locate assets by source provider independent of name/tags.

- [ ] **Step 2: Write RED component tests**

Assert provider chip rendering and provider filter behavior while preserving Built-in/Online/Installed/Favorites/Updates controls.

- [ ] **Step 3: Run focused tests and confirm RED**

- [ ] **Step 4: Implement provider-aware service/UI**

Keep provider filtering additive and mobile-safe; cards must remain installable with the current installer flow.

- [ ] **Step 5: Run focused tests and confirm GREEN**

- [ ] **Step 6: Commit**

`git commit -am "feat: add catalog provider browsing"`

---

### Task 3: Expand fonts to 12+

**Files:**
- Create additional `public/catalog/assets/font/<id>/1.0.0/source.json`
- Create matching `preview.svg` files
- Update generated `public/catalog/index.json` through `pnpm catalog:build`
- Test: `lib/lyricforge/__tests__/catalog-build.test.ts`
- Test: `lib/lyricforge/__tests__/catalog-fonts.test.ts`

**Interfaces:**
- All new fonts are openly licensed, pinned to immutable or revision-specific upstream URLs when possible, and include license metadata.

- [ ] **Step 1: Raise the RED minimum-depth assertion to 12 fonts**

- [ ] **Step 2: Add at least six additional fonts**

Choose diverse display/body families from openly licensed upstream sources. Every source entry includes provider metadata (normally Google Fonts), exact source page/revision, OFL license URL, and package file SHA after catalog build.

- [ ] **Step 3: Rebuild catalog and run font/build tests**

Run: `pnpm catalog:build && pnpm vitest run lib/lyricforge/__tests__/catalog-build.test.ts lib/lyricforge/__tests__/catalog-fonts.test.ts`

- [ ] **Step 4: Commit**

`git commit -am "content: expand catalog fonts"`

---

### Task 4: Expand effects/transitions/text animations to 12+ each

**Files:**
- Create additional source/preview pairs under:
  - `public/catalog/assets/effect/`
  - `public/catalog/assets/transition/`
  - `public/catalog/assets/text-animation/`
- Test: `lib/lyricforge/__tests__/catalog-creative.test.ts`
- Test: `lib/lyricforge/__tests__/catalog-build.test.ts`
- Test: `lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts`

**Interfaces:**
- New catalog presets only reuse trusted built-in runtime IDs already resolved by `creativeRegistry`.
- Each preset has materially distinct default parameters, name, description, preview, and tags.

- [ ] **Step 1: Raise RED minimum assertions to 12 for each category**

- [ ] **Step 2: Seed effects**

Add at least six more presets spanning dreamy bloom, cold cinematic, warm film, crushed monochrome, ghost trail, high-energy strobe, soft-focus glow, posterized motion, retro CRT, bleach contrast, or hazy diffusion as available through trusted runtimes.

- [ ] **Step 3: Seed transitions**

Add at least six more presets using existing trusted transition runtimes: directional pushes/wipes, blur/zoom/flash/glitch/film variants, and impact cuts.

- [ ] **Step 4: Seed text animations**

Add at least six more presets using existing trusted animation runtimes: bounce/blur/type-on/stagger/tracking/elastic/shake/karaoke/fade/scale variations.

- [ ] **Step 5: Rebuild catalog and verify runtime trust**

Run: `pnpm catalog:build && pnpm vitest run lib/lyricforge/__tests__/catalog-build.test.ts lib/lyricforge/__tests__/catalog-creative.test.ts lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts`
Expected: all pass; no arbitrary runtime IDs accepted.

- [ ] **Step 6: Commit**

`git commit -am "content: deepen creative catalog"`

---

### Task 5: Catalog-wide source/license quality gate

**Files:**
- Modify: `lib/lyricforge/__tests__/catalog-build.test.ts`
- Modify: `lib/lyricforge/__tests__/catalog-acceptance.test.ts`
- Modify: `scripts/validate-catalog.mjs` if build-time policy belongs there

- [ ] **Step 1: Add catalog-wide assertions**

Assert every online external item has a non-empty provider, HTTPS item URL, license, and license URL when required. Assert all category minimums. Assert duplicate ids/versions are rejected.

- [ ] **Step 2: Add source-diversity assertion**

Require at least two provider labels across the official catalog before Elements are added, while allowing original LyricForge entries to remain the majority of executable-style presets.

- [ ] **Step 3: Run catalog build + validation**

Run: `pnpm catalog:build && pnpm catalog:validate && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

`git commit -am "test: enforce catalog depth and provenance"`
