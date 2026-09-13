# LyricForge Source Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the existing LyricForge ZIP source into normal version-controlled files, preserve the working GitHub Pages deployment, and add the typed creative-asset/project-migration foundation required by the approved mobile/effects/catalog redesign.

**Architecture:** The application source becomes the repository root instead of being unpacked and rewritten only inside CI. GitHub Pages behavior moves into tracked configuration and a reusable public-path helper. A small pure TypeScript foundation under `lib/lyricforge` defines stable references for fonts, effects, transitions, text animations, and project dependencies; no downloaded asset can execute arbitrary JavaScript.

**Tech Stack:** React 19, TypeScript, Vinext 1.0.0-beta.5, Vite 8, Vitest, jsdom, browser APIs, GitHub Actions Pages.

**Spec:** `docs/superpowers/specs/2026-09-13-mobile-effects-catalog-design.md`

## Global Constraints

- Existing projects remain loadable without online access.
- Built-in functionality remains usable offline.
- Creative assets use stable IDs and explicit versions; changing a display name never changes project identity.
- Arbitrary downloaded JavaScript is not an installable asset format.
- The production base remains `/Lyricforge2/`.
- `next/headers`, `headers()`, `cookies()`, and `redirect()` must not be reintroduced into the browser-only editor path.
- No accounts, payments, cloud project sync, or centralized server database are added in this phase.
- This phase is complete only when tests, the static build, artifact validation, and the GitHub Pages workflow pass from tracked source.

## File Structure

- Repository root: application source extracted from `LyricForge-v2-source.zip`.
- `app/`: existing Vinext/Next routes.
- `components/editor/`: existing editor UI.
- `lib/lyricforge/`: existing editor utilities plus the new foundation modules.
- `lib/lyricforge/public-path.ts`: production/dev-safe app asset URL construction.
- `lib/lyricforge/creative-assets.ts`: stable creative-asset reference types.
- `lib/lyricforge/project-migration.ts`: pure backward-compatible project normalization.
- `lib/lyricforge/__tests__/`: focused unit tests.
- `vitest.config.ts`: deterministic test configuration.
- `scripts/verify-pages-build.mjs`: versioned static artifact checks.
- `.github/workflows/deploy-pages.yml`: build/test/deploy tracked source directly.

The ZIP stays in the repository until deployment parity has been proven, then is removed in the final task.

---

### Task 1: Promote the ZIP source into the repository root

**Files:**
- Create/track: source currently contained in `LyricForge-v2-source.zip`
- Preserve: `docs/**`, `.github/**`, `LyricForge-v2-source.zip`

**Interfaces:**
- Consumes: `LyricForge-v2-source.zip`.
- Produces: tracked `app/page.tsx`, `components/editor/Editor.tsx`, `lib/lyricforge/**`, `public/workers/**`, `package.json`, `next.config.ts`, `vite.config.ts` and the rest of the application source.

- [ ] **Step 1: Create an isolated worktree**

```bash
git worktree add ../Lyricforge2-foundation -b feat/source-foundation main
cd ../Lyricforge2-foundation
```

Expected: clean `feat/source-foundation` worktree.

- [ ] **Step 2: Extract source without deleting repository-owned files**

```bash
rm -rf .source-unpack
mkdir .source-unpack
unzip -q LyricForge-v2-source.zip -d .source-unpack
shopt -s dotglob nullglob
entries=(.source-unpack/*)
if [ ${#entries[@]} -eq 1 ] && [ -d "${entries[0]}" ]; then
  cp -a "${entries[0]}"/. ./
else
  cp -a .source-unpack/. ./
fi
rm -rf .source-unpack
```

- [ ] **Step 3: Verify expected source and repository files**

```bash
test -f app/page.tsx
test -f components/editor/Editor.tsx
test -f public/workers/transcription.js
test -f package.json
test -f docs/superpowers/specs/2026-09-13-mobile-effects-catalog-design.md
test -f docs/superpowers/plans/2026-09-13-source-foundation.md
test -f .github/workflows/deploy-pages.yml
```

Expected: every `test` succeeds.

- [ ] **Step 4: Remove the unused server-hosted auth helper and verify browser-only source**

```bash
rm -f app/chatgpt-auth.ts
! grep -RInE 'next/headers|headers\(|cookies\(|redirect\(' app components lib --include='*.ts' --include='*.tsx'
```

Expected: no server-only dynamic API match remains.

- [ ] **Step 5: Commit the promoted source while retaining the archive**

```bash
git add -A
git commit -m "chore: promote LyricForge source into repository"
```

---

### Task 2: Add the unit-test harness before feature tests

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `lib/lyricforge/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `npm test -- --run` and `npm run test:run` as deterministic CI test commands.

- [ ] **Step 1: Install the testing dependencies**

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event
```

- [ ] **Step 2: Preserve all existing scripts and add these two scripts to `package.json`**

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Do not replace the existing build/dev scripts.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `lib/lyricforge/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("LyricForge test harness", () => {
  it("runs TypeScript tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

```bash
npm test -- --run lib/lyricforge/__tests__/smoke.test.ts
```

Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/lyricforge/__tests__/smoke.test.ts
git commit -m "test: add LyricForge unit test harness"
```

---

### Task 3: Move GitHub Pages adaptation into tracked source

**Files:**
- Modify: `next.config.ts`
- Modify: `vite.config.ts`
- Modify: `app/page.tsx`
- Create: `lib/lyricforge/public-path.ts`
- Create: `lib/lyricforge/__tests__/public-path.test.ts`
- Modify: `components/editor/Editor.tsx`
- Modify: `lib/lyricforge/transcription.ts`
- Modify: `lib/lyricforge/software-exporter.ts`
- Modify: `lib/lyricforge/transcription.worker.ts`
- Modify: `public/workers/transcription.js`
- Create: `scripts/verify-pages-build.mjs`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Produces: `publicPath(path: string, pathname?: string): string`.
- Produces: static export at `dist/client` with production asset URLs under `/Lyricforge2/` while local development continues to use root-relative public files.

- [ ] **Step 1: Write failing public-path tests**

Create `lib/lyricforge/__tests__/public-path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publicPath } from "../public-path";

describe("publicPath", () => {
  it("uses the Pages prefix when the page is under /Lyricforge2", () => {
    expect(publicPath("/workers/analysis.js", "/Lyricforge2/")).toBe("/Lyricforge2/workers/analysis.js");
  });

  it("uses a root public path during local development", () => {
    expect(publicPath("/workers/analysis.js", "/")).toBe("/workers/analysis.js");
  });

  it("does not double-prefix a production path", () => {
    expect(publicPath("/Lyricforge2/favicon.svg", "/Lyricforge2/editor")).toBe("/Lyricforge2/favicon.svg");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm test -- --run lib/lyricforge/__tests__/public-path.test.ts
```

Expected: FAIL because `public-path.ts` does not exist.

- [ ] **Step 3: Implement `lib/lyricforge/public-path.ts`**

```ts
export const APP_BASE_PATH = "/Lyricforge2";

export function publicPath(path: string, pathname?: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) return normalized;

  const currentPath = pathname ?? (typeof window !== "undefined" ? window.location.pathname : APP_BASE_PATH);
  return currentPath === APP_BASE_PATH || currentPath.startsWith(`${APP_BASE_PATH}/`)
    ? `${APP_BASE_PATH}${normalized}`
    : normalized;
}
```

- [ ] **Step 4: Run the focused test**

```bash
npm test -- --run lib/lyricforge/__tests__/public-path.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit the static export configuration currently synthesized by CI**

Set `next.config.ts` to:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: "/Lyricforge2",
  trailingSlash: true,
};

export default nextConfig;
```

Set `vite.config.ts` to:

```ts
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext({ prerender: { routes: "*" } })],
});
```

Ensure `app/page.tsx` exports:

```ts
export const dynamic = "force-static";
```

- [ ] **Step 6: Replace TypeScript/TSX `/workers/...` and app-owned favicon construction with `publicPath()`**

Worker construction must become equivalent to:

```ts
const worker = new Worker(publicPath("/workers/analysis.js"));
```

Keep the generated `public/workers/transcription.js` WASM base literal as:

```js
wasmPaths="/Lyricforge2/workers/"
```

because that generated browser bundle cannot import the TypeScript helper.

- [ ] **Step 7: Create `scripts/verify-pages-build.mjs`**

```js
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/client");
for (const relative of ["index.html", "workers/analysis.js", "workers/transcription.js"]) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Pages artifact: ${relative}`);
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!html.includes("LyricForge")) throw new Error("LyricForge marker missing from index.html");
if (html.includes("Cloudflare Local Explorer")) throw new Error("Wrong Cloudflare explorer artifact exported");
if (!html.includes("/Lyricforge2/_next/")) throw new Error("GitHub Pages asset prefix missing");

const worker = fs.readFileSync(path.join(root, "workers/transcription.js"), "utf8");
if (!worker.includes("/Lyricforge2/workers/")) throw new Error("Worker WASM path is not prefixed");

console.log("GitHub Pages artifact validation passed.");
```

- [ ] **Step 8: Simplify `.github/workflows/deploy-pages.yml` to use tracked source**

The build job must perform these actions in this order:

```yaml
- uses: actions/checkout@v6
- run: npm ci
- run: npm test -- --run
- run: npm run build
- run: |
    if [ -d dist/client/Lyricforge2/_next ]; then
      rm -rf dist/client/_next
      mv dist/client/Lyricforge2/_next dist/client/_next
      rmdir dist/client/Lyricforge2
    fi
    touch dist/client/.nojekyll
- run: node scripts/verify-pages-build.mjs
- uses: actions/configure-pages@v5
- uses: actions/upload-pages-artifact@v4
  with:
    path: dist/client
```

Keep the existing `deploy` job with `actions/deploy-pages@v4`.

- [ ] **Step 9: Run tests and static build locally**

```bash
npm test -- --run
npm run build
if [ -d dist/client/Lyricforge2/_next ]; then
  rm -rf dist/client/_next
  mv dist/client/Lyricforge2/_next dist/client/_next
  rmdir dist/client/Lyricforge2
fi
touch dist/client/.nojekyll
node scripts/verify-pages-build.mjs
```

Expected: tests pass and `GitHub Pages artifact validation passed.` prints.

- [ ] **Step 10: Commit**

```bash
git add next.config.ts vite.config.ts app/page.tsx lib/lyricforge/public-path.ts lib/lyricforge/__tests__/public-path.test.ts components/editor/Editor.tsx lib/lyricforge/transcription.ts lib/lyricforge/software-exporter.ts lib/lyricforge/transcription.worker.ts public/workers/transcription.js scripts/verify-pages-build.mjs .github/workflows/deploy-pages.yml
git commit -m "build: deploy tracked LyricForge source to Pages"
```

---

### Task 4: Define stable creative-asset references

**Files:**
- Create: `lib/lyricforge/creative-assets.ts`
- Create: `lib/lyricforge/__tests__/creative-assets.test.ts`

**Interfaces:**
- Produces: `CreativeAssetType`, `AssetRef`, `ProjectDependency`, `AnimationRole`, `AnimationInstance`, `EffectInstance`, `TransitionInstance`, `isCreativeAssetType()`, `normalizeAssetRef()`.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { isCreativeAssetType, normalizeAssetRef } from "../creative-assets";

describe("creative asset references", () => {
  it("accepts only supported creative asset types", () => {
    for (const type of ["font", "effect", "transition", "text-animation"]) expect(isCreativeAssetType(type)).toBe(true);
    expect(isCreativeAssetType("script")).toBe(false);
  });

  it("normalizes a stable reference", () => {
    expect(normalizeAssetRef({ id: " builtin.fade ", type: "text-animation", version: " 1.0.0 " }))
      .toEqual({ id: "builtin.fade", type: "text-animation", version: "1.0.0" });
  });

  it("rejects blank ids and versions", () => {
    expect(() => normalizeAssetRef({ id: "", type: "effect", version: "1.0.0" })).toThrow();
    expect(() => normalizeAssetRef({ id: "builtin.glow", type: "effect", version: "" })).toThrow();
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
npm test -- --run lib/lyricforge/__tests__/creative-assets.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `lib/lyricforge/creative-assets.ts`**

```ts
export const CREATIVE_ASSET_TYPES = ["font", "effect", "transition", "text-animation"] as const;
export type CreativeAssetType = (typeof CREATIVE_ASSET_TYPES)[number];
export type AnimationRole = "intro" | "loop" | "outro";
export type AssetParamValue = string | number | boolean;

export interface AssetRef { id: string; type: CreativeAssetType; version: string; }
export interface ProjectDependency extends AssetRef { sourceCatalogId?: string; }

export interface AnimationInstance {
  assetId: string;
  version: string;
  role: AnimationRole;
  enabled: boolean;
  params: Record<string, AssetParamValue>;
}

export interface EffectInstance {
  assetId: string;
  version: string;
  enabled: boolean;
  params: Record<string, AssetParamValue>;
}

export interface TransitionInstance {
  assetId: string;
  version: string;
  incomingItemId: string;
  outgoingItemId: string;
  durationMs: number;
  easing: string;
  params: Record<string, AssetParamValue>;
}

export function isCreativeAssetType(value: unknown): value is CreativeAssetType {
  return typeof value === "string" && (CREATIVE_ASSET_TYPES as readonly string[]).includes(value);
}

export function normalizeAssetRef(value: AssetRef): AssetRef {
  const id = value.id.trim();
  const version = value.version.trim();
  if (!id) throw new Error("Creative asset id is required");
  if (!version) throw new Error("Creative asset version is required");
  if (!isCreativeAssetType(value.type)) throw new Error(`Unsupported creative asset type: ${String(value.type)}`);
  return { id, type: value.type, version };
}
```

- [ ] **Step 4: Run and pass the tests**

```bash
npm test -- --run lib/lyricforge/__tests__/creative-assets.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/creative-assets.ts lib/lyricforge/__tests__/creative-assets.test.ts
git commit -m "feat: define creative asset reference model"
```

---

### Task 5: Add backward-compatible project dependency migration

**Files:**
- Create: `lib/lyricforge/project-migration.ts`
- Create: `lib/lyricforge/__tests__/project-migration.test.ts`

**Interfaces:**
- Produces: `PROJECT_SCHEMA_VERSION`, `MigratedProjectDocument`, and `migrateProjectDocument(input: unknown)`.
- The next plan must call `migrateProjectDocument()` at the exact existing project-load boundary discovered after source promotion.

- [ ] **Step 1: Write failing migration tests**

```ts
import { describe, expect, it } from "vitest";
import { migrateProjectDocument, PROJECT_SCHEMA_VERSION } from "../project-migration";

describe("migrateProjectDocument", () => {
  it("adds dependency metadata to a legacy project without changing content", () => {
    const legacy = { name: "Song", layers: [{ id: "lyrics-1", type: "text", text: "Hello" }] };
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.dependencies).toEqual([]);
    expect(migrated.layers).toEqual(legacy.layers);
  });

  it("normalizes and de-duplicates valid dependencies", () => {
    const migrated = migrateProjectDocument({ dependencies: [
      { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
      { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
    ] });
    expect(migrated.dependencies).toEqual([
      { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
    ]);
  });

  it("drops malformed dependencies while preserving other project fields", () => {
    const migrated = migrateProjectDocument({ title: "Keep me", dependencies: [
      { id: "", type: "effect", version: "1.0.0" },
      { id: "catalog.fade", type: "text-animation", version: "1.1.0" },
    ] });
    expect(migrated.title).toBe("Keep me");
    expect(migrated.dependencies).toEqual([
      { id: "catalog.fade", type: "text-animation", version: "1.1.0" },
    ]);
  });

  it("rejects non-object documents", () => {
    expect(() => migrateProjectDocument(null)).toThrow("Project document must be an object");
    expect(() => migrateProjectDocument("bad")).toThrow("Project document must be an object");
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
npm test -- --run lib/lyricforge/__tests__/project-migration.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `lib/lyricforge/project-migration.ts`**

```ts
import { isCreativeAssetType, normalizeAssetRef, type ProjectDependency } from "./creative-assets";

export const PROJECT_SCHEMA_VERSION = 2;
export type MigratedProjectDocument = Record<string, unknown> & {
  schemaVersion: number;
  dependencies: ProjectDependency[];
};

function normalizeDependency(value: unknown): ProjectDependency | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.version !== "string" || !isCreativeAssetType(record.type)) return null;
  try {
    const ref = normalizeAssetRef({ id: record.id, type: record.type, version: record.version });
    return typeof record.sourceCatalogId === "string" && record.sourceCatalogId.trim()
      ? { ...ref, sourceCatalogId: record.sourceCatalogId.trim() }
      : ref;
  } catch {
    return null;
  }
}

export function migrateProjectDocument(input: unknown): MigratedProjectDocument {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Project document must be an object");
  }

  const source = input as Record<string, unknown>;
  const rawDependencies = Array.isArray(source.dependencies) ? source.dependencies : [];
  const dependencies: ProjectDependency[] = [];
  const seen = new Set<string>();

  for (const raw of rawDependencies) {
    const dependency = normalizeDependency(raw);
    if (!dependency) continue;
    const key = `${dependency.type}:${dependency.id}@${dependency.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push(dependency);
  }

  return { ...source, schemaVersion: PROJECT_SCHEMA_VERSION, dependencies };
}
```

- [ ] **Step 4: Run the migration tests and the full unit suite**

```bash
npm test -- --run lib/lyricforge/__tests__/project-migration.test.ts
npm test -- --run
```

Expected: migration tests and the full suite pass.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/project-migration.ts lib/lyricforge/__tests__/project-migration.test.ts
git commit -m "feat: add project dependency migration foundation"
```

---

### Task 6: Prove parity and make tracked source canonical

**Files:**
- Delete: `LyricForge-v2-source.zip`
- Verify: all source/config/test files created above.

**Interfaces:**
- Produces: one canonical source tree that later plans can inspect and modify directly.

- [ ] **Step 1: Run the clean verification sequence**

```bash
npm ci
npm test -- --run
npm run build
if [ -d dist/client/Lyricforge2/_next ]; then
  rm -rf dist/client/_next
  mv dist/client/Lyricforge2/_next dist/client/_next
  rmdir dist/client/Lyricforge2
fi
touch dist/client/.nojekyll
node scripts/verify-pages-build.mjs
```

Expected: every command succeeds.

- [ ] **Step 2: Verify core static resources explicitly**

```bash
test -f dist/client/index.html
test -f dist/client/workers/analysis.js
test -f dist/client/workers/transcription.js
grep -q 'LyricForge' dist/client/index.html
! grep -q 'Cloudflare Local Explorer' dist/client/index.html
```

- [ ] **Step 3: Remove the obsolete archive only after parity passes**

```bash
git rm LyricForge-v2-source.zip
git commit -m "chore: make tracked LyricForge source canonical"
```

- [ ] **Step 4: Push and require the GitHub Pages workflow to pass**

```bash
git push -u origin feat/source-foundation
```

Expected: workflow installs from the tracked root, runs tests, builds, validates the Pages artifact, and deploys successfully without extracting a ZIP.

- [ ] **Step 5: Use the promoted tree to write the remaining implementation plans**

The next plans are intentionally separate because they modify independent subsystems:

1. `preview-mobile-editor`: tap/double-tap text editing, preview transforms, portrait workspace, bottom sheets, mobile timeline.
2. `creative-runtime`: intro/loop/outro animations, stackable effects, first-class transitions, preview/export parity.
3. `asset-catalog-settings`: built-in + online catalog, preview/install/update/remove, hashes, offline storage, fonts, URL/file installs, dependency recovery, expanded settings, mobile/export QA.

Each later plan must inspect the promoted source first and name the exact existing state, persistence, preview, timeline, and export boundaries it changes.

## Self-Review

- Spec coverage in this phase: canonical source, static Pages compatibility, stable creative-asset identity, versioned project dependencies, legacy migration foundation, offline-safe behavior, and the prohibition on arbitrary downloaded JavaScript.
- Deferred by design: preview interaction/mobile UI, actual creative rendering runtime, online catalogs/downloads/fonts, settings UI, dependency recovery UI, and final cross-browser/export QA.
- Placeholder scan: no TBD/TODO/fill-in instructions remain.
- Ordering check: Vitest is installed in Task 2 before any test in Task 3 or later runs.
- Type consistency: `CreativeAssetType`, `AssetRef`, `ProjectDependency`, `migrateProjectDocument()`, and `publicPath()` keep one signature throughout the plan.
