# LyricForge Source Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the existing LyricForge ZIP source into normal version-controlled files, preserve the working GitHub Pages deployment, and add the typed creative-asset/project-migration foundation required by the approved mobile/effects/catalog redesign.

**Architecture:** The app source becomes the repository root instead of being unpacked only inside CI. GitHub Pages-specific behavior moves into committed `next.config.ts`, `vite.config.ts`, and source-relative asset helpers so CI only installs, tests, builds, validates, and deploys. A small typed foundation under `lib/lyricforge` defines stable references for effects, transitions, text animations, fonts, and project dependencies without executing downloaded code.

**Tech Stack:** React 19, TypeScript, Vinext 1.0.0-beta.5, Vite 8, browser APIs, Vitest + jsdom for foundation tests, GitHub Actions Pages deployment.

**Spec:** `docs/superpowers/specs/2026-09-13-mobile-effects-catalog-design.md`

## Global Constraints

- Existing projects must remain loadable without online access.
- Built-in functionality must continue to work offline.
- Creative assets use stable IDs and explicit versions; display-name changes must not break projects.
- Arbitrary downloaded JavaScript must not execute merely because an asset is installed.
- Existing GitHub Pages URL remains `/Lyricforge2/` and all generated assets/workers must resolve there.
- The current browser-side editor must not reintroduce `next/headers`, `headers()`, `cookies()`, or `redirect()` dependencies.
- No user accounts, payments, cloud project sync, or centralized server database are introduced in this phase.
- The phase is complete only when tests, static build validation, and the Pages workflow pass from the tracked source tree.

---

## File Structure Locked In By This Plan

- Repository root: tracked application source extracted from `LyricForge-v2-source.zip`.
- `app/`: existing Next/Vinext application routes.
- `components/editor/`: existing editor UI and preview/timeline components.
- `lib/lyricforge/`: existing editor/runtime utilities plus new creative-asset types and migration helpers.
- `lib/lyricforge/creative-assets.ts`: pure shared types for creative assets and project references.
- `lib/lyricforge/project-migration.ts`: pure migration/normalization helpers; no browser APIs.
- `lib/lyricforge/__tests__/creative-assets.test.ts`: contract tests for type-facing helper constructors/guards.
- `lib/lyricforge/__tests__/project-migration.test.ts`: legacy/current project migration tests.
- `vitest.config.ts`: Vitest configuration.
- `.github/workflows/deploy-pages.yml`: build/test/deploy tracked source directly.
- `scripts/verify-pages-build.mjs`: deterministic post-build validation previously embedded in the workflow.

The ZIP is retained only until deployment parity is proven. It is deleted in the final task so the tracked source becomes canonical.

---

### Task 1: Promote the ZIP source into the repository root

**Files:**
- Create: all application files currently contained in `LyricForge-v2-source.zip`
- Preserve: `docs/**`
- Preserve: `.github/**`
- Preserve temporarily: `LyricForge-v2-source.zip`

**Interfaces:**
- Consumes: current ZIP archive at repository root.
- Produces: a normal tracked source tree with `app/page.tsx`, `components/editor/Editor.tsx`, `lib/lyricforge/**`, `public/workers/**`, `package.json`, `next.config.ts`, and `vite.config.ts` at repository root.

- [ ] **Step 1: Create an isolated worktree before touching source**

Run:

```bash
git worktree add ../Lyricforge2-foundation -b feat/source-foundation main
cd ../Lyricforge2-foundation
```

Expected: clean worktree on `feat/source-foundation`.

- [ ] **Step 2: Extract the archive without overwriting repository metadata**

Run:

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

Expected: `test -f app/page.tsx`, `test -f components/editor/Editor.tsx`, `test -f package.json`, and `test -f public/workers/transcription.js` all succeed.

- [ ] **Step 3: Verify repository-owned files survived extraction**

Run:

```bash
test -f docs/superpowers/specs/2026-09-13-mobile-effects-catalog-design.md
test -f docs/superpowers/plans/2026-09-13-source-foundation.md
test -f .github/workflows/deploy-pages.yml
git status --short
```

Expected: app source appears as new/modified files; spec, plan, and workflow still exist.

- [ ] **Step 4: Remove the unused server-only auth helper from tracked source**

Run:

```bash
rm -f app/chatgpt-auth.ts
! grep -RInE 'next/headers|headers\(|cookies\(|redirect\(' app components lib --include='*.ts' --include='*.tsx'
```

Expected: grep exits 0 because no matching server-only API remains.

- [ ] **Step 5: Commit only the source promotion**

Run:

```bash
git add app components lib public package.json package-lock.json next.config.ts vite.config.ts tsconfig.json scripts 2>/dev/null || true
git add -A
git commit -m "chore: promote LyricForge source into repository"
```

Expected: one commit containing the extracted source while the archive still exists.

---

### Task 2: Make GitHub Pages configuration part of the tracked application

**Files:**
- Modify: `next.config.ts`
- Modify: `vite.config.ts`
- Modify: `app/page.tsx`
- Create: `lib/lyricforge/public-path.ts`
- Modify: `components/editor/Editor.tsx`
- Modify: `lib/lyricforge/transcription.ts`
- Modify: `lib/lyricforge/software-exporter.ts`
- Modify: `lib/lyricforge/transcription.worker.ts`
- Modify: `public/workers/transcription.js`
- Create: `scripts/verify-pages-build.mjs`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Produces: `publicPath(path: string): string` for all app-owned absolute URLs.
- Produces: a static Vinext export under `dist/client` whose HTML references `/Lyricforge2/_next/` and whose worker URLs resolve under `/Lyricforge2/workers/`.

- [ ] **Step 1: Write the public-path helper test first**

Create `lib/lyricforge/__tests__/public-path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publicPath } from "../public-path";

describe("publicPath", () => {
  it("prefixes app-owned root paths with the GitHub Pages base", () => {
    expect(publicPath("/workers/analysis.js")).toBe("/Lyricforge2/workers/analysis.js");
    expect(publicPath("favicon.svg")).toBe("/Lyricforge2/favicon.svg");
  });

  it("does not double-prefix a normalized path", () => {
    expect(publicPath("/Lyricforge2/workers/analysis.js")).toBe("/Lyricforge2/workers/analysis.js");
  });
});
```

- [ ] **Step 2: Add the minimal helper**

Create `lib/lyricforge/public-path.ts`:

```ts
export const APP_BASE_PATH = "/Lyricforge2";

export function publicPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) {
    return normalized;
  }
  return `${APP_BASE_PATH}${normalized}`;
}
```

- [ ] **Step 3: Commit the static export configuration currently synthesized by CI**

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

Ensure the first export in `app/page.tsx` includes:

```ts
export const dynamic = "force-static";
```

- [ ] **Step 4: Replace hard-coded app-owned worker/favicon paths with `publicPath()`**

For each TypeScript/TSX occurrence currently using `/workers/...` or `/favicon.svg`, import `publicPath` and build the URL through it. For worker construction, the resulting form must be equivalent to:

```ts
const worker = new Worker(publicPath("/workers/analysis.js"));
```

For the generated `public/workers/transcription.js`, retain the literal runtime value:

```js
wasmPaths="/Lyricforge2/workers/"
```

because the generated worker bundle cannot import the TypeScript helper.

- [ ] **Step 5: Move the deployment validation into a versioned script**

Create `scripts/verify-pages-build.mjs` that:

```js
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist/client");
const mustExist = [
  "index.html",
  "workers/analysis.js",
  "workers/transcription.js",
];

for (const relative of mustExist) {
  if (!fs.existsSync(path.join(root, relative))) {
    throw new Error(`Missing Pages artifact: ${relative}`);
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!html.includes("LyricForge")) throw new Error("LyricForge marker missing from index.html");
if (html.includes("Cloudflare Local Explorer")) throw new Error("Cloudflare explorer was exported instead of LyricForge");
if (!html.includes("/Lyricforge2/_next/")) throw new Error("GitHub Pages asset prefix missing");

const worker = fs.readFileSync(path.join(root, "workers/transcription.js"), "utf8");
if (!worker.includes("/Lyricforge2/workers/")) throw new Error("Worker WASM base path is not prefixed");

console.log("GitHub Pages artifact validation passed.");
```

- [ ] **Step 6: Simplify `.github/workflows/deploy-pages.yml`**

Delete the ZIP extraction and source-rewrite steps. The build job must perform, in order:

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

Keep the existing deploy job and `actions/deploy-pages@v4` unchanged.

- [ ] **Step 7: Build and validate locally**

Run:

```bash
npm ci
npm run build
if [ -d dist/client/Lyricforge2/_next ]; then
  rm -rf dist/client/_next
  mv dist/client/Lyricforge2/_next dist/client/_next
  rmdir dist/client/Lyricforge2
fi
touch dist/client/.nojekyll
node scripts/verify-pages-build.mjs
```

Expected: build succeeds and the verification script prints `GitHub Pages artifact validation passed.`

- [ ] **Step 8: Commit**

```bash
git add next.config.ts vite.config.ts app/page.tsx lib/lyricforge/public-path.ts lib/lyricforge/__tests__/public-path.test.ts components/editor/Editor.tsx lib/lyricforge/transcription.ts lib/lyricforge/software-exporter.ts lib/lyricforge/transcription.worker.ts public/workers/transcription.js scripts/verify-pages-build.mjs .github/workflows/deploy-pages.yml
git commit -m "build: make tracked source deployable to GitHub Pages"
```

---

### Task 3: Add a deterministic foundation test runner

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test -- --run` as the CI-safe command for pure/unit tests.

- [ ] **Step 1: Add test dependencies**

Run:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event
```

- [ ] **Step 2: Add package scripts**

Ensure `package.json` includes:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Preserve all existing scripts, especially the existing Vinext build command.

- [ ] **Step 3: Add `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

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

- [ ] **Step 4: Run the public-path test**

Run:

```bash
npm test -- --run lib/lyricforge/__tests__/public-path.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add LyricForge unit test harness"
```

---

### Task 4: Define stable creative-asset and project-reference types

**Files:**
- Create: `lib/lyricforge/creative-assets.ts`
- Create: `lib/lyricforge/__tests__/creative-assets.test.ts`

**Interfaces:**
- Produces: `CreativeAssetType`, `AssetRef`, `ProjectDependency`, `AnimationRole`, `AnimationInstance`, `EffectInstance`, `TransitionInstance`, `isCreativeAssetType()`, and `normalizeAssetRef()`.

- [ ] **Step 1: Write failing contract tests**

Create `lib/lyricforge/__tests__/creative-assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCreativeAssetType, normalizeAssetRef } from "../creative-assets";

describe("creative asset references", () => {
  it("accepts only the four supported asset types", () => {
    expect(isCreativeAssetType("font")).toBe(true);
    expect(isCreativeAssetType("effect")).toBe(true);
    expect(isCreativeAssetType("transition")).toBe(true);
    expect(isCreativeAssetType("text-animation")).toBe(true);
    expect(isCreativeAssetType("script")).toBe(false);
  });

  it("normalizes a stable asset reference without display data", () => {
    expect(normalizeAssetRef({ id: "builtin.fade", type: "text-animation", version: "1.0.0" }))
      .toEqual({ id: "builtin.fade", type: "text-animation", version: "1.0.0" });
  });

  it("rejects blank ids and versions", () => {
    expect(() => normalizeAssetRef({ id: "", type: "effect", version: "1.0.0" })).toThrow();
    expect(() => normalizeAssetRef({ id: "builtin.glow", type: "effect", version: "" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and confirm failure**

```bash
npm test -- --run lib/lyricforge/__tests__/creative-assets.test.ts
```

Expected: FAIL because `../creative-assets` does not exist.

- [ ] **Step 3: Add the shared types and guards**

Create `lib/lyricforge/creative-assets.ts`:

```ts
export const CREATIVE_ASSET_TYPES = ["font", "effect", "transition", "text-animation"] as const;
export type CreativeAssetType = (typeof CREATIVE_ASSET_TYPES)[number];
export type AnimationRole = "intro" | "loop" | "outro";
export type AssetParamValue = string | number | boolean;

export interface AssetRef {
  id: string;
  type: CreativeAssetType;
  version: string;
}

export interface ProjectDependency extends AssetRef {
  sourceCatalogId?: string;
}

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

- [ ] **Step 4: Run the focused tests**

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
- Consumes: unknown/legacy parsed project JSON.
- Produces: `migrateProjectDocument(input: unknown): MigratedProjectDocument` and `PROJECT_SCHEMA_VERSION = 2`.
- Later plans must use this function at the existing project-load boundary before editor state is hydrated.

- [ ] **Step 1: Write failing migration tests**

Create `lib/lyricforge/__tests__/project-migration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { migrateProjectDocument, PROJECT_SCHEMA_VERSION } from "../project-migration";

describe("migrateProjectDocument", () => {
  it("adds empty dependencies to a legacy project without changing its content", () => {
    const legacy = { name: "Song", layers: [{ id: "lyrics-1", type: "text", text: "Hello" }] };
    const migrated = migrateProjectDocument(legacy);

    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.dependencies).toEqual([]);
    expect(migrated.layers).toEqual(legacy.layers);
    expect(migrated.name).toBe("Song");
  });

  it("normalizes and de-duplicates valid dependency records", () => {
    const migrated = migrateProjectDocument({
      schemaVersion: 2,
      dependencies: [
        { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
        { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
      ],
    });

    expect(migrated.dependencies).toEqual([
      { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
    ]);
  });

  it("drops malformed dependency records but preserves the rest of the project", () => {
    const migrated = migrateProjectDocument({
      title: "Keep me",
      dependencies: [
        { id: "", type: "effect", version: "1.0.0" },
        { id: "catalog.fade", type: "text-animation", version: "1.1.0" },
      ],
    });

    expect(migrated.title).toBe("Keep me");
    expect(migrated.dependencies).toEqual([
      { id: "catalog.fade", type: "text-animation", version: "1.1.0" },
    ]);
  });

  it("rejects non-object project documents", () => {
    expect(() => migrateProjectDocument(null)).toThrow("Project document must be an object");
    expect(() => migrateProjectDocument("bad")).toThrow("Project document must be an object");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- --run lib/lyricforge/__tests__/project-migration.test.ts
```

Expected: FAIL because `../project-migration` does not exist.

- [ ] **Step 3: Implement the pure migration helper**

Create `lib/lyricforge/project-migration.ts`:

```ts
import {
  isCreativeAssetType,
  normalizeAssetRef,
  type ProjectDependency,
} from "./creative-assets";

export const PROJECT_SCHEMA_VERSION = 2;

export type MigratedProjectDocument = Record<string, unknown> & {
  schemaVersion: number;
  dependencies: ProjectDependency[];
};

function normalizeDependency(value: unknown): ProjectDependency | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.version !== "string" || !isCreativeAssetType(record.type)) {
    return null;
  }

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
  const seen = new Set<string>();
  const dependencies: ProjectDependency[] = [];

  for (const raw of rawDependencies) {
    const dependency = normalizeDependency(raw);
    if (!dependency) continue;
    const key = `${dependency.type}:${dependency.id}@${dependency.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push(dependency);
  }

  return {
    ...source,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    dependencies,
  };
}
```

- [ ] **Step 4: Run migration tests**

```bash
npm test -- --run lib/lyricforge/__tests__/project-migration.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Run all foundation tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/project-migration.ts lib/lyricforge/__tests__/project-migration.test.ts
git commit -m "feat: add backward-compatible project dependency migration"
```

---

### Task 6: Prove source parity, remove the ZIP, and prepare the next implementation plans

**Files:**
- Delete: `LyricForge-v2-source.zip`
- Verify: all tracked source/config/test files from Tasks 1-5.

**Interfaces:**
- Produces: repository source tree as the single canonical LyricForge implementation.

- [ ] **Step 1: Run the complete local verification set**

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

Expected: tests pass, build succeeds, Pages verification passes.

- [ ] **Step 2: Confirm the generated site still contains core editor resources**

```bash
test -f dist/client/index.html
test -f dist/client/workers/analysis.js
test -f dist/client/workers/transcription.js
grep -q 'LyricForge' dist/client/index.html
! grep -q 'Cloudflare Local Explorer' dist/client/index.html
```

Expected: all commands succeed.

- [ ] **Step 3: Remove the obsolete source archive**

```bash
git rm LyricForge-v2-source.zip
```

- [ ] **Step 4: Commit canonical-source cleanup**

```bash
git commit -m "chore: make tracked LyricForge source canonical"
```

- [ ] **Step 5: Push the branch and require GitHub Actions success before merge**

```bash
git push -u origin feat/source-foundation
```

Expected: `deploy-pages.yml` build/test/verification and deploy jobs succeed from tracked source without extracting a ZIP.

- [ ] **Step 6: After this plan lands, write the next three plans against the now-inspectable source tree**

The follow-on planning order is fixed:

1. `preview-mobile-editor`: tap/double-tap text editing, transform gestures, portrait workspace, mobile timeline, bottom sheets.
2. `creative-runtime`: intro/loop/outro animations, stackable effects, first-class transitions, preview/export parity.
3. `asset-catalog-settings`: built-in + online catalog, previews, downloads, hashes, storage, fonts, URL/file install, dependency recovery, expanded settings, final mobile/export QA.

Each follow-on plan must inspect the promoted source and name the exact existing editor components/state/persistence boundaries it modifies rather than guessing from the former ZIP.

---

## Self-Review Checklist

- Spec coverage in this phase: source canonicalization, Pages compatibility, stable creative-asset IDs/types/versions, project dependency metadata, backward-compatible legacy migration, offline-safe foundation, no arbitrary downloaded code execution.
- Deferred intentionally to later plans: preview gestures/UI, actual animation/effect/transition rendering, catalogs/downloads/fonts, dependency resolution UI, settings UI, mobile QA, export regression work.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: `CreativeAssetType`, `AssetRef`, `ProjectDependency`, and `migrateProjectDocument()` names/signatures are used consistently throughout this plan.
