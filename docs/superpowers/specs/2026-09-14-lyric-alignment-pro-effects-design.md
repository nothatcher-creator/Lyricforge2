# Lyric Alignment and Professional Effects Design

Date: 2026-09-14
Branch: `feat/lyric-alignment-pro-effects`
Repository: `nothatcher-creator/Lyricforge2`

## Summary

This update adds two major capabilities to LyricForge while preserving the current workflows:

1. A second lyric AI workflow, **Align Existing Lyrics**, that keeps the user's exact pasted or edited lyric text and retimes it against the song automatically.
2. A broader, more professional effect system organized like a non-linear video editor, with useful color, transform, blur, distortion, stylize, light, time, and audio-reactive effects that remain reorderable, keyframeable, and non-destructive.

The existing **Auto Detect Lyrics** workflow remains unchanged in purpose: it listens to the song, transcribes lyrics, and creates editable timed lyric clips. Alignment is a separate operation for text the user already has.

## Goals

- Preserve user-authored lyric wording exactly during alignment.
- Support pasted lyrics immediately after import and existing lyric tracks later in the project.
- Produce line timing and word timing suitable for karaoke highlighting and lyric animations.
- Keep Auto Detect Lyrics available as a separate AI workflow.
- Make low-confidence alignment visible instead of silently changing text.
- Preserve manual timing where the user explicitly chooses to protect it.
- Make alignment undoable as one editor operation.
- Expand effects into a professional, categorized stack rather than a flat preset list.
- Keep effects real: they must render through LyricForge's renderer and export path, not through editor-only CSS.
- Preserve effect order, enable/disable state, clip/master scope, and keyframes.
- Allow cheaper preview behavior for expensive effects while export uses full-quality rendering.
- Keep mobile portrait controls usable.

## Non-goals for this release

- Replacing the existing Whisper-based Auto Detect system.
- Cloud-only alignment or requiring an account/API key.
- Full Adobe Premiere Pro feature parity.
- Arbitrary third-party shader execution.
- Rewriting lyrics to match the transcription.
- Automatic correction of spelling, punctuation, capitalization, or line breaks.
- Full optical-flow effects or GPU compute effects that would require a new native rendering backend.

## Current foundation

LyricForge already has:

- Local and HTTP transcription providers with word timestamps.
- Manual tap synchronization through `TapSynchronizer`.
- Pasted lyric import with editable lyric clips.
- A real effect runtime and renderer used by both preview and export.
- Clip and master effect stacks.
- Keyframeable effect parameters.
- Preview quality modes and export-quality rendering.
- Existing effects including glow, bloom, blur, sharpen, grain, vignette, brightness, contrast, saturation, hue shift, duotone, posterize, pixelate, RGB split, VHS, displacement, shake, zoom pulse, light streak, glitch, and beat-reactive scaling.

The design extends these systems rather than replacing them.

## Lyric workflows

### Auto Detect Lyrics

The existing workflow remains available and continues to:

1. Select an audio asset.
2. Run the chosen local or HTTP transcription model.
3. Produce recognized text with word timestamps.
4. Group words into lyric clips.
5. Insert editable lyrics into the project.

This mode is appropriate when the user does not already have lyrics or wants AI to generate the lyric text.

### Align Existing Lyrics

A new workflow will be available from both:

- the Paste Lyrics flow, after lyrics are inserted; and
- the lyric track/editor controls for an existing lyric track.

The user chooses an audio asset and a lyric track or selected lyric range, then runs alignment.

The key contract is:

> User-authored lyric text is immutable input to the aligner. The aligner may change timing metadata only.

The aligner must not replace, delete, reorder, normalize, respell, repunctuate, or recase lyric text.

## Alignment architecture

Alignment uses a two-stage local-first pipeline.

### Stage 1: audio recognition

The existing audio preparation and Whisper path produces a sequence of recognized tokens with timestamps. This is evidence about where words occur in the song, not authoritative lyric text.

The user may choose the same model options already available to Auto Detect Lyrics. The default remains the recommended English Base model for English projects.

### Stage 2: forced text-to-time matching

A new alignment module matches normalized forms of the user lyric tokens against normalized recognized tokens while preserving the original user text separately.

The matcher should use dynamic programming / monotonic sequence alignment so that it can tolerate:

- missed words;
- repeated words;
- filler or backing-vocal words recognized by Whisper;
- small recognition substitutions;
- punctuation differences;
- contractions and common tokenization differences;
- repeated choruses.

Matching is monotonic in time: later lyric tokens cannot align to earlier recognized timestamps.

The aligner should use a weighted score based on:

- exact normalized token match;
- close token similarity;
- phonetic/contracted-form compatibility where practical;
- distance from neighboring matched tokens;
- repeated-token ambiguity;
- recognized timestamp continuity.

The first implementation should stay deterministic and testable rather than introduce an opaque generative rewrite step.

## Text preservation and normalization

The alignment engine may create temporary normalized tokens such as lowercase, punctuation-stripped forms for matching, but the output text always references the original lyric lines and words.

Examples:

- `I'm` may be compared with `im` or `i am` for matching.
- `don't` may be compared with `dont` or `do not`.
- punctuation can be ignored for similarity scoring.

None of those transformations alter the stored lyric string.

## Alignment output

Each aligned lyric line receives:

- new `start` and `end` times;
- word-level timing mapped back to the original words;
- an alignment confidence score or quality bucket;
- timing source metadata identifying automatic alignment.

Existing manual word/line timing may be replaced only when the user has not protected it.

Line boundaries remain the user's existing line boundaries. The algorithm does not regroup lines.

Unmatched words between matched anchors receive interpolated timing constrained by neighboring anchors and line boundaries. Completely unmatched lines are placed using surrounding matched lines and marked low confidence.

## Confidence and review

Alignment results should be categorized into three practical states:

- **Good**: strong token match and stable timing anchors.
- **Check**: partially matched or interpolated timing.
- **Uncertain**: weak evidence, large gap, or unresolved repeated-section ambiguity.

The UI should show a compact summary after alignment, such as:

- 42 lines aligned
- 35 good
- 5 check
- 2 uncertain

Low-confidence lines should receive a visible timeline/inspector indicator so the user can jump through them quickly.

The system must never silently rewrite uncertain lyric text.

## Manual timing protection

The alignment dialog includes a control:

- **Protect manually timed lyrics**: enabled by default.

When enabled, clips with explicit manual timing are not moved. Their timings become fixed anchors for neighboring automatic alignment.

The user may disable protection to realign the entire target range.

## Alignment scope

The user can align:

- the whole lyric track;
- selected lyric clips; or
- the lyrics created by the just-completed Paste Lyrics action.

Selection scope is useful for repairing one verse or chorus without disturbing the rest of the song.

## Paste Lyrics integration

After Paste Lyrics inserts text, the dialog/confirmation path exposes two clear outcomes:

- **Add Lyrics**: keep the current initial timing behavior.
- **Add & Auto Align**: insert the exact same text, then open/run alignment against the selected song.

The existing Even Spacing and Start at Playhead timing modes remain useful as initial placement and fallback behavior.

Alignment can also be run later, so declining it during paste is never destructive.

## Undo and failure behavior

Alignment is applied as one editor transaction so one Undo restores all prior lyric timings.

If recognition or alignment fails:

- lyric text remains untouched;
- existing timing remains untouched;
- the dialog reports the error;
- any partial recognition data stays temporary until the user explicitly applies alignment.

Cancellation behaves the same way.

## Effects system organization

The effect browser/inspector will move from a flat preset selector toward categorized professional groups:

### Adjust

- Exposure
- Brightness
- Contrast
- Saturation
- Temperature
- Tint
- Highlights
- Shadows
- Blacks
- Whites
- Gamma
- Fade / lifted blacks

### Transform & Crop

- Position
- Scale X/Y or uniform scale
- Rotation
- Anchor/pivot
- Crop left/right/top/bottom
- Edge fill/background handling where practical

### Blur & Sharpen

- Gaussian blur
- Directional blur
- Radial/zoom blur where performant
- Sharpen
- Unsharp-style sharpening control

### Distort

- Lens distortion
- Wave/displacement
- Turbulent/noise displacement
- Chromatic aberration / RGB split
- Shake

### Stylize

- Glow
- Bloom
- Posterize
- Pixelate
- Duotone
- Film grain
- VHS
- Glitch
- Strobe

### Light

- Light leak
- Film burn
- Light streak
- Vignette

### Time

- Posterize Time
- Echo / trails

### Audio-Reactive

- Existing beat-reactive scale
- Beat-reactive glow/intensity where compatible
- Audio-reactive shake or exposure modulation as later presets built from the same parameter system

## Professional effect behavior

Effects remain ordered instances. Order matters and the renderer applies each effect to the output of the prior effect.

Every effect supports the current essentials where meaningful:

- enable/disable;
- reorder;
- duplicate;
- remove;
- clip or master scope when supported;
- numeric/color keyframes where the parameter type supports them;
- preview/export quality behavior.

The UI should use human-friendly grouped names and descriptions rather than exposing runtime IDs.

## Color adjustment implementation

A new color-adjust runtime should combine commonly stacked tonal operations into one efficient pass where possible rather than repeatedly reading/writing the full canvas for every slider.

Initial controls:

- exposure;
- temperature;
- tint;
- highlights;
- shadows;
- whites;
- blacks;
- gamma;
- saturation;
- fade.

The implementation can use Canvas pixel manipulation or a trusted internal WebGL shader path if the existing build/runtime supports it cleanly. The first priority is deterministic preview/export parity, not GPU complexity.

Existing brightness/contrast/saturation effects remain valid for old projects. New projects may use the richer color-adjust effect.

## Transform and crop effect

Transform/crop must operate on rendered clip/master output rather than mutating the source media itself.

Parameters include:

- x/y translation;
- uniform scale;
- optional X/Y scale;
- rotation;
- crop edges;
- opacity where useful.

This is distinct from the text style transform system and therefore applies uniformly to text, image, video, visualizer, and master output where supported.

## Time effects

### Posterize Time

Posterize Time samples frames at a lower effective frame rate while the project continues at its normal frame rate.

The renderer must use a quantized sample time rather than merely dropping preview frames, so export reproduces the same effect.

### Echo / trails

Echo uses a bounded history of previous rendered frames and composites several prior samples with configurable:

- delay;
- trail count;
- decay/opacity;
- blend mode if supported.

Preview-low may reduce trail count and resolution. Export renders the configured full trail count within practical caps.

The history cache must be scoped so seeking backward or editing the stack invalidates stale history.

## Expensive effect quality rules

Effects declare one of the existing quality behaviors:

- full;
- simplified;
- bypass.

For preview-low, expensive effects may reduce sample count, blur radius precision, pixel-processing resolution, or trail length. Preview-high should stay visually representative. Export uses full behavior.

No effect may exist only in the UI; if it cannot render in export, it should not ship as a normal effect.

## Data model changes

Prefer extending existing effect and lyric metadata over introducing parallel editor-only models.

Likely additions include:

- lyric alignment source/quality metadata on lyric clips or timing metadata;
- optional manual-timing protection marker if current `timingSource` is insufficient;
- new built-in creative definitions for professional effects;
- optional runtime state/cache owned by the renderer for time-based effects.

Project loading must remain backward-compatible. Missing new fields use safe defaults.

## UI changes

### Lyrics

Add **Align Existing Lyrics** near Auto Detect/Paste controls and in lyric-track actions.

Alignment dialog contains:

- audio source;
- lyric scope;
- local/HTTP recognition provider if both are supported for alignment;
- model selector for local alignment;
- Protect manually timed lyrics toggle;
- progress state;
- result confidence summary;
- Apply / Cancel.

### Effects

Replace or augment the flat effect preset Choice with a categorized browser/list.

On mobile portrait:

- category chips or a compact category selector;
- searchable effect list;
- parameter editor remains vertically scrollable;
- reorder controls remain touch-friendly;
- keyframe button remains available without requiring hover.

## Testing strategy

### Alignment unit tests

Cover:

- exact transcript match;
- punctuation/case differences;
- missing recognized words;
- extra recognized words;
- repeated words;
- repeated chorus sections;
- contractions/tokenization differences;
- interpolation between matched anchors;
- unmatched low-confidence line;
- selection-only alignment;
- manual timing protection;
- original lyric text byte-for-byte preservation;
- cancellation/failure leaves project unchanged.

### Effects unit tests

Cover:

- registry definitions and categories;
- parameter normalization;
- keyframe evaluation;
- stack order;
- preview quality behavior;
- posterize-time sampling;
- echo history invalidation;
- backward project compatibility;
- trusted runtime restrictions.

### Renderer regression tests

Verify representative pixels or deterministic render operations for:

- color adjust;
- transform/crop;
- directional blur;
- chromatic aberration;
- lens distortion;
- strobe;
- posterize time;
- echo/trails;
- light leak.

### UI regression tests

Verify:

- pasted lyrics can be aligned immediately;
- existing lyrics can be aligned later;
- Auto Detect Lyrics still exists independently;
- the effect browser groups effects into professional categories;
- effects remain reorderable and keyframeable;
- mobile controls remain accessible.

## Rollout order

Implementation should proceed in dependency order:

1. Alignment data model and pure matcher tests.
2. Forced-alignment engine.
3. Alignment dialog and Paste Lyrics integration.
4. Confidence/review indicators.
5. Effect categorization and registry extensions.
6. Professional color/transform/blur/distort/light effects.
7. Time effects and render-history support.
8. Mobile polish.
9. Full regression/build/export verification.

This order keeps the two large feature areas independently testable and makes failures easier to isolate.

## Acceptance criteria

The feature is complete when:

- Auto Detect Lyrics still works as before.
- A user can paste lyrics and automatically align them afterward without any lyric text changing.
- A user can run alignment later on existing lyrics.
- Alignment can target a subset of lyric clips.
- Manual timing can be protected.
- Word timing is produced for aligned lyrics where possible.
- Low-confidence regions are surfaced for review.
- Alignment is one-step undoable.
- The Effects UI is categorized and includes both professional adjustment tools and creative music-video effects.
- Newly added effects render in both preview and export.
- Effects can be reordered, disabled, duplicated, removed, and keyframed where applicable.
- Expensive effects use explicit preview-quality behavior.
- Existing projects load without migration breakage.
- Mobile portrait remains usable.
- Unit, legacy, catalog, production build, and Pages artifact checks pass before merge.