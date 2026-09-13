# LyricForge Creative Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LyricForge's secure, offline-first official catalog for downloadable fonts, effects, transitions, and text animations, with atomic install/update/rollback, exact-version project dependencies, portable bundled dependencies, mobile-friendly browsing, and recovery flows.

**Architecture:** Keep rendering trusted and deterministic by allowing downloaded creative assets to define only declarative presets that bind to runtime implementations already shipped in LyricForge. Use IndexedDB for installed-version metadata and local preferences, Cache Storage for cacheable manifest/package/preview bytes, and exact-version dependency references in projects. The official catalog is static under `public/catalog/` and is validated during CI before GitHub Pages deployment.

**Tech Stack:** React 19, TypeScript 5.9, Zod 3, fflate 0.8, IndexedDB, Cache Storage, Web Crypto SHA-256, FontFace API, Vitest + jsdom, Vinext/Vite, pnpm 11.25.0, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-13-creative-catalog-design.md`

## Global Constraints

- Version 1 has one official LyricForge catalog only; arbitrary third-party catalog feeds are deferred.
- Downloaded effects, transitions, and text animations are declarative presets only. They never execute downloaded JavaScript, HTML, WebAssembly, shader source, or arbitrary modules.
- Every downloaded creative preset resolves to a trusted runtime identifier already present in the shipped creative registry.
- Updates are manual by default.
- Installed asset versions are immutable.
- Existing project instances keep exact asset ID + exact resolved version until the user explicitly migrates them.
- Failed install/update/repair operations leave the prior working version untouched.
- Built-in assets and already-installed catalog assets remain usable offline.
- The catalog shows cached data immediately and refreshes online data opportunistically.
- Portable project bundles embed only non-built-in dependencies actually used by that project.
- Official catalog fonts require clearly redistributable licensing. Unknown-license user fonts trigger a warning before bundling.
- Advanced install accepts only local `.lyricforge-asset` packages or direct LyricForge asset-manifest URLs.
- Missing dependencies are preserved, visibly diagnosed, and never silently substituted.
- The official catalog is served from `public/catalog/` through the existing GitHub Pages build.
- Package integrity uses SHA-256. Implementation clarification: the external catalog/item manifest owns the whole-package SHA-256; the manifest inside the ZIP owns the declared file list and per-file hashes. A ZIP cannot contain a stable hash of its own final bytes.
- Package size limit is 64 MiB per `.lyricforge-asset`; manifest JSON limit is 256 KiB; preview payloads are capped at 8 MiB each.
- Existing `Project.schemaVersion === 3` remains valid; catalog work must not force unrelated legacy projects online.
- `main` is not modified by this plan. Work stays on `feat/creative-catalog` until review and explicit integration.

## Planned File Structure

New catalog/runtime files:

- `lib/lyricforge/catalog-types.ts` — public catalog/index/manifest/install types and constants.
- `lib/lyricforge/catalog-version.ts` — strict SemVer parsing and compatibility checks.
- `lib/lyricforge/catalog-validation.ts` — Zod validation for index, remote manifests, and embedded package manifests.
- `lib/lyricforge/catalog-package.ts` — ZIP parsing, path safety, MIME allow-list, SHA-256 helpers, and package validation.
- `lib/lyricforge/catalog-storage.ts` — IndexedDB installed-version state plus Cache Storage wrappers.
- `lib/lyricforge/catalog-installer.ts` — staged install/update/repair/rollback/remove orchestration.
- `lib/lyricforge/catalog-creative.ts` — converts validated installed presets into trusted `CreativeDefinition` values.
- `lib/lyricforge/catalog-service.ts` — offline-first index loading, background refresh, search/filter/update/favorites state.
- `lib/lyricforge/catalog-dependencies.ts` — exact dependency collection/resolution and missing-state diagnostics.
- `lib/lyricforge/catalog-fonts.ts` — load/unload catalog fonts with deterministic versioned family names.
- `lib/lyricforge/catalog-bundle.ts` — serialize/restore embedded catalog dependencies in project archives.

New editor components:

- `components/editor/CatalogPanel.tsx`
- `components/editor/CatalogPreview.tsx`
- `components/editor/RestoreDependenciesPanel.tsx`
- `components/editor/AdvancedInstaller.tsx`

New scripts/static files:

- `scripts/build-catalog.mjs`
- `scripts/validate-catalog.mjs`
- `public/catalog/index.json`
- `public/catalog/assets/catalog.effect.neon-pulse/1.0.0/manifest.json`
- `public/catalog/assets/catalog.transition.soft-glitch/1.0.0/manifest.json`
- `public/catalog/assets/catalog.animation.starlight-rise/1.0.0/manifest.json`
- `public/catalog/assets/catalog.font.bebas-neue/1.0.0/manifest.json`
- matching preview assets and `.lyricforge-asset` packages generated by `scripts/build-catalog.mjs`.

Existing files modified:

- `lib/lyricforge/creative-registry.ts`
- `lib/lyricforge/creative-assets.ts`
- `lib/lyricforge/model.ts`
- `lib/lyricforge/project-manager.ts`
- `lib/lyricforge/store.ts`
- `lib/lyricforge/assets.ts`
- `components/editor/Editor.tsx`
- `components/editor/CreativeInspector.tsx`
- `components/editor/Inspector.tsx`
- `app/globals.css`
- `package.json`
- `.github/workflows/deploy-pages.yml`
- `scripts/verify-pages-build.mjs`

---

### Task 1: Define strict catalog contracts, SemVer, and manifest validation

**Files:**
- Create: `lib/lyricforge/catalog-types.ts`
- Create: `lib/lyricforge/catalog-version.ts`
- Create: `lib/lyricforge/catalog-validation.ts`
- Create: `lib/lyricforge/__tests__/catalog-validation.test.ts`

**Interfaces:**
- Produces: `CatalogIndex`, `CatalogIndexItem`, `CatalogAssetManifest`, `EmbeddedAssetManifest`, `InstalledAssetVersion`, `CatalogAssetKey`, `parseSemVer()`, `compareSemVer()`, `isAppVersionCompatible()`, `validateCatalogIndex()`, `validateCatalogAssetManifest()`, `validateEmbeddedAssetManifest()`.

- [ ] **Step 1: Write failing contract/compatibility tests**

```ts
it('accepts a trusted declarative effect manifest',()=>{
  const manifest=validateCatalogAssetManifest({
    schemaVersion:1,id:'catalog.effect.neon-pulse',version:'1.0.0',type:'effect',
    name:'Neon Pulse',description:'Glow pulse preset',author:'LyricForge',
    sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',
    tags:['neon'],minAppVersion:'0.1.0',runtimeId:'effect.glow',
    preset:{radius:28,intensity:.8},preview:{kind:'image',url:'preview.svg'},
    package:{url:'catalog.effect.neon-pulse-1.0.0.lyricforge-asset',size:2048,sha256:'a'.repeat(64)}
  });
  expect(manifest.id).toBe('catalog.effect.neon-pulse');
});

it('rejects executable payload declarations',()=>{
  expect(()=>validateEmbeddedAssetManifest({
    schemaVersion:1,id:'catalog.effect.bad',version:'1.0.0',type:'effect',runtimeId:'effect.glow',
    files:[{path:'plugin.js',mime:'text/javascript',sha256:'a'.repeat(64),size:4}]
  })).toThrow(/unsupported payload/i);
});

it('compares semantic versions without lexical mistakes',()=>{
  expect(compareSemVer('1.10.0','1.9.9')).toBeGreaterThan(0);
  expect(isAppVersionCompatible('0.1.0',{minAppVersion:'0.1.0',maxAppVersion:'0.2.0'})).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-validation.test.ts
```

Expected: FAIL because the catalog modules do not exist.

- [ ] **Step 3: Implement exact public types/constants**

Use:

```ts
export const CATALOG_SCHEMA_VERSION=1 as const;
export const CATALOG_ID='official' as const;
export const CATALOG_APP_VERSION='0.1.0';
export const CATALOG_PACKAGE_MAX_BYTES=64*1024*1024;
export const CATALOG_MANIFEST_MAX_BYTES=256*1024;
export const CATALOG_PREVIEW_MAX_BYTES=8*1024*1024;

export type CatalogAssetType='font'|'effect'|'transition'|'text-animation';
export interface CatalogPackageRef{url:string;size:number;sha256:string;}
export interface CatalogPreviewRef{kind:'image'|'video';url:string;}
export interface CatalogAssetManifest{
  schemaVersion:1;id:string;version:string;type:CatalogAssetType;name:string;description:string;
  author:string;sourceUrl:string;license:string;licenseUrl?:string;tags:string[];
  minAppVersion:string;maxAppVersion?:string;runtimeId?:string;preset?:Record<string,string|number|boolean>;
  preview:CatalogPreviewRef;package:CatalogPackageRef;font?:{family:string;style:'normal'|'italic';weight:number};
  changelog?:string;
}
```

`EmbeddedAssetManifest` mirrors identity/runtime/font metadata and declares `files[]`, but does not contain the ZIP's own hash.

- [ ] **Step 4: Implement strict SemVer and Zod validation**

`parseSemVer()` accepts only `MAJOR.MINOR.PATCH` with non-negative integers. `isAppVersionCompatible()` uses inclusive minimum/maximum bounds. Validation rejects unknown creative `runtimeId` requirements only later at install time; schema validation only checks shape.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-validation.test.ts
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/catalog-*.ts lib/lyricforge/__tests__/catalog-validation.test.ts
git commit -m "feat: define creative catalog contracts"
```

---

### Task 2: Validate `.lyricforge-asset` ZIP packages and integrity safely

**Files:**
- Create: `lib/lyricforge/catalog-package.ts`
- Create: `lib/lyricforge/__tests__/catalog-package.test.ts`

**Interfaces:**
- Consumes: `EmbeddedAssetManifest`, size constants, validators.
- Produces: `sha256Hex(data)`, `validateCatalogPackage(bytes, expectedManifest) -> Promise<ValidatedCatalogPackage>`.

- [ ] **Step 1: Add RED tests for package hash, path traversal, undeclared files, and MIME filtering**

```ts
it('rejects path traversal before activation',async()=>{
  const bytes=makeZip({'manifest.json':embeddedManifestBytes(),'../evil.txt':new Uint8Array([1])});
  await expect(validateCatalogPackage(bytes,remoteManifest())).rejects.toThrow(/path traversal/i);
});

it('rejects a package whose external sha256 does not match',async()=>{
  const bytes=makeValidPackage();
  await expect(validateCatalogPackage(bytes,{...remoteManifest(),package:{...remoteManifest().package,sha256:'0'.repeat(64)}}))
    .rejects.toThrow(/sha-256/i);
});
```

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-package.test.ts
```

- [ ] **Step 3: Implement SHA-256 and ZIP validation**

Use `crypto.subtle.digest('SHA-256', bytes)` and `fflate.unzipSync()`. Reject absolute paths, `..` segments, backslashes, duplicate normalized paths, files not listed in `manifest.json`, and unsupported MIME values. Allowed payload MIME types in v1:

```ts
const ALLOWED_MIME=new Set([
 'application/json','font/ttf','font/woff2','image/png','image/jpeg','image/webp','image/svg+xml','video/mp4','video/webm','text/plain'
]);
```

SVG previews are treated as display-only static assets; never inject their text into `innerHTML`.

- [ ] **Step 4: Verify per-file hashes and identity equality**

The embedded manifest's `id`, `version`, and `type` must equal the remote manifest. Every declared file gets exact size/hash validation before the package is returned.

- [ ] **Step 5: Run focused + existing creative tests**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-package.test.ts lib/lyricforge/__tests__/creative-registry.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/catalog-package.ts lib/lyricforge/__tests__/catalog-package.test.ts
git commit -m "feat: validate catalog asset packages"
```

---

### Task 3: Add installed-asset metadata storage and offline cache primitives

**Files:**
- Create: `lib/lyricforge/catalog-storage.ts`
- Create: `lib/lyricforge/__tests__/catalog-storage.test.ts`

**Interfaces:**
- Produces: `CatalogStorage` with `putVersion`, `getVersion`, `listVersions`, `setCurrentVersion`, `getCurrentVersion`, `setFavorite`, `listFavorites`, `putCachedResponse`, `getCachedResponse`, `deleteVersionBytes`.

- [ ] **Step 1: Write failing storage tests using a fake in-memory backend adapter**

```ts
it('keeps exact versions side by side',async()=>{
  const storage=createMemoryCatalogStorage();
  await storage.putVersion(versionRecord('catalog.effect.neon-pulse','1.0.0'));
  await storage.putVersion(versionRecord('catalog.effect.neon-pulse','1.1.0'));
  expect((await storage.listVersions('effect','catalog.effect.neon-pulse')).map(v=>v.version)).toEqual(['1.0.0','1.1.0']);
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-storage.test.ts
```

- [ ] **Step 3: Implement browser IndexedDB schema**

Use separate DB `lyricforge-catalog`, version `1`, stores:

```ts
installedVersions // key: `${type}:${id}@${version}`
currentVersions   // key: `${type}:${id}` -> exact version
preferences       // favorites + last validated catalog metadata
```

Cache Storage name is `lyricforge-catalog-v1`. Version/package cache keys include type, ID, and exact version so updates cannot overwrite prior bytes.

- [ ] **Step 4: Keep testable adapter boundaries**

Browser code calls an injected `CatalogStorageBackend`; tests use the in-memory implementation rather than depending on jsdom IndexedDB support.

- [ ] **Step 5: Verify**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-storage.test.ts
pnpm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/catalog-storage.ts lib/lyricforge/__tests__/catalog-storage.test.ts
git commit -m "feat: persist installed catalog versions"
```

---

### Task 4: Build atomic install, update, repair, rollback, and remove orchestration

**Files:**
- Create: `lib/lyricforge/catalog-installer.ts`
- Create: `lib/lyricforge/__tests__/catalog-installer.test.ts`
- Modify: `lib/lyricforge/creative-registry.ts`

**Interfaces:**
- Produces: `CatalogInstaller.install(manifest)`, `.repair(key)`, `.rollback(key,version)`, `.remove(key,version,{force})`.
- Uses injected `fetch`, storage, package validator, and `isTrustedRuntime(type,runtimeId)`.

- [ ] **Step 1: Add RED tests proving failed updates preserve the current pointer**

```ts
it('does not replace the current version when validation fails',async()=>{
  const ctx=installerFixture({current:'1.0.0',download:'corrupt'});
  await expect(ctx.installer.install(manifest('1.1.0'))).rejects.toThrow();
  expect(await ctx.storage.getCurrentVersion('effect','catalog.effect.neon-pulse')).toBe('1.0.0');
});
```

Add tests for repair preserving version, rollback switching pointer only to an installed valid version, and remove refusing a referenced version unless `force:true`.

- [ ] **Step 2: Run RED**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-installer.test.ts
```

- [ ] **Step 3: Add runtime trust lookup to `creative-registry.ts`**

```ts
export function isTrustedRuntime(type:'effect'|'transition'|'text-animation',runtimeId:string){
  return creativeRegistry.definitions.some(def=>def.type===type&&def.runtime===runtimeId);
}
```

Fonts skip runtime checks.

- [ ] **Step 4: Implement staged install ordering**

The exact order is: validate remote manifest -> compatibility check -> runtime trust check -> download bytes -> whole-package hash -> ZIP/file validation -> cache immutable bytes -> write immutable version record -> switch current pointer. If any step before pointer update fails, prior pointer remains unchanged. If metadata commit fails after caching bytes, remove only the newly staged cache entry.

- [ ] **Step 5: Run focused tests**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-installer.test.ts lib/lyricforge/__tests__/creative-registry.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/catalog-installer.ts lib/lyricforge/creative-registry.ts lib/lyricforge/__tests__/catalog-installer.test.ts
git commit -m "feat: install catalog assets atomically"
```

---

### Task 5: Resolve installed creative presets through the trusted renderer

**Files:**
- Create: `lib/lyricforge/catalog-creative.ts`
- Modify: `lib/lyricforge/creative-registry.ts`
- Modify: `lib/lyricforge/store.ts`
- Create: `lib/lyricforge/__tests__/catalog-creative.test.ts`

**Interfaces:**
- Produces: `definitionFromInstalledManifest(manifest, trustedDefinition)`, `CreativeRegistry.replaceInstalled(definitions)`.

- [ ] **Step 1: Add failing tests for trusted-runtime cloning and preset defaults**

```ts
it('creates a new asset id without replacing the trusted runtime schema',()=>{
  const trusted=creativeRegistry.definitions.find(d=>d.runtime==='effect.glow')!;
  const installed=definitionFromInstalledManifest(effectManifest({preset:{radius:30,intensity:.9}}),trusted);
  expect(installed.id).toBe('catalog.effect.neon-pulse');
  expect(installed.runtime).toBe('effect.glow');
  expect(installed.params.radius.default).toBe(30);
  expect(installed.params.radius.min).toBe(trusted.params.radius.min);
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-creative.test.ts
```

- [ ] **Step 3: Extend registry with immutable built-ins + replaceable installed definitions**

Keep built-in definitions unchanged. `resolve()` searches built-ins and installed definitions by exact ID/version; compatibility aliases remain trusted-source-only and are not read from downloaded manifests.

- [ ] **Step 4: Clamp preset overrides through existing parameter schemas**

Downloaded presets may override only known parameter defaults. They cannot add parameters, change min/max, change targets, change quality policy, or change executable runtime identity after validation.

- [ ] **Step 5: Ensure store creation paths use exact installed versions**

`EditorStore.createEffect()` and transition creation already resolve by ID/version; preserve that path and add tests that an installed definition can create an `EffectInstance` without special renderer code.

- [ ] **Step 6: Verify renderer parity tests remain green**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-creative.test.ts lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts lib/lyricforge/__tests__/render-operations.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add lib/lyricforge/catalog-creative.ts lib/lyricforge/creative-registry.ts lib/lyricforge/store.ts lib/lyricforge/__tests__/catalog-creative.test.ts
git commit -m "feat: resolve installed creative presets"
```

---

### Task 6: Add exact dependency collection, project bundling, and restoration

**Files:**
- Create: `lib/lyricforge/catalog-dependencies.ts`
- Create: `lib/lyricforge/catalog-bundle.ts`
- Modify: `lib/lyricforge/project-manager.ts`
- Modify: `lib/lyricforge/creative-assets.ts`
- Create: `lib/lyricforge/__tests__/catalog-dependencies.test.ts`
- Modify: `lib/lyricforge/__tests__/project-manager.test.ts` if present; otherwise create `lib/lyricforge/__tests__/project-catalog-bundle.test.ts`.

**Interfaces:**
- Produces: `collectProjectCatalogDependencies(project, installed)`, `resolveProjectDependencies(project, registryState)`, `bundleCatalogDependencies(project)`, `restoreBundledCatalogDependencies(archive)`.

- [ ] **Step 1: Add RED tests that collect only actually-used non-built-ins**

```ts
it('collects exact versions from effects, transitions, animations, and catalog fonts',()=>{
  const deps=collectProjectCatalogDependencies(projectUsingCatalogAssets(),installedFixture());
  expect(deps).toEqual(expect.arrayContaining([
    {id:'catalog.effect.neon-pulse',type:'effect',version:'1.0.0',sourceCatalogId:'official'},
    {id:'catalog.transition.soft-glitch',type:'transition',version:'1.0.0',sourceCatalogId:'official'}
  ]));
  expect(deps.some(d=>d.id.startsWith('builtin.'))).toBe(false);
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-dependencies.test.ts
```

- [ ] **Step 3: Implement deterministic dependency graph collection**

Walk clip animation slots, clip effects, master effects, transitions, and versioned catalog-font family names. Merge duplicate references by `type:id@version`. Write the resulting exact list into `Project.dependencies` when saving/bundling; do not mutate project creative instances.

- [ ] **Step 4: Extend `.lyricforge` project archive layout**

Existing media remains under `assets/<id>`. Add catalog package bytes under:

```text
catalog/<type>/<id>/<version>/asset.lyricforge-asset
```

`project.json` keeps only exact dependency refs, not implementation code.

- [ ] **Step 5: Restore bundled dependencies before final dependency resolution**

On import, validate embedded packages through the same package validator/installer staging logic. Invalid embedded catalog content is reported and not activated; ordinary media still uses existing validation.

- [ ] **Step 6: Add exact-version preservation tests**

A project referencing `1.0.0` must continue resolving `1.0.0` even when `1.1.0` is current for new insertions.

- [ ] **Step 7: Verify**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-dependencies.test.ts lib/lyricforge/__tests__/project-catalog-bundle.test.ts lib/lyricforge/__tests__/project-migration.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add lib/lyricforge/catalog-dependencies.ts lib/lyricforge/catalog-bundle.ts lib/lyricforge/project-manager.ts lib/lyricforge/creative-assets.ts lib/lyricforge/__tests__
git commit -m "feat: bundle exact catalog dependencies"
```

---

### Task 7: Implement offline-first catalog service, favorites, and update detection

**Files:**
- Create: `lib/lyricforge/catalog-service.ts`
- Create: `lib/lyricforge/__tests__/catalog-service.test.ts`
- Modify: `lib/lyricforge/public-path.ts` only if needed to expose a reusable catalog URL helper.

**Interfaces:**
- Produces: `CatalogService.load()`, `.refresh()`, `.search()`, `.setFavorite()`, `.getUpdateState()` and a subscribe/snapshot interface usable through `useSyncExternalStore`.

- [ ] **Step 1: Write RED tests for cached-first startup and failed refresh fallback**

```ts
it('publishes cached catalog before the network response',async()=>{
  const service=serviceFixture({cached:index('cached'),network:index('fresh',100)});
  const loading=service.load();
  expect(service.getSnapshot().index?.generatedAt).toBe('cached');
  await loading;
  expect(service.getSnapshot().index?.generatedAt).toBe('fresh');
});

it('keeps the last valid cache when refresh validation fails',async()=>{
  const service=serviceFixture({cached:index('cached'),network:{bad:true}});
  await service.load();
  expect(service.getSnapshot().index?.generatedAt).toBe('cached');
  expect(service.getSnapshot().refreshError).toMatch(/catalog/i);
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-service.test.ts
```

- [ ] **Step 3: Implement cached-first load + background refresh**

Network URL is `publicPath('/catalog/index.json')`. Only a validated network index replaces the cached index. Offline/network errors set non-fatal status.

- [ ] **Step 4: Implement filters/search/update state**

Filters are exactly Built-in, Online, Installed, Favorites, Updates. Search matches normalized name, description, author, and tags. Updates compare installed current version against compatible official versions using `compareSemVer()`.

- [ ] **Step 5: Verify**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-service.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/catalog-service.ts lib/lyricforge/__tests__/catalog-service.test.ts lib/lyricforge/public-path.ts
git commit -m "feat: add offline first catalog service"
```

---

### Task 8: Add the official static catalog, deterministic package builder, and CI validation

**Files:**
- Create: `scripts/build-catalog.mjs`
- Create: `scripts/validate-catalog.mjs`
- Create: `public/catalog/index.json`
- Create: four versioned source manifests/previews under `public/catalog/assets/...`
- Modify: `package.json`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `scripts/verify-pages-build.mjs`
- Create: `scripts/__tests__/catalog-build.test.mjs` only if the existing test harness supports Node script tests; otherwise cover script output from Vitest through a small fixture helper.

**Interfaces:**
- `pnpm run catalog:build` deterministically writes package ZIPs and final SHA/size fields.
- `pnpm run catalog:validate` exits non-zero for any malformed catalog.

- [ ] **Step 1: Add a failing catalog-validator fixture test**

Verify duplicate ID/version, bad package hash, missing preview, bad runtime, path traversal, and an official font without redistributable license metadata each fail validation.

- [ ] **Step 2: Implement deterministic catalog source entries**

Seed v1 with:

```text
catalog.effect.neon-pulse@1.0.0       -> trusted runtime effect.glow
catalog.transition.soft-glitch@1.0.0  -> trusted runtime transition.glitch
catalog.animation.starlight-rise@1.0.0 -> trusted runtime animation.slide
catalog.font.bebas-neue@1.0.0         -> Bebas Neue Regular, SIL OFL 1.1
```

The Bebas Neue source is the Google Fonts repository family `ofl/bebasneue`; store the upstream source URL and OFL license metadata in the manifest. The actual font payload included in the package is `BebasNeue-Regular.ttf` and must match the committed/package hash.

- [ ] **Step 3: Build packages deterministically**

Sort ZIP entry names, normalize JSON with stable key ordering/newline rules, use deterministic ZIP metadata, then calculate the whole-package SHA-256 and write/update `index.json` + external item manifests.

- [ ] **Step 4: Add scripts**

```json
"catalog:build":"node scripts/build-catalog.mjs",
"catalog:validate":"node scripts/validate-catalog.mjs"
```

- [ ] **Step 5: Gate Pages build before application build**

Add workflow steps after tests:

```yaml
- name: Build official creative catalog
  run: pnpm run catalog:build
- name: Validate official creative catalog
  run: pnpm run catalog:validate
```

Update `verify-pages-build.mjs` to require `dist/client/catalog/index.json` and the four package URLs.

- [ ] **Step 6: Verify locally**

```bash
pnpm run catalog:build
pnpm run catalog:validate
pnpm test -- --run
pnpm run build
node scripts/verify-pages-build.mjs
```

- [ ] **Step 7: Commit**

```bash
git add public/catalog scripts package.json .github/workflows/deploy-pages.yml
git commit -m "feat: publish validated official asset catalog"
```

---

### Task 9: Build desktop/mobile catalog UI with live install state

**Files:**
- Create: `components/editor/CatalogPanel.tsx`
- Create: `components/editor/CatalogPreview.tsx`
- Create: `components/editor/__tests__/CatalogPanel.test.tsx`
- Modify: `components/editor/Editor.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `CatalogService`, `CatalogInstaller`.
- Produces: catalog tabs `Fonts | Effects | Transitions | Text Animations`, filters `Built-in | Online | Installed | Favorites | Updates`, search, detail view, install/update/repair/rollback/remove controls.

- [ ] **Step 1: Add RED component tests**

```tsx
it('filters to installed effects and exposes update action',async()=>{
  render(<CatalogPanel service={fixtureService()} installer={fixtureInstaller()} mobile={false}/>);
  await user.click(screen.getByRole('tab',{name:'Effects'}));
  await user.click(screen.getByRole('button',{name:'Installed'}));
  expect(screen.getByText('Neon Pulse')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/update/i})).toBeInTheDocument();
});
```

Add a phone test that the catalog gets `role="dialog"`/sheet semantics and touch-sized install controls.

- [ ] **Step 2: Run RED**

```bash
pnpm test -- --run components/editor/__tests__/CatalogPanel.test.tsx
```

- [ ] **Step 3: Implement catalog shell and cards**

Cards show preview, name, author/source, license, version, size, compatibility, favorite state, and status action. Detail view shows description, parameters/preset, changelog, source/license, and trusted runtime ID.

- [ ] **Step 4: Integrate into editor layout**

Add a `Catalog` entry to the existing left-side workspace. Desktop/tablet opens it as a normal panel. Phone portrait opens a full-height sheet using existing workspace mode classification rather than UA sniffing.

- [ ] **Step 5: Add lazy previews**

Use ordinary `<img>`/`<video muted playsInline>` URLs from validated cached/static paths. Do not use HTML injection for SVG.

- [ ] **Step 6: Verify**

```bash
pnpm test -- --run components/editor/__tests__/CatalogPanel.test.tsx components/editor/__tests__/Editor.mobile.test.tsx
pnpm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add components/editor/CatalogPanel.tsx components/editor/CatalogPreview.tsx components/editor/Editor.tsx components/editor/__tests__/CatalogPanel.test.tsx app/globals.css
git commit -m "feat: add mobile friendly asset catalog"
```

---

### Task 10: Integrate installed creative assets and fonts into normal editor pickers

**Files:**
- Create: `lib/lyricforge/catalog-fonts.ts`
- Modify: `lib/lyricforge/assets.ts`
- Modify: `components/editor/CreativeInspector.tsx`
- Modify: `components/editor/Inspector.tsx`
- Create: `lib/lyricforge/__tests__/catalog-fonts.test.ts`
- Modify: `components/editor/__tests__/CreativeInspector.test.tsx`

**Interfaces:**
- Produces: `catalogFontFamily(id,version,displayFamily)`, `loadInstalledCatalogFont(versionRecord,bytes)`, `unloadCatalogFont()`.

- [ ] **Step 1: Add RED tests for deterministic exact-version font family names**

```ts
it('uses distinct CSS family names for distinct installed versions',()=>{
  expect(catalogFontFamily('catalog.font.bebas-neue','1.0.0','Bebas Neue'))
    .not.toBe(catalogFontFamily('catalog.font.bebas-neue','1.1.0','Bebas Neue'));
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-fonts.test.ts
```

- [ ] **Step 3: Implement font loading through `FontFace`**

Versioned CSS family name format:

```ts
`LyricForge Catalog ${displayFamily} [${id}@${version}]`
```

The normal typography UI displays the friendly catalog name but writes the versioned family into the project style so exact dependency collection remains deterministic.

- [ ] **Step 4: Merge installed creative definitions into inspector choices**

Effects, transitions, and text animations appear alongside built-ins after install without a reload. Existing project instances continue showing their exact version even when another version becomes current.

- [ ] **Step 5: Verify**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-fonts.test.ts components/editor/__tests__/CreativeInspector.test.tsx lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/catalog-fonts.ts lib/lyricforge/assets.ts components/editor/CreativeInspector.tsx components/editor/Inspector.tsx lib/lyricforge/__tests__/catalog-fonts.test.ts components/editor/__tests__/CreativeInspector.test.tsx
git commit -m "feat: expose installed assets in editor pickers"
```

---

### Task 11: Add Restore Dependencies and advanced manual installation

**Files:**
- Create: `components/editor/RestoreDependenciesPanel.tsx`
- Create: `components/editor/AdvancedInstaller.tsx`
- Create: `components/editor/__tests__/RestoreDependenciesPanel.test.tsx`
- Create: `components/editor/__tests__/AdvancedInstaller.test.tsx`
- Modify: `components/editor/Editor.tsx`
- Modify: `lib/lyricforge/project-manager.ts`

**Interfaces:**
- Restore panel consumes `DependencyResolution[]` and exposes `Restore All`, exact-version restore, locate/import, explicit substitute, and bypass actions.
- Advanced installer accepts `File` or direct manifest URL.

- [ ] **Step 1: Add RED tests that nothing downloads before user action**

```tsx
it('shows exact missing versions without auto downloading',()=>{
  const restore=vi.fn();
  render(<RestoreDependenciesPanel missing={[missingEffect('1.0.0')]} onRestore={restore}/>);
  expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
  expect(restore).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add URL installer validation tests**

Permit `https:` URLs and local-development `http://localhost` / `http://127.0.0.1`; reject arbitrary insecure remote HTTP. Fetch only direct manifests, never scrape HTML pages.

- [ ] **Step 3: Implement restore flow**

On project open/import, resolve dependencies after bundled dependency validation. If unresolved required dependencies remain, surface the panel immediately. `Restore All` installs only exact compatible official versions after explicit click.

- [ ] **Step 4: Implement advanced file/URL flow**

Local `.lyricforge-asset` goes directly through package validation. Direct manifest URL goes manifest -> confirmation showing source/author/license -> package download -> standard installer.

- [ ] **Step 5: Add unknown-license font bundle warning**

User-imported fonts retain current behavior. Before embedding such fonts in a shareable bundle, show/throw a structured warning that `Editor.tsx` turns into an explicit confirmation flow. Official catalog fonts with validated redistributable licenses do not warn.

- [ ] **Step 6: Verify**

```bash
pnpm test -- --run components/editor/__tests__/RestoreDependenciesPanel.test.tsx components/editor/__tests__/AdvancedInstaller.test.tsx lib/lyricforge/__tests__/catalog-dependencies.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add components/editor/RestoreDependenciesPanel.tsx components/editor/AdvancedInstaller.tsx components/editor/Editor.tsx components/editor/__tests__ lib/lyricforge/project-manager.ts
git commit -m "feat: restore and manually install catalog assets"
```

---

### Task 12: Run acceptance, corruption, offline, and regression gates

**Files:**
- Create: `lib/lyricforge/__tests__/catalog-acceptance.test.ts`
- Modify: `QA.md`
- Modify: `README.md` only for user-facing catalog/project portability notes.

**Interfaces:**
- This task adds no new product API; it proves the complete v1 flow.

- [ ] **Step 1: Add an automated clean-profile acceptance test**

The fixture flow must: load official index -> install one font/effect/transition/animation -> apply them to a project -> reload service with network disabled -> resolve installed items -> bundle project -> create a second empty storage fixture -> import bundle -> restore embedded dependencies -> confirm exact IDs/versions and renderer definitions match.

- [ ] **Step 2: Add corruption and rollback acceptance coverage**

Deliberately mutate one byte in a package and confirm install fails with the prior installed version/current pointer untouched. Confirm `repair()` restores the same version and `rollback()` switches to an already-installed older version without rewriting project refs.

- [ ] **Step 3: Run the focused suite**

```bash
pnpm test -- --run lib/lyricforge/__tests__/catalog-acceptance.test.ts lib/lyricforge/__tests__/catalog-package.test.ts lib/lyricforge/__tests__/catalog-installer.test.ts lib/lyricforge/__tests__/catalog-dependencies.test.ts
```

- [ ] **Step 4: Run the authoritative repository gate**

```bash
pnpm run catalog:build
pnpm run catalog:validate
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
pnpm run build
node scripts/verify-pages-build.mjs
```

Expected: all commands pass, catalog files are present in `dist/client/catalog/`, existing creative runtime tests remain green, and no build step requires catalog network access.

- [ ] **Step 5: Update QA notes with manual mobile checks**

Document Android Chrome portrait/landscape checks for catalog sheet scrolling, preview playback, install/update controls, offline reload, dependency restore, font selection, and a short export. Do not claim hands-on device QA unless it was actually run.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/__tests__/catalog-acceptance.test.ts QA.md README.md
git commit -m "test: verify creative catalog acceptance flow"
```

---

## Self-Review Checklist

- Spec coverage: official static catalog, trusted declarative assets, fonts, effects, transitions, animations, manual updates, favorites, offline cache, atomic install, repair, rollback, exact-version project refs, project bundling, restore panel, file/URL install, font licensing, CI validation, mobile UI, and clean-profile acceptance all map to tasks above.
- Integrity clarification: whole-package SHA-256 is external to the ZIP; embedded manifest carries file hashes. This preserves the approved trust requirement without an impossible self-hash.
- No arbitrary executable package type is accepted anywhere in the plan.
- Type consistency: all catalog references use `type + id + exact version`; current-version pointers affect new insertions only.
- Rendering boundary: installed creative definitions reuse trusted runtime IDs and existing renderer code; no catalog network fetch occurs inside rendering/export.
- Backward compatibility: project schema remains version 3 and old built-in-only projects do not gain a network dependency.
- Main-branch safety: implementation branch is `feat/creative-catalog`; merge to `main` is outside this plan and requires a later explicit integration decision.
