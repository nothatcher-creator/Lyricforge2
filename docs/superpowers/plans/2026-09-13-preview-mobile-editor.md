# Preview + Mobile Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visible text directly editable from the preview and make LyricForge comfortable to use on a phone in portrait orientation without replacing its existing renderer, inspector, or timeline.

**Architecture:** Keep the existing `Renderer.bounds`, `EditorStore`, `Inspector`, and timeline mechanics as the source of truth. Add small pure interaction/layout helpers for testability, layer direct text editing onto `Preview`, and use responsive workspace classes/CSS so the existing inspector becomes a touch-friendly bottom sheet on phone portrait while desktop/tablet behavior remains intact.

**Tech Stack:** React 19, TypeScript, Vinext/Vite, Vitest + jsdom, existing LyricForge store/renderer/model, CSS media/container overrides.

**Spec:** `docs/superpowers/specs/2026-09-13-mobile-effects-catalog-design.md`

## Global Constraints

- Existing desktop behavior and existing project data must remain compatible.
- Preview interactions must remain undoable through `EditorStore.begin()/end()` or normal keyed patches.
- Do not introduce a second project/editor state store.
- Phone portrait layout is based on viewport dimensions and coarse-pointer capability, not user-agent strings.
- Single-tap preview selection must remain fast; double tap/second tap edits text.
- The existing timeline pinch zoom, clip drag, trim, snapping, and keyboard behavior must continue working.
- All tests, legacy regression tests, static build, and Pages verifier must pass before each checkpoint is considered complete.

---

### Task 1: Add deterministic workspace and preview interaction helpers

**Files:**
- Create: `lib/lyricforge/workspace-layout.ts`
- Create: `lib/lyricforge/preview-interaction.ts`
- Create: `lib/lyricforge/__tests__/workspace-layout.test.ts`
- Create: `lib/lyricforge/__tests__/preview-interaction.test.ts`

**Interfaces:**
- Produces: `WorkspaceMode`, `classifyWorkspace(width,height,coarsePointer)`.
- Produces: `PreviewBound`, `pickTextBound(bounds, clips, x, y, previousId?)`.

- [ ] **Step 1: Write failing tests**

```ts
import {describe,expect,it} from 'vitest';
import {classifyWorkspace} from '../workspace-layout';

describe('classifyWorkspace',()=>{
  it('uses phone portrait for a narrow portrait coarse viewport',()=>{
    expect(classifyWorkspace(390,844,true)).toBe('phone-portrait');
  });
  it('uses compact for a landscape phone',()=>{
    expect(classifyWorkspace(844,390,true)).toBe('compact');
  });
  it('keeps wide desktop as desktop',()=>{
    expect(classifyWorkspace(1440,900,false)).toBe('desktop');
  });
});
```

```ts
import {describe,expect,it} from 'vitest';
import {pickTextBound} from '../preview-interaction';

const clips=[
  {id:'back',kind:'text'},
  {id:'image',kind:'image'},
  {id:'front',kind:'lyrics'},
] as any[];
const bounds=[
  {id:'back',x:0,y:0,width:100,height:100},
  {id:'image',x:0,y:0,width:100,height:100},
  {id:'front',x:0,y:0,width:100,height:100},
];

describe('pickTextBound',()=>{
  it('picks the topmost text-capable bound',()=>expect(pickTextBound(bounds,clips,50,50)?.id).toBe('front'));
  it('cycles overlapping text bounds after the previous selection',()=>expect(pickTextBound(bounds,clips,50,50,'front')?.id).toBe('back'));
  it('ignores non-text bounds',()=>expect(pickTextBound([{id:'image',x:0,y:0,width:100,height:100}],clips,10,10)).toBeNull());
});
```

- [ ] **Step 2: Run the focused tests and confirm module-not-found failures**

```bash
pnpm test -- --run lib/lyricforge/__tests__/workspace-layout.test.ts lib/lyricforge/__tests__/preview-interaction.test.ts
```

- [ ] **Step 3: Implement helpers**

```ts
export type WorkspaceMode='phone-portrait'|'compact'|'desktop';
export function classifyWorkspace(width:number,height:number,coarsePointer:boolean):WorkspaceMode{
  if(width<=760&&height>width&&coarsePointer)return 'phone-portrait';
  if(width<1100||coarsePointer)return 'compact';
  return 'desktop';
}
```

```ts
import type {Clip} from './model';
export interface PreviewBound{id:string;x:number;y:number;width:number;height:number}
export function pickTextBound(bounds:PreviewBound[],clips:Pick<Clip,'id'|'kind'>[],x:number,y:number,previousId?:string):PreviewBound|null{
  const textIds=new Set(clips.filter(c=>c.kind==='lyrics'||c.kind==='text').map(c=>c.id));
  const hits=[...bounds].reverse().filter(b=>textIds.has(b.id)&&x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height);
  if(!hits.length)return null;
  if(!previousId)return hits[0];
  const index=hits.findIndex(b=>b.id===previousId);
  return hits[(index+1+hits.length)%hits.length];
}
```

- [ ] **Step 4: Run focused + full unit tests**

```bash
pnpm test -- --run lib/lyricforge/__tests__/workspace-layout.test.ts lib/lyricforge/__tests__/preview-interaction.test.ts
pnpm test -- --run
```

- [ ] **Step 5: Commit**

```bash
git add lib/lyricforge/workspace-layout.ts lib/lyricforge/preview-interaction.ts lib/lyricforge/__tests__/workspace-layout.test.ts lib/lyricforge/__tests__/preview-interaction.test.ts
git commit -m "feat: add mobile workspace and preview interaction helpers"
```

---

### Task 2: Add direct preview text editing

**Files:**
- Modify: `components/editor/Preview.tsx`
- Test: `lib/lyricforge/__tests__/preview-interaction.test.ts`

**Interfaces:**
- Consumes: `pickTextBound()` and existing `Renderer.bounds`.
- Produces: `Preview` prop `onTextSelected?: (id:string)=>void`.

- [ ] **Step 1: Extend preview interaction tests**

Add a case proving an already selected overlapping text cycles while a non-overlap stays stable.

- [ ] **Step 2: Replace raw reverse-find hit testing with `pickTextBound()`**

`pointerDown` must still map client coordinates to project coordinates, select the returned clip, preserve drag/scale behavior, and call `onTextSelected(bounds.id)` for `lyrics`/`text` clips.

- [ ] **Step 3: Add inline editing state**

`Preview` stores `editingId:string|null`. On double-click or a second tap inside the currently selected text bound, set `editingId`. Render a `<textarea className="preview-inline-editor">` absolutely over the canvas using the selected renderer bound transformed to CSS coordinates. Update with `store.patch(clip.id,setText(clip,value),'preview-text')`. Blur or Escape commits/closes; Enter without Shift closes, while Shift+Enter inserts a newline.

- [ ] **Step 4: Preserve transform gestures**

Dragging an editable selected element continues using `store.begin()/store.end()`. While inline editing is active, pointer drag on the canvas must not move the text beneath the editor.

- [ ] **Step 5: Run full regressions and build**

```bash
pnpm test -- --run
pnpm run test:legacy
pnpm run build
```

- [ ] **Step 6: Commit**

```bash
git add components/editor/Preview.tsx lib/lyricforge/__tests__/preview-interaction.test.ts
git commit -m "feat: edit text directly from video preview"
```

---

### Task 3: Classify workspace responsively and open the inspector from preview selection

**Files:**
- Modify: `components/editor/Editor.tsx`
- Consume: `lib/lyricforge/workspace-layout.ts`

**Interfaces:**
- `Workspace` keeps `workspaceMode` state and applies `mode-phone-portrait`, `mode-compact`, or `mode-desktop` to `.studio`.
- `Preview.onTextSelected` opens the right inspector when `workspaceMode==='phone-portrait'`.

- [ ] **Step 1: Add viewport classification lifecycle**

On mount and `resize`, compute mode using `classifyWorkspace(window.innerWidth,window.innerHeight,matchMedia('(pointer: coarse)').matches)`.

- [ ] **Step 2: Apply mode classes and phone defaults**

Phone portrait starts with the left library collapsed. Selecting preview text opens the right inspector sheet. Toggling a library tab on phone closes the inspector; opening inspector closes the library.

- [ ] **Step 3: Ensure workspace preference persistence remains desktop-safe**

Continue storing panel widths/timeline height, but do not overwrite saved desktop widths merely because a phone viewport is active.

- [ ] **Step 4: Run full tests/build**

```bash
pnpm test -- --run
pnpm run test:legacy
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add components/editor/Editor.tsx
git commit -m "feat: add responsive workspace modes"
```

---

### Task 4: Turn the existing inspector into a portrait bottom sheet

**Files:**
- Modify: `app/globals.css`
- Modify: `components/editor/Inspector.tsx`

**Interfaces:**
- Phone portrait `.inspector-container` becomes a fixed/absolute bottom sheet with a visible grab affordance.
- Existing `Inspector` remains the only property editor.

- [ ] **Step 1: Add a mobile sheet handle inside `Inspector`**

Add `<div className="mobile-sheet-handle" aria-hidden="true"><span/></div>` before the panel heading.

- [ ] **Step 2: Add portrait overrides**

At `max-width:760px` and portrait:
- header height ~52px; hide secondary brand/save labels but keep Save/Export icon actions;
- workflow strip hidden;
- workbench becomes a single center column plus bottom tool rail;
- library is an overlay/sheet when expanded;
- inspector is a bottom sheet occupying roughly 48dvh, with rounded top corners, safe-area bottom padding, shadow, and scrollable contents;
- `.right-collapsed .inspector-container` moves fully off-screen;
- viewer/transport stays visible above timeline;
- tap targets are at least 42px where practical.

- [ ] **Step 3: Make inline text editor touch-friendly**

Style `.preview-inline-editor` with high-contrast outline/background, minimum 44px height, resize disabled, centered text, and `touch-action:manipulation`.

- [ ] **Step 4: Build and verify CSS compiles**

```bash
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/editor/Inspector.tsx
git commit -m "feat: add portrait inspector bottom sheet"
```

---

### Task 5: Improve portrait timeline touch ergonomics

**Files:**
- Modify: `components/editor/Timeline.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Existing timeline math remains unchanged.
- Existing pinch zoom remains active.

- [ ] **Step 1: Add semantic mobile CSS hooks**

Add `data-timeline-scroller` to `.timeline-scroll` and `data-clip-handle` to clip resize handles. No behavior change yet.

- [ ] **Step 2: Add portrait touch styling**

- timeline toolbar horizontally scrolls rather than wrapping into an unusable block;
- minimum clip height/touch target increases;
- invisible resize-handle hit area expands to >=18px while visual handle stays narrow;
- timeline height defaults around 31dvh in portrait through CSS;
- track labels remain readable and horizontal scrolling remains possible;
- disable text selection during touch drag.

- [ ] **Step 3: Run build and legacy tests**

```bash
pnpm run test:legacy
pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add components/editor/Timeline.tsx app/globals.css
git commit -m "feat: improve mobile timeline touch controls"
```

---

### Task 6: Final preview/mobile verification checkpoint

**Files:**
- Verify all files above.

- [ ] **Step 1: Run clean regression suite**

```bash
pnpm install --frozen-lockfile
pnpm test -- --run
pnpm run test:legacy
pnpm run build
if [ -d dist/client/Lyricforge2/_next ]; then
  rm -rf dist/client/_next
  mv dist/client/Lyricforge2/_next dist/client/_next
  rmdir dist/client/Lyricforge2
fi
touch dist/client/.nojekyll
node scripts/verify-pages-build.mjs
```

- [ ] **Step 2: Verify source invariants**

```bash
grep -q 'preview-inline-editor' components/editor/Preview.tsx
grep -q 'mode-phone-portrait' components/editor/Editor.tsx
grep -q 'mobile-sheet-handle' components/editor/Inspector.tsx
grep -q '@media (max-width:760px)' app/globals.css
```

- [ ] **Step 3: Push checkpoint**

The tracked-source Pages build must pass on the exact checkpoint commit. Feature-branch Pages deployment remains skipped; build/verification must succeed.
