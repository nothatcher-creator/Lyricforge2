# Audio-Aware Lyric Alignment, Multi-Source Catalog, and Elements Design

Date: 2026-09-15
Branch: `feat/audio-aware-alignment-catalog-elements`

## Purpose

This update improves LyricForge in three connected areas:

1. Make **Align Existing Lyrics** listen to the actual song more deeply instead of falling back to mostly text matching plus even interpolation when recognition is weak.
2. Expand the official catalog with substantially more content and explicit source/provider metadata.
3. Add a new first-class **Elements** asset type for reusable visual overlays such as frames, gradients, light leaks, particles, textures, scribbles, stars, waveform decorations, and similar lyric-video building blocks.

The existing **Auto Detect Lyrics** workflow remains unchanged as a separate workflow. User-supplied lyric wording remains authoritative and must never be rewritten by alignment.

## Goals

### Audio-aware alignment

- Keep the user's exact pasted/edited lyric wording.
- Keep the current Whisper-based local and HTTP recognition providers.
- Add a second audio-analysis stage that uses the waveform itself to refine timing.
- Improve placement of lyrics when Whisper misses words, merges words, or produces weak timestamps on singing.
- Preserve manually timed/protected lines.
- Keep alignment as one undoable project operation.
- Surface confidence and review flags instead of silently pretending uncertain timing is exact.

### Catalog expansion

- Grow each existing catalog category well beyond the current six items.
- Show where an asset came from and what license applies.
- Keep packages pinned and reproducible.
- Avoid live arbitrary remote-code execution; effects/transitions/animations continue to map only to trusted LyricForge runtimes.
- Add build-time minimum-depth checks so the catalog cannot accidentally regress to a tiny set again.

### Elements

- Add `element` as a first-class creative asset type.
- Allow installing, previewing, favoriting, searching, and restoring Elements like other catalog assets.
- Let an installed Element be inserted directly into the project as an editable visual overlay.
- Make Elements participate in project dependency restore/bundling.

## Non-goals

- Do not replace Auto Detect Lyrics.
- Do not change user lyric text during alignment.
- Do not add arbitrary executable third-party JavaScript, shaders, or plugins from the catalog.
- Do not perform unrestricted live searches against Openverse/Wikimedia from the editor in this release.
- Do not add a large new vocal-isolation neural model in this release.
- Do not require a server account or API key for the default alignment path.

# 1. Audio-Aware Alignment

## Current limitation

The current aligner transcribes the song, performs monotonic text matching against recognized words, and interpolates unmatched user words between recognized anchors. This is deterministic and preserves wording, but when sung vocals are recognized poorly the interpolation is primarily time-based rather than evidence-based.

## Proposed pipeline

The new alignment pipeline remains local-first and has five stages.

### Stage A: Prepare audio

Reuse the selected song and the existing `audioEngine.mono16k()` path. Alignment works in the song's local audio time and converts results back into project timeline time using the audio clip start/offset mapping already used by `AlignmentDialog`.

### Stage B: Recognize words

Run the existing selected transcription provider exactly as today. Recognition output remains temporary timing evidence and never replaces the user's lyric text.

### Stage C: Listen to the waveform

Add a pure audio feature extractor, proposed module:

`lib/lyricforge/audio-alignment.ts`

Input:

- mono 16 kHz samples
- sample rate
- optional analysis window bounds

Output:

```ts
interface AudioAlignmentFeatures {
  frameMs: number;
  rms: Float32Array;
  activity: Float32Array;
  onset: Float32Array;
  boundaries: number[];
}
```

The first implementation stays deterministic and browser-friendly:

- 20 ms RMS frames with a short smoothing window.
- Adaptive noise-floor estimation from lower-percentile energy.
- Normalized activity score above the estimated floor.
- Onset/change score derived from positive changes in smoothed energy plus a short high-frequency emphasis signal.
- Candidate boundaries are local maxima separated by a minimum spacing to prevent dozens of tiny peaks.

This is not claimed to be isolated-vocal detection. It is song-audio evidence that helps locate audible syllable/phrase changes when text recognition is weak.

### Stage D: Monotonic text anchors

Keep the current contraction-aware, edit-distance-based monotonic matcher. Strong recognized words remain the highest-confidence timing anchors.

The matcher will expose anchor confidence rather than immediately converting every gap into evenly spaced words.

### Stage E: Audio-constrained refinement

For each unprotected lyric segment:

1. Strong text anchors keep their recognized word timestamps.
2. Line starts and ends are allowed to snap within a small bounded radius toward strong audio activity/onset boundaries.
3. Missing words between two text anchors are distributed across candidate audio boundaries/activity, not simply evenly across wall-clock time.
4. If there are fewer useful audio boundaries than missing words, remaining words use proportional interpolation inside the evidence-bounded interval.
5. If there are no useful text anchors in a line, the line uses nearby song activity plus neighboring aligned/protected lines as bounds.
6. Timing remains monotonic and cannot cross neighboring protected lines or selection bounds.

### Focused re-listen pass

For lines that remain `check` or `uncertain`, the aligner may run a focused second recognition pass over only the estimated local window using the same selected model/provider. This pass is used only to search for additional anchors around that line. It must not alter text.

The focused pass is capped to uncertain regions so it does not double the cost of every alignment.

## Confidence model

Line confidence becomes a blend of independent evidence:

- text-anchor coverage
- average text similarity of anchors
- audio-boundary support for unanchored words/line edges
- continuity with neighboring aligned/protected lines

Suggested weights for the initial implementation:

- text evidence: 65%
- audio evidence: 25%
- continuity/bounds: 10%

These are implementation defaults, not user-facing promises, and should be covered by deterministic tests.

Existing quality buckets remain:

- `good`
- `check`
- `uncertain`

## UI changes

`AlignmentDialog` keeps the current provider/model choices and gains visible analysis stages:

- Preparing audio
- Listening for vocal timing
- Recognizing words
- Matching exact lyrics
- Re-listening to uncertain sections (only when needed)
- Alignment ready to review

Add an **Audio-aware refinement** toggle, enabled by default. Turning it off reproduces the text/timestamp-only alignment behavior for debugging and fallback.

The result summary continues to show Good / Check / Uncertain counts. Review rows may additionally show a short reason such as `weak recognition`, `audio-assisted`, or `protected anchor`.

## Failure behavior

- If audio feature extraction fails, alignment falls back to the current transcript-only matcher and shows a non-blocking warning.
- If transcription fails, alignment does not silently invent a full-song timing result. The user receives the current error/manual-alignment guidance.
- If focused re-listen fails, the first-pass result remains available.
- No project data changes until **Apply alignment** is pressed.

# 2. Multi-Source Catalog Expansion

## Source model

The catalog currently has a source URL and license but does not model source/provider identity strongly enough for a larger library.

Generated catalog manifests will add optional source metadata while remaining able to read existing v1 manifests:

```ts
interface CatalogSourceDescriptor {
  provider: string;
  itemUrl: string;
  creator?: string;
  attribution?: string;
  discoveredVia?: string;
}
```

Examples of provider labels:

- LyricForge
- Google Fonts
- Wikimedia Commons
- Openverse-discovered

`sourceUrl` and `license` remain for compatibility. New source metadata is additive.

## Curation policy

The official catalog is curated and pinned, not a live unverified search proxy.

For every external catalog item:

- exact source/item page is recorded
- creator is recorded when required
- license identifier and license URL are recorded
- attribution text is recorded when required
- package bytes are pinned by SHA-256
- remote source revision/file is pinned whenever the upstream supports immutable revisions
- build validation rejects missing required attribution/license metadata

Openverse-discovered items must link back to the original work and have their individual license checked before inclusion. Wikimedia items likewise use the individual file's license metadata.

## Initial depth target

The first implementation should ship with at least:

- 12 Fonts
- 12 Effects
- 12 Transitions
- 12 Text Animations
- 24 Elements

Minimum first-release total: **72 catalog items**.

Build tests enforce the category minimums rather than only a global total.

## More useful content

Effects should expand into additional trusted-runtime presets such as:

- dreamy bloom
- cold cinematic
- warm film
- crushed monochrome
- RGB shake
- ghost trail
- high-energy strobe
- soft-focus glow
- posterized motion
- retro CRT
- bleach contrast
- hazy diffusion

Transitions should add variants built only on trusted transition runtimes, including directional wipes/pushes, zooms, flashes, glitch variants, film-burn variants, blur transitions, and impact cuts.

Text animations should add more intro/loop/outro treatments such as bounce-in, blur reveal, type-on, staggered word rise, tracking collapse, elastic pop, shake emphasis, karaoke sweep, fade-through, and scale punch.

Fonts should remain openly licensed and version-pinned, with display metadata and bundled license text.

## Catalog browsing UI

Add source/provider chips to cards/details and a provider filter when more than one provider is present for the selected type.

Search indexes:

- asset name
- author/creator
- tags
- provider
- description

The existing Built-in / Online / Installed / Favorites / Updates filters remain.

# 3. Elements Asset Type

## Type model

Extend:

```ts
CREATIVE_ASSET_TYPES
```

with:

```ts
'element'
```

Add an Elements tab to `CatalogPanel`.

## Element descriptor

Elements are non-executable visual media packages.

Initial release supports static SVG and PNG elements. Animated/video elements are intentionally deferred until the static pipeline is proven.

Catalog manifest extension:

```ts
interface CatalogElementDescriptor {
  file: string;
  mime: 'image/svg+xml' | 'image/png';
  width?: number;
  height?: number;
  defaultDurationMs?: number;
  defaultFit?: 'contain' | 'cover';
}
```

An element package contains:

- embedded manifest
- the SVG/PNG element file
- optional preview image if the element file itself is not used as preview
- license/attribution metadata when required

No scripts or executable code are allowed in element packages.

## Installing and inserting

Installing an Element makes it available offline through the existing catalog storage layer.

Installed Element cards gain **Add to project**.

Add-to-project behavior:

1. Load the installed element bytes from catalog storage.
2. Create/reuse a project image asset backed by those bytes.
3. Insert a visual/image clip at the current playhead.
4. Default duration: 5 seconds unless the element descriptor specifies another duration.
5. Place it on the highest suitable unlocked visual track or create a visual overlay track if required.
6. Select the new clip and open normal transform/opacity controls.

Elements therefore use the editor's existing image rendering path after insertion rather than requiring a second renderer.

## Dependency handling

When a catalog Element is inserted:

- the project records the `element` dependency and source catalog id
- project save/bundle records enough information to detect missing installed element packages
- Restore Dependencies can reinstall the exact version
- if package bytes are unavailable, the project reports the element as missing instead of silently replacing it

Existing v1 projects with no Elements continue to load unchanged.

## Initial Element content

The first 24+ Elements should intentionally cover different lyric-video use cases:

- gradient blobs
- vignette/film frames
- letterbox/cinematic frames
- light leaks
- halftone textures
- grunge textures
- paper/noise textures
- scribble circles/underlines/arrows
- stars/sparkles
- dust/particle overlays
- waveform/equalizer decorations
- geometric grids/lines
- glow rings
- smoke/fog-style static overlays
- torn-paper edges
- retro scanline overlays

A meaningful portion should be original LyricForge SVG assets so the catalog remains useful even if external providers change policies. External curated elements supplement, not replace, the original pack.

# 4. Compatibility and Schema Strategy

The app must continue reading currently installed catalog packages and existing project files.

- Existing catalog manifest schema v1 remains accepted.
- New optional source metadata does not invalidate v1 items.
- Generated official catalog may introduce a newer schema only if validation/normalization supports both old and new formats.
- Existing `font`, `effect`, `transition`, and `text-animation` dependency handling must remain unchanged.
- `element` is additive.
- Trusted runtime allowlists remain mandatory for executable-style asset types.
- Elements never receive a runtime id.

# 5. Testing Strategy

## Audio alignment tests

Add deterministic tests covering:

- exact lyric text remains unchanged
- strong transcript anchors remain stable with audio-aware refinement enabled
- unmatched words prefer nearby audio boundaries over uniform interpolation
- quiet gaps do not attract lyric boundaries
- manual/protected lines do not move
- selected-range bounds remain respected
- no-crossing monotonic timing
- transcript-only fallback when feature extraction is unavailable
- focused re-listen only runs for low-confidence regions
- one Undo restores the pre-alignment state

Synthetic waveform fixtures should be generated in tests so alignment tests do not depend on external audio files.

## Catalog tests

Add tests covering:

- at least 12 items in each legacy category
- at least 24 Elements
- every external item has provider/source/license metadata
- required-attribution licenses have attribution metadata
- duplicate ids/versions rejected
- unsupported executable runtime ids rejected
- Element packages reject scripts/executable files
- package hashes validated
- provider filtering/search

## Element tests

Add tests covering:

- install element
- preview element
- insert installed element into project
- inserted asset uses stored bytes
- correct playhead/default duration
- dependency recorded
- project reload preserves element dependency
- missing element is surfaced in Restore Dependencies
- PNG and SVG rendering work in preview/export paths through the existing image clip renderer

# 6. Acceptance Criteria

The feature is ready to merge when all of the following are true:

1. Align Existing Lyrics visibly analyzes the audio waveform in addition to transcription.
2. Pasted/edited lyric wording is byte-for-byte unchanged by alignment.
3. Weakly recognized passages use waveform evidence instead of only uniform interpolation.
4. Existing Auto Detect Lyrics still works as before.
5. Current manual/protected timing behavior remains intact.
6. Catalog shows at least 72 official items with the category minimums above.
7. Catalog exposes source/provider information and preserves license/attribution metadata.
8. Elements appears as a fifth catalog category with at least 24 usable items.
9. Installed Elements can be added directly to the project as normal editable visual clips.
10. Old projects and old installed catalog packages continue to load.
11. Unit, legacy, catalog validation, production build, and GitHub Pages artifact verification all pass before merge.

# 7. Rollout Order

Implementation order:

1. Audio feature extraction and audio-aware alignment core.
2. Alignment UI/progress/confidence integration.
3. Catalog source metadata and deeper existing categories.
4. `element` type, validation, storage, dependency handling.
5. Element insertion UI and renderer integration through existing image clips.
6. Seed 24+ Elements and reach 72+ total catalog items.
7. Compatibility review, mobile review, full regression/build verification.

This order keeps the alignment work independently testable and introduces the new catalog type only after the existing catalog metadata/depth changes are stable.
