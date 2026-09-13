import type {AnimationResolution} from './animation-runtime';
import {resolveAnimationRoles} from './animation-runtime';
import type {TransitionInstance} from './creative-assets';
import {creativeRegistry,type CreativeQuality,type CreativeTarget} from './creative-registry';
import {resolveEffectStack,type CreativeDiagnostic,type EffectStackResolution} from './effect-runtime';
import {clamp,type Clip,type Project} from './model';
import {isValidTransitionPair,resolveTransition,type TransitionResolution} from './transition-runtime';

const VISUAL_KINDS=new Set(['lyrics','text','image','video','visualizer']);

export interface CreativeClipFrame{
  clip:Clip;
  sampleTimeMs:number;
  animation:AnimationResolution;
  effects:EffectStackResolution;
}

export interface CreativeTransitionFrame{
  instance:TransitionInstance;
  resolution:TransitionResolution;
  outgoing:CreativeClipFrame;
  incoming:CreativeClipFrame;
}

export interface CreativeFramePlan{
  quality:CreativeQuality;
  timeMs:number;
  clips:CreativeClipFrame[];
  transitions:CreativeTransitionFrame[];
  masterEffects:EffectStackResolution;
  diagnostics:CreativeDiagnostic[];
  operationOrder:string[];
  consumedClipIds:string[];
}

function audioReactive(project:Project,timeMs:number){
  if(!project.energy.length)return 0;
  const index=clamp(Math.floor(timeMs/20),0,project.energy.length-1);
  return clamp((project.energy[index]??0)*8,0,1);
}

function emptyAnimation():AnimationResolution{
  return {state:{x:0,y:0,scaleX:1,scaleY:1,rotation:0,alpha:1,blur:0,reveal:1,tracking:0,colorShift:0,glow:0},sources:{intro:'none',loop:'none',outro:'none'}};
}

function resolveClip(project:Project,clip:Clip,sampleTimeMs:number,quality:CreativeQuality):CreativeClipFrame{
  const animation=clip.kind==='text'||clip.kind==='lyrics'?resolveAnimationRoles(project,clip,sampleTimeMs,quality):emptyAnimation();
  const effects=VISUAL_KINDS.has(clip.kind)?resolveEffectStack(clip.effects??[],{
    scope:'clip',
    targetKind:clip.kind as CreativeTarget,
    timeMs:sampleTimeMs,
    scopeStartMs:clip.start,
    scopeDurationMs:Math.max(1,clip.end-clip.start),
    quality,
    audioReactive:audioReactive(project,sampleTimeMs),
  }):{effects:[],diagnostics:[]};
  return {clip,sampleTimeMs,animation,effects};
}

function visible(project:Project,clip:Clip){return project.tracks.find(track=>track.id===clip.trackId)?.visible!==false;}

export function resolveCreativeFrame(project:Project,timeMs:number,quality:CreativeQuality):CreativeFramePlan{
  const diagnostics:CreativeDiagnostic[]=[];
  const transitions:CreativeTransitionFrame[]=[];
  const consumed=new Set<string>();

  for(const instance of project.transitions??[]){
    const resolution=resolveTransition(project,instance,timeMs,quality);
    diagnostics.push(...resolution.diagnostics);
    if(!resolution.active||resolution.hardCut||!resolution.sampleTimes)continue;
    const outgoing=project.clips.find(clip=>clip.id===instance.outgoingItemId);
    const incoming=project.clips.find(clip=>clip.id===instance.incomingItemId);
    if(!outgoing||!incoming||!visible(project,outgoing)||!visible(project,incoming))continue;
    const outgoingFrame=resolveClip(project,outgoing,resolution.sampleTimes.outgoingMs,quality);
    const incomingFrame=resolveClip(project,incoming,resolution.sampleTimes.incomingMs,quality);
    diagnostics.push(...outgoingFrame.effects.diagnostics,...incomingFrame.effects.diagnostics);
    transitions.push({instance,resolution,outgoing:outgoingFrame,incoming:incomingFrame});
    consumed.add(outgoing.id);consumed.add(incoming.id);
  }

  const clips=project.clips
    .filter(clip=>visible(project,clip)&&clip.kind!=='audio'&&clip.start<=timeMs&&clip.end>timeMs&&!consumed.has(clip.id))
    .map(clip=>resolveClip(project,clip,timeMs,quality));
  for(const clip of clips)diagnostics.push(...clip.effects.diagnostics);

  const masterEffects=resolveEffectStack(project.masterEffects??[],{
    scope:'master',targetKind:'master',timeMs,scopeStartMs:0,scopeDurationMs:Math.max(1,project.duration),quality,audioReactive:audioReactive(project,timeMs),
  });
  diagnostics.push(...masterEffects.diagnostics);

  const operationOrder:string[]=[];
  for(const clip of clips){
    operationOrder.push(`clip:source:${clip.clip.id}`);
    for(const effect of clip.effects.effects)operationOrder.push(`clip:effect:${effect.instanceId}`);
  }
  for(const transition of transitions){
    operationOrder.push(`clip:source:${transition.outgoing.clip.id}`);
    for(const effect of transition.outgoing.effects.effects)operationOrder.push(`clip:effect:${effect.instanceId}`);
    operationOrder.push(`transition:${transition.instance.id}`);
  }
  operationOrder.push('scene:composite');
  for(const effect of masterEffects.effects)operationOrder.push(`master:effect:${effect.instanceId}`);

  return {quality,timeMs,clips,transitions,masterEffects,diagnostics,operationOrder,consumedClipIds:[...consumed]};
}

export function validateCreativeProject(project:Project):CreativeDiagnostic[]{
  const diagnostics:CreativeDiagnostic[]=[];
  for(const clip of project.clips){
    if(VISUAL_KINDS.has(clip.kind)){
      const effects=resolveEffectStack(clip.effects??[],{scope:'clip',targetKind:clip.kind as CreativeTarget,timeMs:clip.start,scopeStartMs:clip.start,scopeDurationMs:Math.max(1,clip.end-clip.start),quality:'export',audioReactive:0});
      diagnostics.push(...effects.diagnostics);
    }
    if(clip.kind==='text'||clip.kind==='lyrics')for(const role of ['intro','loop','outro'] as const){
      const instance=clip.animations?.[role];if(!instance?.enabled)continue;
      const definition=creativeRegistry.resolve('text-animation',instance.assetId,instance.version);
      if(!definition)diagnostics.push({kind:'missing',instanceId:`${clip.id}:${role}`,assetId:instance.assetId,message:`Missing creative animation ${instance.assetId}@${instance.version}.`});
      else if(!definition.roles?.includes(role)||!definition.targets.includes(clip.kind))diagnostics.push({kind:'incompatible',instanceId:`${clip.id}:${role}`,assetId:instance.assetId,message:`${definition.name} does not support ${role} on ${clip.kind}.`});
    }
  }
  diagnostics.push(...resolveEffectStack(project.masterEffects??[],{scope:'master',targetKind:'master',timeMs:0,scopeStartMs:0,scopeDurationMs:Math.max(1,project.duration),quality:'export',audioReactive:0}).diagnostics);
  for(const instance of project.transitions??[]){
    const pair=isValidTransitionPair(project,instance);
    if(!pair.valid){if(pair.diagnostic)diagnostics.push(pair.diagnostic);continue;}
    const definition=creativeRegistry.resolve('transition',instance.assetId,instance.version);
    if(!definition){diagnostics.push({kind:'missing',instanceId:instance.id,assetId:instance.assetId,message:`Missing creative transition ${instance.assetId}@${instance.version}.`});continue;}
    if(!pair.outgoing||!pair.incoming||!definition.targets.includes(pair.outgoing.kind as CreativeTarget)||!definition.targets.includes(pair.incoming.kind as CreativeTarget))diagnostics.push({kind:'incompatible',instanceId:instance.id,assetId:instance.assetId,message:`${definition.name} does not support this transition pair.`});
  }
  return diagnostics;
}
