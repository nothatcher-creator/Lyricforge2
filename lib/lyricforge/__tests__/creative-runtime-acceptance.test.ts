// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {EffectInstance,TransitionInstance} from '../creative-assets';
import {resolveAnimationRoles} from '../animation-runtime';
import {creativeRegistry} from '../creative-registry';
import {resolveCreativeFrame,validateCreativeProject} from '../creative-runtime';
import {EditorStore} from '../store';
import {hashNoise} from '../render-effects';
import {Renderer} from '../renderer';
import {createProject,makeClip,makeTrack,type Project} from '../model';
import {validateProject} from '../project-manager';
import {isValidTransitionPair,resolveTransition} from '../transition-runtime';

function effect(assetId:string,id:string,params:Record<string,number|string|boolean>={}):EffectInstance{
  const definition=creativeRegistry.resolve('effect',assetId,'1.0.0');
  if(!definition)throw new Error(`Missing fixture effect ${assetId}`);
  return {id,assetId,version:definition.version,enabled:true,params:creativeRegistry.normalizeParams(definition,params),keyframes:{}};
}

function transition(outgoingItemId:string,incomingItemId:string,durationMs=1000):TransitionInstance{
  return {id:'tr',assetId:'builtin.transition.crossfade',version:'1.0.0',outgoingItemId,incomingItemId,durationMs,easing:'linear',params:{}};
}

function twoClipProject(gapMs=0){
  const project=createProject('transition fixture');
  const track=makeTrack('text','Text');
  const a=makeClip('text',track.id,0,1000,'A');a.id='a';
  const b=makeClip('text',track.id,1000+gapMs,2000+gapMs,'B');b.id='b';
  project.tracks=[track];project.clips=[a,b];project.duration=2000+gapMs;
  const tr=transition('a','b');project.transitions=[tr];
  return {project,track,a,b,transition:tr};
}

class FakeGradient{addColorStop(){/* no-op */}}
class FakeContext2D{
  globalAlpha=1;globalCompositeOperation='source-over';filter='none';fillStyle='#000000';strokeStyle='#000000';lineWidth=1;
  shadowColor='rgba(0, 0, 0, 0)';shadowBlur=0;shadowOffsetX=0;shadowOffsetY=0;imageSmoothingEnabled=true;
  font='16px sans-serif';textBaseline='alphabetic';textAlign='left';letterSpacing='0px';lineJoin='miter';
  save(){} restore(){} setTransform(){} clearRect(){} scale(){} fillRect(){} drawImage(){} translate(){} rotate(){}
  setLineDash(){} strokeRect(){} beginPath(){} moveTo(){} bezierCurveTo(){} stroke(){} roundRect(){} fill(){} rect(){} clip(){}
  createLinearGradient(){return new FakeGradient();} createRadialGradient(){return new FakeGradient();}
  measureText(text:string){return {width:Math.max(1,text.length*9)} as TextMetrics;} strokeText(){} fillText(){}
  getImageData(){return {data:new Uint8ClampedArray(4),width:1,height:1} as ImageData;} putImageData(){}
}
class FakeCanvas{
  context=new FakeContext2D();
  constructor(public width:number,public height:number){}
  getContext(kind:string){return kind==='2d'?this.context:null;}
}

afterEach(()=>vi.unstubAllGlobals());

describe('creative runtime acceptance',()=>{
  it('preserves legacy creative behavior and explicit legacy effect clips',()=>{
    const project=createProject('legacy');
    const textTrack=makeTrack('text','Text');
    const effectTrack=makeTrack('effect','Legacy effect');
    const text=makeClip('text',textTrack.id,0,1200,'Legacy');text.id='legacy-text';text.style={entrance:'Fade'};
    const legacyEffect=makeClip('effect',effectTrack.id,0,1200,'Legacy FX');legacyEffect.id='legacy-effect';
    project.tracks=[textTrack,effectTrack];project.clips=[text,legacyEffect];project.duration=1200;
    const raw=structuredClone(project) as unknown as Record<string,unknown>;
    raw.schemaVersion=2;delete raw.dependencies;delete raw.masterEffects;delete raw.transitions;
    const migrated=validateProject(raw);
    expect(migrated.clips.find(clip=>clip.id==='legacy-effect')?.kind).toBe('effect');
    const migratedText=migrated.clips.find(clip=>clip.id==='legacy-text')!;
    expect(resolveAnimationRoles(migrated,migratedText,migratedText.start+100,'preview-high').sources.intro).toBe('legacy');
  });

  it('keeps legacy glow, brightness, and VHS instances resolvable and in render order',()=>{
    const project=createProject('legacy built-in effects');
    const track=makeTrack('text','Text');
    const clip=makeClip('text',track.id,0,1000,'Legacy');clip.id='legacy-text';
    clip.effects=[
      {id:'old-glow',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,params:{radius:12,intensity:.4},keyframes:{}},
      {id:'old-brightness',assetId:'builtin.effect.brightness',version:'1.0.0',enabled:true,params:{amount:1.1},keyframes:{}},
      {id:'old-vhs',assetId:'builtin.effect.vhs',version:'1.0.0',enabled:true,params:{scanlines:.3,noise:.15,jitter:.1},keyframes:{}},
    ];
    project.tracks=[track];project.clips=[clip];project.duration=1000;
    for(const instance of clip.effects)expect(creativeRegistry.resolve('effect',instance.assetId,instance.version)?.runtime).toBeTruthy();
    expect(resolveCreativeFrame(project,500,'preview-high').operationOrder).toEqual([
      'clip:source:legacy-text','clip:effect:old-glow','clip:effect:old-brightness','clip:effect:old-vhs','scene:composite',
    ]);
    expect(new Renderer().recordFrame(project,500,{quality:'preview-high'}).plan.diagnostics).toEqual([]);
  });

  it('keeps requested transition duration while exposing the clamped render duration',()=>{
    const project=createProject('short transition');
    const track=makeTrack('text','Text');
    const a=makeClip('text',track.id,0,300,'A');a.id='a';
    const b=makeClip('text',track.id,300,600,'B');b.id='b';
    project.tracks=[track];project.clips=[a,b];project.duration=600;
    const tr=transition('a','b',2000);project.transitions=[tr];
    const resolved=resolveTransition(project,tr,300,'export');
    expect(tr.durationMs).toBe(2000);
    expect(resolved.window?.effectiveDurationMs).toBeLessThan(2000);
    expect(resolved.window?.effectiveDurationMs).toBe(600);
  });

  it('never retargets a transition when a new clip becomes adjacent',()=>{
    const {project,track,transition:tr}=twoClipProject();
    expect(isValidTransitionPair(project,tr).valid).toBe(true);
    const inserted=makeClip('text',track.id,1000,1100,'Inserted');inserted.id='inserted';
    project.clips.push(inserted);
    expect(isValidTransitionPair(project,tr).valid).toBe(false);
    expect(tr.outgoingItemId).toBe('a');
    expect(tr.incomingItemId).toBe('b');
  });

  it('accepts a 1 ms cut tolerance and rejects a 2 ms gap',()=>{
    expect(isValidTransitionPair(twoClipProject(1).project,twoClipProject(1).transition).valid).toBe(true);
    const two=twoClipProject(2);
    expect(isValidTransitionPair(two.project,two.transition).valid).toBe(false);
  });

  it('keeps clip effects ordered and master effects last',()=>{
    const project=createProject('effect order');
    const track=makeTrack('text','Text');
    const clip=makeClip('text',track.id,0,1000,'A');clip.id='clip';
    clip.effects=[effect('builtin.effect.brightness','clip-bright',{amount:1.2}),effect('builtin.effect.contrast','clip-contrast',{amount:1.2}),effect('builtin.effect.saturation','clip-saturation',{amount:1.2})];
    project.tracks=[track];project.clips=[clip];project.duration=1000;
    project.masterEffects=[effect('builtin.effect.hue-shift','master-hue',{degrees:12}),effect('builtin.effect.blur','master-blur',{radius:2})];
    expect(resolveCreativeFrame(project,500,'preview-high').operationOrder).toEqual([
      'clip:source:clip','clip:effect:clip-bright','clip:effect:clip-contrast','clip:effect:clip-saturation','scene:composite','master:effect:master-hue','master:effect:master-blur',
    ]);
  });

  it('duplicates effects independently and keeps explicit registry versions exact',()=>{
    const store=new EditorStore();
    const clip=store.add('text',0,'Hello');
    const first=store.addClipEffect(clip.id,'builtin.effect.glow','1.0.0')!;
    store.patchClipEffect(clip.id,first.id,{params:{radius:18,intensity:.3}});
    const copy=store.duplicateClipEffect(clip.id,first.id)!;
    store.patchClipEffect(clip.id,first.id,{params:{radius:18,intensity:.8}});
    const saved=store.project.clips.find(item=>item.id===clip.id)!;
    expect(copy.id).not.toBe(first.id);
    expect(saved.effects.find(item=>item.id===copy.id)?.params.intensity).toBe(.3);
    expect(saved.effects.find(item=>item.id===first.id)?.params.intensity).toBe(.8);
    expect(creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')?.version).toBe('1.0.0');
    expect(creativeRegistry.resolve('effect','builtin.effect.glow','9.9.9')).toBeNull();
    expect(creativeRegistry.definitions.every(definition=>/^\d+\.\d+\.\d+$/.test(definition.version))).toBe(true);
  });

  it('preserves missing creative references instead of mutating project data',()=>{
    const project=createProject('missing ref');
    const track=makeTrack('text','Text');
    const clip=makeClip('text',track.id,0,1000,'A');clip.id='clip';
    clip.effects=[{id:'future-fx',assetId:'catalog.effect.future',version:'7.0.0',enabled:true,params:{amount:.5},keyframes:{}}];
    project.tracks=[track];project.clips=[clip];project.duration=1000;
    const before=structuredClone(project);
    const diagnostics=validateCreativeProject(project);
    expect(diagnostics.some(item=>item.kind==='missing'&&item.instanceId==='future-fx')).toBe(true);
    expect(project).toEqual(before);
    expect(project.clips[0].effects[0].assetId).toBe('catalog.effect.future');
  });

  it('keeps preview quality modes distinct and always forces full export quality',()=>{
    const {project}=twoClipProject();
    const renderer=new Renderer();
    expect(renderer.recordFrame(project,500,{quality:'preview-low'}).plan.quality).toBe('preview-low');
    expect(renderer.recordFrame(project,500,{quality:'preview-high'}).plan.quality).toBe('preview-high');
    expect(renderer.recordFrame(project,500,{quality:'preview-low',export:true}).plan.quality).toBe('export');
  });

  it('keeps procedural effects deterministic',()=>{
    const seeds=[0,1,17,12345,987654];
    expect(seeds.map(hashNoise)).toEqual(seeds.map(hashNoise));
    expect(new Set(seeds.map(hashNoise)).size).toBe(seeds.length);
  });

  it('deduplicates runtime failures and resets only the edited instance quarantine',()=>{
    const project=createProject('quarantine');
    const track=makeTrack('text','Text');
    const clip=makeClip('text',track.id,0,1000,'A');clip.id='clip';
    clip.effects=[effect('builtin.effect.brightness','fx',{amount:1.2})];
    project.tracks=[track];project.clips=[clip];project.duration=1000;
    const renderer=new Renderer();
    const internals=renderer as unknown as {
      syncSignatures:(project:Project)=>void;
      runtimeFailure:(instanceId:string,assetId:string,error:unknown)=>void;
      quarantine:Set<string>;
      creativeDiagnostics:{instanceId:string}[];
    };
    internals.syncSignatures(project);
    internals.runtimeFailure('fx','builtin.effect.brightness',new Error('boom'));
    internals.runtimeFailure('fx','builtin.effect.brightness',new Error('boom'));
    expect(internals.quarantine.has('fx')).toBe(true);
    expect(renderer.creativeDiagnostics.filter(item=>item.instanceId==='fx')).toHaveLength(1);
    const edited=structuredClone(project);
    edited.clips[0].effects[0].params.amount=1.4;
    internals.syncSignatures(edited);
    expect(internals.quarantine.has('fx')).toBe(false);
    expect(renderer.creativeDiagnostics.some(item=>item.instanceId==='fx')).toBe(false);
  });

  it('stabilizes render-surface allocation across repeated Low and High frame passes',()=>{
    vi.stubGlobal('OffscreenCanvas',FakeCanvas);
    const project=createProject('surface smoke');
    project.background={...project.background,type:'solid'};
    const track=makeTrack('text','Text');
    project.tracks=[track];project.clips=[];project.duration=30000;
    for(let index=0;index<30;index++){
      const clip=makeClip('text',track.id,index*1000,(index+1)*1000,`Line ${index}`);clip.id=`clip-${index}`;
      clip.effects=[effect('builtin.effect.brightness',`bright-${index}`,{amount:1.2}),effect('builtin.effect.contrast',`contrast-${index}`,{amount:1.15}),effect('builtin.effect.saturation',`saturation-${index}`,{amount:1.1})];
      project.clips.push(clip);
    }
    project.masterEffects=[effect('builtin.effect.hue-shift','master-hue',{degrees:8}),effect('builtin.effect.blur','master-blur',{radius:2})];
    const root=new FakeCanvas(project.width,project.height) as unknown as HTMLCanvasElement;
    const renderer=new Renderer();
    const pool=(renderer as unknown as {surfaces:{stats:()=>{count:number}}}).surfaces;
    const times=project.clips.map(clip=>clip.start+500);
    for(const quality of ['preview-low','preview-high'] as const)for(const time of times)renderer.draw(root,project,time,{quality});
    const allocated=pool.stats().count;
    expect(allocated).toBeGreaterThan(0);
    for(const quality of ['preview-low','preview-high'] as const)for(const time of times)renderer.draw(root,project,time,{quality});
    expect(pool.stats().count).toBe(allocated);
    expect(renderer.creativeDiagnostics).toEqual([]);
    renderer.dispose();
  });
});
