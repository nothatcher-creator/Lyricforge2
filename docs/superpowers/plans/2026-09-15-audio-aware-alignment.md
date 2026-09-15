# Audio-Aware Lyric Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Align Existing Lyrics use deterministic song-waveform evidence in addition to transcript word timestamps, while preserving exact lyric wording and existing manual anchors.

**Architecture:** Add a pure `audio-alignment.ts` feature extractor and refinement layer. Keep `lyric-alignment.ts` responsible for monotonic text alignment, then optionally refine unmatched/weak timing using audio features. `AlignmentDialog.tsx` orchestrates analysis, local-only focused re-listening, fallback, progress, and Apply.

**Tech Stack:** TypeScript, React, Web Audio API, Vitest, existing LocalWhisper/HTTP transcription providers.

**Spec:** `docs/superpowers/specs/2026-09-15-audio-aware-alignment-catalog-elements-design.md`

## Global Constraints

- User lyric text must never be rewritten by alignment.
- Existing Auto Detect Lyrics remains separate and unchanged.
- Existing LocalWhisper and HTTP providers remain supported.
- Focused re-listen is local-provider-only; HTTP alignment still receives waveform refinement.
- Protected/manual lines remain fixed.
- Apply remains a single undoable store transaction.
- Failure in waveform analysis falls back to transcript-only alignment.
- Initial deterministic tuning constants live in one exported config object and are regression-tested: 20 ms frames, 3-frame RMS smoothing, 20th-percentile noise floor, 60 ms minimum boundary spacing, 180 ms weak-edge snap radius.
- Focused local re-listen merges overlapping windows, pads each side by 1500 ms, runs at most 8 windows, and analyzes at most 45 seconds total per alignment action.

---

### Task 1: Deterministic audio feature extraction

**Files:**
- Create: `lib/lyricforge/audio-alignment.ts`
- Test: `lib/lyricforge/__tests__/audio-alignment.test.ts`

**Interfaces:**
- Produces: `ALIGNMENT_AUDIO_CONFIG` containing the constants above.
- Produces: `analyzeAlignmentAudio(samples: Float32Array, sampleRate?: number): AudioAlignmentFeatures`
- Produces: `findSupportedBoundary(features: AudioAlignmentFeatures, targetMs:number, radiusMs:number): {time:number;strength:number}|null`
- Produces: `AudioAlignmentFeatures { frameMs:number; rms:Float32Array; activity:Float32Array; onset:Float32Array; boundaries:number[] }`

- [ ] **Step 1: Write failing synthetic-waveform tests**

Create pulses and quiet gaps without external audio files. Assert that strong pulses produce nearby boundaries, silence does not, results are deterministic, and boundary spacing is at least 60 ms.

```ts
it('finds audible boundaries but ignores quiet gaps',()=>{
 const sr=16000;
 const samples=new Float32Array(sr*2);
 for(let i=.45*sr;i<.55*sr;i++)samples[i]=Math.sin(i*.18)*.8;
 for(let i=1.2*sr;i<1.3*sr;i++)samples[i]=Math.sin(i*.25)*.65;
 const features=analyzeAlignmentAudio(samples,sr);
 expect(features.frameMs).toBe(20);
 expect(features.boundaries.some(ms=>Math.abs(ms-450)<120)).toBe(true);
 expect(features.boundaries.some(ms=>ms>700&&ms<1050)).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm vitest run lib/lyricforge/__tests__/audio-alignment.test.ts`
Expected: FAIL because `audio-alignment.ts` does not exist.

- [ ] **Step 3: Implement feature extraction**

Use 20 ms RMS frames, a 3-frame centered smoothing window, the 20th percentile of smoothed RMS as adaptive floor, normalized activity above that floor, an onset score combining positive smoothed-energy delta with a short first-difference/high-frequency emphasis term, and non-maximum suppression with 60 ms minimum spacing. Clamp all returned times to sample duration.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `pnpm vitest run lib/lyricforge/__tests__/audio-alignment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -am "feat: add audio alignment feature extraction"`

---

### Task 2: Audio-constrained lyric refinement

**Files:**
- Modify: `lib/lyricforge/lyric-alignment.ts`
- Test: `lib/lyricforge/__tests__/lyric-alignment.test.ts`

**Interfaces:**
- Consumes: `AudioAlignmentFeatures` from Task 1.
- Extends: `alignLyricsToTranscript(lines, recognized, bounds, options?)`
- Adds options:

```ts
interface LyricAlignmentOptions {
  audioFeatures?: AudioAlignmentFeatures;
  audioAware?: boolean;
}
```

- Adds result metadata per line:

```ts
reason?: 'text-anchored'|'audio-assisted'|'weak-recognition'|'protected-anchor';
```

- [ ] **Step 1: Add RED tests for audio-assisted unmatched words**

Create a transcript with first/last anchors and synthetic audio boundaries between them. Assert missing words are placed near the boundary evidence and not uniformly spaced.

- [ ] **Step 2: Add RED tests for invariants**

Assert strong text anchors do not move, protected lines do not move, timings remain monotonic, selection/protected bounds cannot be crossed, and a weak line edge can move no more than `ALIGNMENT_AUDIO_CONFIG.edgeSnapRadiusMs` (180 ms).

- [ ] **Step 3: Run alignment tests and confirm RED**

Run: `pnpm vitest run lib/lyricforge/__tests__/lyric-alignment.test.ts lib/lyricforge/__tests__/audio-alignment.test.ts`
Expected: new refinement assertions FAIL.

- [ ] **Step 4: Implement audio refinement**

Expose enough anchor evidence from the existing dynamic-programming match to distinguish anchored vs interpolated tokens. For unmatched regions, rank candidate audio boundaries by combined onset/activity strength, allocate them monotonically between neighboring text anchors, and use proportional interpolation only when evidence is insufficient. Snap only weak/interpolated line edges, never recognized anchors, and cap edge movement at 180 ms.

- [ ] **Step 5: Blend confidence**

Put the weights in named constants: text `0.65`, audio `0.25`, continuity/bounds `0.10`. Preserve the existing `good`/`check`/`uncertain` thresholds unless a compatibility regression demonstrates an existing threshold cannot be retained.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `pnpm vitest run lib/lyricforge/__tests__/lyric-alignment.test.ts lib/lyricforge/__tests__/audio-alignment.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

`git commit -am "feat: refine lyric timing with waveform evidence"`

---

### Task 3: Alignment dialog orchestration and fallback

**Files:**
- Modify: `components/editor/AlignmentDialog.tsx`
- Modify: `lib/lyricforge/transcription.ts` only if a bounded local-window helper is required
- Test: `lib/lyricforge/__tests__/alignment-ui.test.ts`
- Test: `lib/lyricforge/__tests__/transcription-quality.test.ts`

**Interfaces:**
- Consumes `analyzeAlignmentAudio()` and updated `alignLyricsToTranscript()`.
- UI adds `Audio-aware refinement` toggle defaulting to `true`.
- Progress states include `Listening for vocal timing…` and local-only `Re-listening to uncertain sections…`.

- [ ] **Step 1: Write RED UI-contract tests**

Assert the toggle exists/defaults on, progress copy exists, result reasons render, and HTTP mode does not advertise/use focused re-listen.

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `pnpm vitest run lib/lyricforge/__tests__/alignment-ui.test.ts`

- [ ] **Step 3: Wire first-pass audio analysis**

After `mono16k()`, call `analyzeAlignmentAudio(samples,16000)` inside a try/catch. On failure, retain transcription and show a non-blocking warning. Pass features into the aligner only when the toggle is on.

- [ ] **Step 4: Add local focused re-listen for uncertain windows**

For LocalWhisper only, derive windows around `check`/`uncertain` line spans, pad each side by 1500 ms, merge overlapping/touching windows, keep the first 8 in timeline order, and trim/skip later windows once cumulative analyzed duration would exceed 45,000 ms. Transcribe those sample slices, offset returned word timestamps back to song time, merge/dedupe them with first-pass words, and rerun alignment once.

- [ ] **Step 5: Preserve HTTP behavior**

HTTP provider performs one full transcription plus waveform refinement only. No sliced HTTP uploads are attempted.

- [ ] **Step 6: Run UI/transcription/alignment tests**

Run: `pnpm vitest run lib/lyricforge/__tests__/alignment-ui.test.ts lib/lyricforge/__tests__/transcription-quality.test.ts lib/lyricforge/__tests__/lyric-alignment.test.ts lib/lyricforge/__tests__/audio-alignment.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

`git commit -am "feat: add audio-aware alignment workflow"`

---

### Task 4: Alignment regression and production gate

**Files:**
- Modify tests only if coverage gaps are discovered; do not weaken assertions.

- [ ] **Step 1: Run all unit tests**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 2: Run legacy regressions**

Run the repository legacy/core test command from `package.json`/CI.
Expected: all legacy tests pass.

- [ ] **Step 3: Run TypeScript and production build**

Run the same typecheck/build sequence used by `.github/workflows/deploy-pages.yml`.
Expected: PASS.

- [ ] **Step 4: Verify Auto Detect regression coverage**

Confirm existing transcription workflow tests remain unchanged and green; no alignment code path may replace Auto Detect-generated lyric text.

- [ ] **Step 5: Commit any test-only fixes**

Use a narrow commit such as `test: cover audio-aware alignment regressions`.
