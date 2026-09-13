# LyricForge Mobile Editing, Effects, Transitions, and Asset Catalog Design

Date: 2026-09-13
Status: Approved design direction; implementation plan pending user review

## Goal

Upgrade LyricForge from a desktop-first lyric video editor into a substantially more touch-friendly editor, especially in phone portrait orientation, while adding direct preview text editing, richer visual effects, proper transitions, reusable text animations, and a hybrid downloadable asset catalog.

The new systems should feel native to the existing editor rather than like separate utilities. Projects must remain usable offline after required assets are installed, and missing or incompatible downloaded assets must fail visibly instead of silently changing the project.

## Scope

This feature set includes:

- Tap-to-select and edit text directly from the preview.
- Mobile portrait workspace optimized for touch.
- Expanded text and visual effects.
- Clip/layer transitions with configurable duration and easing.
- Separate intro, loop, and outro text animation slots.
- Built-in and online catalogs for fonts, effects, transitions, and text animations.
- One-tap preview/install/update/remove for catalog assets.
- Install-from-URL and import-from-file for advanced users.
- Expanded application, timeline, rendering, gesture, storage, and accessibility settings.
- Project-level dependency tracking for downloaded assets.

This design does not add user accounts, payments, cloud project sync, or a centralized server database. The online catalog is intentionally manifest-driven so it can be hosted cheaply and updated independently of the application.

## Design Principles

1. Direct manipulation first. If a user can see text in the preview, tapping it should be the fastest path to editing it.
2. Mobile controls should not be scaled-down desktop controls. Portrait mode gets its own layout behavior and interaction patterns.
3. Installed creative assets must work offline.
4. Downloaded assets must have stable IDs, versions, compatibility metadata, and license/source information.
5. Editing state must stay non-destructive and undoable.
6. Heavy visual effects should degrade preview quality before they degrade editing responsiveness.
7. Every catalog feature should have a manual fallback: built-in assets, file import, or URL install.

## 1. Preview Direct Manipulation

### Selection

A tap on rendered text selects the topmost visible text layer under the pointer. Hit testing must respect current transforms, layer order, hidden/locked state, and preview scaling.

If overlapping elements are hit, repeated taps cycle through the eligible layers under that point. Locked layers may be identified but cannot be moved or edited until unlocked.

### Editing gestures

- Single tap: select the text layer.
- Double tap: enter inline text editing for that layer.
- Drag selected text: move it.
- Pinch on selected text: scale it.
- Rotation handle or two-finger rotate gesture: rotate it.
- Tap outside: commit inline editing and keep normal project focus rules.
- Long press: open the contextual action sheet with edit, duplicate, lock, hide, bring forward/backward, animation, effects, and delete actions.

### Inline text editing

Inline editing should be an overlay aligned to the rendered text bounds, not a separate floating prompt. The preview should continue showing the layer in context while the text changes.

On desktop/tablet, selection synchronizes with the existing inspector. On phone portrait, selection opens the relevant bottom sheet, initially focused on text content and typography.

All transform and text changes must participate in the existing undo/redo model.

## 2. Portrait Mobile Workspace

### Layout

Phone portrait mode uses a three-zone layout:

1. Preview at the top.
2. Timeline in the middle/lower working area.
3. Contextual bottom sheet for editing controls.

The desktop side inspector is not simply squeezed into portrait mode. Instead, its controls are grouped into mobile sheets:

- Text
- Style
- Animation
- Effects
- Transitions
- Layers
- Audio
- Project
- Settings

The bottom sheet supports collapsed, half-height, and near-full-height states. Preview and timeline remain reachable without navigating to separate screens for common edits.

### Mobile timeline behavior

- Larger minimum touch target for clips, handles, markers, and keyframes.
- Pinch to zoom timeline scale.
- Horizontal drag to scroll.
- Drag playhead independently from clip selection.
- Magnetic snap with visible snap feedback.
- Long press on a clip for contextual actions.
- Edge handles for duration changes with generous invisible hit areas.
- Optional haptic feedback where browser/platform support exists.

### Responsive breakpoints

The application should classify layout by available working width and pointer characteristics rather than user-agent strings.

Expected modes:

- Phone portrait: bottom-sheet workflow.
- Phone landscape/small tablet: compact split workspace.
- Tablet/desktop: existing multi-panel workspace, refined where needed.

## 3. Text Animation Model

Each text layer can have up to three animation roles:

- Intro: runs when the layer enters.
- Loop: runs while the layer is active.
- Outro: runs as the layer exits.

Each role references an animation definition and user-adjustable parameters such as duration, delay, easing, intensity, direction, staggering, and per-word/per-character behavior where supported.

### Initial built-in animations

Intro/outro examples:

- Fade
- Slide
- Blur in/out
- Scale punch
- Tracking expand/contract
- Word pop
- Character cascade
- Spin
- 3D tilt
- Wipe reveal
- Pixel dissolve
- Glitch reveal

Loop examples:

- Pulse
- Float
- Bounce
- Shake
- Wave
- Neon flicker
- Breathing glow
- RGB drift
- Subtle 3D sway
- Beat pulse where audio analysis is available

### Animation definition contract

Animation definitions must expose:

- Stable asset ID.
- Human-readable name.
- Version.
- Supported targets.
- Parameter schema.
- Preview metadata.
- Runtime implementation identifier.
- Minimum compatible LyricForge version.

The editor should not store implementation code directly inside project files. Projects store asset ID, version constraint/resolved version, role, and user parameters.

## 4. Visual Effects

Effects are stackable and non-destructive. A layer or supported media item may contain an ordered list of effect instances.

Each effect instance stores:

- Asset ID and resolved version.
- Enabled state.
- Parameter values.
- Optional animation/keyframe information.

### Initial built-in effects

- Glow
- Bloom
- Drop shadow
- Outline/stroke enhancements
- Blur
- Sharpen
- Grain
- Vignette
- Hue shift
- Saturation/contrast/brightness
- Duotone
- Posterize
- Pixelation
- Chromatic aberration/RGB split
- VHS/scanlines
- Noise displacement
- Shake/jitter
- Zoom pulse
- Lens flare/light streak approximation
- Glitch
- Beat-reactive intensity when audio analysis is available

The preview renderer should use quality tiers. Heavy effects may run at reduced preview resolution while exports use full configured quality.

## 5. Transition Model

Transitions exist between adjacent compatible clips/layers or at supported item boundaries. They should be represented as first-class timeline objects rather than hidden animation side effects.

A transition instance stores:

- Transition asset ID and version.
- Incoming item ID.
- Outgoing item ID.
- Duration.
- Easing.
- Direction and effect-specific parameters.

### Initial built-in transitions

- Crossfade
- Dip to black
- Dip to white
- Blur dissolve
- Push
- Slide
- Directional wipe
- Zoom
- Spin
- Flash
- Glitch
- RGB split
- Pixel dissolve
- Film burn-style overlay
- Light leak-style overlay
- Mask reveal

Dragging a transition handle on the timeline changes duration. Tapping it opens transition controls and a quick preset picker.

## 6. Hybrid Asset Catalog

LyricForge has two primary catalog sources plus manual installation:

### Built-in catalog

Bundled with the app and always available offline. It contains the core fonts/presets/effects/transitions/animations needed for a useful editor without a network connection.

### Online catalog

A structured remote catalog containing downloadable:

- Fonts
- Effects
- Transitions
- Text animations

The online experience is a true browsable catalog, not merely a URL input. Users can browse categories, search, filter, preview, favorite, install, update, and remove assets.

Recommended first implementation: static versioned JSON manifests and downloadable asset packages hosted in a dedicated GitHub repository or equivalent static host.

### Advanced install options

The catalog screen also provides:

- Install from URL.
- Import asset package from file.
- Import compatible font file directly.

Unsupported or invalid packages must be rejected with an actionable error.

## 7. Catalog User Experience

Top-level catalog sections:

- Fonts
- Effects
- Transitions
- Text Animations

Filters:

- Built-in
- Online
- Installed
- Favorites
- Updates
- Category/tag
- Compatibility

Each item card should show:

- Name.
- Animated/live preview where applicable.
- Author/source.
- License.
- Version.
- Download size.
- Installed/update state.
- Compatibility indicator.
- Favorite control.
- Install/update/remove action.

### Preview behavior

Fonts preview using editable sample lyric text.

Effects and animations preview against a standard demonstration scene plus, where practical, the currently selected project layer.

Transitions preview as a looping A-to-B clip.

Previews should be low-cost and lazy-loaded so the catalog remains responsive on phones.

## 8. Asset Package and Manifest Format

The remote catalog manifest contains catalog metadata and references to versioned asset packages.

Each asset entry must include at least:

- `id`
- `type`
- `name`
- `version`
- `minAppVersion`
- `author`
- `sourceUrl`
- `license`
- `tags`
- `description`
- `preview`
- `downloadUrl`
- `downloadSize`
- `sha256`
- `entrypoint` or runtime identifier as applicable
- parameter/default metadata for programmable assets

Asset IDs must be globally stable. Renaming a catalog display name must never break projects.

Packages are downloaded to browser-managed local storage/cache. Hash validation occurs before installation is committed.

## 9. Font Catalog

The online font section should support a curated catalog backed initially by freely usable sources such as Google Fonts plus user-installable font files/URLs.

A font record tracks family, styles/weights, license, source, local cached asset references, and version metadata.

Installed web fonts should be available through the normal typography selector and usable offline after caching.

If a project references a missing downloaded font, LyricForge should show the missing dependency and temporarily fall back to a safe font without rewriting the project setting.

## 10. Project Dependency Tracking

Projects gain a dependency section listing external assets used by the project.

For each dependency, store:

- Asset ID.
- Type.
- Resolved version or compatible version range.
- Source catalog identifier if relevant.

On project load:

1. Resolve installed assets.
2. Report missing/incompatible dependencies.
3. Offer one-tap installation/update from the known catalog when available.
4. Preserve the intended asset reference if the dependency is unavailable.

A project must not silently replace a missing effect, animation, transition, or font with a different catalog item.

## 11. Settings Expansion

### Editing

- Default text style.
- Default transition duration.
- Default animation easing.
- Snap strength.
- Timeline zoom default.
- Safe-area guides.
- Auto-select behavior.
- Gesture sensitivity.
- Haptic feedback toggle when supported.

### Performance

- Preview quality: Auto/Low/Medium/High.
- Preview FPS target.
- Render scale.
- Heavy-effect preview mode.
- Hardware acceleration preference where applicable.
- Worker/concurrency limits where useful.

### Export

- Default resolution.
- Frame rate.
- Quality/bitrate presets.
- Audio quality.
- Export background behavior where supported.

### Project and storage

- Autosave interval.
- Undo history depth.
- Cache size display.
- Clear catalog preview cache.
- Clear unused downloaded assets.
- Offline asset/storage management.

### Accessibility

- Reduced motion.
- Larger mobile controls.
- High-contrast selection outlines.
- Disable flashing preview effects.

## 12. State and Architecture Boundaries

The implementation should separate the following responsibilities:

### Preview interaction layer

Owns hit testing, selection gestures, transform gestures, inline editing, and synchronization to editor state.

### Animation/effects runtime

Owns effect and animation definitions, parameter evaluation, interpolation, and renderer-facing values. It does not own UI panels.

### Transition runtime

Owns transition timing and compositing semantics independently from ordinary layer animations.

### Asset registry

Provides one uniform API for built-in and installed assets. Callers resolve assets by stable ID/type/version, not by file path.

### Catalog service

Loads manifests, validates catalog responses, searches/filters entries, checks updates, downloads packages, verifies hashes, and hands validated assets to local storage.

### Asset storage

Persists downloaded packages/metadata in browser-supported storage and exposes cache/storage usage.

### Project dependency resolver

Compares project requirements with the asset registry and produces missing/update/incompatible dependency state.

### Responsive workspace

Determines the appropriate UI layout mode and hosts mobile bottom sheets without duplicating the underlying editing logic.

These components should communicate through typed interfaces so catalog/network concerns do not leak into rendering or project serialization.

## 13. Offline and Failure Behavior

- Built-in assets always remain usable.
- Installed online assets remain usable without a network connection.
- A failed catalog refresh leaves the last valid cached catalog available.
- A failed asset download does not alter the installed version.
- Hash mismatch rejects the new package.
- Unsupported app version displays an incompatibility message before installation.
- Missing project assets produce visible dependency warnings and recovery actions.
- Preview failures for one catalog item must not crash the catalog screen.
- Export should block only when a missing dependency is required to reproduce the intended output; the user may explicitly choose a fallback where supported.

## 14. Security and Trust Boundaries

Initial downloadable effects/transitions/animations should use a constrained declarative format or a fixed set of trusted runtime implementations with parameterized definitions. Arbitrary downloaded JavaScript must not execute merely because an asset was installed.

Install-from-URL follows the same validation and package rules as catalog downloads.

Catalog manifests and packages require HTTPS in normal online use. Package hashes are verified before activation.

## 15. Migration and Backward Compatibility

Existing projects without dependency metadata should load unchanged.

Existing text animations/effects should be mapped into the new definition structure where possible. If older project data uses legacy fields, a project-load migration converts them in memory and saves the updated format on the next project save.

No existing project should require online access simply because this catalog feature exists.

## 16. Testing Strategy

### Unit tests

- Hit-test ordering and transform calculations.
- Animation interpolation and parameter defaults.
- Transition duration/boundary calculations.
- Manifest schema validation.
- Package hash verification.
- Asset/version resolution.
- Project dependency resolution.
- Legacy project migration.

### Component/integration tests

- Tap preview text -> correct layer selection.
- Double tap -> inline text edit -> project state update.
- Mobile bottom sheet reflects selected layer and edits state.
- Timeline transition handle modifies correct transition.
- Catalog browse/search/filter/install/update/remove.
- Missing asset recovery flow.
- Offline installed asset usage.

### Browser/mobile QA

At minimum verify common Chrome/Android viewport sizes in portrait and landscape, plus desktop Chrome.

Critical mobile flows:

1. Import audio.
2. Add/edit lyrics.
3. Tap preview text and edit it.
4. Move/scale/rotate text.
5. Add intro/loop/outro animation.
6. Add effect.
7. Add transition.
8. Browse online catalog and preview/install an item.
9. Reload offline and confirm installed asset still works.
10. Save/reopen project.
11. Export a short test video.

Performance QA should include projects with many lyric layers and multiple effects so the application can reduce preview quality rather than becoming unusable.

## 17. Implementation Sequencing

The implementation plan should preserve usable checkpoints in this order:

1. Stabilize shared typed asset/animation/transition models and project migration.
2. Preview text hit testing and direct editing.
3. Portrait responsive workspace and mobile timeline controls.
4. Intro/loop/outro text animation runtime and expanded built-ins.
5. Effect stack expansion and quality-tier behavior.
6. First-class transitions and timeline UI.
7. Asset registry/storage and project dependency resolver.
8. Built-in catalog UI.
9. Online manifest catalog, previews, downloads, validation, updates, favorites, and offline cache.
10. Font catalog integration.
11. Install-from-URL/file flows.
12. Expanded settings.
13. Cross-browser/mobile QA, export regression testing, and performance pass.

## 18. Acceptance Criteria

The feature set is complete when:

- A user can tap visible preview text and immediately select/edit the corresponding layer.
- LyricForge is comfortably usable in phone portrait orientation without relying on desktop sidebars.
- Text layers support configurable intro, loop, and outro animations.
- Effects are stackable and preview/export consistently.
- Transitions are visible/editable as first-class timeline objects.
- Fonts, effects, transitions, and text animations each have Built-in and Online catalog views with previews.
- Online catalog items can be installed, updated, removed, favorited, and used offline after installation.
- Assets can also be installed from compatible URLs/files.
- Projects track external asset dependencies and recover cleanly from missing/incompatible assets.
- New settings cover mobile gestures, editing defaults, preview/render quality, storage/cache, and accessibility.
- Existing projects continue to open without requiring the online catalog.
- Core workflows pass desktop and Android portrait QA.
