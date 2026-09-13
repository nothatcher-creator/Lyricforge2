# LyricForge Creative Runtime Design

Date: 2026-09-13
Status: Written design for user review
Branch: `feat/source-foundation`

## 1. Purpose

Build a trusted, deterministic creative runtime for LyricForge that powers text animations, ordered clip effects, adjacent-clip transitions, and master/global effects using the same evaluation rules in preview and export.

This phase turns the existing creative-asset reference foundation into an executable editing/rendering system. It deliberately does not build the online catalog or arbitrary third-party code execution. The catalog phase will consume the runtime contracts defined here.

The runtime must remain practical on Android/mobile browsers, preserve existing projects, fail gracefully when creative assets are unavailable, and keep project data declarative rather than embedding executable code.

## 2. Goals

This phase must provide:

- Trusted built-in text animations with separate Intro, Loop, and Outro slots.
- Ordered non-destructive effect stacks on individual visual clips.
- An ordered project-level master/global effect stack.
- First-class transition objects between adjacent compatible clips on the same track.
- Centered virtual-overlap transition timing without requiring manual clip overlap.
- Per-effect parameters, enable/disable state, duplication, reordering, and keyframing.
- Stable creative asset IDs and versions in saved project data.
- One shared runtime contract used by interactive preview and export.
- Low/high preview quality modes plus full export quality.
- Backward compatibility for current LyricForge animation/style fields.
- Clear recovery when a referenced creative asset is missing or incompatible.
- Safe failure behavior when a single effect or transition cannot render.

## 3. Non-goals

This phase does not include:

- Online catalog browsing.
- Remote manifest fetching.
- Asset package downloading, updating, favorites, or removal.
- Install-from-URL or install-from-file flows.
- Arbitrary JavaScript, WebAssembly, shader source, or executable plugin code downloaded from the network.
- User accounts or cloud asset sync.
- Cross-track transitions.
- Node-based compositing.
- Track-level effect stacks.

Track-level effects and cross-track transitions may be added later, but this phase must not require them to complete the runtime architecture.

## 4. Design Principles

1. Preview and export must resolve creative state through the same runtime definitions.
2. Projects store references and parameters, never executable implementation code.
3. Creative assets have stable IDs and versions independent of display names.
4. Runtime evaluation should be as pure and deterministic as practical.
5. Effects are non-destructive and ordered.
6. Expensive effects may reduce preview quality before editing responsiveness is sacrificed.
7. A missing or failed creative asset should degrade one feature, not crash the entire project.
8. Existing projects should continue to look the same before users explicitly adopt new creative features.
9. Mobile editing behavior and runtime quality must be considered first-class requirements.

## 5. High-level Architecture

The recommended architecture is a trusted registry plus a unified render pipeline.

The project file stores creative asset references, versions, user parameters, enabled state, ordering, and keyframes. A built-in registry maps those references to trusted runtime implementations. The renderer asks a pure evaluation layer to resolve the creative state for the current project time. The same renderer is used by preview and export, preserving visual parity.

The canonical processing order is:

`Clip source -> text animation/transform -> ordered clip effects -> transition/compositing -> complete scene -> ordered master effects -> output`

The runtime is divided into focused units:

- **Creative registry**: resolves built-in animation/effect/transition definitions by stable ID and version.
- **Creative preset registry**: contains trusted declarative metadata and parameter schemas for built-in presets.
- **Animation runtime**: evaluates Intro/Loop/Outro instances and legacy text animation compatibility.
- **Effect runtime**: evaluates ordered clip/master effect instances, parameters, keyframes, and quality-tier behavior.
- **Transition runtime**: validates adjacent-clip transitions, computes centered virtual overlap, and evaluates transition progress.
- **Creative runtime facade**: produces renderer-facing resolved state for a project at a specific time.
- **Renderer adapters**: apply resolved text transforms, clip effects, transitions, and master effects to canvas rendering.
- **Migration/compatibility adapter**: converts or interprets legacy animation fields without breaking older saves.

Suggested implementation files are:

- `lib/lyricforge/creative-runtime.ts`
- `lib/lyricforge/creative-registry.ts`
- `lib/lyricforge/creative-presets.ts`
- `lib/lyricforge/animation-runtime.ts`
- `lib/lyricforge/effect-runtime.ts`
- `lib/lyricforge/transition-runtime.ts`
- `lib/lyricforge/creative-migration.ts`

Exact file splitting may change during implementation if existing project conventions make a smaller arrangement clearer, but the responsibility boundaries above must remain intact.

## 6. Creative Asset Registry

The registry is the source of truth for executable built-in creative behavior.

Each registered definition must expose:

- Stable `id`.
- Asset `type`: `text-animation`, `effect`, or `transition`.
- Semantic `version` string.
- Human-readable name.
- Optional category/tags.
- Supported target kinds.
- Parameter schema.
- Default parameter values.
- Quality capabilities or degradation rules.
- Trusted runtime implementation identifier or function binding.

The registry API should support:

- Exact lookup by asset type, ID, and version.
- Compatibility lookup when a project requests a supported older version.
- Parameter normalization against defaults/ranges.
- Target compatibility checks.
- Capability checks for preview/export quality tiers.

The runtime must never execute code supplied by project JSON or future catalog manifests. Future downloaded catalog entries may reference trusted runtime IDs and supply declarative parameters/assets only.

## 7. Project Data Model

The existing creative asset reference types are the foundation and should be extended rather than replaced.

### 7.1 Parameter values

Basic parameter values remain serializable primitives. Keyframed parameters are represented separately so simple instances stay compact.

A keyframed parameter needs:

- Parameter key.
- Ordered keyframes.
- Each keyframe time or normalized position.
- Value.
- Easing/interpolation mode.

Times for clip-scoped effects and text animations are interpreted relative to the clip unless explicitly defined otherwise. Master-effect keyframes use project time.

### 7.2 Animation instances

Text layers may have at most one active instance for each role:

- `intro`
- `loop`
- `outro`

Each animation instance stores:

- `assetId`
- `version`
- `role`
- `enabled`
- `params`
- optional parameter keyframes

The UI may temporarily preview an animation before committing it, but project serialization contains only committed instances.

### 7.3 Effect instances

Each supported visual clip may hold an ordered list of effect instances. The project additionally owns an ordered master effect list.

Each effect instance stores:

- Stable instance ID so duplicate uses of the same effect remain independently editable.
- `assetId`
- `version`
- `enabled`
- `params`
- optional parameter keyframes

The array order is the render order. Reordering the UI list changes the array order and therefore output.

### 7.4 Transition instances

Transitions are first-class project objects rather than hidden clip properties.

Each transition stores:

- Stable transition instance ID.
- `assetId`
- `version`
- `outgoingItemId`
- `incomingItemId`
- `durationMs`
- `easing`
- `params`
- optional parameter keyframes where the preset supports them

A transition is valid in this phase only when both clips:

- Exist.
- Are visual/compatible clip kinds.
- Belong to the same track.
- Are adjacent in time/order for that track.
- Touch at a cut boundary or are within the project’s accepted cut tolerance.

Manual overlap is not required.

### 7.5 Project-level fields

The project model gains:

- Creative runtime schema/version metadata where needed.
- Master effect stack.
- Transition collection.
- Creative dependency references already supported by the migration foundation.

Clip data gains:

- Intro/Loop/Outro animation instances for text-capable clips.
- Ordered clip effect stack for supported visual clips.

## 8. Text Animation Runtime

Text animation uses the approved Intro / Loop / Outro model.

### 8.1 Timing

- **Intro** evaluates from clip entry over its configured duration and delay.
- **Loop** evaluates over the active interior of the clip. Loop behavior may be periodic, oscillating, beat-driven, or continuously time-based depending on the preset.
- **Outro** evaluates backward from clip end over its configured duration and delay/offset semantics.

When Intro and Outro windows overlap on a very short clip, both remain defined. Their transform contributions are combined using the preset composition rules rather than allowing one to erase the other.

### 8.2 Resolved animation output

The animation runtime should resolve into renderer-friendly values such as:

- opacity multiplier
- translation X/Y
- scale X/Y
- rotation
- blur
- reveal progress
- tracking/spacing modifiers
- per-word/per-character stagger metadata when required
- optional color/glow modifiers

The renderer should consume resolved values rather than branching on dozens of preset display names.

### 8.3 Initial trusted animation set

Intro/Outro presets:

- Fade
- Slide
- Blur
- Scale Punch
- Tracking Expand/Contract
- Word Pop
- Character Cascade
- Spin
- 3D Tilt approximation
- Wipe Reveal
- Pixel Dissolve
- Glitch Reveal

Loop presets:

- Pulse
- Float
- Bounce
- Shake
- Wave
- Neon Flicker
- Breathing Glow
- RGB Drift
- 3D Sway approximation
- Beat Pulse when audio analysis data is available

Presets that cannot achieve acceptable preview/export parity in the existing canvas pipeline should be deferred rather than implemented as preview-only tricks.

## 9. Legacy Animation Compatibility

Current LyricForge projects contain animation-related style fields such as entrance, idle, exit, emphasis, duration, intensity, delay, direction, and easing.

This phase must preserve them.

Compatibility strategy:

1. Existing projects load through the current project migration path.
2. Legacy entrance/idle/exit behavior is interpreted through a compatibility adapter.
3. Where there is a direct equivalent, the adapter maps legacy values to trusted runtime animation IDs and parameters in memory.
4. Existing saved files do not need to be destructively rewritten merely to open.
5. When the user edits/re-saves creative animation settings, the canonical new representation may be written while preserving unrelated project fields.
6. Legacy emphasis behavior may remain a renderer/style compatibility path until an equivalent dedicated role is required; it is not promoted to a fourth new animation slot in this phase.

The visual baseline requirement is that a previously working project should render the same, within normal canvas/font tolerance, before the user changes its creative settings.

## 10. Effect Runtime

Effects are ordered, non-destructive operations.

### 10.1 Scope

This phase supports two scopes:

- **Clip effects**: affect one selected visual/text/visualizer clip.
- **Master effects**: affect the fully composited scene.

Track-level effects are intentionally deferred.

### 10.2 Stack behavior

Users can:

- Add multiple instances.
- Reorder instances.
- Enable/disable instances.
- Duplicate instances.
- Remove instances.
- Edit parameters.
- Keyframe supported parameters independently.

Disabled effects remain serialized so toggling them back on restores prior settings.

### 10.3 Effect execution contract

Each effect implementation declares:

- Supported target scopes/kinds.
- Parameter schema and ranges.
- Whether it is single-pass or requires an intermediate surface.
- Preview quality behavior.
- Whether it is safe/available in export.

The effect runtime resolves normalized parameters at time `t`, then produces an ordered execution plan. The renderer applies that plan.

Effects should use canvas-native operations where practical. Effects requiring offscreen processing may render to temporary canvases/surfaces managed by the renderer rather than allocating new surfaces every frame.

### 10.4 Initial built-in effect set

The initial trusted set should prioritize useful effects that can maintain deterministic export parity:

- Glow
- Bloom approximation
- Drop Shadow
- Enhanced Stroke/Outline
- Blur
- Sharpen approximation
- Grain
- Vignette
- Brightness
- Contrast
- Saturation
- Hue Shift
- Duotone
- Posterize
- Pixelation
- RGB Split / Chromatic Aberration
- VHS / Scanlines
- Noise Displacement approximation
- Shake / Jitter
- Zoom Pulse
- Light Streak / Lens approximation
- Glitch
- Beat-reactive intensity where project audio analysis is available

The exact implementation method may differ by effect, but unsupported preview-only effects must not be shipped as if export parity exists.

## 11. Master Effects

Master effects run after visual tracks, clip effects, and transitions have been composited into the scene.

Typical use cases include:

- Global grain.
- Vignette.
- Global bloom.
- VHS treatment.
- Color grading.
- Global RGB split/glitch.
- Beat-reactive flash or intensity treatment.

Master effects use the same `EffectInstance` contract and registry as clip effects. The distinction is scope and evaluation time, not a separate plugin architecture.

The master stack must not mutate underlying clip style/effect settings.

## 12. Transition Runtime

Transitions are explicit objects between adjacent compatible clips on the same track.

### 12.1 Centered virtual overlap

If outgoing clip A ends at cut time `C` and incoming clip B starts at `C`, a transition with duration `D` evaluates over:

`[C - D/2, C + D/2]`

This is a virtual overlap. The timeline clips do not need to be physically overlapped.

At the beginning of the transition window, A dominates. At the midpoint/cut, the transition is halfway. At the end, B dominates.

### 12.2 Duration clamping

The effective duration is clamped so it cannot require media outside the playable/available portions of either side.

At minimum, clamping considers:

- Available outgoing clip duration before the cut.
- Available incoming clip duration after the cut.
- Media offset/source limits for non-looping video where applicable.
- Project boundaries.

The project may preserve the user-requested duration separately if useful for UI restoration, but rendering must use a valid effective duration.

### 12.3 Adjacency rules

The runtime resolves adjacency from the canonical same-track clip order, not from stale UI assumptions.

If a user moves/deletes a clip so a transition no longer connects adjacent compatible clips, the transition becomes invalid and should be surfaced to the editor for cleanup/relinking rather than silently attaching itself to a different cut.

### 12.4 Initial built-in transitions

- Crossfade
- Dip to Black
- Dip to White
- Blur Dissolve
- Push
- Slide
- Directional Wipe
- Zoom
- Spin
- Flash
- Glitch
- RGB Split
- Pixel Dissolve
- Film Burn-style overlay approximation
- Light Leak-style overlay approximation
- Mask Reveal

Transition implementations that require additional generated masks or procedural overlays must remain deterministic and available to export.

## 13. Render Pipeline Integration

The existing renderer remains the frame producer. The new runtime should remove creative branching from the renderer where practical, but it should not replace the entire rendering system.

For each frame:

1. Resolve project time and quality tier.
2. Draw background/base scene preparation.
3. Resolve active clips by track.
4. For each clip, resolve style/keyframes and text animation state.
5. Render clip source into the appropriate working surface.
6. Apply ordered clip effect plan.
7. At valid transition windows, render both sides of the cut and composite with the transition evaluator.
8. Composite tracks into the complete scene respecting current track visibility/opacity/blend semantics.
9. Apply ordered master effects.
10. Draw editor-only guides/selection overlays after creative output when appropriate so guides are not baked into effects.
11. Return bounds/interactions required by the preview editor.

Export calls the same frame renderer with export quality and editor-only overlays disabled.

## 14. Intermediate Surface Strategy

Some effects and transitions require reading or transforming already-rendered pixels. The runtime therefore needs a small reusable surface pool.

Requirements:

- Reuse canvases/offscreen canvases instead of allocating per frame where possible.
- Size surfaces according to current render dimensions and quality tier.
- Release/recycle resources when project dimensions change or renderer is disposed.
- Avoid retaining large surfaces that are no longer needed.
- Allow single-pass effects to bypass intermediate surfaces.

This is an implementation detail of the renderer/effect pipeline, not part of project serialization.

## 15. Quality Tiers

The runtime exposes three effective quality modes:

### Preview Low

Optimized for responsive editing on weaker phones.

Allowed degradations include:

- Reduced offscreen render scale for expensive effects.
- Reduced blur/bloom sample count.
- Lower noise/displacement resolution.
- Simplified light/glitch passes.
- Lower effect update frequency only where the result remains temporally stable enough for editing.

### Preview High

Closer to export appearance while remaining interactive.

Uses full preview canvas resolution where feasible and higher-quality intermediate passes.

### Export

Full configured output resolution and deterministic effect quality. No preview-only shortcuts that visibly change the intended preset semantics.

A preset definition must describe how it behaves in each supported quality tier. If an effect cannot provide a safe Low implementation, the runtime may bypass or simplify it with a visible editor warning rather than freezing the UI.

## 16. Keyframing

Effect and supported animation parameters can be keyframed.

The runtime reuses existing easing/interpolation concepts where possible instead of introducing a separate timeline math system.

Rules:

- Numeric parameters interpolate according to easing.
- Boolean/enumerated/string parameters use stepped changes unless the preset declares a safe custom interpolation.
- Values are normalized/clamped after interpolation.
- Duplicate keyframe times resolve deterministically, using the last canonical entry after normalization.
- Clip-scoped keyframes are evaluated relative to clip time.
- Master-effect keyframes are evaluated in project time.

The first implementation should expose keyframing only for parameters whose runtime behavior is tested and deterministic.

## 17. Beat-reactive Behavior

Beat/audio-reactive effects and animations must consume LyricForge’s existing analyzed energy/spectrum data where available.

They must not perform expensive audio analysis independently inside every effect.

The runtime receives a normalized audio-reactive input for time `t` and passes it to presets that declare a need for it.

If analysis data is unavailable, the preset falls back to a neutral value rather than throwing.

## 18. Error Handling and Degradation

Creative runtime failures are isolated.

### Missing implementation

If a project references an unknown asset/version:

- Preserve the reference in project data.
- Mark the instance unresolved.
- Bypass it for rendering.
- Surface a clear missing/incompatible asset warning to the editor.
- Do not silently replace it with another preset.

### Invalid parameters

- Apply schema defaults where values are absent.
- Clamp numeric values to valid ranges.
- Ignore unknown parameter keys for execution while preserving them when safe for forward compatibility.
- Report invalid values through development diagnostics/editor warnings where useful.

### Runtime effect failure

If one effect throws during frame execution:

- Catch the failure at the effect boundary.
- Record the asset/instance ID.
- Bypass that effect for the current frame/session as appropriate.
- Continue rendering the rest of the composition.
- Avoid spamming repeated identical errors every frame.

### Transition failure

A failed transition should fall back to a hard cut for that frame/session and surface the transition instance ID.

### Export behavior

Export should not silently produce materially wrong output for unresolved required assets. Before export, the dependency/runtime validator reports unresolved instances. The UI may let the user explicitly continue with bypass/fallback behavior, but the default path should warn clearly.

## 19. Compatibility and Migration

The existing project migration system remains the only project-load migration boundary.

The creative runtime migration step must:

- Accept projects without any new creative runtime fields.
- Initialize missing stacks/transition collections safely.
- Normalize creative asset references.
- Preserve unknown unrelated fields.
- Avoid changing project duration/timing/style data.
- Keep legacy animation behavior usable through the compatibility adapter.

Migration should be idempotent: loading an already-migrated project should not keep rewriting its creative data.

## 20. UI Integration Boundaries

This spec defines runtime behavior, but only enough UI changes are included to make the runtime editable.

### Inspector

The inspector/mobile sheet will need controls for:

- Intro / Loop / Outro animation slots.
- Animation preset selection and parameters.
- Clip effect stack.
- Add/remove/duplicate/reorder/toggle effect actions.
- Effect parameter controls.
- Keyframe controls for supported parameters.
- Master effects when project/global context is selected.

### Timeline

The timeline will need:

- A visible transition object/handle centered at a valid cut.
- Selection of a transition object.
- Duration adjustment.
- Preset/easing access through the inspector/mobile sheet.

The timeline must not require users to physically overlap clips to create the transition.

### Mobile

Controls must preserve the existing portrait bottom-sheet model and touch target improvements. No new creative feature may require a desktop-only sidebar interaction.

## 21. Performance Constraints

The implementation should prefer responsiveness over maximum preview fidelity.

Important constraints:

- Do not allocate large canvas surfaces inside tight per-frame loops when reusable surfaces suffice.
- Skip disabled effects before parameter work.
- Skip effects whose evaluated intensity is effectively zero when semantically safe.
- Cache normalized preset metadata and resolved registry definitions.
- Avoid rescanning the entire project repeatedly for every effect when active-clip/transition indexing can be computed once per frame.
- Preserve the existing video-pool/media preparation behavior.
- Keep heavy master effects to one final scene pass where possible.

Performance regressions should be measured with representative lyric-heavy projects, not only empty demo scenes.

## 22. Testing Strategy

### Unit tests

Test pure runtime logic for:

- Registry lookup and version resolution.
- Parameter normalization/defaults/range clamping.
- Numeric and stepped keyframe interpolation.
- Intro timing.
- Loop timing.
- Outro timing.
- Legacy animation compatibility mappings.
- Effect stack ordering.
- Disabled effect bypass.
- Duplicate effect independence.
- Clip-vs-master ordering.
- Transition adjacency validation.
- Centered virtual-overlap progress.
- Transition duration clamping.
- Invalid transition detection after clip movement/deletion.
- Missing asset behavior.
- Quality-tier selection/degradation rules.
- Migration idempotence.

### Renderer/integration tests

Test that:

- The same creative runtime state is consumed for preview and export mode.
- Clip effects execute before master effects.
- Transitions execute at the correct cut window.
- Guides/selection overlays are not affected by or baked into export/master effects.
- Failed effects are isolated.
- Missing creative assets do not crash a project.
- Existing projects without creative stacks still render.

Where pixel-perfect canvas tests are brittle, use deterministic execution-plan/state assertions plus a small number of visual/pixel smoke tests.

### Regression tests

All existing Vitest and legacy regression suites must continue passing.

### Mobile QA

At minimum verify on Android Chrome-sized portrait and landscape viewports:

- Add/edit Intro, Loop, and Outro animation.
- Add multiple clip effects.
- Reorder/toggle/duplicate effects.
- Add and edit a transition at an adjacent cut.
- Adjust transition duration without manually overlapping clips.
- Edit master effects.
- Scrub while effects are active.
- Switch preview quality.
- Save/reopen project.
- Export a short project and compare key frames with preview.

## 23. Built-in Preset Acceptance Rule

A built-in preset is considered shippable only when:

- It has a stable registry ID/version.
- Its parameter schema and defaults are defined.
- It behaves safely with malformed parameters.
- It has deterministic preview/export semantics.
- It defines supported targets/scopes.
- It defines quality-tier behavior if expensive.
- It has unit or integration coverage for its core timing/evaluation behavior.

This rule prevents the editor from accumulating decorative presets that only work in one path.

## 24. Acceptance Criteria

The creative runtime phase is complete when all of the following are true:

1. Text clips support independent Intro, Loop, and Outro animation instances through stable registry IDs.
2. Existing legacy animation projects still load and retain their previous behavior within normal rendering tolerance.
3. Visual clips support ordered effect stacks that can be toggled, reordered, duplicated, removed, parameterized, and keyframed where supported.
4. Projects support an ordered master/global effects stack executed after scene composition.
5. Adjacent compatible same-track clips can be joined by explicit transition objects.
6. Transitions use centered virtual overlap and do not require manually overlapping timeline clips.
7. Transition duration is safely clamped to available clip/media time.
8. Moving or deleting clips cannot silently retarget an existing transition to a different cut.
9. Preview and export use the same creative runtime and renderer-facing evaluation rules.
10. Missing or incompatible creative assets are bypassed with explicit warnings while references remain intact.
11. A single failing effect or transition cannot crash the full render loop.
12. Preview Low, Preview High, and Export quality paths exist with deterministic preset rules.
13. All new runtime behavior is covered by focused tests and all existing regression suites remain green.
14. GitHub Pages static build verification continues to pass on the feature branch.
15. The implementation does not execute arbitrary downloaded JavaScript or other untrusted runtime code.

## 25. Implementation Boundary for the Following Phase

After this creative runtime is complete, the asset catalog/settings phase may add:

- Built-in and online catalog browsing.
- Remote static JSON manifests.
- Download/install/update/remove/favorite flows.
- Hash validation and browser storage.
- Font asset installation.
- Install from URL/file.
- Dependency recovery UI.
- Expanded performance/storage/editor settings.

That later phase must consume the stable registry/project contracts in this spec rather than adding a second creative execution system.

## 26. Approved Design Decisions

The following decisions were explicitly approved before this spec was written:

- Transitions are explicit first-class objects.
- Initial transition scope is adjacent clips on the same track.
- Transition timing uses a centered virtual overlap around the cut.
- Effects support both clip-level and master/global stacks.
- Effect stacks support multiple instances, reorder, enable/disable, duplicate, and per-parameter keyframing where supported.
- The architecture is registry-based rather than hard-coded renderer branching or downloadable executable plugins.
- The canonical pipeline is clip source -> text animation/transform -> clip effects -> transition/compositing -> scene -> master effects -> output.
- Text animations use Intro / Loop / Outro slots.
- Projects store stable IDs, versions, parameters, and keyframes rather than implementation code.
- Missing/incompatible creative assets are preserved and bypassed with visible recovery state.
- The runtime has Preview Low, Preview High, and Export quality modes.
- This phase builds the trusted creative runtime and built-ins; the downloadable online catalog is a later phase.
