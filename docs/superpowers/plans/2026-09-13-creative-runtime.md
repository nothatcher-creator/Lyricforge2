# LyricForge Creative Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Every product change follows test-driven development: establish a relevant failing test, implement the smallest coherent change, then run focused and regression verification before moving on.

**Goal:** Add LyricForge's trusted creative runtime for Intro/Loop/Outro text animations, ordered clip effects, master effects, and explicit adjacent-clip transitions while keeping preview/export behavior deterministic, mobile-friendly, and backward compatible.

**Architecture:** Extend the existing project model with declarative creative instances, resolve them through a trusted built-in registry, and keep timing/evaluation logic in small pure runtime modules. The existing `Renderer` remains the single frame producer for preview, Mediabunny export, and FFmpeg-WASM export. The renderer consumes resolved creative plans and uses reusable intermediate surfaces only when necessary. UI edits the same `EditorStore`; no second project/editor state store is introduced.

**Tech Stack:** React 19, TypeScript 5.9, Canvas 2D / OffscreenCanvas where supported, Vinext/Vite, Vitest + jsdom, existing `EditorStore`, `Renderer`, Mediabunny export, FFmpeg-WASM fallback, pnpm 11.25.0, GitHub Pages.

**Approved spec:** `docs/superpowers/specs/2026-09-13-creative-runtime-design.md`

## Global Constraints

- Transitions are explicit project objects only between adjacent compatible clips on the same track.
- A valid cut requires `Math.abs(outgoing.end - incoming.start) <= 1` ms. Gaps larger than 1 ms and physical clip overlaps are invalid in this phase.
- A transition stores the user's requested `durationMs`; rendering derives `effectiveDurationMs` without rewriting the requested value.
- Transition time uses centered virtual overlap: `[cut - effectiveDurationMs/2, cut + effectiveDurationMs/2]`.
- During virtual overlap, the outgoing side samples no later than its last in-clip frame and the incoming side samples no earlier than its first in-clip frame. This intentionally holds boundary content on the opposite half of the virtual window rather than inventing hidden media handles.
- Clip source -> text animation/transform -> clip effects -> same-track transition/compositing -> complete scene -> master effects -> editor overlays/output.
- Editor guides and selection outlines are drawn after creative output and never appear in exported frames.
- Text-capable clips have at most one canonical `intro`, one `loop`, and one `outro` animation instance.
- Canonical animation slots override legacy animation fields role-by-role. An absent canonical role continues to use the corresponding legacy field, preserving mixed old/new projects.
- Existing legacy `Style.entrance`, `Style.idle`, `Style.exit`, and `Style.emphasis` fields remain loadable. Legacy `kind:'effect'` clips also remain loadable and keep their current rendering path.
- Project JSON stores IDs, versions, parameters, enable state, order, and keyframes only. It never stores executable implementation code.
- Registry version resolution is exact first. A different version can resolve only through an explicit compatibility alias declared in trusted source code.
- Missing/incompatible creative assets keep their original project references, render as bypass/hard-cut, and produce diagnostics. They are never silently replaced.
- Runtime executor failures are caught only at the individual effect/transition boundary. Failed instance IDs are quarantined for the current `Renderer` session; unrelated renderer/media errors still propagate.
- Editing/replacing a quarantined instance clears only that instance's quarantine. Recreating the renderer clears all quarantine state.
- Quality modes are exactly `preview-low`, `preview-high`, and `export`.
- No downloaded JavaScript, WebAssembly, shader source, or arbitrary executable plugin code is introduced.
- No online catalog, remote manifest, download/install/update flow, cross-track transition, track-level effect stack, node compositor, or full Settings redesign is included in this plan.
- Existing desktop behavior, phone portrait bottom-sheet behavior, `LABEL=174`, 50 px timeline rows, clip trim, pinch zoom, snapping, and legacy project export must remain compatible.

## Stable IDs and Types

Use these exact built-in ID prefixes and initial version `1.0.0`:

- Text animation: `builtin.animation.<slug>`
- Effect: `builtin.effect.<slug>`
- Transition: `builtin.transition.<slug>`

Core runtime types:

```ts
export type CreativeQuality='preview-low'|'preview-high'|'export';
export type CreativeEasing='linear'|'ease-in'|'ease-out'|'ease-in-out';
export type CreativeTarget='lyrics'|'text'|'image'|'video'|'visualizer'|'master';

export interface CreativeKeyframe{
  id:string;
  timeMs:number;
  value:AssetParamValue;
  easing:CreativeEasing;
}
export type ParamKeyframes=Record<string,CreativeKeyframe[]>;
```

## Planned File Structure

New runtime files:

- `lib/lyricforge/creative-registry.ts`
- `lib/lyricforge/creative-presets.ts`
- `lib/lyricforge/creative-keyframes.ts`
- `lib/lyricforge/animation-runtime.ts`
- `lib/lyricforge/effect-runtime.ts`
- `lib/lyricforge/transition-runtime.ts`
- `lib/lyricforge/creative-runtime.ts`
- `lib/lyricforge/render-surfaces.ts`
- `lib/lyricforge/render-effects.ts`
- `lib/lyricforge/render-transitions.ts`
- `components/editor/CreativeInspector.tsx`
- `components/editor/TimelineTransitions.tsx`
- `components/editor/CreativeDiagnostics.tsx`

Existing files modified as needed:

- `lib/lyricforge/creative-assets.ts`
- `lib/lyricforge/model.ts`
- `lib/lyricforge/project-migration.ts`
- `lib/lyricforge/project-manager.ts`
- `lib/lyricforge/animation.ts`
- `lib/lyricforge/renderer.ts`
- `lib/lyricforge/exporter.ts`
- `lib/lyricforge/software-exporter.ts`
- `lib/lyricforge/store.ts`
- `components/editor/Inspector.tsx`
- `components/editor/Timeline.tsx`
- `components/editor/Preview.tsx`
- `components/editor/Editor.tsx`
- `app/globals.css`

---

### Task 1: Extend the serializable creative model and make migration the single load boundary

**Files:**
- Modify: `lib/lyricforge/creative-assets.ts`
- Modify: `lib/lyricforge/model.ts`
- Modify: `lib/lyricforge/project-migration.ts`
- Modify: `lib/lyricforge/project-manager.ts`
- Modify: `lib/lyricforge/__tests__/creative-assets.test.ts`
- Modify: `lib/lyricforge/__tests__/project-migration.test.ts`
- Create: `lib/lyricforge/__tests__/project-creative-validation.test.ts`

**Data contracts:**

```ts
export interface AnimationInstance{
  assetId:string;
  version:string;
  role:AnimationRole;
  enabled:boolean;
  params:Record<string,AssetParamValue>;
  keyframes:ParamKeyframes;
}

export interface EffectInstance{
  id:string;
  assetId:string;
  version:string;
  enabled:boolean;
  params:Record<string,AssetParamValue>;
  keyframes:ParamKeyframes;
}

export interface TransitionInstance{
  id:string;
  assetId:string;
  version:string;
  outgoingItemId:string;
  incomingItemId:string;
  durationMs:number;
  easing:CreativeEasing;
  params:Record<string,AssetParamValue>;
}
```

`Clip` gains:

```ts
animations?:Partial<Record<AnimationRole,AnimationInstance>>;
effects:EffectInstance[];
```

`Project` gains:

```ts
schemaVersion:number;
dependencies:ProjectDependency[];
masterEffects:EffectInstance[];
transitions:TransitionInstance[];
```

`PROJECT_SCHEMA_VERSION` becomes `3`.

- [ ] **Step 1: Add failing migration/model tests**

```ts
it('adds creative defaults without changing legacy timing or effect clips',()=>{
  const legacy={clips:[{id:'fx-old',kind:'effect',start:100,end:900}],duration:1000};
  const migrated=migrateProjectDocument(legacy);
  expect(migrated.schemaVersion).toBe(3);
  expect(migrated.masterEffects).toEqual([]);
  expect(migrated.transitions).toEqual([]);
  expect((migrated.clips as any[])[0]).toMatchObject({
    id:'fx-old',kind:'effect',start:100,end:900,effects:[]
  });
});

it('is idempotent for creative defaults',()=>{
  const once=migrateProjectDocument({clips:[],masterEffects:[],transitions:[],dependencies:[]});
  expect(migrateProjectDocument(once)).toEqual(once);
});
```

Add to `creative-assets.test.ts`:

```ts
it('uses stable instance ids for duplicate effect presets',()=>{
  const first:EffectInstance={
    id:'fx-a',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,
    params:{intensity:.5},keyframes:{}
  };
  const second={...structuredClone(first),id:'fx-b'};
  expect(second.id).not.toBe(first.id);
  expect(second.params).toEqual(first.params);
});
```

- [ ] **Step 2: Run the focused tests and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-assets.test.ts lib/lyricforge/__tests__/project-migration.test.ts
```

Expected: failures because schema version 3 and new fields are not implemented.

- [ ] **Step 3: Implement the contracts and constructors**

`makeClip()` initializes `effects:[]` and leaves `animations` absent. `createProject()` initializes:

```ts
schemaVersion:3,
dependencies:[],
masterEffects:[],
transitions:[],
```

Do not remove or rewrite legacy style fields.

- [ ] **Step 4: Normalize structure in `migrateProjectDocument()`**

For object-like clips, add `effects:[]` only when absent. Preserve `animations`, legacy style fields, unknown fields, and all legacy `kind:'effect'` clip data. Normalize `dependencies` exactly as today. Normalize `masterEffects` and `transitions` only enough for Zod validation to decide validity; migration does not silently drop malformed creative instances.

- [ ] **Step 5: Extend Zod validation and wire migration before all project parsing**

Use the existing error wording exactly:

```ts
export function validateProject(data:unknown):Project{
  const migrated=migrateProjectDocument(data);
  const res=schema.safeParse(migrated);
  if(!res.success){
    throw new Error('Invalid project file: '+res.error.issues[0].path.join('.')+' '+res.error.issues[0].message);
  }
  const p=res.data as unknown as Project;
  // retain the existing duplicate-ID, media-reference, track-reference,
  // font-family, animation-name, size, and scale checks below this point.
  return p;
}
```

`openProject()` must validate stored IndexedDB data before hydration:

```ts
export async function openProject(id:string){
  const raw=await transaction<unknown>(['projects'],'readonly',t=>t.objectStore('projects').get(id));
  if(!raw)throw new Error('This project was not found on this device.');
  const p=validateProject(raw);
  await hydrate(p);
  return p;
}
```

- [ ] **Step 6: Add concrete validation tests**

```ts
it('accepts valid creative stacks and explicit transitions',()=>{
  const p=createProject('Creative');
  const track=makeTrack('text','Text');
  const a=makeClip('text',track.id,0,1000,'A');
  const b=makeClip('text',track.id,1000,2000,'B');
  a.effects=[{id:'fx-1',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,params:{intensity:.5},keyframes:{}}];
  p.tracks.unshift(track);p.clips=[a,b];
  p.transitions=[{id:'tr-1',assetId:'builtin.transition.crossfade',version:'1.0.0',outgoingItemId:a.id,incomingItemId:b.id,durationMs:500,easing:'ease-in-out',params:{}}];
  const validated=validateProject(structuredClone(p));
  expect(validated.clips[0].effects[0].id).toBe('fx-1');
  expect(validated.transitions[0].id).toBe('tr-1');
});

it('rejects malformed creative instance ids',()=>{
  const p=createProject('Bad');
  p.masterEffects=[{id:'',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,params:{},keyframes:{}}];
  expect(()=>validateProject(p)).toThrow(/Invalid project file/);
});
```

Also retain an assertion that a legacy effect clip survives `validateProject()` and that an old project lacking creative fields gets defaults before parse.

- [ ] **Step 7: Verify focused + regressions**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-assets.test.ts lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/project-creative-validation.test.ts
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add lib/lyricforge/creative-assets.ts lib/lyricforge/model.ts lib/lyricforge/project-migration.ts lib/lyricforge/project-manager.ts lib/lyricforge/__tests__/creative-assets.test.ts lib/lyricforge/__tests__/project-migration.test.ts lib/lyricforge/__tests__/project-creative-validation.test.ts
git commit -m "feat: add creative runtime project model"
```

---

### Task 2: Build the trusted registry and complete built-in preset metadata

**Files:**
- Create: `lib/lyricforge/creative-registry.ts`
- Create: `lib/lyricforge/creative-presets.ts`
- Create: `lib/lyricforge/__tests__/creative-registry.test.ts`
- Create: `lib/lyricforge/__tests__/creative-presets.test.ts`

**Registry contract:**

```ts
export type ParamDefinition=
 | {kind:'number';default:number;min:number;max:number;step:number;keyframeable:boolean;neutral?:number}
 | {kind:'boolean';default:boolean;keyframeable:false;neutral?:boolean}
 | {kind:'select';default:string;options:readonly string[];keyframeable:false;neutral?:string}
 | {kind:'color';default:string;keyframeable:boolean;interpolation:'color'|'step';neutral?:string};

export interface CreativeDefinition{
  id:string;
  type:'text-animation'|'effect'|'transition';
  version:string;
  name:string;
  targets:readonly CreativeTarget[];
  roles?:readonly AnimationRole[];
  runtime:string;
  params:Record<string,ParamDefinition>;
  quality:{
    'preview-low':'full'|'simplified'|'bypass';
    'preview-high':'full'|'simplified'|'bypass';
    export:'full';
  };
  compatibleVersions?:readonly string[];
  bypassWhenNeutral?:readonly string[];
}
```

- [ ] **Step 1: Write failing registry tests**

```ts
it('resolves exact versions and refuses undeclared substitutions',()=>{
  expect(creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')?.id).toBe('builtin.effect.glow');
  expect(creativeRegistry.resolve('effect','builtin.effect.glow','9.0.0')).toBeNull();
});

it('normalizes only declared parameters',()=>{
  const def=creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')!;
  const params=creativeRegistry.normalizeParams(def,{intensity:999,unknown:'not executable'});
  expect(params.intensity).toBe(1);
  expect(params).not.toHaveProperty('unknown');
});
```

- [ ] **Step 2: Run and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
```

- [ ] **Step 3: Implement registry lookup and parameter normalization**

Version lookup is exact or explicitly compatible:

```ts
resolve(type:CreativeDefinition['type'],id:string,version:string){
  const defs=this.byKey.get(`${type}:${id}`)??[];
  return defs.find(d=>d.version===version)
    ?? defs.find(d=>d.compatibleVersions?.includes(version))
    ?? null;
}
```

Number parameters clamp to min/max. Select parameters reject unknown values back to the trusted default. Colors accept only `#rrggbb`; invalid colors fall back to the trusted default. Unknown project parameter keys are ignored for execution but remain untouched in serialized project data.

- [ ] **Step 4: Register these exact animation IDs**

Use a small source-code factory and these explicit IDs/runtime operations:

```ts
const animationSpecs=[
 ['fade','animation.fade',['intro','outro']],
 ['slide','animation.slide',['intro','outro']],
 ['blur','animation.blur',['intro','outro']],
 ['scale-punch','animation.scale-punch',['intro','outro']],
 ['tracking','animation.tracking',['intro','outro']],
 ['word-pop','animation.word-pop',['intro','outro']],
 ['character-cascade','animation.character-cascade',['intro','outro']],
 ['spin','animation.spin',['intro','outro']],
 ['tilt-3d','animation.tilt-3d',['intro','outro']],
 ['wipe-reveal','animation.wipe-reveal',['intro','outro']],
 ['pixel-dissolve','animation.pixel-dissolve',['intro','outro']],
 ['glitch-reveal','animation.glitch-reveal',['intro','outro']],
 ['pulse','animation.pulse',['loop']],
 ['float','animation.float',['loop']],
 ['bounce','animation.bounce',['loop']],
 ['shake','animation.shake',['loop']],
 ['wave','animation.wave',['loop']],
 ['neon-flicker','animation.neon-flicker',['loop']],
 ['breathing-glow','animation.breathing-glow',['loop']],
 ['rgb-drift','animation.rgb-drift',['loop']],
 ['sway-3d','animation.sway-3d',['loop']],
 ['beat-pulse','animation.beat-pulse',['loop']],
] as const;
```

All animation definitions target `['lyrics','text']`. Common params are concrete and trusted:

```ts
const animationCommon={
 durationMs:num(350,50,4000,10,true),
 delayMs:num(0,0,3000,10,true),
 intensity:num(.5,0,2,.05,true),
 direction:select('forward',['forward','reverse']),
};
```

Character/word stagger presets additionally define `staggerMs:num(35,0,300,1,true)`. Loop presets additionally define `periodMs:num(1200,100,10000,10,true)`. Beat Pulse defines `sensitivity:num(1,.1,5,.05,true)`.

- [ ] **Step 5: Register these exact effect IDs and default parameter schemas**

```ts
const effectSpecs={
 glow:{runtime:'effect.glow',params:{radius:num(18,0,80,1,true),intensity:num(.6,0,1,.01,true)}},
 bloom:{runtime:'effect.bloom',params:{radius:num(22,0,80,1,true),intensity:num(.45,0,1,.01,true)}},
 'drop-shadow':{runtime:'effect.drop-shadow',params:{blur:num(14,0,60,1,true),offsetX:num(0,-80,80,1,true),offsetY:num(8,-80,80,1,true),opacity:num(.55,0,1,.01,true),color:color('#000000')}},
 outline:{runtime:'effect.outline',params:{width:num(3,0,20,.5,true),opacity:num(1,0,1,.01,true),color:color('#ffffff')}},
 blur:{runtime:'effect.blur',params:{radius:num(8,0,60,.5,true)}},
 sharpen:{runtime:'effect.sharpen',params:{amount:num(.4,0,1,.01,true)}},
 grain:{runtime:'effect.grain',params:{amount:num(.2,0,1,.01,true),size:num(1,1,8,1,false)}},
 vignette:{runtime:'effect.vignette',params:{amount:num(.35,0,1,.01,true),softness:num(.55,.05,1,.01,true)}},
 brightness:{runtime:'effect.brightness',params:{amount:num(1,0,3,.01,true)}},
 contrast:{runtime:'effect.contrast',params:{amount:num(1,0,3,.01,true)}},
 saturation:{runtime:'effect.saturation',params:{amount:num(1,0,3,.01,true)}},
 'hue-shift':{runtime:'effect.hue-shift',params:{degrees:num(0,-180,180,1,true)}},
 duotone:{runtime:'effect.duotone',params:{shadow:color('#182030'),highlight:color('#f2b66d'),amount:num(1,0,1,.01,true)}},
 posterize:{runtime:'effect.posterize',params:{levels:num(6,2,32,1,true)}},
 pixelate:{runtime:'effect.pixelate',params:{size:num(8,1,80,1,true)}},
 'rgb-split':{runtime:'effect.rgb-split',params:{amount:num(6,0,40,.5,true)}},
 vhs:{runtime:'effect.vhs',params:{scanlines:num(.45,0,1,.01,true),noise:num(.2,0,1,.01,true),jitter:num(.15,0,1,.01,true)}},
 'noise-displacement':{runtime:'effect.noise-displacement',params:{amount:num(8,0,60,.5,true),scale:num(24,2,128,1,false)}},
 shake:{runtime:'effect.shake',params:{amount:num(8,0,80,.5,true),speed:num(8,.1,40,.1,true)}},
 'zoom-pulse':{runtime:'effect.zoom-pulse',params:{amount:num(.08,0,.5,.01,true),periodMs:num(800,100,5000,10,true)}},
 'light-streak':{runtime:'effect.light-streak',params:{intensity:num(.4,0,1,.01,true),angle:num(25,-180,180,1,true)}},
 glitch:{runtime:'effect.glitch',params:{intensity:num(.35,0,1,.01,true),rate:num(.25,0,1,.01,true)}},
 'beat-reactive':{runtime:'effect.beat-reactive',params:{intensity:num(.5,0,2,.01,true),sensitivity:num(1,.1,5,.05,true)}},
} as const;
```

Definitions target supported visual clip kinds. Master-safe definitions explicitly include `master`; any effect that depends on clip geometry rather than a complete scene must omit `master`. Mark neutral parameters with `neutral` and list only safe ones in `bypassWhenNeutral`.

- [ ] **Step 6: Register these exact transition IDs**

```ts
const transitionSpecs={
 crossfade:{runtime:'transition.crossfade',params:{}},
 'dip-black':{runtime:'transition.dip-black',params:{hold:num(.15,0,.8,.01,true)}},
 'dip-white':{runtime:'transition.dip-white',params:{hold:num(.15,0,.8,.01,true)}},
 'blur-dissolve':{runtime:'transition.blur-dissolve',params:{radius:num(24,0,80,1,true)}},
 push:{runtime:'transition.push',params:{direction:select('left',['left','right','up','down'])}},
 slide:{runtime:'transition.slide',params:{direction:select('left',['left','right','up','down'])}},
 wipe:{runtime:'transition.wipe',params:{direction:select('left',['left','right','up','down']),softness:num(.05,0,.5,.01,true)}},
 zoom:{runtime:'transition.zoom',params:{amount:num(.25,0,1,.01,true)}},
 spin:{runtime:'transition.spin',params:{turns:num(.3,-2,2,.01,true)}},
 flash:{runtime:'transition.flash',params:{strength:num(.7,0,1,.01,true)}},
 glitch:{runtime:'transition.glitch',params:{intensity:num(.5,0,1,.01,true)}},
 'rgb-split':{runtime:'transition.rgb-split',params:{amount:num(12,0,60,.5,true)}},
 'pixel-dissolve':{runtime:'transition.pixel-dissolve',params:{cellSize:num(10,2,80,1,false)}},
 'film-burn':{runtime:'transition.film-burn',params:{intensity:num(.75,0,1,.01,true)}},
 'light-leak':{runtime:'transition.light-leak',params:{intensity:num(.7,0,1,.01,true)}},
 'mask-reveal':{runtime:'transition.mask-reveal',params:{direction:select('left',['left','right','up','down']),softness:num(.08,0,.5,.01,true)}},
} as const;
```

All transition definitions support the compatible visual clip kinds from Task 5 and export quality `full`.

- [ ] **Step 7: Add completeness tests**

Assert unique IDs, nonblank versions, valid defaults, every runtime operation is nonblank, every animation's `roles` are compatible with its declared list, and the exact animation/effect/transition slug sets above are present.

- [ ] **Step 8: Verify and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
pnpm test -- --run
pnpm run typecheck
git add lib/lyricforge/creative-registry.ts lib/lyricforge/creative-presets.ts lib/lyricforge/__tests__/creative-registry.test.ts lib/lyricforge/__tests__/creative-presets.test.ts
git commit -m "feat: add trusted creative preset registry"
```

---

### Task 3: Add deterministic parameter keyframes and Intro/Loop/Outro animation evaluation

**Files:**
- Create: `lib/lyricforge/creative-keyframes.ts`
- Create: `lib/lyricforge/animation-runtime.ts`
- Create: `lib/lyricforge/__tests__/creative-keyframes.test.ts`
- Create: `lib/lyricforge/__tests__/animation-runtime.test.ts`
- Modify: `lib/lyricforge/animation.ts` only to export reusable color interpolation if useful; do not move the new subsystem into this file.

**Runtime output:**

```ts
export interface AnimationRenderState{
 x:number;y:number;
 scaleX:number;scaleY:number;
 rotation:number;
 alpha:number;
 blur:number;
 reveal:number;
 tracking:number;
 colorShift:number;
 glow:number;
}
```

- [ ] **Step 1: Write failing keyframe tests**

```ts
it('interpolates numeric parameters',()=>{
  const def={kind:'number',default:0,min:0,max:10,step:.1,keyframeable:true} as const;
  expect(evaluateParamKeyframes(0,[
    {id:'a',timeMs:0,value:0,easing:'linear'},
    {id:'b',timeMs:1000,value:10,easing:'linear'},
  ],500,def)).toBe(5);
});

it('uses stepped values for select parameters and last entry at duplicate time',()=>{
  const selectDef={kind:'select',default:'left',options:['left','right'] as const,keyframeable:false} as const;
  expect(evaluateParamKeyframes('left',[
    {id:'a',timeMs:0,value:'left',easing:'linear'},
    {id:'b',timeMs:1000,value:'right',easing:'linear'},
  ],500,selectDef)).toBe('left');
  const numberDef={kind:'number',default:0,min:0,max:5,step:.1,keyframeable:true} as const;
  expect(evaluateParamKeyframes(0,[
    {id:'a',timeMs:100,value:1,easing:'linear'},
    {id:'b',timeMs:100,value:2,easing:'linear'},
  ],100,numberDef)).toBe(2);
});
```

Add a color test proving `interpolation:'color'` interpolates valid hex colors while `interpolation:'step'` steps.

- [ ] **Step 2: Write failing role timing and compatibility tests**

Use a 4-second text clip. Assert Intro uses clip-start-relative role time, Loop evaluates the active interior, Outro evaluates from the clip end, and a 200 ms clip with 350 ms Intro/Outro combines both contributions instead of discarding one.

Legacy precedence must be explicit:

```ts
it('uses canonical role data only for roles that exist',()=>{
  const p=createProject();
  const c=makeClip('text',makeTrack('text','T').id,0,4000,'hello');
  c.style={entrance:'Fade',idle:'Pulse',exit:'Fade'};
  c.animations={intro:{assetId:'builtin.animation.slide',version:'1.0.0',role:'intro',enabled:true,params:{durationMs:350,delayMs:0,intensity:.5,direction:'forward'},keyframes:{}}};
  const resolved=resolveAnimationRoles(p,c,1000,'preview-high');
  expect(resolved.sources).toEqual({intro:'canonical',loop:'legacy',outro:'legacy'});
});
```

- [ ] **Step 3: Run focused tests and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-keyframes.test.ts lib/lyricforge/__tests__/animation-runtime.test.ts
```

- [ ] **Step 4: Implement keyframe normalization**

Rules: integer `timeMs`, stable sort by `(timeMs, originalIndex)`, last duplicate wins, numeric interpolation uses existing `ease()`, colors interpolate only when the trusted schema says `interpolation:'color'`, all other primitives step. The caller clamps role/scope time before evaluation.

- [ ] **Step 5: Implement canonical animation operations and composition**

Identity:

```ts
export const IDENTITY_ANIMATION:AnimationRenderState={
  x:0,y:0,scaleX:1,scaleY:1,rotation:0,alpha:1,
  blur:0,reveal:1,tracking:0,colorShift:0,glow:0,
};
```

Composition rules: x/y/rotation/blur/tracking/colorShift/glow add; scale and alpha multiply; reveal uses `Math.min`. Intro and Outro therefore both contribute on short clips.

- [ ] **Step 6: Preserve every legacy animation name without forcing new registry entries**

For any canonical role that is absent, evaluate the corresponding legacy field using the current trusted `animationState()` implementation. `entrance` -> Intro, `idle` -> Loop, `exit` -> Outro. Existing `emphasis` remains the current per-word renderer compatibility path. This preserves legacy values such as Pop, Bounce, Zoom, Typewriter, Character Reveal, Word Reveal, Stretch, Rise, and Fall even when they are not exposed as new catalog presets.

- [ ] **Step 7: Verify and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-keyframes.test.ts lib/lyricforge/__tests__/animation-runtime.test.ts
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
git add lib/lyricforge/creative-keyframes.ts lib/lyricforge/animation-runtime.ts lib/lyricforge/animation.ts lib/lyricforge/__tests__/creative-keyframes.test.ts lib/lyricforge/__tests__/animation-runtime.test.ts
git commit -m "feat: add creative text animation runtime"
```

---

### Task 4: Add ordered effect evaluation, quality tiers, and diagnostics

**Files:**
- Create: `lib/lyricforge/effect-runtime.ts`
- Create: `lib/lyricforge/__tests__/effect-runtime.test.ts`

**Interfaces:**

```ts
export interface CreativeDiagnostic{
  kind:'missing'|'incompatible'|'runtime'|'invalid-transition';
  instanceId:string;
  assetId?:string;
  message:string;
}

export interface ResolvedEffect{
  instanceId:string;
  assetId:string;
  runtime:string;
  params:Record<string,AssetParamValue>;
  quality:'full'|'simplified';
  scope:'clip'|'master';
}
```

Test helpers must be concrete:

```ts
const effect=(id:string,assetId:string):EffectInstance=>({
 id,assetId,version:'1.0.0',enabled:true,params:{},keyframes:{}
});
const clipContext:EffectResolveContext={
 scope:'clip',targetKind:'text',timeMs:500,scopeDurationMs:2000,
 quality:'preview-high',audioReactive:0
};
```

- [ ] **Step 1: Write failing stack tests**

```ts
it('preserves array order and bypasses disabled instances',()=>{
  const stack=[effect('a','builtin.effect.blur'),{...effect('b','builtin.effect.glow'),enabled:false},effect('c','builtin.effect.grain')];
  const result=resolveEffectStack(stack,clipContext);
  expect(result.effects.map(x=>x.instanceId)).toEqual(['a','c']);
});

it('keeps duplicate preset instances independent',()=>{
  const result=resolveEffectStack([
    {...effect('a','builtin.effect.glow'),params:{intensity:.2}},
    {...effect('b','builtin.effect.glow'),params:{intensity:.8}},
  ],clipContext);
  expect(result.effects.map(x=>x.params.intensity)).toEqual([.2,.8]);
});
```

Also test missing version => diagnostic+bypass, unsupported target => diagnostic+bypass, clip keyframes use clip-relative time, master keyframes use project time, and `preview-low` follows the registry's full/simplified/bypass policy.

- [ ] **Step 2: Run focused test and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/effect-runtime.test.ts
```

- [ ] **Step 3: Implement pure effect-plan resolution**

`resolveEffectStack()` does not mutate project instances and never executes drawing code. It skips disabled instances before registry work, resolves exact/compatible definitions, normalizes parameters, evaluates trusted keyframeable fields, determines quality behavior, and returns diagnostics rather than throwing for missing/incompatible definitions.

Neutral bypass is used only when `definition.bypassWhenNeutral` explicitly lists fields and every listed field equals its trusted neutral value. Do not infer neutral state for arbitrary colors/enums.

- [ ] **Step 4: Verify and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/effect-runtime.test.ts
pnpm test -- --run
pnpm run typecheck
git add lib/lyricforge/effect-runtime.ts lib/lyricforge/__tests__/effect-runtime.test.ts
git commit -m "feat: resolve ordered creative effect stacks"
```

---

### Task 5: Add explicit transition adjacency, virtual-overlap timing, and source sampling

**Files:**
- Create: `lib/lyricforge/transition-runtime.ts`
- Create: `lib/lyricforge/__tests__/transition-runtime.test.ts`

Supported clip kinds are exactly:

```ts
export const TRANSITION_KINDS=['lyrics','text','image','video','visualizer'] as const;
```

- [ ] **Step 1: Add concrete test helpers and failing adjacency tests**

```ts
function transition(outgoingItemId='a',incomingItemId='b'):TransitionInstance{
  return {id:'tr',assetId:'builtin.transition.crossfade',version:'1.0.0',outgoingItemId,incomingItemId,durationMs:1000,easing:'linear',params:{}};
}

function pairProject(opts:{aStart?:number;aEnd?:number;bStart?:number;bEnd?:number;differentTracks?:boolean}={}):Project{
  const p=createProject('pair');
  const ta=makeTrack('text','A');
  const tb=opts.differentTracks?makeTrack('text','B'):ta;
  const a=makeClip('text',ta.id,opts.aStart??0,opts.aEnd??1000,'A');a.id='a';
  const b=makeClip('text',tb.id,opts.bStart??1000,opts.bEnd??2000,'B');b.id='b';
  p.tracks=[ta,...(tb===ta?[]:[tb])];p.clips=[a,b];
  return p;
}
```

```ts
it('accepts a touching same-track pair within one millisecond',()=>{
  expect(isValidTransitionPair(pairProject({aEnd:1000,bStart:1001}),transition()).valid).toBe(true);
});

it('rejects gaps, overlaps, cross-track and non-adjacent pairs',()=>{
  expect(isValidTransitionPair(pairProject({aEnd:1000,bStart:1002}),transition()).valid).toBe(false);
  expect(isValidTransitionPair(pairProject({aEnd:1100,bStart:1000}),transition()).valid).toBe(false);
  expect(isValidTransitionPair(pairProject({differentTracks:true}),transition()).valid).toBe(false);
});
```

Add a third clip between A and B and prove the old A->B transition becomes invalid instead of retargeting.

- [ ] **Step 2: Write failing window/clamp/sampling tests**

```ts
it('centers a one-second window on the cut',()=>{
  const w=transitionWindow(pairProject({aEnd:5000,bStart:5000}),{...transition(),durationMs:1000});
  expect(w).toMatchObject({cutMs:5000,startMs:4500,endMs:5500,effectiveDurationMs:1000});
});

it('clamps effective duration without rewriting requested duration',()=>{
  const tr={...transition(),durationMs:2000};
  const w=transitionWindow(pairProject({aStart:4500,aEnd:5000,bStart:5000,bEnd:5400}),tr)!;
  expect(w.effectiveDurationMs).toBe(800);
  expect(tr.durationMs).toBe(2000);
});

it('holds source sampling at clip boundaries across the virtual overlap',()=>{
  const p=pairProject({aStart:0,aEnd:1000,bStart:1000,bEnd:2000});
  const w=transitionWindow(p,transition())!;
  expect(transitionSampleTimes(p,transition(),750,w)).toEqual({outgoingMs:750,incomingMs:1000});
  expect(transitionSampleTimes(p,transition(),1250,w)).toEqual({outgoingMs:999,incomingMs:1250});
});
```

- [ ] **Step 3: Run focused test and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/transition-runtime.test.ts
```

- [ ] **Step 4: Implement canonical adjacency**

Within the outgoing clip's track, sort compatible clips by `start`, then `end`, then original project array index. Incoming must be the immediate next compatible clip. Require same track and the 1 ms touching-cut rule. Never rewrite IDs.

- [ ] **Step 5: Implement effective duration and media limits**

Base clamp:

```ts
const effectiveDurationMs=Math.max(0,Math.min(
  transition.durationMs,
  2*outgoingAvailableMs,
  2*incomingAvailableMs,
));
```

`outgoingAvailableMs = cut - outgoing.start`; `incomingAvailableMs = incoming.end - cut`. For non-looping video, when decoded source duration is known, additionally clamp usable duration to the source duration remaining after the clip's `offset`. If usable duration becomes zero, return an invalid diagnostic and hard-cut.

- [ ] **Step 6: Implement sampling and progress**

For valid window `w`:

```ts
const outgoingMs=clamp(Math.min(timeMs,w.cutMs-1),outgoing.start,outgoing.end-1);
const incomingMs=clamp(Math.max(timeMs,w.cutMs),incoming.start,incoming.end-1);
const raw=(timeMs-w.startMs)/Math.max(1,w.effectiveDurationMs);
const progress=ease(clamp(raw,0,1),transition.easing);
```

Resolve the transition definition through the registry. Missing/incompatible definitions return a diagnostic with hard-cut behavior.

- [ ] **Step 7: Verify and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/transition-runtime.test.ts
pnpm test -- --run
pnpm run typecheck
git add lib/lyricforge/transition-runtime.ts lib/lyricforge/__tests__/transition-runtime.test.ts
git commit -m "feat: add explicit transition runtime"
```

---

### Task 6: Add reusable render surfaces and trusted Canvas 2D executors

**Files:**
- Create: `lib/lyricforge/render-surfaces.ts`
- Create: `lib/lyricforge/render-effects.ts`
- Create: `lib/lyricforge/render-transitions.ts`
- Create: `lib/lyricforge/__tests__/render-surfaces.test.ts`
- Create: `lib/lyricforge/__tests__/render-operations.test.ts`

- [ ] **Step 1: Write failing pool tests**

```ts
it('reuses one keyed surface at stable dimensions',()=>{
  const pool=new RenderSurfacePool();
  expect(pool.acquire(640,360,1,'scene')).toBe(pool.acquire(640,360,1,'scene'));
  expect(pool.stats().count).toBe(1);
});

it('resizes rather than retaining an obsolete keyed surface',()=>{
  const pool=new RenderSurfacePool();
  pool.acquire(640,360,1,'fx-a');
  const next=pool.acquire(1280,720,1,'fx-a');
  expect(next.canvas.width).toBe(1280);
  expect(next.canvas.height).toBe(720);
  expect(pool.stats().count).toBe(1);
});
```

- [ ] **Step 2: Implement the pool**

Use `OffscreenCanvas` when available, otherwise `document.createElement('canvas')`. On acquire, reset transform, alpha, composite mode, filter, shadow state, and clear the surface. Pool keys are reused across frames. `dispose()` zeroes HTML-canvas dimensions where applicable and clears references.

- [ ] **Step 3: Define exact trusted effect dispatch**

`render-effects.ts` exports a source-controlled handler map keyed only by trusted runtime strings:

```ts
export const EFFECT_HANDLERS:Record<string,EffectRenderHandler>={
 'effect.glow':renderGlow,
 'effect.bloom':renderBloom,
 'effect.drop-shadow':renderDropShadow,
 'effect.outline':renderOutline,
 'effect.blur':renderBlur,
 'effect.sharpen':renderSharpen,
 'effect.grain':renderGrain,
 'effect.vignette':renderVignette,
 'effect.brightness':renderBrightness,
 'effect.contrast':renderContrast,
 'effect.saturation':renderSaturation,
 'effect.hue-shift':renderHueShift,
 'effect.duotone':renderDuotone,
 'effect.posterize':renderPosterize,
 'effect.pixelate':renderPixelate,
 'effect.rgb-split':renderRgbSplit,
 'effect.vhs':renderVhs,
 'effect.noise-displacement':renderNoiseDisplacement,
 'effect.shake':renderShake,
 'effect.zoom-pulse':renderZoomPulse,
 'effect.light-streak':renderLightStreak,
 'effect.glitch':renderGlitch,
 'effect.beat-reactive':renderBeatReactive,
};
```

Canvas-native filters/compositing are preferred. Pixel/offscreen handlers use pooled surfaces. `preview-low` may take only the trusted simplified branch declared by registry metadata. Export always uses full behavior.

- [ ] **Step 4: Make procedural effects deterministic**

No per-frame `Math.random()` is allowed. Seed by stable instance hash + integer frame index:

```ts
export function hashNoise(seed:number){
  let x=seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;
  return ((x>>>0)%1000000)/1000000;
}
```

Use this for Grain, VHS noise, Noise Displacement, Glitch, Film Burn, and Light Leak.

- [ ] **Step 5: Define exact trusted transition dispatch**

```ts
export const TRANSITION_HANDLERS:Record<string,TransitionRenderHandler>={
 'transition.crossfade':renderCrossfade,
 'transition.dip-black':renderDipBlack,
 'transition.dip-white':renderDipWhite,
 'transition.blur-dissolve':renderBlurDissolve,
 'transition.push':renderPush,
 'transition.slide':renderSlide,
 'transition.wipe':renderWipe,
 'transition.zoom':renderZoom,
 'transition.spin':renderSpin,
 'transition.flash':renderFlash,
 'transition.glitch':renderTransitionGlitch,
 'transition.rgb-split':renderTransitionRgbSplit,
 'transition.pixel-dissolve':renderTransitionPixelDissolve,
 'transition.film-burn':renderFilmBurn,
 'transition.light-leak':renderLightLeak,
 'transition.mask-reveal':renderMaskReveal,
};
```

Handlers receive normalized progress and already-rendered outgoing/incoming surfaces. They do not recalculate project timing/adjacency.

- [ ] **Step 6: Test registry/executor completeness**

```ts
it('has an executor for every trusted effect and transition runtime',()=>{
  for(const def of creativeRegistry.all('effect'))expect(EFFECT_HANDLERS[def.runtime]).toBeTypeOf('function');
  for(const def of creativeRegistry.all('transition'))expect(TRANSITION_HANDLERS[def.runtime]).toBeTypeOf('function');
});
```

Also assert deterministic noise returns the same values for the same seeds and changes for different frame seeds. Use recording/fake contexts for dispatch/order tests rather than brittle full-size pixel snapshots.

- [ ] **Step 7: Verify and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/render-surfaces.test.ts lib/lyricforge/__tests__/render-operations.test.ts
pnpm test -- --run
pnpm run typecheck
git add lib/lyricforge/render-surfaces.ts lib/lyricforge/render-effects.ts lib/lyricforge/render-transitions.ts lib/lyricforge/__tests__/render-surfaces.test.ts lib/lyricforge/__tests__/render-operations.test.ts
git commit -m "feat: add trusted creative render operations"
```

---

### Task 7: Integrate one frame runtime into `Renderer` and both export paths

**Files:**
- Create: `lib/lyricforge/creative-runtime.ts`
- Modify: `lib/lyricforge/renderer.ts`
- Modify: `lib/lyricforge/exporter.ts`
- Modify: `lib/lyricforge/software-exporter.ts`
- Create: `lib/lyricforge/__tests__/creative-runtime.test.ts`
- Create: `lib/lyricforge/__tests__/renderer-creative-order.test.ts`

**Renderer contract:**

```ts
export interface RenderOptions{
 guides?:boolean;
 selected?:string[];
 export?:boolean;
 quality?:CreativeQuality;
}
```

`export:true` forces `quality:'export'` even if another value is accidentally passed.

- [ ] **Step 1: Write failing frame-plan/order tests**

```ts
it('orders clip effects before transition and master effects last',()=>{
  const plan=resolveCreativeFrame(projectAtCut,1000,'preview-high');
  expect(plan.operationOrder).toEqual([
    'clip:source:text-a',
    'clip:effect:clip-glow',
    'transition:tr-1',
    'scene:composite',
    'master:effect:master-grain',
  ]);
});
```

A renderer recording adapter must prove editor overlay is last in preview and absent in export:

```ts
expect(previewOps.at(-1)).toBe('editor:overlay');
expect(exportOps).not.toContain('editor:overlay');
expect(exportPlan.quality).toBe('export');
```

- [ ] **Step 2: Run focused tests and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-runtime.test.ts lib/lyricforge/__tests__/renderer-creative-order.test.ts
```

- [ ] **Step 3: Implement `resolveCreativeFrame()` as a pure facade**

Index clips by ID/track once per frame. Resolve active normal clips, transition windows, transition sample times, per-role text animation state, clip effect plans, master effect plan, audio-reactive input, and diagnostics. The facade does not draw.

- [ ] **Step 4: Refactor `Renderer.draw()` without replacing existing media behavior**

Preserve `VideoPool`, `mediaTime()`, background, neighbor lyric behavior, waveform/spectrum rendering, hit bounds, and legacy `effect()` clips. Use direct drawing for clips that need no creative surface; use pooled clip surfaces when an effect or transition needs pixel access.

During an active transition, render both specified sides at the sample times from Task 5 even when one side is outside its nominal active timeline interval. Composite the pair once for that track. Do not also draw either transition-side clip through the normal direct path in that frame.

Canonical text role state is applied before clip effects. Legacy per-word `emphasis` remains where it is today.

- [ ] **Step 5: Extend `prepareMedia()` for transition-side videos**

Export currently awaits `prepareMedia()` before drawing. It must seek both normally active videos and any video used by an active transition side. For a transition-side video, seek with `mediaTime(clip, transitionSampleMs, duration)` rather than raw project time. This prevents export from attempting to draw unprepared incoming/outgoing video frames during virtual overlap.

Preview remains allowed to seek asynchronously using the same sample time when not exporting.

- [ ] **Step 6: Add renderer quarantine with per-instance signatures**

Track serialized signatures only for executable instances:

```ts
function signature(value:EffectInstance|TransitionInstance){
  return JSON.stringify(value);
}
```

Before each frame, compare current instance signatures with the renderer's prior map. If an instance's signature changed or the ID disappeared, remove only that ID from quarantine/diagnostic dedupe state. New renderer => empty quarantine. Executor failures add the single instance ID to quarantine and one deduplicated diagnostic. Quarantined effect => bypass; quarantined transition => hard cut.

- [ ] **Step 7: Preserve legacy rendering explicitly**

If a canonical animation role is absent, Task 3's legacy adapter supplies that role. Continue rendering `kind:'effect'` clips through the current legacy `Renderer.effect()` method. Do not auto-convert old effect clips.

- [ ] **Step 8: Force both exporters through the same export-quality renderer**

Both export loops become:

```ts
await renderer.prepareMedia(p,time);
renderer.draw(canvas,p,time,{export:true,quality:'export'});
```

There is no exporter-specific creative evaluator.

- [ ] **Step 9: Validate unresolved creative references before expensive encoding**

`validateCreativeProject(project)` returns unresolved instance diagnostics by registry lookup and target compatibility. `renderVideo()` checks this before initializing encoding. If unresolved required creative instances exist, throw one readable error containing their IDs. This phase does not add a “continue with fallback” export UI; therefore the safe default is blocking export rather than silently producing different output.

- [ ] **Step 10: Verify and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-runtime.test.ts lib/lyricforge/__tests__/renderer-creative-order.test.ts
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
pnpm run build
git add lib/lyricforge/creative-runtime.ts lib/lyricforge/renderer.ts lib/lyricforge/exporter.ts lib/lyricforge/software-exporter.ts lib/lyricforge/__tests__/creative-runtime.test.ts lib/lyricforge/__tests__/renderer-creative-order.test.ts
git commit -m "feat: integrate creative runtime with preview and export"
```

---

### Task 8: Add undoable store operations for animations, effects, master effects, and transitions

**Files:**
- Modify: `lib/lyricforge/store.ts`
- Create: `lib/lyricforge/__tests__/creative-store.test.ts`

Store snapshot gains `selectedTransitionId:string|null`.

- [ ] **Step 1: Write failing store tests**

```ts
it('duplicates an effect with a new instance id and copied settings',()=>{
  const s=new EditorStore();
  const clip=s.add('text',0,'hello');
  const first=s.addClipEffect(clip.id,'builtin.effect.glow','1.0.0')!;
  s.patchClipEffect(clip.id,first.id,{params:{intensity:.35}});
  const second=s.duplicateClipEffect(clip.id,first.id)!;
  expect(second.id).not.toBe(first.id);
  expect(second.params).toEqual({intensity:.35});
});

it('transition selection and clip selection are mutually exclusive',()=>{
  const s=new EditorStore();
  s.select(['clip-a']);
  s.selectTransition('tr-a');
  expect(s.selected).toEqual([]);
  expect(s.getSnapshot().selectedTransitionId).toBe('tr-a');
  s.select(['clip-b']);
  expect(s.getSnapshot().selectedTransitionId).toBeNull();
});
```

Also prove effect add/reorder/toggle/remove is undoable; master effects modify only `project.masterEffects`; `addTransition()` rejects invalid pairs using Task 5; and `setProject()/undo()/redo()` clear transition selection when its ID no longer exists.

- [ ] **Step 2: Run focused test and confirm red**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-store.test.ts
```

- [ ] **Step 3: Implement helpers through existing immutable history**

Required methods:

```ts
selectTransition(id:string|null):void;
setAnimation(clipId:string,role:AnimationRole,instance:AnimationInstance|null):void;
addClipEffect(clipId:string,assetId:string,version:string):EffectInstance|undefined;
patchClipEffect(clipId:string,instanceId:string,patch:Partial<EffectInstance>):void;
moveClipEffect(clipId:string,instanceId:string,delta:-1|1):void;
duplicateClipEffect(clipId:string,instanceId:string):EffectInstance|undefined;
removeClipEffect(clipId:string,instanceId:string):void;
addMasterEffect(assetId:string,version:string):EffectInstance|undefined;
patchMasterEffect(instanceId:string,patch:Partial<EffectInstance>):void;
moveMasterEffect(instanceId:string,delta:-1|1):void;
duplicateMasterEffect(instanceId:string):EffectInstance|undefined;
removeMasterEffect(instanceId:string):void;
addTransition(outgoingId:string,incomingId:string,assetId?:string):TransitionInstance|undefined;
patchTransition(id:string,patch:Partial<TransitionInstance>):void;
removeTransition(id:string):void;
```

Creation uses registry defaults and `uid()`. No UI component invents preset defaults.

- [ ] **Step 4: Verify and commit**

```bash
pnpm test -- --run lib/lyricforge/__tests__/creative-store.test.ts
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
git add lib/lyricforge/store.ts lib/lyricforge/__tests__/creative-store.test.ts
git commit -m "feat: add creative editor store operations"
```

---

### Task 9: Add Inspector/mobile controls for canonical animation slots and clip/master effect stacks

**Files:**
- Create: `components/editor/CreativeInspector.tsx`
- Create: `components/editor/__tests__/CreativeInspector.test.tsx`
- Modify: `components/editor/Inspector.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing accessible component tests**

With a selected text clip:

```ts
expect(screen.getByLabelText('Intro animation')).toBeTruthy();
expect(screen.getByLabelText('Loop animation')).toBeTruthy();
expect(screen.getByLabelText('Outro animation')).toBeTruthy();
expect(screen.getByRole('button',{name:'Add clip effect'})).toBeTruthy();
```

After adding Glow:

```ts
expect(screen.getByRole('button',{name:'Duplicate Glow effect'})).toBeTruthy();
expect(screen.getByRole('button',{name:'Move Glow effect up'})).toBeTruthy();
expect(screen.getByRole('button',{name:'Remove Glow effect'})).toBeTruthy();
```

With no clip selected, assert `Master effects` is shown and changes only `project.masterEffects`.

- [ ] **Step 2: Run focused test and confirm red**

```bash
pnpm test -- --run components/editor/__tests__/CreativeInspector.test.tsx
```

- [ ] **Step 3: Implement schema-driven parameter controls**

Number -> `Range`; boolean -> `Toggle`; select -> `Choice`; color -> `ColorField`. All labels include preset + parameter name for accessibility. Add a keyframe button only when the trusted parameter definition says `keyframeable:true`.

Keyframe time scopes are exact:

- Clip effect: `round(clamp(audioEngine.time()-clip.start,0,clip.end-clip.start))`.
- Master effect: absolute rounded project time.
- Animation parameter: relative to the role window computed by `animation-runtime.ts`.

- [ ] **Step 4: Implement Intro/Loop/Outro editing with per-role legacy fallback**

A selected `lyrics` or `text` clip gets one selector per role. Choosing a canonical preset writes only that role's `clip.animations[role]`. Choosing `None` removes the canonical role, which intentionally exposes the legacy fallback again if that legacy style field is non-`None`. Add a separate `Disable role` toggle when the user wants an explicit canonical disabled state rather than legacy fallback.

Do not erase `Style.emphasis`.

- [ ] **Step 5: Preserve All Lyrics legacy controls**

When Inspector scope is `All lyrics`, keep the existing legacy `entrance`, `idle`, `exit`, and `emphasis` controls because `project.lyricStyle` does not own per-clip canonical animation slots. Canonical Intro/Loop/Outro controls appear only for an individually selected lyrics/text clip (`This line` or text layer). This avoids silently removing global animation editing.

- [ ] **Step 6: Implement clip/master effect stacks**

Selected visual clips show a `Clip / Master` scope control. With no compatible clip, show Master only. Stack rows expose enable, move up/down, duplicate, delete, expandable parameters, and supported keyframes. Use buttons rather than drag-only ordering so phone users have a reliable touch path.

- [ ] **Step 7: Integrate without bloating `Inspector.tsx`**

Add an `Effects` tab mounting `CreativeInspector`. In Motion, mount its canonical animation section for individual text clips and retain the existing legacy animation section only for `All lyrics` plus the existing emphasis control where applicable. Existing layout/style/ordinary clip keyframes remain unchanged.

- [ ] **Step 8: Add portrait-safe styles**

Effect cards and parameter rows must stay inside the existing bottom-sheet width, use existing mobile control sizing, and keep all primary action targets at least 36 px high in phone portrait.

- [ ] **Step 9: Verify and commit**

```bash
pnpm test -- --run components/editor/__tests__/CreativeInspector.test.tsx components/editor/__tests__/Inspector.mobile.test.tsx
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
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

- [ ] **Step 1: Write failing transition UI tests**

For one valid touching cut:

```ts
expect(screen.getByRole('button',{name:'Add transition between A and B'})).toBeTruthy();
```

After creating Crossfade:

```ts
expect(screen.getByRole('button',{name:/Crossfade transition between A and B/})).toBeTruthy();
```

Assert no Add button for a 2 ms gap, overlap, cross-track pair, audio pair, non-adjacent pair, or a cut already owning a transition.

- [ ] **Step 2: Extend mobile timeline invariants**

Require source/CSS hooks:

```ts
expect(timelineSource).toContain('data-transition-handle');
expect(css).toMatch(/data-transition-handle[^}]*min-height:\s*36px/s);
```

Keep existing assertions for `data-timeline-scroller`, clip start/end handles, portrait clip height, and toolbar scrolling.

- [ ] **Step 3: Run focused tests and confirm red**

```bash
pnpm test -- --run components/editor/__tests__/TimelineTransitions.test.tsx lib/lyricforge/__tests__/timeline-mobile.test.ts
```

- [ ] **Step 4: Render transition/add controls in lane coordinates**

`TimelineTransitions` derives compatible adjacent pairs from the same exported Task 5 helper; it does not duplicate adjacency rules. The marker center is `cutMs/1000*scale`. Existing transition visual width uses `effectiveDurationMs` so the timeline shows what can actually render; Inspector separately shows the user's requested value when clamped.

Valid cuts without a transition show an add affordance on hover/focus, and persistently under coarse-pointer/phone CSS.

- [ ] **Step 5: Implement symmetric requested-duration drag**

```ts
const deltaMs=2*deltaPx/scale*1000;
const next=Math.max(50,Math.round(baseDuration+deltaMs));
store.patchTransition(id,{durationMs:next});
```

Wrap pointer gesture in `store.begin()/store.end()`. Runtime still performs the authoritative clamp.

- [ ] **Step 6: Add selected-transition Inspector mode**

When `selectedTransitionId` exists, show preset, requested duration, easing, schema-driven parameters, effective duration, source/target clip names, validity warning, and Remove. Invalid transitions are never auto-relinked.

- [ ] **Step 7: Verify and commit**

```bash
pnpm test -- --run components/editor/__tests__/TimelineTransitions.test.tsx lib/lyricforge/__tests__/timeline-mobile.test.ts
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
pnpm run build
git add components/editor/TimelineTransitions.tsx components/editor/__tests__/TimelineTransitions.test.tsx components/editor/Timeline.tsx components/editor/CreativeInspector.tsx app/globals.css lib/lyricforge/__tests__/timeline-mobile.test.ts
git commit -m "feat: edit transitions directly on the timeline"
```

---

### Task 11: Add Preview Low/High selection and visible creative diagnostics

**Files:**
- Modify: `components/editor/Preview.tsx`
- Modify: `components/editor/Editor.tsx`
- Create: `components/editor/CreativeDiagnostics.tsx`
- Create: `components/editor/__tests__/CreativeDiagnostics.test.tsx`
- Modify: `app/globals.css`

This task deliberately does not build the later full Settings or online recovery/catalog UI.

- [ ] **Step 1: Write failing diagnostics tests**

```ts
const diagnostics=[
 {kind:'missing' as const,instanceId:'fx-missing',assetId:'catalog.effect.future',message:'Missing effect'},
 {kind:'runtime' as const,instanceId:'fx-bad',assetId:'builtin.effect.glitch',message:'Effect failed'},
];
render(<CreativeDiagnostics diagnostics={diagnostics}/>);
expect(screen.getByText(/fx-missing/)).toBeTruthy();
expect(screen.getByText(/fx-bad/)).toBeTruthy();
```

Pass the same diagnostic twice and assert it renders once by `kind + instanceId + message`. Dismissing presentation state must not mutate project data.

- [ ] **Step 2: Add persisted preview-quality state in `Editor`**

Load/save existing settings key `creativePreviewQuality`. Allowed values are `preview-low | preview-high`; invalid/missing value defaults to `preview-high`. Pass quality to `Preview` as a prop.

UI labels are exact:

- `Low — faster editing`
- `High — closer to export`

Export is not selectable here and is always full quality.

- [ ] **Step 3: Pass quality into the existing render loop**

```ts
render.draw(el,state.project,t,{
 selected:state.selected,
 guides:state.guides,
 quality,
});
```

Ensure changing quality invalidates the preview loop's draw cache so the next animation frame redraws immediately.

- [ ] **Step 4: Surface renderer diagnostics without per-frame React churn**

`Preview` compares a stable serialized diagnostic key after draws and updates React state only when the deduplicated diagnostic set changes. Missing/incompatible text says the item is preserved but bypassed. Runtime-failure text says the item is disabled for this renderer session.

- [ ] **Step 5: Verify and commit**

```bash
pnpm test -- --run components/editor/__tests__/CreativeDiagnostics.test.tsx
pnpm test -- --run
pnpm run test:legacy
pnpm run typecheck
pnpm run build
git add components/editor/Preview.tsx components/editor/Editor.tsx components/editor/CreativeDiagnostics.tsx components/editor/__tests__/CreativeDiagnostics.test.tsx app/globals.css
git commit -m "feat: add creative preview quality and diagnostics"
```

---

### Task 12: Final acceptance, parity, performance, mobile, and GitHub Pages verification

**Files:**
- Create: `lib/lyricforge/__tests__/creative-runtime-acceptance.test.ts`
- Modify implementation files only when a failing test/verification demonstrates a defect.
- Do not add temporary workflow files; use `.github/workflows/deploy-pages.yml`.

- [ ] **Step 1: Add concrete acceptance assertions**

Build fixtures with `createProject()/makeTrack()/makeClip()` and assert, at minimum:

```ts
it('preserves legacy creative behavior and explicit legacy effect clips',()=>{
  const p=legacyCreativeFixture();
  const migrated=validateProject(structuredClone(p));
  expect(migrated.clips.find(c=>c.id==='legacy-effect')?.kind).toBe('effect');
  const text=migrated.clips.find(c=>c.id==='legacy-text')!;
  expect(resolveAnimationRoles(migrated,text,text.start+100,'preview-high').sources.intro).toBe('legacy');
});

it('keeps transition request duration while exposing the clamped render duration',()=>{
  const {project,transition}=shortTransitionFixture();
  const resolved=resolveTransition(project,transition,transitionCut(project,transition),'export')!;
  expect(transition.durationMs).toBe(2000);
  expect(resolved.window.effectiveDurationMs).toBeLessThan(2000);
});

it('does not retarget a transition after inserting a new adjacent clip',()=>{
  const {project,transition}=validTransitionFixture();
  expect(isValidTransitionPair(project,transition).valid).toBe(true);
  project.clips.push(makeInterveningClip(project,transition));
  expect(isValidTransitionPair(project,transition).valid).toBe(false);
  expect(transition.outgoingItemId).toBe('a');
  expect(transition.incomingItemId).toBe('b');
});
```

The suite also asserts clip-effect order, master-last order, duplicate effect independence, exact/explicit registry versioning, 1 ms cut tolerance, missing-asset reference preservation, quality modes, deterministic procedural effects, and renderer quarantine reset after editing the failing instance.

- [ ] **Step 2: Fresh dependency + type + test + build verification**

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test -- --run
pnpm run test:legacy
pnpm run build
```

Every command must exit 0 before completion is claimed.

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

- [ ] **Step 4: Mobile/browser QA**

When a real Chromium/Android browser or emulator is available in the execution environment, verify this exact flow at phone portrait and phone landscape sizes:

1. Select a text clip from Preview.
2. Assign Intro/Loop/Outro and scrub through each role window.
3. Add two clip effects; reorder, disable/enable, duplicate, and keyframe a supported parameter.
4. Switch Preview High -> Low -> High and confirm editor state/output updates without changing export settings.
5. Add a master effect and confirm it affects the composed scene, not only the selected clip.
6. Create a valid touching same-track cut, add Crossfade, drag duration, and confirm clips remain physically un-overlapped.
7. Move one clip to create a 2 ms gap and confirm the transition becomes invalid instead of retargeting; restore the cut.
8. Save/reopen and confirm creative settings persist.
9. Export a short project and compare frames before/during/after the transition with High preview.

If no real browser/emulator is available, do not claim this manual/browser QA passed. Run all component/source-invariant tests, record the browser QA as the one unverified acceptance item, and state that limitation explicitly.

- [ ] **Step 5: Performance/surface smoke check**

Use a fixture with at least 30 lyric/text clips, 3 effects on the active clip, and 2 master effects. Repeatedly resolve/draw a sequence of frame times in Low and High. Assert `RenderSurfacePool.stats().count` stabilizes after required keys are allocated instead of increasing every frame. Treat unbounded surface growth, repeated identical runtime diagnostics, or renderer lock-up as failure. Do not invent an FPS threshold that the current environment cannot measure reliably.

- [ ] **Step 6: Rerun the complete verification after any fix**

```bash
pnpm run typecheck
pnpm test -- --run
pnpm run test:legacy
pnpm run build
node scripts/verify-pages-build.mjs
```

Run artifact normalization before the final verifier exactly as in Step 3.

- [ ] **Step 7: Commit final acceptance coverage/fixes**

```bash
git add -A
git commit -m "test: verify creative runtime acceptance"
```

If verification required no file changes, do not create an empty commit.

- [ ] **Step 8: Verify the existing normal GitHub Pages workflow on the clean feature branch**

Push `feat/source-foundation` normally and inspect the resulting `Deploy LyricForge to GitHub Pages` run. Require success for dependency install, unit tests, legacy regression tests, static build, artifact normalization, and deployable-site verification. Configure Pages/upload/deploy must be skipped because the ref is not `main`.

No temporary workflow is created for this phase.

- [ ] **Step 9: Completion protocol**

Invoke `superpowers:verification-before-completion` with fresh evidence from Steps 2-8 before saying the phase is complete. Then invoke `superpowers:finishing-a-development-branch` and present the integration choices to the user. Do not merge `feat/source-foundation` to `main` automatically.

## Self-Review Result

- Placeholder scan: no `TBD`, `TODO`, pseudo error-message placeholder, or undefined test-context variable remains.
- Spec coverage: model/migration, registry, animation, clip/master effects, transition timing, virtual source sampling, render parity, quarantine, mobile editing, quality tiers, diagnostics, backward compatibility, and acceptance verification all have explicit tasks.
- Type consistency: animation roles, instance IDs, parameter keyframes, quality modes, effect scopes, transition selection, and registry targets have one named contract each.
- Scope: online catalog/install/settings work remains explicitly deferred; this plan is one cohesive creative-runtime phase.
- Compatibility: global All Lyrics legacy animation editing and legacy effect clips are intentionally preserved rather than accidentally replaced by the new per-clip system.
