# LyricForge Creative Catalog, Asset Install, and Dependency Recovery Design

Date: 2026-09-13
Status: Approved design; implementation plan pending final user review

## Goal

Add a secure, offline-first creative asset catalog to LyricForge for downloadable fonts, effects, transitions, and text animations without compromising project determinism, export fidelity, or browser safety.

The catalog must feel like part of the editor rather than a separate marketplace. Installed assets must be usable directly from existing font, effect, transition, and animation controls. Existing projects must continue to work offline and must not silently change when catalog assets are updated, removed upstream, or temporarily unavailable.

This phase intentionally focuses on catalog, installation, storage, versioning, project dependency bundling, and dependency recovery. Broader general-settings expansion remains a follow-on subsystem so this design stays bounded.

## 1. Product Scope

Version 1 includes:

- One official LyricForge catalog hosted as static files in this repository and served through the existing GitHub Pages deployment.
- Built-in, Online, Installed, Favorites, and Updates views.
- Four asset categories: Fonts, Effects, Transitions, and Text Animations.
- Live or representative previews for every catalog asset type.
- Install, update, repair, rollback, remove, and favorite workflows.
- Manual local package installation.
- Manual direct-manifest URL installation.
- Offline catalog cache and fully offline use of installed assets.
- Exact-version project dependency tracking.
- Project bundles that embed only downloaded dependencies actually used by the project.
- Missing-dependency detection and user-approved restoration.
- Build-time catalog validation before GitHub Pages deployment.

Version 1 does not include:

- User accounts or cloud sync.
- Payments or commercial marketplace features.
- Arbitrary third-party catalog feeds.
- Arbitrary downloaded JavaScript, HTML, WebAssembly, shaders, or executable modules.
- Silent/background installation of updates.
- Silent replacement of missing or incompatible dependencies.

Third-party catalog feed URLs may be considered in a later version after the trust and moderation model is expanded.

## 2. Security and Trust Model

Downloaded effects, transitions, and text animations are declarative presets only. They may define parameters, default values, keyframes, timing, easing, colors, intensity, preview metadata, tags, and other schema-approved configuration, but they cannot introduce new executable code.

Every downloadable creative preset must bind to a trusted runtime implementation already shipped with LyricForge. If a package references a runtime identifier that is not present in the trusted creative registry, installation fails before activation.

Allowed package payloads are limited to declared data assets such as:

- JSON manifest and preset data.
- WOFF2 or TTF font files where permitted.
- Preview images, short preview video, or other explicitly supported non-executable preview media.

Packages containing undeclared files, executable scripts, HTML, unsupported MIME types, path traversal entries, or unsupported runtime bindings are rejected.

Official downloads use SHA-256 integrity metadata. A package is not committed as installed until its hash, schema, compatibility, runtime binding, declared files, and licensing metadata all validate.

## 3. Hosting Architecture

The official catalog lives under:

`public/catalog/`

The existing static build and GitHub Pages deployment serves the catalog beside the application. No application server or database is required.

Recommended top-level layout:

```text
public/catalog/
  index.json
  assets/
    <asset-id>/
      <version>/
        manifest.json
        <asset-id>-<version>.lyricforge-asset
        preview.*
```

`index.json` remains intentionally small enough to load quickly on mobile. It provides searchable summary metadata and points to versioned item manifests/packages.

The build pipeline validates the complete catalog before Pages deployment. A malformed catalog entry must fail CI rather than reach production.

## 4. Package and Manifest Contract

A `.lyricforge-asset` package is a ZIP-based container with exactly one root manifest plus only the files declared by that manifest.

Each catalog asset uses a stable namespaced ID and immutable semantic version. Display names may change without affecting project references.

The manifest includes at least:

- `schemaVersion`
- `id`
- `version`
- `type`
- `name`
- `description`
- `author`
- `sourceUrl`
- `license`
- `licenseUrl` when relevant
- `tags`
- `minAppVersion`
- optional `maxAppVersion`
- trusted `runtimeId` for effects/transitions/animations
- declarative preset/default parameter payload
- parameter schema
- preview metadata
- package size
- package SHA-256
- changelog metadata
- declared package file list including MIME/type metadata and per-file integrity where useful

The official catalog index contains enough metadata for listing, filtering, compatibility display, update checks, and lazy preview loading without downloading every full package manifest up front.

## 5. Core Components

### `CatalogIndexService`

Loads the cached official catalog immediately, refreshes `/catalog/index.json` when online, normalizes catalog entries, and exposes filtered views for Built-in, Online, Installed, Favorites, and Updates.

### `CatalogManifestValidator`

Validates manifest schema, asset IDs, versions, compatibility ranges, trusted runtime bindings, source/license metadata, declared files, package integrity metadata, and type-specific constraints.

### `AssetPackageInstaller`

Owns staged installation, integrity verification, atomic commit, update, repair, rollback, and uninstall rules. It must never destroy the previous working version before a replacement has fully validated.

### `InstalledAssetStore`

Uses IndexedDB for installed-version metadata, current-version pointers, favorites, source information, license metadata, compatibility state, and update state.

### `CatalogCache`

Uses Cache Storage for catalog index/manifest responses, previews, packages, and other suitable downloadable binary payloads. Cache failures must degrade gracefully to IndexedDB metadata plus online fetch where available.

### `DependencyResolver`

Combines built-in assets, installed catalog versions, and project dependency references into a deterministic resolution result with explicit missing/incompatible diagnostics.

### `ProjectDependencyBundler`

Collects only non-built-in dependencies actually referenced by the current project and embeds those validated dependency payloads into project bundles.

### `AdvancedInstaller`

Supports only:

1. Local `.lyricforge-asset` files.
2. Direct URLs to valid LyricForge asset manifests with integrity metadata.

It does not scrape arbitrary webpages.

### `CatalogUI`

Provides browsing, search, filters, detail views, previews, install/update controls, favorites, and installed state.

### `RestoreDependenciesPanel`

Provides explicit missing-dependency recovery with exact versions, compatibility status, source/license details, and one-tap restoration when safe and available.

## 6. Install, Update, Repair, and Rollback Flow

Installation is staged and atomic.

1. User chooses Install.
2. LyricForge retrieves the item manifest if not already cached.
3. Manifest validation runs before package activation.
4. Package bytes download to temporary/staged storage.
5. SHA-256 and declared payload validation run.
6. Compatibility and trusted runtime binding are rechecked against the currently running app.
7. The validated immutable version is committed to local storage.
8. Only after successful commit does LyricForge move the asset's current-version pointer.

Updates are manual by default. The Updates view shows available versions, compatibility, and changelog information. LyricForge never silently changes the creative result of an existing project.

Repair re-downloads and revalidates the same exact version without altering project references.

Rollback switches the current pointer to a previously installed valid version. Exact-version projects continue resolving their referenced version regardless of which version is currently preferred for new uses.

A failed install, update, repair, or hash check leaves every previously installed version untouched.

## 7. Immutable Versioning and Project Determinism

Every installed version is immutable after successful validation.

Projects store stable asset references using at least:

- Asset ID.
- Asset type.
- Exact resolved version.
- User overrides/parameters/keyframes relevant to that project instance.

Projects must not silently float to a newer catalog version when reopened. A catalog update may become the default for newly added instances, but already-authored project content keeps its exact resolved version unless the user explicitly migrates it.

Old installed versions remain available while saved projects depend on them. A later storage-management feature may remove versions only when they are unreferenced or after explicit user confirmation.

If an asset disappears from the remote catalog, already-installed valid versions continue working locally.

## 8. Offline-First Behavior

Opening the Catalog shows the most recent valid cached index immediately. If online, LyricForge refreshes the official index in the background and then updates the visible catalog state.

When offline:

- Built-in assets work normally.
- Installed assets work normally.
- Cached catalog metadata and previews remain browsable where available.
- Favorites and installed/update history remain visible from local metadata.
- New remote downloads are disabled with a clear offline state.

A failed refresh never replaces the last valid cached catalog with an error or malformed response.

## 9. Catalog UI and Mobile UX

The catalog is integrated into LyricForge.

Desktop/tablet uses a dedicated Catalog panel. Phone portrait opens the catalog as a full-height bottom sheet so search, previews, filters, and install controls remain usable without forcing desktop sidebar layouts onto a small screen.

Top-level asset tabs:

- Fonts
- Effects
- Transitions
- Text Animations

Primary filters:

- Built-in
- Online
- Installed
- Favorites
- Updates

Search is available across the active category. Additional tag/category filtering may be included when supported by the catalog metadata.

Each card shows:

- Preview.
- Name.
- Author/source.
- License.
- Version.
- Download size.
- Compatibility state.
- Favorite control.
- Install, Update, Installed, or incompatible state.

The detail view shows a larger preview, description, parameter summary, changelog, source/license information, package/version information, and the trusted runtime identifier used by creative presets.

Catalog previews are lazy-loaded and designed to stay inexpensive on phones.

Installed effects, transitions, and text animations appear directly alongside built-ins in the existing creative inspector. Installed fonts appear directly in the normal font picker.

## 10. Preview Rules by Asset Type

Fonts preview with editable sample lyric text and representative weights/styles where available.

Effects preview against a standard LyricForge demonstration scene using the same trusted renderer used by the editor.

Transitions preview as a looping A-to-B sample using the same transition runtime used by preview/export.

Text animations preview against representative lyric text using the same animation runtime used by preview/export.

Because downloadable creative items are presets over trusted runtime implementations, preview and export do not need a separate execution engine for installed content.

## 11. Font Policy

The official LyricForge catalog includes only fonts with clearly redistributable licensing appropriate for catalog packaging and project bundling, such as SIL OFL, Apache-2.0, or similarly permissive licenses.

Each official font entry exposes its license and source before installation.

Users may privately import their own font files through supported project/editor workflows. When LyricForge cannot verify redistribution rights for a user-imported font, project bundling must show a warning before embedding that font into a shareable project bundle.

The warning does not make a legal determination; it prevents silent redistribution of a font with unknown rights.

## 12. Project Dependency Resolution

On project load, LyricForge resolves dependencies in this order:

1. Built-in assets.
2. Exact locally installed catalog versions.
3. Valid dependencies embedded in the project bundle.
4. Remote recovery options from the official catalog, only after user approval.

If an exact dependency cannot be resolved, the project retains the intended reference. The creative instance is safely bypassed or uses an explicitly defined temporary fallback where necessary for editor stability, and diagnostics explain what is missing.

LyricForge never silently substitutes a different catalog asset or a newer version.

Unresolved required dependencies block final export by default when their absence would materially change the intended result. The user may only proceed through an explicit fallback path where such behavior is supported.

## 13. Restore Dependencies Flow

Opening a project with unresolved dependencies immediately surfaces a Restore Dependencies panel.

For every unresolved dependency the panel shows:

- Name/asset ID.
- Type.
- Exact required version.
- Current resolution status.
- Source.
- License where available.
- Whether the exact version exists in the official catalog.
- Whether the project bundle already contains a validated copy.
- Compatibility state.

The panel offers `Restore All` only for dependencies that can be fetched/restored safely and exactly. Nothing downloads without user action.

Where the exact remote version is unavailable, the panel may offer locate/import, substitute, or bypass choices, but those alternatives must be explicit and must not rewrite the original dependency silently.

## 14. Project Bundle Portability

When saving/exporting a shareable LyricForge project bundle, LyricForge walks the project dependency graph and includes only non-built-in downloaded assets actually referenced by the project.

Embedded dependencies retain their exact immutable version and integrity metadata.

When a bundle opens on another clean browser/profile, LyricForge may restore those dependencies locally only after validating:

- Manifest schema.
- Package/file integrity.
- App compatibility.
- Trusted runtime binding.
- Allowed payload types.

User fonts with unknown redistribution rights require a warning before they are included in a bundle.

This model keeps ordinary project files deterministic while allowing project bundles to be portable across devices without requiring the catalog to remain online forever.

## 15. Failure Handling

Installation and resolution errors are specific and actionable.

Examples include:

- Invalid or unsupported manifest schema.
- Duplicate asset ID/version.
- Incompatible LyricForge version.
- Unknown trusted runtime identifier.
- Package hash mismatch.
- File-level integrity mismatch.
- Path traversal or undeclared file.
- Unsupported MIME type.
- Missing required font licensing/source metadata for an official catalog item.
- Network or CORS failure.
- Insufficient browser storage.
- Corrupt ZIP/package.

Manual URL installation also presents the manifest source URL and declared author/license before the user confirms installation.

A failure never removes or mutates a previously working installed version.

## 16. Catalog Validation in CI

GitHub Pages deployment validates the entire official catalog before publishing.

The validator checks at least:

- Catalog schema version.
- Duplicate stable IDs/versions.
- Semantic version validity.
- Compatibility ranges.
- Trusted runtime references.
- Required source/license metadata.
- Official font redistribution metadata.
- Preview references.
- Package presence and declared size.
- SHA-256 integrity values.
- ZIP package structure.
- Path traversal prevention.
- Declared file list consistency.
- Supported MIME/payload types.

CI failure prevents deployment of an invalid catalog.

## 17. Data and Storage Boundaries

IndexedDB is the source of truth for local installed-asset metadata and state.

Cache Storage holds cache-friendly network/binary responses such as catalog indexes, manifests, previews, package downloads, and font/media payloads where practical.

The renderer does not fetch the network directly. Rendering resolves creative assets through the trusted registry/resolver layer so preview and export share the same deterministic runtime path.

Network/catalog concerns must not leak into project serialization or rendering code.

## 18. Backward Compatibility

Existing projects that use only built-in assets continue to load without any catalog dependency metadata.

Existing built-in effect, transition, and animation IDs remain valid.

Legacy project fields already supported by the creative-runtime migration continue to migrate normally.

Adding the catalog must not make previously offline-capable projects require network access.

## 19. Testing Strategy

### Unit tests

Cover:

- Catalog index parsing.
- Manifest validation.
- Semantic version and compatibility resolution.
- SHA-256 verification.
- ZIP/path safety rules.
- Trusted runtime validation.
- Atomic staged installation.
- Update/repair/rollback semantics.
- Exact-version dependency resolution.
- Project dependency graph collection.
- Font licensing warning behavior.
- Offline cache selection/fallback behavior.

### Integration/component tests

Cover:

- Browse/search/filter each asset type.
- Install one item from each asset category.
- Installed items appear immediately in the existing editor pickers/inspector.
- Manual update and rollback.
- Corrupt package rejection without damaging the previous version.
- Offline startup using cached catalog data.
- Installed creative preset preview/export reuse the same trusted renderer.
- Missing dependency panel and Restore All.
- Exact version restored from embedded project bundle.
- Missing runtime/incompatible asset remains preserved but safely bypassed.
- Manual file and direct-manifest URL installation.
- Mobile catalog bottom-sheet interactions.

### Browser/mobile QA

Verify desktop Chrome plus representative Android Chrome portrait and landscape sizes.

Critical flows include catalog browsing, previewing, installation, applying installed creative assets, offline reload, project save/reopen, project transfer to a clean profile, dependency restore, and successful export.

## 20. Version 1 Acceptance Test

Version 1 is accepted when a clean LyricForge profile can:

1. Open the catalog and browse the official static catalog.
2. Install at least one font, effect, transition, and text animation.
3. Use each installed item in an actual project through the normal editor controls.
4. Reload offline and continue editing with those installed items.
5. Export the project successfully with preview/export behavior matching the trusted runtime model.
6. Save a portable project bundle containing only the external dependencies actually used.
7. Open that bundle in another clean browser/profile.
8. Validate and restore its embedded dependencies.
9. Reproduce the intended project result without silently upgrading or substituting asset versions.
10. Detect and clearly report a deliberately corrupt or incompatible package while leaving previous working installs intact.

## 21. Recommended Implementation Sequence

The implementation plan should use small, testable checkpoints:

1. Define catalog, manifest, package, installed-version, and dependency types/schemas.
2. Add manifest/package validator and test fixtures.
3. Add IndexedDB installed-asset store and cache abstraction.
4. Add atomic package installer with hash validation, repair, and rollback.
5. Extend the existing creative registry/resolver for installed trusted presets.
6. Add project exact-version dependency serialization/resolution.
7. Add project dependency bundling/restoration.
8. Add official static catalog structure plus build-time validator.
9. Add Catalog UI with desktop and phone portrait behavior.
10. Add catalog previews and existing-inspector/font-picker integration.
11. Add Favorites and Updates state.
12. Add Restore Dependencies panel.
13. Add advanced `.lyricforge-asset` file and direct-manifest URL installation.
14. Add font-specific licensing and bundle warnings.
15. Run offline, mobile, export, migration, corruption, rollback, and clean-profile portability acceptance passes.

## 22. Design Decisions Locked for Version 1

The following decisions were explicitly approved:

- Official LyricForge catalog only; arbitrary third-party catalog feeds are deferred.
- Downloaded effects/transitions/text animations are declarative trusted-runtime presets only.
- Updates are manual by default.
- Portable project bundles embed only downloaded dependencies actually used by that project.
- Official catalog fonts require clearly redistributable licensing.
- User-imported fonts with unknown redistribution rights trigger a bundling warning.
- Catalog behavior is offline-first with cached index/previews and background refresh when online.
- Advanced install supports only local `.lyricforge-asset` packages and direct LyricForge manifest URLs.
- Missing dependencies are surfaced immediately through an explicit Restore Dependencies flow.
- The official catalog is hosted under `public/catalog/` through the existing GitHub Pages deployment.
- Static manifest + packaged assets is the chosen catalog architecture.
- Installed asset versions are immutable and exact-version project references are preserved.
- Failed updates preserve the last working installed version.
- Repair and rollback are first-class recovery actions.
- `.lyricforge-asset` is ZIP-based and cannot contain executable code.
- Catalog CI validation is required before Pages deployment.
