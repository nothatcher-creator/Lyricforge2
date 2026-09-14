# Lyric Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate Align Existing Lyrics workflow that keeps user-authored lyric text byte-for-byte unchanged while automatically producing line and word timing from the existing transcription system.

**Architecture:** Keep recognition and alignment separate. Existing `TranscriptionProvider` implementations produce timestamped recognized words; a new pure `lyric-alignment.ts` module performs deterministic monotonic sequence alignment against immutable user text, while `AlignmentDialog.tsx` orchestrates recognition, preview, confidence review, and one-shot application through the editor store. Protected manually timed lines divide the target into bounded alignment segments so they remain fixed and also disambiguate repeated song sections.

**Tech Stack:** TypeScript 5.9, React 19, Next 16/Vinext, Vitest 5, existing Web Audio + Transformers.js transcription pipeline, existing `EditorStore` history.

**Spec:** `docs/superpowers/specs/2026-09-14-lyric-alignment-pro-effects-design.md`

## Global Constraints

- User-authored lyric text is immutable input to alignment; only timing metadata may change.
- Existing **Auto Detect Lyrics** stays available and keeps its current purpose.
- Alignment must support whole-track, selected-clips, and just-pasted scopes.
- **Protect manually timed lyrics** defaults to enabled.
- Alignment must produce word timing where possible and surface Good / Check / Uncertain confidence states.
- Alignment must apply as one undoable editor operation.
- Recognition/alignment failure or cancellation must leave project text and timing unchanged.
- Local alignment must reuse the existing Whisper model choices; no new account, API key, or cloud dependency is required.
- Existing projects must remain loadable; new model fields are optional with safe defaults.
- Node remains `>=22.13.0`; package manager remains `pnpm@11.25.0`.

---

## File Structure

- Create `lib/lyricforge/lyric-alignment.ts`: pure token normalization, monotonic matching, interpolation, protected-line segmentation, confidence classification, and project-independent alignment result types.
- Create `components/editor/AlignmentDialog.tsx`: alignment workflow UI, provider/model selection, progress, confidence summary, Apply/Cancel.
- Modify `lib/lyricforge/model.ts`: add alignment timing source and optional alignment confidence metadata to lyric clips.
- Modify `lib/lyricforge/store.ts`: add a single-transaction `applyLyricAlignment()` mutation.
- Modify `components/editor/Dialogs.tsx`: register the new modal, preserve Auto Detect, and add Add & Auto Align after paste.
- Modify `components/editor/Editor.tsx`: expose Align Existing Lyrics for existing lyric tracks/selections.
- Modify `app/mobile-portrait.css`: keep alignment controls usable in portrait.
- Create `lib/lyricforge/__tests__/lyric-alignment.test.ts`: pure matcher tests.
- Create `lib/lyricforge/__tests__/alignment-store.test.ts`: one-shot apply, protection, text preservation, undo.
- Create `lib/lyricforge/__tests__/alignment-ui.test.ts`: source-level workflow regression coverage matching existing UI tests.
- Modify `lib/lyricforge/__tests__/project-migration.test.ts`: backward compatibility for projects without alignment metadata.

---

### Task 1: Alignment Data Contract

**Files:**
- Modify: `lib/lyricforge/model.ts:1`
- Test: `lib/lyricforge/__tests__/project-migration.test.ts`
- Create: `lib/lyricforge/__tests__/lyric-alignment.test.ts`

**Interfaces:**
- Produces: `AlignmentQuality = 'good'|'check'|'uncertain'`.
- Produces: optional `Clip.alignmentConfidence?: number` and `Clip.alignmentQuality?: AlignmentQuality`.
- Extends: `Clip.timingSource` with `'aligned'` while preserving `'manual'|'estimated'|'detected'`.

- [ ] **Step 1: Write failing model compatibility tests**

Add tests that construct/load lyric clips with no alignment fields and assert existing behavior is unchanged, plus a compile/runtime assertion that aligned clips can carry the new metadata:

```ts
const clip={...makeClip('lyrics','lyrics',0,1000,'Hello world'),timingSource:'aligned' as const,alignmentConfidence:.91,alignmentQuality:'good' as const};
expect(clip.text).toBe('Hello world');
expect(clip.timingSource).toBe('aligned');
expect(clip.alignmentQuality).toBe('good');
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/lyric-alignment.test.ts
```

Expected: TypeScript/Vitest fails because `AlignmentQuality`, `'aligned'`, and alignment metadata are not defined yet.

- [ ] **Step 3: Add the minimal model fields**

In `model.ts`, define:

```ts
export type AlignmentQuality='good'|'check'|'uncertain';
```

and extend `Clip`:

```ts
timingSource?:'manual'|'estimated'|'detected'|'aligned';
alignmentConfidence?:number;
alignmentQuality?:AlignmentQuality;
```

Do not make these fields required and do not change existing clip factories beyond continuing to default lyric clips to `estimated`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same Vitest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/model.ts lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/lyric-alignment.test.ts
git commit -m "feat: add lyric alignment metadata"
```

---

### Task 2: Pure Token Normalization and Similarity

**Files:**
- Create: `lib/lyricforge/lyric-alignment.ts`
- Modify: `lib/lyricforge/__tests__/lyric-alignment.test.ts`

**Interfaces:**
- Produces: `LyricToken { lineId:string; wordIndex:number; raw:string; normalized:string; variants:string[] }`.
- Produces: `tokenizeLyricLines(lines:readonly AlignmentInputLine[]): LyricToken[]`.
- Produces: `normalizedTokenSimilarity(a:LyricToken,b:string): number` returning `0..1`.

- [ ] **Step 1: Add failing normalization tests**

Cover case/punctuation and contraction compatibility without modifying raw text:

```ts
expect(tokenizeLyricLines([{id:'a',text:"I'm here",start:0,end:1000,protected:false}]).map(t=>t.raw)).toEqual(["I'm",'here']);
expect(normalizedTokenSimilarity(tokens[0],'im')).toBeGreaterThan(.9);
expect(normalizedTokenSimilarity(tokenizeLyricLines([{id:'b',text:"don't",start:0,end:1,protected:false}])[0],'dont')).toBeGreaterThan(.9);
```

Also test `I'm` against recognized `i` / `am` variants through variant expansion.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/lyric-alignment.test.ts
```

Expected: FAIL because alignment helpers do not exist.

- [ ] **Step 3: Implement deterministic normalization**

Implement Unicode normalization, lowercase, punctuation removal, apostrophe folding, and a small explicit contraction variant table. Keep original `raw` text untouched. Use a bounded normalized Levenshtein similarity for non-exact substitutions:

```ts
score = 1 - editDistance(a,b) / Math.max(a.length,b.length,1)
```

Return exact/variant matches as `1`, and return `0` for empty normalized forms.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same test file. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/lyric-alignment.ts lib/lyricforge/__tests__/lyric-alignment.test.ts
git commit -m "feat: normalize lyrics for forced alignment"
```

---

### Task 3: Monotonic Forced Alignment Engine

**Files:**
- Modify: `lib/lyricforge/lyric-alignment.ts`
- Modify: `lib/lyricforge/__tests__/lyric-alignment.test.ts`

**Interfaces:**
- Consumes: `Word[]` recognized by existing transcription providers.
- Produces:

```ts
export interface AlignmentInputLine {id:string;text:string;start:number;end:number;protected:boolean}
export interface AlignedLyricLine {clipId:string;start:number;end:number;words:Word[];confidence:number;quality:AlignmentQuality;protected:boolean}
export interface LyricAlignmentResult {lines:AlignedLyricLine[];good:number;check:number;uncertain:number}
export function alignLyricsToTranscript(lines:readonly AlignmentInputLine[], recognized:readonly Word[], bounds:{start:number;end:number}):LyricAlignmentResult
```

- [ ] **Step 1: Write failing sequence-alignment tests**

Add cases for exact match, extra recognized words, missing recognized words, repeated user words, and a repeated chorus. Example:

```ts
const result=alignLyricsToTranscript(
 [{id:'l1',text:'we go we go',start:0,end:4000,protected:false}],
 [
  {text:'we',start:100,end:250},{text:'go',start:300,end:450},
  {text:'we',start:800,end:950},{text:'go',start:1000,end:1150},
 ],
 {start:0,end:2000},
);
expect(result.lines[0].words.map(w=>w.text)).toEqual(['we','go','we','go']);
expect(result.lines[0].words.map(w=>w.start)).toEqual([100,300,800,1000]);
```

Assert the stored word text comes from the user lyric tokens, not recognition tokens.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/lyric-alignment.test.ts
```

Expected: FAIL because `alignLyricsToTranscript` is missing.

- [ ] **Step 3: Implement weighted monotonic dynamic programming**

Flatten user tokens in original line order and recognized tokens in timestamp order. Use a DP matrix with these deterministic scores:

```ts
matchScore = similarity >= .98 ? 6 : similarity >= .82 ? 4 : similarity >= .68 ? 2 : -4;
skipUser = -3;
skipRecognized = -2;
```

Tie-break in this order: higher score, more exact matches, smaller timestamp span, earlier recognized index. Backtrack to produce at most one recognized timestamp anchor per user token and never reorder either sequence.

- [ ] **Step 4: Add interpolation and confidence classification**

For unmatched user words between anchors, distribute times evenly between the previous matched word end and next matched word start. For leading/trailing unmatched words, interpolate inside the resolved line bounds. Ensure every output word has `end > start` and line start/end wrap its word timing.

Compute line confidence as:

```ts
confidence = clamp01((exactMatches + .7*closeMatches + .35*interpolatedMatches) / Math.max(1,userWordCount));
quality = confidence >= .78 ? 'good' : confidence >= .48 ? 'check' : 'uncertain';
```

- [ ] **Step 5: Run and verify GREEN**

Run the focused test. Expected: all sequence, interpolation, and repeated-word cases PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/lyric-alignment.ts lib/lyricforge/__tests__/lyric-alignment.test.ts
git commit -m "feat: align lyric text to recognized word timing"
```

---

### Task 4: Protected Manual Lines and Selection Bounds

**Files:**
- Modify: `lib/lyricforge/lyric-alignment.ts`
- Modify: `lib/lyricforge/__tests__/lyric-alignment.test.ts`

**Interfaces:**
- Produces: `alignmentBoundsForSelection(project:Project, clipIds:readonly string[]): {start:number;end:number}`.
- Protected input lines must be returned with their original line/word timing unchanged.

- [ ] **Step 1: Add failing tests for protected anchors and selected scopes**

Test a three-line sequence where the middle line is `protected:true`; assert the middle line stays byte-for-byte timing-identical and the preceding/following segments only consume recognized words on their own side of that anchor. Also test a selected chorus bounded by nearest unselected lyric clips.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/lyric-alignment.test.ts
```

Expected: FAIL because protected segmentation/bounds are absent.

- [ ] **Step 3: Implement protected segmentation**

Split target lines at protected lines. Align each unprotected segment only against recognition words inside:

```ts
segmentStart = previousProtected?.end ?? selectionBounds.start;
segmentEnd = nextProtected?.start ?? selectionBounds.end;
```

Return protected lines unchanged with `protected:true`, `confidence:1`, and `quality:'good'`.

- [ ] **Step 4: Implement selected alignment bounds**

For selected lyric clips, use the previous unselected lyric clip's `end` and next unselected lyric clip's `start` as bounds when present; otherwise use `0` and `project.duration`.

- [ ] **Step 5: Run and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/lyricforge/lyric-alignment.ts lib/lyricforge/__tests__/lyric-alignment.test.ts
git commit -m "feat: protect manual lyric timing during alignment"
```

---

### Task 5: One-Shot Store Application and Undo

**Files:**
- Modify: `lib/lyricforge/store.ts:1`
- Create: `lib/lyricforge/__tests__/alignment-store.test.ts`

**Interfaces:**
- Consumes: `LyricAlignmentResult`.
- Produces:

```ts
applyLyricAlignment(result:LyricAlignmentResult): void
```

The method must update all affected clips in one `store.update(...)` call.

- [ ] **Step 1: Write failing store tests**

Construct a store project with two lyric clips, snapshot both `text` strings and timings, call `applyLyricAlignment`, then assert:

```ts
expect(after.clips.map(c=>c.text)).toEqual(before.clips.map(c=>c.text));
expect(after.clips[0].timingSource).toBe('aligned');
expect(after.clips[0].alignmentQuality).toBe('good');
```

Call `undo()` once and assert every original timing is restored. Add a test that protected results do not overwrite the clip.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/alignment-store.test.ts
```

Expected: FAIL because `applyLyricAlignment` does not exist.

- [ ] **Step 3: Implement the store mutation**

Map by `clipId`, skip `line.protected`, and update only `start`, `end`, `words`, `timingSource:'aligned'`, `alignmentConfidence`, and `alignmentQuality`. Never set `text`, `name`, `section`, or style fields.

- [ ] **Step 4: Run and verify GREEN**

Run the focused store test. Expected: PASS, including single-step undo.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/store.ts lib/lyricforge/__tests__/alignment-store.test.ts
git commit -m "feat: apply lyric alignment as one undoable edit"
```

---

### Task 6: Alignment Dialog Using Existing Recognition Providers

**Files:**
- Create: `components/editor/AlignmentDialog.tsx`
- Modify: `components/editor/Dialogs.tsx:1`
- Create: `lib/lyricforge/__tests__/alignment-ui.test.ts`

**Interfaces:**
- `AlignmentDialog` props:

```ts
interface AlignmentDialogProps {
  clipIds:string[];
  close:()=>void;
  onImport:()=>void;
}
```

- Reuse `DEFAULT_LOCAL_TRANSCRIPTION_MODEL`, `LocalWhisper`, `HttpTranscription`, `audioEngine.mono16k`, and `TranscriptionUpdate`.

- [ ] **Step 1: Write failing source-level UI tests**

Assert source contains both independent workflows and the new controls:

```ts
expect(dialogSource).toContain('Align Existing Lyrics');
expect(dialogSource).toContain('Protect manually timed lyrics');
expect(dialogSource).toContain('Auto Detect Lyrics');
expect(dialogSource).toContain('alignmentQuality');
```

Also assert AlignmentDialog imports and calls `alignLyricsToTranscript` but does not call `setText` or replace lyric strings.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/alignment-ui.test.ts
```

Expected: FAIL because the dialog does not exist.

- [ ] **Step 3: Implement recognition and preview state**

The dialog selects an audio asset, provider, local model, and manual-protection toggle. On Run:

1. Pause playback.
2. Resolve the selected audio buffer.
3. Generate mono 16 kHz samples.
4. Run the existing transcription provider.
5. Build `AlignmentInputLine[]` from target clips, setting `protected` when the toggle is on and `timingSource==='manual'`.
6. Call `alignmentBoundsForSelection()` then `alignLyricsToTranscript()`.
7. Keep the result in component state only.

Do not mutate the project before Apply.

- [ ] **Step 4: Implement confidence review and Apply/Cancel**

Show `good/check/uncertain` counts, and a compact list of Check/Uncertain lyric lines. Apply calls `store.applyLyricAlignment(result)` once, selects the first uncertain/check clip if one exists, then closes. Cancel or Abort discards temporary recognition/result state.

- [ ] **Step 5: Run and verify GREEN**

Run alignment UI tests plus transcription quality tests:

```bash
pnpm exec vitest run lib/lyricforge/__tests__/alignment-ui.test.ts lib/lyricforge/__tests__/transcription-quality.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/editor/AlignmentDialog.tsx components/editor/Dialogs.tsx lib/lyricforge/__tests__/alignment-ui.test.ts
git commit -m "feat: add existing lyric alignment dialog"
```

---

### Task 7: Paste & Auto Align and Existing-Lyrics Entry Points

**Files:**
- Modify: `components/editor/Dialogs.tsx:1`
- Modify: `components/editor/Editor.tsx:1`
- Modify: `app/mobile-portrait.css`
- Modify: `lib/lyricforge/__tests__/alignment-ui.test.ts`
- Modify: `lib/lyricforge/__tests__/timeline-mobile.test.ts`

**Interfaces:**
- Dialog modal union adds `'align'`.
- `StudioDialogs` keeps a local `pendingAlignmentIds:string[]` payload for the alignment modal.

- [ ] **Step 1: Add failing workflow tests**

Assert Paste Lyrics includes separate `Add Lyrics` and `Add & Auto Align` actions, Auto Detect remains present, existing lyric selections can launch alignment, and portrait CSS includes alignment dialog scrolling/touch targets.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/alignment-ui.test.ts lib/lyricforge/__tests__/timeline-mobile.test.ts
```

Expected: FAIL on missing entry points.

- [ ] **Step 3: Add Paste Lyrics integration**

Refactor the existing paste handler into a small local function returning the inserted clip IDs. `Add Lyrics` uses the current behavior. `Add & Auto Align` inserts the exact same clips, saves their IDs into `pendingAlignmentIds`, then switches the modal to `'align'`.

- [ ] **Step 4: Add existing lyric alignment action**

Add **Align Existing Lyrics** beside the existing lyric/transcription controls. If selected editable lyric clips exist, align those; otherwise align the editable lyric track. Never include text clips or locked lyric tracks.

- [ ] **Step 5: Add portrait styling**

Ensure the dialog content scrolls within `100dvh`, action buttons remain at least 44 px high, and confidence chips wrap instead of forcing horizontal overflow.

- [ ] **Step 6: Run and verify GREEN**

Run the focused UI/mobile tests. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/editor/Dialogs.tsx components/editor/Editor.tsx app/mobile-portrait.css lib/lyricforge/__tests__/alignment-ui.test.ts lib/lyricforge/__tests__/timeline-mobile.test.ts
git commit -m "feat: align pasted and existing lyrics"
```

---

### Task 8: Alignment Regression and Production Verification

**Files:**
- Modify only if failures expose a defect in the files above.

**Interfaces:**
- No new interfaces; this is the integration gate.

- [ ] **Step 1: Run alignment-focused tests**

```bash
pnpm exec vitest run \
  lib/lyricforge/__tests__/lyric-alignment.test.ts \
  lib/lyricforge/__tests__/alignment-store.test.ts \
  lib/lyricforge/__tests__/alignment-ui.test.ts \
  lib/lyricforge/__tests__/transcription-quality.test.ts \
  lib/lyricforge/__tests__/project-migration.test.ts \
  lib/lyricforge/__tests__/timeline-mobile.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full automated suite**

```bash
pnpm test:run
pnpm test:legacy
pnpm catalog:build
pnpm catalog:validate
pnpm typecheck
pnpm build
```

Expected: every command exits 0.

- [ ] **Step 3: Verify the invariant explicitly**

Add or retain a regression test that serializes all lyric `text` values before alignment and compares them byte-for-byte after alignment. This test must cover punctuation and contractions.

- [ ] **Step 4: Commit any verification fixes**

If a defect was found, commit only the minimal fix and its regression test with a descriptive `fix:` message. If no defect was found, do not create an empty commit.

- [ ] **Step 5: Hand off for code review**

Use the `requesting-code-review` skill against the completed alignment diff before merging or starting the effects implementation on top of it.
