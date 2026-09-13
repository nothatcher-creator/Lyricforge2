# LyricForge Creative Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LyricForge's trusted creative runtime for Intro/Loop/Outro text animations, ordered clip effects, master effects, and explicit adjacent-clip transitions while keeping preview/export behavior deterministic and backward compatible.

**Architecture:** Extend the existing project model with declarative creative instances, resolve them through a trusted built-in registry, and keep timing/evaluation logic in pure runtime modules. The existing `Renderer` remains the single frame producer for preview and both export paths; it receives resolved animation/effect/transition plans and applies them through reusable canvas surfaces. UI edits the same project data through `EditorStore`, and legacy style animations plus legacy `kind: 'effect'` clips remain valid.

**Tech Stack:** React 19, TypeScript 5.9, Canvas 2D / OffscreenCanvas where supported, Vinext/Vite, Vitest + jsdom, existing `EditorStore`, `Renderer`, Mediabunny export, FFmpeg-WASM fallback, pnpm 11.25.0, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-13-creative-runtime-design.md`

## Global Constraints

- Transitions are explicit objects only between adjacent compatible clips on the same track.
- A valid transition cut requires `abs(outgoing.end - incoming.start) <= 1` ms; larger gaps and physical overlaps are invalid in this phase.
- Transition timing uses centered virtual overlap and stores requested `durationMs`; rendering derives a non-destructive `effectiveDurationMs`.
- Clip effects run before transition/compositing; master effects run after the complete scene; editor guides/selection overlays run last and are never baked into export.
- Text animations use at most one `intro`, one `loop`, and one `outro` instance per text-capable clip.
- Project data stores stable IDs, semantic versions, parameters, enable state, ordering, and keyframes; project JSON never stores executable implementation code.
- Runtime version resolution is exact first. A different version may resolve only through an explicit compatibility alias in the built-in registry.
- Existing style animation fields and legacy `kind: 'effect'` clips remain loadable and visually compatible until the user changes creative settings.
- Missing/incompatible assets are preserved in project data, bypassed for rendering, and reported; they are never silently replaced.
- A failing effect/transition is quarantined for the current `Renderer` session instead of crashing or throwing every frame.
- Quality modes are exactly `preview-low`, `preview-high`, and `export`.
- No arbitrary downloaded JavaScript, WebAssembly, shader source, or executable plugin code is introduced.
- No online catalog, remote manifest, asset download/install, cross-track transition, track-level effect stack, or node compositor is included in this plan.
- Every checkpoint must preserve the existing `pnpm test -- --run`, `pnpm run test:legacy`, static build, and GitHub Pages artifact verification.

## File Structure

New focused runtime files:

- `lib/lyricforge/creative-assets.ts` — serializable instance/keyframe/reference contracts.
- `lib/lyricforge/creative-registry.ts` — trusted definition registry, exact-version resolution, compatibility aliases, parameter normalization.
- `lib/lyricforge/creative-presets.ts` — built-in animation/effect/transition metadata and parameter schemas.
- `lib/lyricforge/creative-keyframes.ts` — deterministic parameter interpolation.
- `lib/lyricforge/animation-runtime.ts` — Intro/Loop/Outro evaluation plus legacy style compatibility adapter.
- `lib/lyricforge/effect-runtime.ts` — ordered effect-plan evaluation, scope/quality handling, diagnostics.
- `lib/lyricforge/transition-runtime.ts` — adjacency, virtual-overlap timing, duration clamping, transition evaluation.
- `lib/lyricforge/creative-runtime.ts` — frame-level facade used by the renderer and pre-export validation.
- `lib/lyricforge/render-surfaces.ts` — reusable intermediate canvas pool.
- `lib/lyricforge/render-effects.ts` — trusted Canvas 2D effect execution.
- `lib/lyricforge/render-transitions.ts` — trusted transition compositing.
- `components/editor/CreativeInspector.tsx` — Intro/Loop/Outro, clip/master effects, transition parameter UI.
- `components/editor/TimelineTransitions.tsx` — transition creation/selection/drag handle UI.

Existing files modified:

- `lib/lyricforge/model.ts`
- `lib/lyricforge/project-migration.ts`
- `lib/lyricforge/project-manager.ts`
- `lib/lyricforge/animation.ts` only for shared easing/compatibility reuse, not to grow the new subsystem inside it.
- `lib/lyricforge/renderer.ts`
- `lib/lyricforge/exporter.ts`
- `lib/lyricforge/software-exporter.ts`
- `lib/lyricforge/store.ts`
- `components/editor/Inspector.tsx`
- `components/editor/Timeline.tsx`
- `components/editor/Preview.tsx`
- `app/globals.css`

Focused tests are added under `lib/lyricforge/__tests__/` and `components/editor/__tests__/`.

---

### Task 1: Extend the serializable creative model and the single project migration boundary

**Files:**
- Modify: `lib/lyricforge/creative-assets.ts`
- Modify: `lib/lyricforge/model.ts`
- Modify: `lib/lyricforge/project-migration.ts`
- Modify: `lib/lyricforge/project-manager.ts`
- Modify: `lib/lyricforge/__tests__/creative-assets.test.ts`
- Modify: `lib/lyricforge/__tests__/project-migration.test.ts`
- Create: `lib/lyricforge/__tests__/project-creative-validation.test.ts`

**Interfaces:**
- Produces `CreativeEasing = 'linear'|'ease-in'|'ease-out'|'ease-in-out'`.
- Produces `CreativeKeyframe { id:string; timeMs:number; value:AssetParamValue; easing:CreativeEasing }`.
- Produces `ParamKeyframes = Record<string, CreativeKeyframe[]>`.
- Extends `AnimationInstance` with `keyframes: ParamKeyframes`.
- Extends `EffectInstance` with stable `id:string` and `keyframes: ParamKeyframes`.
- Extends `TransitionInstance` with stable `id:string`; transition parameters are not independently keyframed in this phase.
- Extends `Clip` with `animations?: Partial<Record<AnimationRole,AnimationInstance>>` and `effects: EffectInstance[]`.
- Extends `Project` with `schemaVersion:number`, `dependencies:ProjectDependency[]`, `masterEffects:EffectInstance[]`, and `transitions:TransitionInstance[]`.
- `PROJECT_SCHEMA_VERSION` becomes `3`.
- `validateProject(data)` must call `migrateProjectDocument(data)` before Zod parsing.

- [ ] **Step 1: Write failing type/migration tests**

Add these behaviors to `project-migration.test.ts`:

```ts
it('adds creative runtime defaults without changing legacy timing or effect clips',()=>{
  const legacy={clips:[{id:'fx-old',kind:'effect',start:100,end:900}],duration:1000};
  const migrated=migrateProjectDocument(legacy);
  expect(migrated.schemaVersion).toBe(3);
  expect(migrated.masterEffects).toEqual([]);
  expect(migrated.transitions).toEqual([]);
  expect((migrated.clips as any[])[0]).toMatchObject({id:'fx-old',kind:'effect',start:100,end:900,effects:[]});
});

it('is idempotent for already migrated creative fields',()=>{
  const once=migrateProjectDocument({clips:[],masterEffects:[],transitions:[],dependencies:[]});
  expect(migrateProjectDocument(once)).toEqual(once);
});
```

Add to `creative-assets.test.ts`:

```ts
it('keeps duplicated effect presets independent through instance ids',()=>{
  const a:EffectInstance={id:'fx-a',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,params:{intensity:.5},keyframes:{}};
  const b={...a,id:'fx-b'};
  expect(a.id).not.toBe(b.id);
});
```

- [ ] **Step 2: Run focused tests and confirm they fail**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-assets.test.ts lib/lyricforge/__tests__/project-migration.test.ts
```

Expected: failures because creative defaults/instance fields/schema version do not exist.

- [ ] **Step 3: Extend the serializable contracts**

Use this shape in `creative-assets.ts`:

```ts
export type CreativeEasing='linear'|'ease-in'|'ease-out'|'ease-in-out';
export interface CreativeKeyframe{id:string;timeMs:number;value:AssetParamValue;easing:CreativeEasing}
export type ParamKeyframes=Record<string,CreativeKeyframe[]>;

export interface AnimationInstance{
  assetId:string;version:string;role:AnimationRole;enabled:boolean;
  params:Record<string,AssetParamValue>;keyframes:ParamKeyframes;
}
export interface EffectInstance{
  id:string;assetId:string;version:string;enabled:boolean;
  params:Record<string,AssetParamValue>;keyframes:ParamKeyframes;
}
export interface TransitionInstance{
  id:string;assetId:string;version:string;
  incomingItemId:string;outgoingItemId:string;
  durationMs:number;easing:CreativeEasing;
  params:Record<string,AssetParamValue>;
}
```

In `model.ts`, initialize new clips/projects without changing legacy style fields:

```ts
// makeClip return object additions
animations: undefined,
effects: [],

// createProject return object additions
schemaVersion: 3,
dependencies: [],
masterEffects: [],
transitions: [],
```

- [ ] **Step 4: Make migration normalize only structure, not visual intent**

`migrateProjectDocument()` must preserve unknown fields, preserve legacy `kind:'effect'` clips, ensure every clip object has `effects:[]` when absent, and ensure project `masterEffects`, `transitions`, `dependencies` arrays exist. Do not translate legacy style animations here; that happens at runtime.

- [ ] **Step 5: Extend validation and make migration the only load boundary**

Define Zod schemas for creative keyframes/instances and parse migrated input:

```ts
export function validateProject(data:unknown):Project{
  const migrated=migrateProjectDocument(data);
  const res=schema.safeParse(migrated);
  if(!res.success) throw new Error(/* existing message format */);
  // existing cross-reference checks remain
  return res.data as unknown as Project;
}
```

`openProject()` must also validate/migrate IndexedDB data before `hydrate()` instead of casting stored bytes straight to `Project`:

```ts
const raw=await transaction<unknown>(['projects'],'readonly',t=>t.objectStore('projects').get(id));
if(!raw)throw new Error('This project was not found on this device.');
const p=validateProject(raw);
await hydrate(p);
return p;
```

- [ ] **Step 6: Add validation tests**

`project-creative-validation.test.ts` must prove a valid effect stack/transition survives validation, malformed creative entries are rejected by the project schema, a legacy project migrates before parse, and legacy effect clips survive unchanged.

- [ ] **Step 7: Run focused and full tests**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-assets.test.ts lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/project-creative-validation.test.ts
pnpm test -- --run
pnpm run test:legacy
```

- [ ] **Step 8: Commit**

```bash
git add lib/lyricforge/creative-assets.ts lib/lyricforge/model.ts lib/lyricforge/project-migration.ts lib/lyricforge/project-manager.ts lib/lyricforge/__tests__/creative-assets.test.ts lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/project-creative-validation.test.ts
git commit -m "feat: add creative runtime project model"
```

---

### Task 2: Build the trusted creative registry and complete built-in preset metadata

**Files:**
- Create: `lib/lyricforge/creative-registry.ts`
- Create: `lib/lyricforge/creative-presets.ts`
- Create: `lib/lyricforge/__tests__/creative-registry.test.ts`
- Create: `lib/lyricforge/__tests__/creative-presets.test.ts`

**Interfaces:**
- Produces `CreativeQuality = 'preview-low'|'preview-high'|'export'`.
- Produces typed parameter definitions for number, boolean, select, and color values.
- Produces `CreativeDefinition` metadata with stable ID/type/version/name/targets/params/runtime/quality/compatibility aliases.
- Produces `creativeRegistry.resolve(type,id,version)` and `creativeRegistry.normalizeParams(def,raw)`.
- Built-ins use `1.0.0` initially and IDs prefixed `builtin.animation.`, `builtin.effect.`, or `builtin.transition.`.

- [ ] **Step 1: Write failing registry tests**

```ts
it('resolves exact versions and refuses undeclared version substitution',()=>{
  expect(creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')?.id).toBe('builtin.effect.glow');
  expect(creativeRegistry.resolve('effect','builtin.effect.glow','9.0.0')).toBeNull();
});

it('clamps numbers and applies defaults without preserving executable fields',()=>{
  const def=creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')!;
  expect(creativeRegistry.normalizeParams(def,{intensity:999,unknown:'x'})).toMatchObject({intensity:1});
  expect(creativeRegistry.normalizeParams(def,{intensity:999,unknown:'x'})).not.toHaveProperty('unknown');
});
```

- [ ] **Step 2: Run and confirm module-not-found failures**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
```

- [ ] **Step 3: Implement registry contracts**

Use explicit trusted runtime operation strings declared in source code:

```ts
export type ParamDefinition=
 | {kind:'number';default:number;min:number;max:number;step:number;keyframeable:boolean}
 | {kind:'boolean';default:boolean;keyframeable:false}
 | {kind:'select';default:string;options:readonly string[];keyframeable:false}
 | {kind:'color';default:string;keyframeable:boolean};

export interface CreativeDefinition{
 id:string;type:'text-animation'|'effect'|'transition';version:string;name:string;
 targets:readonly string[];runtime:string;params:Record<string,ParamDefinition>;
 quality:{'preview-low':'full'|'simplified'|'bypass';'preview-high':'full'|'simplified'|'bypass';export:'full'};
 compatibleVersions?:readonly string[];
}
```

Registry compatibility is exact or explicitly listed:

```ts
resolve(type,id,version){
 const defs=this.byKey.get(`${type}:${id}`)||[];
 return defs.find(d=>d.version===version) ?? defs.find(d=>d.compatibleVersions?.includes(version)) ?? null;
}
```

- [ ] **Step 4: Register every approved built-in animation**

Intro/Outro definitions: Fade, Slide, Blur, Scale Punch, Tracking Expand/Contract, Word Pop, Character Cascade, Spin, 3D Tilt approximation, Wipe Reveal, Pixel Dissolve, Glitch Reveal.

Loop definitions: Pulse, Float, Bounce, Shake, Wave, Neon Flicker, Breathing Glow, RGB Drift, 3D Sway approximation, Beat Pulse.

Each entry must specify supported roles/targets, defaults, parameter ranges, runtime operation, and quality behavior. Shared runtime operations may power multiple display presets; project IDs remain distinct.

- [ ] **Step 5: Register every approved built-in effect**

Register: Glow, Bloom, Drop Shadow, Enhanced Stroke/Outline, Blur, Sharpen, Grain, Vignette, Brightness, Contrast, Saturation, Hue Shift, Duotone, Posterize, Pixelation, RGB Split/Chromatic Aberration, VHS/Scanlines, Noise Displacement, Shake/Jitter, Zoom Pulse, Light Streak/Lens, Glitch, Beat-reactive intensity.

Use target scopes that exclude audio. Master-compatible entries explicitly include `master` in their targets.

- [ ] **Step 6: Register every approved built-in transition**

Register: Crossfade, Dip to Black, Dip to White, Blur Dissolve, Push, Slide, Directional Wipe, Zoom, Spin, Flash, Glitch, RGB Split, Pixel Dissolve, Film Burn approximation, Light Leak approximation, Mask Reveal.

- [ ] **Step 7: Add registry completeness tests**

`creative-presets.test.ts` must assert every ID is unique, every version is nonblank, every parameter default validates against its schema, every expensive preset declares all three quality entries, and the expected approved IDs are present.

- [ ] **Step 8: Run tests and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
pnpm test -- --run
git add lib/lyricforge/creative-registry.ts lib/lyricforge/creative-presets.ts lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
git commit -m "feat: add trusted creative preset registry"
```

---

### Task 3: Add deterministic creative parameter keyframes and Intro/Loop/Outro animation evaluation

**Files:**
- Create: `lib/lyricforge/creative-keyframes.ts`
- Create: `lib/lyricforge/animation-runtime.ts`
- Create: `lib/lyricforge/__tests__/creative-keyframes.test.ts`
- Create: `lib/lyricforge/__tests__/animation-runtime.test.ts`
- Modify: `lib/lyricforge/animation.ts`

**Interfaces:**
- Produces `evaluateParamKeyframes(base,keyframes,timeMs,definition)`.
- Produces `AnimationRenderState` with `x,y,scaleX,scaleY,rotation,alpha,blur,reveal,tracking,colorShift,glow`.
- Produces `evaluateTextAnimations(project,clip,time,quality)`.
- Produces `legacyAnimationInstances(project,clip)` compatibility mapping without mutating the project.

- [ ] **Step 1: Write failing interpolation tests**

```ts
it('interpolates numeric values and uses stepped strings',()=>{
 expect(evaluateParamKeyframes(0,[
  {id:'a',timeMs:0,value:0,easing:'linear'},
  {id:'b',timeMs:1000,value:10,easing:'linear'}
 ],500,{kind:'number',default:0,min:0,max:10,step:.1,keyframeable:true})).toBe(5);
 expect(evaluateParamKeyframes('left',[
  {id:'a',timeMs:0,value:'left',easing:'linear'},
  {id:'b',timeMs:1000,value:'right',easing:'linear'}
 ],500,{kind:'select',default:'left',options:['left','right'],keyframeable:false})).toBe('left');
});

it('uses the last normalized entry at duplicate times',()=>{
 const frames=[
  {id:'a',timeMs:100,value:1,easing:'linear' as const},
  {id:'b',timeMs:100,value:2,easing:'linear' as const}
 ];
 expect(evaluateParamKeyframes(0,frames,100,{kind:'number',default:0,min:0,max:5,step:.1,keyframeable:true})).toBe(2);
});
```

- [ ] **Step 2: Write animation timing/legacy tests**

Prove Intro time is relative to the Intro window, Loop remains active in the interior, Outro runs backward from clip end, short clips compose Intro and Outro instead of replacing one, and a legacy `entrance:'Fade' / idle:'Pulse' / exit:'Fade'` clip resolves to equivalent runtime states without changing its stored style.

- [ ] **Step 3: Run focused tests and confirm failures**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-keyframes.test.ts lib/lyricforge/__tests__/animation-runtime.test.ts
```

- [ ] **Step 4: Implement keyframe normalization/evaluation**

Normalize keyframe `timeMs` to integer milliseconds; clamp to the caller-provided role/scope window; sort by `(timeMs, originalIndex)` so the last duplicate wins. Numeric values interpolate with the existing `ease()` function. Non-numeric values use the previous value until the later keyframe time is reached.

- [ ] **Step 5: Implement animation state composition**

Use identity state:

```ts
export const IDENTITY_ANIMATION:AnimationRenderState={
 x:0,y:0,scaleX:1,scaleY:1,rotation:0,alpha:1,blur:0,reveal:1,
 tracking:0,colorShift:0,glow:0
};
```

Compose independent roles deterministically: translations/rotations/blur/tracking/glow add, scale and alpha multiply, reveal takes the minimum. Runtime operations are selected from the trusted registry definition, never from project-provided code.

- [ ] **Step 6: Keep legacy `animationState()` available for emphasis compatibility**

Do not delete the existing public helper. New Intro/Loop/Outro evaluation may reuse its math for matching legacy presets. Existing per-word `emphasis` remains on the old compatibility path in this phase.

- [ ] **Step 7: Run full regressions and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-keyframes.test.ts lib/lyricforge/__tests__/animation-runtime.test.ts
pnpm test -- --run
pnpm run test:legacy
git add lib/lyricforge/creative-keyframes.ts lib/lyricforge/animation-runtime.ts lib/lyricforge/animation.ts lib/lyricforge/__tests__/creative-keyframes.test.ts lib/lyricforge/__tests__/animation-runtime.test.ts
git commit -m "feat: add creative text animation runtime"
```

---

### Task 4: Add ordered effect evaluation, quality tiers, diagnostics, and quarantine contracts

**Files:**
- Create: `lib/lyricforge/effect-runtime.ts`
- Create: `lib/lyricforge/__tests__/effect-runtime.test.ts`

**Interfaces:**
- Produces `ResolvedEffect { instanceId,assetId,runtime,params,quality,scope }`.
- Produces `resolveEffectStack(instances,context)` preserving array order.
- Produces `CreativeDiagnostic { kind:'missing'|'incompatible'|'runtime'|'invalid-transition'; instanceId:string; assetId?:string; message:string }`.
- Renderer owns quarantine sets; pure runtime only returns unresolved diagnostics.

- [ ] **Step 1: Write failing effect-plan tests**

```ts
it('keeps stack order and bypasses disabled effects',()=>{
 const stack=[effect('a','builtin.effect.blur'),{...effect('b','builtin.effect.glow'),enabled:false},effect('c','builtin.effect.grain')];
 const result=resolveEffectStack(stack,{scope:'clip',targetKind:'text',timeMs:500,scopeDurationMs:2000,quality:'preview-high',audioReactive:0});
 expect(result.effects.map(x=>x.instanceId)).toEqual(['a','c']);
});

it('keeps duplicate preset instances independent',()=>{
 const result=resolveEffectStack([
  {...effect('a','builtin.effect.glow'),params:{intensity:.2}},
  {...effect('b','builtin.effect.glow'),params:{intensity:.8}}
 ],context);
 expect(result.effects.map(x=>x.params.intensity)).toEqual([.2,.8]);
});
```

Also test missing version => diagnostic + bypass; unsupported target => diagnostic + bypass; clip-relative effect keyframes; master keyframes use project time; `preview-low` follows the preset's declared full/simplified/bypass rule.

- [ ] **Step 2: Run and confirm module-not-found failure**

```bash
pnpm test -- --run lib/lyricforge/__tests__/effect-runtime.test.ts
```

- [ ] **Step 3: Implement pure ordered plan resolution**

`resolveEffectStack()` must never mutate instances, must normalize parameters through the registry, must evaluate only parameter definitions marked keyframeable, and must return diagnostics rather than throw for missing/incompatible creative definitions.

- [ ] **Step 4: Add zero-cost bypass rules**

Skip disabled effects before registry/parameter work. For explicit intensity/amount parameters equal to their neutral value, skip only definitions whose metadata marks the neutral value as bypass-safe. Do not infer neutrality for color/enum effects.

- [ ] **Step 5: Run full tests and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/effect-runtime.test.ts
pnpm test -- --run
git add lib/lyricforge/effect-runtime.ts lib/lyricforge/__tests__/effect-runtime.test.ts
git commit -m "feat: resolve ordered creative effect stacks"
```

---

### Task 5: Add explicit same-track transition timing and evaluation

**Files:**
- Create: `lib/lyricforge/transition-runtime.ts`
- Create: `lib/lyricforge/__tests__/transition-runtime.test.ts`

**Interfaces:**
- Produces `isValidTransitionPair(project,transition)`.
- Produces `transitionWindow(project,transition,mediaDurationByClip?)` returning `{cutMs,startMs,endMs,effectiveDurationMs}` or an invalid diagnostic.
- Produces `resolveTransition(project,transition,timeMs,quality,mediaDurationByClip?)` returning normalized progress and trusted runtime data.
- Supported clip kinds are exactly `lyrics`, `text`, `image`, `video`, `visualizer`.

- [ ] **Step 1: Write failing adjacency and 1 ms tolerance tests**

```ts
it('accepts adjacent touching same-track clips within one millisecond',()=>{
 const p=pairProject({aEnd:1000,bStart:1001});
 expect(isValidTransitionPair(p,transition('a','b')).valid).toBe(true);
});

it('rejects gaps, overlaps, cross-track pairs, and non-adjacent retargeting',()=>{
 expect(isValidTransitionPair(pairProject({aEnd:1000,bStart:1002}),transition('a','b')).valid).toBe(false);
 expect(isValidTransitionPair(pairProject({aEnd:1100,bStart:1000}),transition('a','b')).valid).toBe(false);
 expect(isValidTransitionPair(pairProject({differentTracks:true}),transition('a','b')).valid).toBe(false);
});
```

- [ ] **Step 2: Write centered overlap/clamp tests**

```ts
it('centers a one-second transition on the cut',()=>{
 const w=transitionWindow(pairProject({aEnd:5000,bStart:5000}),{...transition('a','b'),durationMs:1000});
 expect(w).toMatchObject({cutMs:5000,startMs:4500,endMs:5500,effectiveDurationMs:1000});
});

it('clamps effective duration without rewriting requested duration',()=>{
 const tr={...transition('a','b'),durationMs:2000};
 const w=transitionWindow(pairProject({aStart:4500,aEnd:5000,bStart:5000,bEnd:5400}),tr);
 expect(w?.effectiveDurationMs).toBe(800);
 expect(tr.durationMs).toBe(2000);
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
pnpm test -- --run lib/lyricforge/__tests__/transition-runtime.test.ts
```

- [ ] **Step 4: Implement canonical adjacency resolution**

For the outgoing clip's track, sort compatible clips by `start`, then `end`, then stable original project order. The transition is valid only if incoming is the immediate next compatible clip and the touching-cut rule passes. Never relink IDs automatically.

- [ ] **Step 5: Implement media-aware effective duration**

Core clamp:

```ts
const effectiveDurationMs=Math.max(0,Math.min(
 transition.durationMs,
 2*outgoingAvailableMs,
 2*incomingAvailableMs
));
```

For non-looping video, constrain available time by source offset/media duration when media duration is known. Unknown media duration may use clip timing until the renderer supplies decoded metadata; if a decoded source later yields zero usable time, mark invalid and hard-cut.

- [ ] **Step 6: Implement normalized transition progress**

```ts
const raw=(timeMs-window.startMs)/Math.max(1,window.effectiveDurationMs);
const progress=ease(clamp(raw,0,1),transition.easing);
```

Resolve the trusted transition definition/version through the registry. Missing definitions produce a diagnostic and hard-cut behavior.

- [ ] **Step 7: Run full tests and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/transition-runtime.test.ts
pnpm test -- --run
git add lib/lyricforge/transition-runtime.ts lib/lyricforge/__tests__/transition-runtime.test.ts
git commit -m "feat: add explicit transition runtime"
```

---

### Task 6: Add reusable render surfaces and trusted Canvas 2D effect/transition executors

**Files:**
- Create: `lib/lyricforge/render-surfaces.ts`
- Create: `lib/lyricforge/render-effects.ts`
- Create: `lib/lyricforge/render-transitions.ts`
- Create: `lib/lyricforge/__tests__/render-surfaces.test.ts`
- Create: `lib/lyricforge/__tests__/render-operations.test.ts`

**Interfaces:**
- Produces `RenderSurfacePool.acquire(width,height,scale,key)` and `.dispose()`.
- Produces `applyEffectPlan(target,source,effect,frameContext)`.
- Produces `compositeTransition(target,outgoing,incoming,resolvedTransition,frameContext)`.
- Executors accept only trusted runtime operation identifiers emitted by the registry.

- [ ] **Step 1: Write surface reuse tests**

```ts
it('reuses a surface for the same key and dimensions',()=>{
 const pool=new RenderSurfacePool();
 const a=pool.acquire(1920,1080,1,'scene');
 const b=pool.acquire(1920,1080,1,'scene');
 expect(b).toBe(a);
});

it('resizes instead of retaining obsolete dimensions',()=>{
 const pool=new RenderSurfacePool();
 const a=pool.acquire(640,360,1,'fx');
 const b=pool.acquire(1280,720,1,'fx');
 expect(b.canvas.width).toBe(1280);
 expect(b.canvas.height).toBe(720);
 expect(pool.stats().count).toBe(1);
});
```

- [ ] **Step 2: Implement pooled surfaces**

Use `OffscreenCanvas` when available and HTML canvas otherwise. Reset transforms/composite/filter/global alpha before handing a context back. Pool keys identify purposes (`scene`, `clip:<id>`, `fx:a`, `fx:b`, `transition:a`, `transition:b`) and are reused across frames. `Renderer.dispose()` will dispose the pool later.

- [ ] **Step 3: Implement effect operation families**

Use trusted operation families so the entire approved list does not become unsafe dynamic code:

- Canvas filter/alpha/composite operations: Blur, Brightness, Contrast, Saturation, Hue Shift, Drop Shadow/Glow.
- Scene overlays: Vignette, Grain, VHS/Scanlines, Light Streak/Lens, Beat-reactive intensity.
- Pixel/offscreen operations: Bloom approximation, Sharpen approximation, Duotone, Posterize, Pixelation, RGB Split, Noise Displacement, Glitch.
- Geometric source transforms: Shake/Jitter, Zoom Pulse.
- Text-aware outline remains a resolved renderer style modifier for text; non-text outline may use repeated offset drawing.

`preview-low` uses the definition's simplified/bypass rule; `export` never uses a lower-quality branch.

- [ ] **Step 4: Make procedural noise deterministic**

Do not use `Math.random()` per frame. Derive pseudo-random values from stable integer inputs such as asset/instance hash + frame number so preview and export at the same time produce the same grain/glitch pattern.

```ts
export function hashNoise(seed:number){
 let x=seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;
 return ((x>>>0)%1000000)/1000000;
}
```

- [ ] **Step 5: Implement transition operation families**

- Alpha/composite: Crossfade, Dip Black/White, Flash.
- Transform: Push, Slide, Zoom, Spin.
- Clip/mask: Directional Wipe, Mask Reveal, Pixel Dissolve.
- Filter/offscreen: Blur Dissolve, Glitch, RGB Split.
- Deterministic procedural overlays: Film Burn and Light Leak.

Every executor receives normalized `progress`; it must not recalculate project adjacency/timing.

- [ ] **Step 6: Add operation contract tests**

Tests should use fake recording contexts or small real jsdom canvas-compatible stubs to assert dispatch category, quality branch, deterministic seeds, and that every registry runtime string has an executor. Do not depend on large pixel snapshots for every preset.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/render-surfaces.test.ts lib/lyricforge/__tests__/render-operations.test.ts
pnpm test -- --run
git add lib/lyricforge/render-surfaces.ts lib/lyricforge/render-effects.ts lib/lyricforge/render-transitions.ts lib/lyricforge/__tests__/render-surfaces.test.ts lib/lyricforge/__tests__/render-operations.test.ts
git commit -m "feat: add trusted creative render operations"
```

---

### Task 7: Integrate one creative frame runtime into the existing Renderer and both export paths

**Files:**
- Create: `lib/lyricforge/creative-runtime.ts`
- Modify: `lib/lyricforge/renderer.ts`
- Modify: `lib/lyricforge/exporter.ts`
- Modify: `lib/lyricforge/software-exporter.ts`
- Create: `lib/lyricforge/__tests__/creative-runtime.test.ts`
- Create: `lib/lyricforge/__tests__/renderer-creative-order.test.ts`

**Interfaces:**
- Produces `resolveCreativeFrame(project,timeMs,quality,mediaInfo?)`.
- `RenderOptions` gains `quality?:CreativeQuality`; `export:true` always forces `export` quality.
- `Renderer` exposes deduplicated `diagnostics:CreativeDiagnostic[]` and `clearCreativeDiagnostics()`.
- Renderer quarantine key is instance ID; project revision/edit produces a new project reference and clears quarantines for IDs whose serialized instance changed.

- [ ] **Step 1: Write failing frame-order tests**

`creative-runtime.test.ts` must assert a frame plan declares clip effects before transition operations and master effects last. `renderer-creative-order.test.ts` should use injected/spied operation executors or a recording adapter and assert this order:

```ts
expect(operations).toEqual([
 'clip:source:text-a',
 'clip:effect:clip-glow',
 'transition:crossfade',
 'scene:composite',
 'master:effect:grain',
 'editor:overlay'
]);
```

Also assert `export:true` omits `editor:overlay` and uses `quality:'export'`.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-runtime.test.ts lib/lyricforge/__tests__/renderer-creative-order.test.ts
```

- [ ] **Step 3: Implement the pure frame facade**

`resolveCreativeFrame()` indexes clips by ID/track once, resolves text animation state for active/transition-side clips, resolves each clip effect stack, resolves transitions whose virtual window contains `timeMs`, resolves master effects, and returns diagnostics. It does not draw.

- [ ] **Step 4: Refactor `Renderer.draw()` around scene/clip surfaces without replacing media logic**

Preserve existing `VideoPool`, `mediaTime()`, `prepareMedia()`, background, waveform/visualizer, hit bounds, neighbor lyrics, and legacy `effect()` clip path.

Rendering rules:

1. Draw background/base scene.
2. Render each normal clip to a clip surface when it has effects or participates in a transition; otherwise keep the fast direct path when safe.
3. Apply resolved Intro/Loop/Outro state in text rendering instead of branching directly on new preset display names.
4. Apply ordered clip effects.
5. When a transition window is active, render the specified outgoing/incoming pair and composite via the transition executor even though only one side would be normally active before/after the exact cut.
6. Composite all visual tracks with existing opacity/blend semantics.
7. Apply master effects to the scene surface.
8. Copy final scene to output canvas.
9. Draw guides and selection outlines only in non-export editor mode.

- [ ] **Step 5: Preserve legacy behavior explicitly**

When a text clip has no canonical `animations` slot, use `legacyAnimationInstances()` so old style fields keep their appearance. Continue calling the existing legacy `effect(ctx,p,c,time)` for `kind:'effect'` clips. Do not auto-convert those clips.

- [ ] **Step 6: Add quarantine boundaries**

Wrap each trusted effect/transition executor call separately. On first throw, record one diagnostic and quarantine the instance ID for the renderer session. A quarantined effect is bypassed; a quarantined transition renders a hard cut. Do not catch unrelated renderer/media failures at this boundary.

- [ ] **Step 7: Force both exporters through export quality**

Change both export paths from:

```ts
renderer.draw(canvas,p,time,{export:true});
```

to:

```ts
renderer.draw(canvas,p,time,{export:true,quality:'export'});
```

Do not create an exporter-specific creative runtime.

- [ ] **Step 8: Add pre-export unresolved-creative validation**

Expose `validateCreativeProject(project)` from `creative-runtime.ts`. `renderVideo()` and software fallback call it before expensive encoding and throw a readable error listing unresolved creative instance IDs unless the caller explicitly passes a future fallback option. In this phase there is no silent fallback flag in the export UI, so unresolved required creative assets block export with a clear message; runtime executor failures discovered only during rendering still use quarantine + diagnostic and should surface to the export caller.

- [ ] **Step 9: Run unit, legacy, and build checks**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-runtime.test.ts lib/lyricforge/__tests__/renderer-creative-order.test.ts
pnpm test -- --run
pnpm run test:legacy
pnpm run build
```

- [ ] **Step 10: Commit**

```bash
git add lib/lyricforge/creative-runtime.ts lib/lyricforge/renderer.ts lib/lyricforge/exporter.ts lib/lyricforge/software-exporter.ts lib/lyricforge/__tests__/creative-runtime.test.ts lib/lyricforge/__tests__/renderer-creative-order.test.ts
git commit -m "feat: integrate creative runtime with preview and export"
```

---

### Task 8: Add undoable store operations for animations, effects, master effects, and transition selection

**Files:**
- Modify: `lib/lyricforge/store.ts`
- Create: `lib/lyricforge/__tests__/creative-store.test.ts`

**Interfaces:**
- Snapshot gains `selectedTransitionId:string|null`.
- Produces `selectTransition(id:string|null)`.
- Produces `setAnimation(clipId,role,instance|null)`.
- Produces `addClipEffect(clipId,assetId,version)` and effect patch/move/duplicate/remove helpers.
- Produces equivalent master-effect helpers.
- Produces `addTransition(outgoingId,incomingId,assetId='builtin.transition.crossfade')`, `patchTransition(id,patch)`, `removeTransition(id)`.
- Removing/moving clips never silently retargets transitions; invalid objects may remain until explicitly removed, and runtime/UI marks them invalid.

- [ ] **Step 1: Write failing store tests**

```ts
it('duplicates an effect with a new instance id and copied params/keyframes',()=>{
 const store=new EditorStore();
 const clip=store.add('text',0,'hello');
 const first=store.addClipEffect(clip.id,'builtin.effect.glow','1.0.0')!;
 const second=store.duplicateClipEffect(clip.id,first.id)!;
 expect(second.id).not.toBe(first.id);
 expect(second.params).toEqual(first.params);
});

it('selecting a transition clears clip selection',()=>{
 const store=new EditorStore();
 store.select(['clip-a']);
 store.selectTransition('transition-a');
 expect(store.selected).toEqual([]);
 expect(store.getSnapshot().selectedTransitionId).toBe('transition-a');
});
```

Also test add/reorder/toggle/remove are undoable, master effects are project scoped, transition creation refuses invalid/non-adjacent pairs using `isValidTransitionPair()`, and `setProject()/undo()/redo()` clear an invalid transition selection.

- [ ] **Step 2: Run focused tests and confirm failures**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-store.test.ts
```

- [ ] **Step 3: Implement store helpers using existing history mechanics**

All helpers must call `update()`/`patch()` rather than mutate arrays. Use `uid()` for effect/transition instance IDs. New instances take registry defaults through a helper such as `createEffectInstance(definition)` rather than duplicating defaults in UI code.

- [ ] **Step 4: Make selection semantics explicit**

`select(ids)` clears `selectedTransitionId`; `selectTransition(id)` clears clip `selected`. `emit()` includes both. `undo()`, `redo()`, and `setProject()` clear a transition selection if the ID no longer exists.

- [ ] **Step 5: Run full tests and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-store.test.ts
pnpm test -- --run
pnpm run test:legacy
git add lib/lyricforge/store.ts lib/lyricforge/__tests__/creative-store.test.ts
git commit -m "feat: add creative editor store operations"
```

---

### Task 9: Add Inspector/mobile controls for animation slots and clip/master effect stacks

**Files:**
- Create: `components/editor/CreativeInspector.tsx`
- Create: `components/editor/__tests__/CreativeInspector.test.tsx`
- Modify: `components/editor/Inspector.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `CreativeInspector` receives no duplicate project state; it reads `useEditor()` and edits through `store`.
- It switches context among selected transition, selected clip creative controls, and master effects.
- Parameter editors are generated from registry schemas, not hard-coded per preset.

- [ ] **Step 1: Write component tests for isolated creative controls**

Mock/store a selected text clip and assert the UI exposes three labeled slots: `Intro`, `Loop`, `Outro`. Add an effect and assert its enabled toggle, duplicate, move up/down, remove, and parameter input render. With no clip selected, switch to Master and assert edits target `project.masterEffects`.

Use direct accessible labels so tests remain robust:

```tsx
expect(screen.getByLabelText('Intro animation')).toBeTruthy();
expect(screen.getByRole('button',{name:'Add clip effect'})).toBeTruthy();
expect(screen.getByRole('button',{name:'Duplicate Glow effect'})).toBeTruthy();
```

- [ ] **Step 2: Run focused component test and confirm failure**

```bash
pnpm test -- --run components/editor/__tests__/CreativeInspector.test.tsx
```

- [ ] **Step 3: Implement schema-driven parameter fields**

- number => `Range` plus numeric display using definition min/max/step.
- boolean => `Toggle`.
- select => `Choice` with definition options.
- color => `ColorField`.

For a keyframeable numeric/color parameter, include `Add keyframe at playhead`. Clip effect time uses `audioEngine.time()-clip.start`; master effect time uses absolute `audioEngine.time()`; animation parameter keyframes use the selected role's computed role-window-relative time. Clamp to the valid scope before storing integer `timeMs`.

- [ ] **Step 4: Implement Intro/Loop/Outro UI**

Text-capable clips show one preset selector per role plus enable toggle and parameters for the chosen definition. Choosing `None` writes `null`/removes that role. Legacy style values continue to display through the compatibility mapping until the user selects a canonical preset; that edit writes only the chosen canonical slot and does not erase unrelated legacy emphasis fields.

- [ ] **Step 5: Implement clip/master effect stack UI**

Use a `Clip / Master` scope selector when a visual clip is selected; Master is the only available scope with no selected clip. Stack rows show name, enable toggle, drag-independent move up/down buttons for mobile accessibility, duplicate, delete, and expandable parameter controls.

- [ ] **Step 6: Integrate into Inspector without making the existing file larger than necessary**

Add an `Effects` tab to the existing inspector tab list and mount `CreativeInspector`. In the Motion tab, replace the old entrance/idle/exit controls with the new Intro/Loop/Outro section while retaining legacy emphasis controls until emphasis has a replacement. Keep existing transform/style/keyframe UI intact.

- [ ] **Step 7: Add portrait styles**

Creative stack action buttons must be at least the existing mobile touch target size, effect cards must not force horizontal overflow, and parameter sections must scroll inside the established bottom-sheet inspector.

- [ ] **Step 8: Run component/full/build checks and commit**

```bash
pnpm test -- --run components/editor/__tests__/CreativeInspector.test.tsx components/editor/__tests__/Inspector.mobile.test.tsx
pnpm test -- --run
pnpm run test:legacy
pnpm run build
git add components/editor/CreativeInspector.tsx components/editor/__tests__/CreativeInspector.test.tsx components/editor/Inspector.tsx app/globals.css
git commit -m "feat: add creative animation and effect controls"
```

---

### Task 10: Add first-class transition objects to the timeline and Inspector

**Files:**
- Create: `components/editor/TimelineTransitions.tsx`
- Create: `components/editor/__tests__/TimelineTransitions.test.tsx`
- Modify: `components/editor/Timeline.tsx`
- Modify: `components/editor/CreativeInspector.tsx`
- Modify: `app/globals.css`
- Modify: `lib/lyricforge/__tests__/timeline-mobile.test.ts`

**Interfaces:**
- `TimelineTransitions({track,clips,scale,viewLeft,viewWidth})` draws transition/add controls in the lane coordinate system where clip left values already exclude the fixed `LABEL` column.
- Existing transition objects are selected with `store.selectTransition(id)`.
- A valid adjacent touching cut without a transition shows a small add-transition affordance on hover/focus and persistently on touch/coarse-pointer layouts.
- Transition duration drag modifies requested `durationMs`; runtime computes effective duration.

- [ ] **Step 1: Write transition timeline tests**

Component tests must assert:

```tsx
expect(screen.getByRole('button',{name:'Add transition between A and B'})).toBeTruthy();
```

After creating one:

```tsx
expect(screen.getByRole('button',{name:/Crossfade transition between A and B/})).toBeTruthy();
```

Also assert no add button appears for a 2 ms gap, an overlap, different tracks, audio clips, or a pair already containing a transition.

- [ ] **Step 2: Add mobile invariant expectations**

Extend `timeline-mobile.test.ts` to require `[data-transition-handle]` and a portrait minimum hit area. Preserve existing `LABEL=174`, 50 px row math, pinch zoom, and clip trim selectors.

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
pnpm test -- --run components/editor/__tests__/TimelineTransitions.test.tsx lib/lyricforge/__tests__/timeline-mobile.test.ts
```

- [ ] **Step 4: Implement transition/add markers**

For each track, derive compatible adjacent clip pairs using the same exported helper as the transition runtime. Marker center is `cutMs / 1000 * scale`. Existing transitions render above clips with width based on requested/effective duration visualization; invalid transitions tied to the track render with a warning state rather than relinking.

- [ ] **Step 5: Implement duration dragging**

A duration handle converts horizontal delta to milliseconds and updates requested duration symmetrically:

```ts
const next=Math.max(50,Math.round(baseDuration+2*deltaPx/scale*1000));
store.patchTransition(id,{durationMs:next});
```

Use `store.begin()/end()` around the gesture. The Inspector displays `effectiveDurationMs` from `transitionWindow()` when clamped, while the editable field remains the stored requested duration.

- [ ] **Step 6: Add transition Inspector controls**

When `selectedTransitionId` is set, `CreativeInspector` shows transition preset selector, requested duration, easing, schema-driven parameters, effective duration status, and Remove. Invalid pair state shows an explicit warning with clip names/IDs and Remove; do not offer automatic relinking.

- [ ] **Step 7: Add touch/portrait CSS**

Ensure transition objects have at least 36 px visible/implicit touch height in phone portrait and do not intercept clip trim handles outside the transition control region.

- [ ] **Step 8: Run full regressions/build and commit**

```bash
pnpm test -- --run components/editor/__tests__/TimelineTransitions.test.tsx lib/lyricforge/__tests__/timeline-mobile.test.ts
pnpm test -- --run
pnpm run test:legacy
pnpm run build
git add components/editor/TimelineTransitions.tsx components/editor/__tests__/TimelineTransitions.test.tsx components/editor/Timeline.tsx components/editor/CreativeInspector.tsx app/globals.css lib/lyricforge/__tests__/timeline-mobile.test.ts
git commit -m "feat: edit transitions directly on the timeline"
```

---

### Task 11: Add preview quality selection and visible creative diagnostics without adding catalog/settings scope

**Files:**
- Modify: `components/editor/Preview.tsx`
- Modify: `components/editor/Editor.tsx`
- Create: `components/editor/CreativeDiagnostics.tsx`
- Create: `components/editor/__tests__/CreativeDiagnostics.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Preview quality UI supports exactly `Low` and `High`; export always uses runtime `export` quality and is not selectable from Preview.
- `Renderer.diagnostics` are surfaced as deduplicated warnings in the editor.
- This task does not add the later full Settings screen or online dependency recovery/install UI.

- [ ] **Step 1: Write diagnostic UI tests**

Render `CreativeDiagnostics` with one missing asset diagnostic and one runtime failure. Assert each instance appears once, the text names the asset/instance, and dismissing a warning only dismisses presentation state; it does not mutate project references.

- [ ] **Step 2: Add preview quality state**

Use local editor preference persisted through existing `saveSetting/loadSetting` under key `creativePreviewQuality`, values `preview-low | preview-high`, default `preview-high`. Pass it into `Renderer.draw()` from `Preview`.

- [ ] **Step 3: Surface diagnostics**

After draws, read the current renderer diagnostics into a small deduplicated state only when the set changes. Show non-blocking warnings near the viewer/inspector. Missing/incompatible assets explain that the item is bypassed and preserved; runtime failures explain that the item was disabled for this renderer session.

- [ ] **Step 4: Add performance-safe UI wording**

Low quality text: `Low — faster editing`. High: `High — closer to export`. Do not claim Low changes the exported result.

- [ ] **Step 5: Run tests/build and commit**

```bash
pnpm test -- --run components/editor/__tests__/CreativeDiagnostics.test.tsx
pnpm test -- --run
pnpm run test:legacy
pnpm run build
git add components/editor/Preview.tsx components/editor/Editor.tsx components/editor/CreativeDiagnostics.tsx components/editor/__tests__/CreativeDiagnostics.test.tsx app/globals.css
git commit -m "feat: add creative preview quality and diagnostics"
```

---

### Task 12: Final compatibility, parity, performance, mobile, and GitHub Pages verification

**Files:**
- Create: `lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts`
- Modify only if evidence requires a fix: runtime/editor files from Tasks 1-11.
- Do not add temporary workflow files; use the existing `.github/workflows/deploy-pages.yml`.

**Interfaces:**
- This task adds no new product architecture. It proves the approved acceptance criteria on the clean feature branch.

- [ ] **Step 1: Add acceptance-level source/runtime tests**

Cover in one focused suite:

```ts
it('preserves legacy project animations and legacy effect clips');
it('resolves intro loop outro independently');
it('executes clip effects in array order and master effects last');
it('keeps duplicate effect instances independent');
it('uses exact or explicitly compatible registry versions only');
it('accepts only adjacent same-track one-millisecond transition cuts');
it('centers and clamps virtual overlap without mutating requested duration');
it('does not retarget transitions after clip edits');
it('bypasses missing assets while preserving references');
it('quarantines a failing effect or transition per renderer session');
it('uses the same frame runtime for preview and export quality modes');
```

Each test must have concrete assertions against project/runtime output; these are test names, not empty placeholders.

- [ ] **Step 2: Run the full local verification set from a fresh dependency state**

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm test -- --run
pnpm run test:legacy
pnpm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Normalize and verify the Pages artifact exactly like CI**

```bash
set -euo pipefail
if [ -d dist/client/Lyricforge2/_next ]; then
  rm -rf dist/client/_next
  mv dist/client/Lyricforge2/_next dist/client/_next
  rmdir dist/client/Lyricforge2
fi
touch dist/client/.nojekyll
node scripts/verify-pages-build.mjs
```

Expected output includes `GitHub Pages artifact validation passed.`

- [ ] **Step 4: Perform manual mobile QA on a phone-sized Android Chrome viewport**

Verify this exact flow without desktop-only controls:

1. Select a text clip from the preview.
2. Assign Intro, Loop, and Outro presets and scrub through each window.
3. Add two clip effects, reorder them, disable/enable one, duplicate one, and keyframe a supported parameter.
4. Switch Preview High -> Low and verify editing remains functional; switch back to High.
5. Add a master effect and confirm it changes the final scene rather than only the selected clip.
6. Put two compatible visual clips on one track with a touching cut, add a Crossfade, drag requested duration, and verify no physical overlap is created.
7. Move one clip 2 ms away; confirm transition shows invalid instead of moving to another cut. Restore the cut.
8. Save, reload, and verify creative settings persist.
9. Export a short video and compare frames before, during, and after the transition against High preview.

Record any discrepancy as a failing test before fixing it.

- [ ] **Step 5: Perform a representative performance smoke check**

Use a lyric-heavy project with at least 30 text/lyric clips, 3 clip effects on the active lyric, and 2 master effects. During Preview Low and High, verify surfaces are reused (`RenderSurfacePool.stats()` does not continuously increase while scrubbing) and no diagnostic is emitted merely from normal load. Do not add an arbitrary FPS acceptance number unsupported by the current test environment; treat unbounded surface growth or editor lock-up as failure.

- [ ] **Step 6: Run the complete verification again after any fixes**

```bash
pnpm test -- --run
pnpm run test:legacy
pnpm run build
# normalize artifact as in Step 3
node scripts/verify-pages-build.mjs
```

- [ ] **Step 7: Commit final acceptance coverage/necessary fixes**

```bash
git add -A
git commit -m "test: verify creative runtime acceptance"
```

If there are no file changes after verification, do not create an empty commit.

- [ ] **Step 8: Verify the existing normal GitHub Pages workflow on `feat/source-foundation`**

Push the clean branch normally. Inspect the resulting `Deploy LyricForge to GitHub Pages` run and require:

- Install dependencies: success.
- Unit tests: success.
- Legacy regression tests: success.
- Static build: success.
- Normalize GitHub Pages artifact: success.
- Verify deployable site: success.
- Configure Pages / upload / deploy: skipped because the ref is not `main`.

No temporary CI workflow is needed. Do not merge to `main` as part of this plan.

- [ ] **Step 9: Invoke verification-before-completion before claiming the phase complete**

Use fresh command/workflow evidence from Steps 6-8. Then invoke `superpowers:finishing-a-development-branch` and present its integration choices to the user rather than merging automatically.
