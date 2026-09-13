import type {AssetParamValue,TransitionInstance} from './creative-assets';
import {creativeRegistry,type CreativeQuality} from './creative-registry';
import type {CreativeDiagnostic} from './effect-runtime';
import {ease} from './animation';
import {clamp,type Clip,type Project} from './model';

export const TRANSITION_KINDS=['lyrics','text','image','video','visualizer'] as const;
export type TransitionKind=(typeof TRANSITION_KINDS)[number];

export interface TransitionPairResult{
  valid:boolean;
  outgoing?:Clip;
  incoming?:Clip;
  cutMs?:number;
  diagnostic?:CreativeDiagnostic;
}

export interface TransitionWindow{
  cutMs:number;
  startMs:number;
  endMs:number;
  effectiveDurationMs:number;
  outgoing:Clip;
  incoming:Clip;
}

export interface TransitionResolution{
  active:boolean;
  hardCut:boolean;
  progress:number;
  runtime?:string;
  params:Record<string,AssetParamValue>;
  quality?:'full'|'simplified';
  window?:TransitionWindow;
  sampleTimes?:{outgoingMs:number;incomingMs:number};
  diagnostics:CreativeDiagnostic[];
}

function isTransitionKind(kind:Clip['kind']):kind is TransitionKind{
  return (TRANSITION_KINDS as readonly string[]).includes(kind);
}

function invalid(instance:TransitionInstance,message:string):TransitionPairResult{
  return {valid:false,diagnostic:{kind:'invalid-transition',instanceId:instance.id,assetId:instance.assetId,message}};
}

export function isValidTransitionPair(project:Project,instance:TransitionInstance):TransitionPairResult{
  const outgoing=project.clips.find(c=>c.id===instance.outgoingItemId);
  const incoming=project.clips.find(c=>c.id===instance.incomingItemId);
  if(!outgoing||!incoming)return invalid(instance,'Transition source or target clip is missing.');
  if(!isTransitionKind(outgoing.kind)||!isTransitionKind(incoming.kind))return invalid(instance,'Transitions support visual clips only.');
  if(outgoing.trackId!==incoming.trackId)return invalid(instance,'Transition clips must be on the same track.');

  const ordered=project.clips
    .map((clip,index)=>({clip,index}))
    .filter(entry=>entry.clip.trackId===outgoing.trackId&&isTransitionKind(entry.clip.kind))
    .sort((a,b)=>a.clip.start-b.clip.start||a.clip.end-b.clip.end||a.index-b.index);
  const outgoingIndex=ordered.findIndex(entry=>entry.clip.id===outgoing.id);
  if(outgoingIndex<0||ordered[outgoingIndex+1]?.clip.id!==incoming.id)return invalid(instance,'Transition clips are no longer adjacent.');

  const gap=incoming.start-outgoing.end;
  if(gap<0||gap>1)return invalid(instance,'Transition clips must touch at the cut.');
  return {valid:true,outgoing,incoming,cutMs:outgoing.end};
}

function decodedVideoAvailable(project:Project,clip:Clip,availableMs:number){
  if(clip.kind!=='video'||clip.loop)return availableMs;
  const asset=project.assets.find(a=>a.id===clip.assetId&&a.type==='video');
  if(!asset||asset.duration===undefined||!Number.isFinite(asset.duration))return availableMs;
  return Math.min(availableMs,Math.max(0,asset.duration-clip.offset));
}

export function transitionWindow(project:Project,instance:TransitionInstance):TransitionWindow|null{
  const pair=isValidTransitionPair(project,instance);
  if(!pair.valid||!pair.outgoing||!pair.incoming||pair.cutMs===undefined)return null;
  const {outgoing,incoming,cutMs}=pair;
  const outgoingAvailable=decodedVideoAvailable(project,outgoing,Math.max(0,cutMs-outgoing.start));
  const incomingAvailable=decodedVideoAvailable(project,incoming,Math.max(0,incoming.end-cutMs));
  const effectiveDurationMs=Math.max(0,Math.min(
    Math.max(0,instance.durationMs),
    2*outgoingAvailable,
    2*incomingAvailable,
  ));
  if(effectiveDurationMs<=0)return null;
  return {
    cutMs,
    startMs:cutMs-effectiveDurationMs/2,
    endMs:cutMs+effectiveDurationMs/2,
    effectiveDurationMs,
    outgoing,
    incoming,
  };
}

export function transitionSampleTimes(project:Project,instance:TransitionInstance,timeMs:number,window=transitionWindow(project,instance)){
  if(!window)throw new Error('Cannot sample an invalid transition.');
  const outgoingMs=clamp(Math.min(timeMs,window.cutMs-1),window.outgoing.start,window.outgoing.end-1);
  const incomingMs=clamp(Math.max(timeMs,window.cutMs),window.incoming.start,window.incoming.end-1);
  return {outgoingMs,incomingMs};
}

export function transitionProgress(window:TransitionWindow,instance:TransitionInstance,timeMs:number){
  const raw=(timeMs-window.startMs)/Math.max(1,window.effectiveDurationMs);
  return ease(clamp(raw,0,1),instance.easing);
}

export function resolveTransition(project:Project,instance:TransitionInstance,timeMs:number,quality:CreativeQuality):TransitionResolution{
  const diagnostics:CreativeDiagnostic[]=[];
  const pair=isValidTransitionPair(project,instance);
  if(!pair.valid){
    if(pair.diagnostic)diagnostics.push(pair.diagnostic);
    return {active:false,hardCut:true,progress:0,params:{},diagnostics};
  }
  const window=transitionWindow(project,instance);
  if(!window){
    diagnostics.push({kind:'invalid-transition',instanceId:instance.id,assetId:instance.assetId,message:'Transition has no usable overlap duration.'});
    return {active:false,hardCut:true,progress:0,params:{},diagnostics};
  }
  const definition=creativeRegistry.resolve('transition',instance.assetId,instance.version);
  if(!definition){
    diagnostics.push({kind:'missing',instanceId:instance.id,assetId:instance.assetId,message:`Missing creative transition ${instance.assetId}@${instance.version}.`});
    return {active:false,hardCut:true,progress:0,params:{},window,diagnostics};
  }
  if(!definition.targets.includes(window.outgoing.kind as TransitionKind)||!definition.targets.includes(window.incoming.kind as TransitionKind)){
    diagnostics.push({kind:'incompatible',instanceId:instance.id,assetId:instance.assetId,message:`${definition.name} does not support this transition pair.`});
    return {active:false,hardCut:true,progress:0,params:{},window,diagnostics};
  }
  const behavior=definition.quality[quality];
  if(behavior==='bypass')return {active:false,hardCut:true,progress:0,params:{},window,diagnostics};
  const active=timeMs>=window.startMs&&timeMs<=window.endMs;
  const progress=transitionProgress(window,instance,timeMs);
  return {
    active,
    hardCut:false,
    progress,
    runtime:definition.runtime,
    params:creativeRegistry.normalizeParams(definition,instance.params),
    quality:behavior,
    window,
    sampleTimes:active?transitionSampleTimes(project,instance,timeMs,window):undefined,
    diagnostics,
  };
}
