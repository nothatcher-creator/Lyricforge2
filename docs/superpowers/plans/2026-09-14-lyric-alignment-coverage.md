# Lyric Alignment Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved lyric-alignment design by covering completely unmatched lines and adding persistent post-alignment review indicators for Check/Uncertain lyric clips.

**Architecture:** Keep the existing alignment result metadata as the single source of truth. The pure aligner must place completely unmatched lines from surrounding timing anchors while marking them low confidence; Timeline and Inspector then read `alignmentQuality` directly so uncertain lines stay discoverable after the alignment dialog closes. This plan is a required supplement to `2026-09-14-lyric-alignment.md` and should execute after its Task 4 and before final verification.

**Tech Stack:** TypeScript 5.9, React 19, existing Timeline/Inspector components, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-14-lyric-alignment-pro-effects-design.md`

## Global Constraints

- Lyric text must remain byte-for-byte unchanged.
- Review indicators are informational only; they must not change timing or text.
- `good` lines do not need a warning badge; `check` and `uncertain` do.
- Indicators must remain visible after the alignment dialog closes and after project save/reload because they come from persisted clip metadata.
- Mobile portrait must not hide the warning state.

---

### Task 1: Completely Unmatched Line Placement

**Files:**
- Modify: `lib/lyricforge/lyric-alignment.ts`
- Modify: `lib/lyricforge/__tests__/lyric-alignment.test.ts`

**Interfaces:**
- Uses existing `AlignedLyricLine` and `AlignmentQuality`.
- No new public interface.

- [ ] **Step 1: Write a failing unmatched-line test**

Create three lyric lines where the first and third have strong transcript matches but the middle line has no matching recognized words. Assert the middle line keeps its exact text, receives timing strictly between surrounding anchors, gets word timings spanning that line, and is `quality:'uncertain'`.

```ts
expect(result.lines[1].clipId).toBe('middle');
expect(result.lines[1].start).toBeGreaterThan(result.lines[0].end);
expect(result.lines[1].end).toBeLessThan(result.lines[2].start);
expect(result.lines[1].quality).toBe('uncertain');
```

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/lyric-alignment.test.ts
```

Expected: FAIL until unmatched-line interpolation is explicit.

- [ ] **Step 3: Implement line-level anchor interpolation**

After token matching, detect lines with zero matched token anchors. Place each unmatched run between the previous matched/protected line end and next matched/protected line start. Divide the available interval evenly across unmatched lines, then use `evenlyTimeWords`-equivalent interpolation within each line. If only one side exists, use the alignment selection bound on the missing side. Mark these lines `confidence:0` and `quality:'uncertain'`.

- [ ] **Step 4: Run and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/lyric-alignment.ts lib/lyricforge/__tests__/lyric-alignment.test.ts
git commit -m "fix: place unmatched lyric lines between alignment anchors"
```

---

### Task 2: Persistent Timeline Review Indicators

**Files:**
- Modify: `components/editor/Timeline.tsx:1`
- Modify: `lib/lyricforge/__tests__/timeline-mobile.test.ts`
- Modify: `lib/lyricforge/__tests__/alignment-ui.test.ts`

**Interfaces:**
- Reads `Clip.alignmentQuality` only.
- `check` renders a compact warning marker; `uncertain` renders a stronger warning marker.

- [ ] **Step 1: Write failing timeline source/regression tests**

Assert Timeline reads `alignmentQuality`, renders separate accessible labels for Check and Uncertain, and does not add a warning for Good lines. Include mobile-source coverage that the marker remains inside the lyric clip rather than requiring hover.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/timeline-mobile.test.ts lib/lyricforge/__tests__/alignment-ui.test.ts
```

Expected: FAIL because persistent markers do not exist.

- [ ] **Step 3: Render markers in lyric clips**

For lyric clips only, render a small icon/badge when `alignmentQuality==='check'` or `'uncertain'`. Give it an accessible label such as `Alignment needs review` or `Alignment uncertain`. Keep the marker pointer-transparent so drag/trim behavior is unchanged.

- [ ] **Step 4: Run and verify GREEN**

Run the focused tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/editor/Timeline.tsx lib/lyricforge/__tests__/timeline-mobile.test.ts lib/lyricforge/__tests__/alignment-ui.test.ts
git commit -m "feat: mark low confidence lyric timing on timeline"
```

---

### Task 3: Inspector Review and Jump Action

**Files:**
- Modify: `components/editor/Inspector.tsx:1`
- Modify: `lib/lyricforge/__tests__/alignment-ui.test.ts`

**Interfaces:**
- Reads selected lyric clip `alignmentQuality` and `alignmentConfidence`.
- Jump action selects/seeks the next editable lyric clip whose quality is `check` or `uncertain`.

- [ ] **Step 1: Write failing inspector tests**

Assert Inspector exposes the selected line's alignment quality/confidence and contains a `Next timing issue` action whenever reviewable lyric clips exist.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/alignment-ui.test.ts
```

Expected: FAIL because Inspector has no alignment review controls.

- [ ] **Step 3: Implement review summary and jump**

For a selected aligned lyric clip, show `Alignment: Good`, `Alignment: Check`, or `Alignment: Uncertain`, plus rounded confidence percentage when available. `Next timing issue` finds reviewable lyric clips sorted by start time, advances after the current clip with wraparound, calls `store.select([next.id])`, and seeks `audioEngine` to `next.start`.

- [ ] **Step 4: Run and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/editor/Inspector.tsx lib/lyricforge/__tests__/alignment-ui.test.ts
git commit -m "feat: add lyric alignment review controls"
```

---

### Task 4: Coverage Gate

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run alignment review coverage**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/lyric-alignment.test.ts lib/lyricforge/__tests__/alignment-ui.test.ts lib/lyricforge/__tests__/timeline-mobile.test.ts
```

Expected: PASS.

- [ ] **Step 2: Verify persistence compatibility**

```bash
pnpm exec vitest run lib/lyricforge/__tests__/project-migration.test.ts
```

Expected: PASS with old projects lacking alignment metadata and new projects preserving optional metadata.

- [ ] **Step 3: Commit only if a regression is found**

If verification exposes a defect, fix the smallest responsible code path, add a regression assertion, and commit with a descriptive `fix:` message. Otherwise do not create an empty commit.
