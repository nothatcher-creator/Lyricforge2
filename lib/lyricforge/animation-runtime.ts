import type {AnimationInstance,AnimationRole,AssetParamValue} from './creative-assets';
import type {Clip,Project,Style} from './model';
import {clamp,effectiveStyle} from './model';
import {animationState,ease} from './animation';
import {creativeRegistry,type CreativeQuality, type CreativeDefinition} from './creative-registry';
import {evaluateParamKeyframes} from './creative-keyframes';

export interface AnimationRenderState{
  x:number;y:number;scaleX:number;scaleY:number;rotation:number;alpha:number;
  blur:number;reveal:number;tracking:number;colorShift:number;glow:number;
}
export const IDENTITY_ANIMATION:AnimationRenderState={x:0,y:0,scaleX:1,scaleY:1,rotation:0,alpha:1,blur:0,reveal:1,tracking:0,colorShift:0,glow:0};
export type AnimationSource='canonical'|'legacy'|'none';
export interface AnimationResolution{state:AnimationRenderState;sources:Record<AnimationRole,AnimationSource>}

const n=(params:Record<string,AssetParamValue>,key:string,fallback=0)=>typeof params[key]==='number'?params[key] as number:fallback;
const direction=(params:Record<string,AssetParamValue>)=>params.direction==='reverse'?-1:1;

function compose(a:AnimationRenderState,b:AnimationRenderState):AnimationRenderState{
  return {
    x:a.x+b.x,y:a.y+b.y,scaleX:a.scaleX*b.scaleX,scaleY:a.scaleY*b.scaleY,
    rotation:a.rotation+b.rotation,alpha:a.alpha*b.alpha,blur:a.blur+b.blur,
    reveal:Math.min(a.reveal,b.reveal),tracking:a.tracking+b.tracking,
    colorShift:a.colorShift+b.colorShift,glow:a.glow+b.glow,
  };
}

function fromLegacy(value:ReturnType<typeof animationState>):AnimationRenderState{
  return {...IDENTITY_ANIMATION,x:value.x,y:value.y,scaleX:value.scaleX,scaleY:value.scaleY,rotation:value.rotation,alpha:value.alpha,blur:value.blur,reveal:value.reveal};
}

function roleWindow(clip:Clip,role:AnimationRole,timeMs:number,params:Record<string,AssetParamValue>){
  const duration=Math.max(1,n(params,'durationMs',350));
  const delay=Math.max(0,n(params,'delayMs',0));
  if(role==='intro'){
    const start=clip.start+delay;
    return {duration,roleTime:clamp(timeMs-start,0,duration),visibility:ease((timeMs-start)/duration,'ease-out')};
  }
  if(role==='outro'){
    const start=clip.end-duration;
    return {duration,roleTime:clamp(timeMs-start,0,duration),visibility:ease((clip.end-timeMs)/duration,'ease-out')};
  }
  return {duration:Math.max(1,n(params,'periodMs',1200)),roleTime:Math.max(0,timeMs-clip.start),visibility:1};
}

export function animationRoleTime(clip:Clip,role:AnimationRole,timeMs:number,params:Record<string,AssetParamValue>){
  return Math.round(roleWindow(clip,role,timeMs,params).roleTime);
}

function evaluatedParams(def:CreativeDefinition,instance:AnimationInstance,roleTime:number){
  const params=creativeRegistry.normalizeParams(def,instance.params);
  const out={...params};
  for(const [key,paramDef] of Object.entries(def.params)){
    const frames=instance.keyframes[key]??[];
    if(frames.length)out[key]=evaluateParamKeyframes(params[key],frames,roleTime,paramDef);
  }
  return out;
}

function audioReactive(project:Project,timeMs:number){
  if(!project.energy.length)return 0;
  const index=clamp(Math.floor(timeMs/20),0,project.energy.length-1);
  return clamp((project.energy[index]??0)*8,0,1);
}

function canonicalState(project:Project,clip:Clip,timeMs:number,role:AnimationRole,instance:AnimationInstance,quality:CreativeQuality):AnimationRenderState{
  if(!instance.enabled)return IDENTITY_ANIMATION;
  const def=creativeRegistry.resolve('text-animation',instance.assetId,instance.version);
  if(!def||!def.roles?.includes(role)||!def.targets.includes(clip.kind as never)||def.quality[quality]==='bypass')return IDENTITY_ANIMATION;
  const normalized=creativeRegistry.normalizeParams(def,instance.params);
  const initialWindow=roleWindow(clip,role,timeMs,normalized);
  const params=evaluatedParams(def,instance,initialWindow.roleTime);
  const window=roleWindow(clip,role,timeMs,params);
  const p=window.visibility;
  const intensity=n(params,'intensity',.5);
  const dir=direction(params)*(role==='outro'?-1:1);
  const state={...IDENTITY_ANIMATION};
  const phase=window.roleTime/Math.max(1,n(params,'periodMs',window.duration))*Math.PI*2;
  switch(def.runtime){
    case 'animation.fade': state.alpha=p; break;
    case 'animation.slide': state.x=(1-p)*160*intensity*dir; state.alpha=p; break;
    case 'animation.blur': state.blur=(1-p)*n(params,'radius',24)*Math.max(.25,intensity); state.alpha=p; break;
    case 'animation.scale-punch': {const s=.72+.28*p+Math.sin(p*Math.PI)*.18*intensity;state.scaleX=state.scaleY=s;state.alpha=p;break;}
    case 'animation.tracking': state.tracking=(1-p)*n(params,'amount',28)*dir; state.alpha=p; break;
    case 'animation.word-pop': case 'animation.character-cascade': state.reveal=p; state.scaleX=state.scaleY=.9+.1*p; state.alpha=p; break;
    case 'animation.spin': state.rotation=(1-p)*Math.PI*.8*intensity*dir; state.alpha=p; break;
    case 'animation.tilt-3d': state.rotation=(1-p)*.22*intensity*dir; state.scaleX=1-(1-p)*.12*intensity; state.alpha=p; break;
    case 'animation.wipe-reveal': case 'animation.pixel-dissolve': state.reveal=p; state.alpha=p; break;
    case 'animation.glitch-reveal': state.reveal=p; state.alpha=p; state.x=(1-p)*Math.sin(timeMs*.071)*18*intensity; state.colorShift=(1-p)*12*intensity; break;
    case 'animation.pulse': {const s=1+Math.sin(phase)*.07*intensity;state.scaleX=state.scaleY=s;break;}
    case 'animation.float': state.y=Math.sin(phase)*32*intensity; break;
    case 'animation.bounce': state.y=-Math.abs(Math.sin(phase))*36*intensity; break;
    case 'animation.shake': state.x=Math.sin(phase*7)*12*intensity;state.y=Math.cos(phase*9)*8*intensity;break;
    case 'animation.wave': state.rotation=Math.sin(phase)*.08*intensity;state.y=Math.sin(phase*1.3)*12*intensity;break;
    case 'animation.neon-flicker': state.alpha=.65+Math.abs(Math.sin(phase*3.7))*.35;state.glow=(10+Math.abs(Math.sin(phase*2.3))*28)*intensity;break;
    case 'animation.breathing-glow': state.glow=((Math.sin(phase)+1)/2)*n(params,'radius',24)*intensity;break;
    case 'animation.rgb-drift': state.colorShift=Math.sin(phase)*n(params,'amount',6)*intensity;break;
    case 'animation.sway-3d': state.rotation=Math.sin(phase)*.12*intensity;state.x=Math.cos(phase)*8*intensity;break;
    case 'animation.beat-pulse': {const beat=audioReactive(project,timeMs)*n(params,'sensitivity',1);const s=1+beat*.14*intensity;state.scaleX=state.scaleY=s;break;}
  }
  return state;
}

function legacyState(style:Style,clip:Clip,timeMs:number,role:AnimationRole):AnimationRenderState{
  const duration=Math.max(10,style.animationDuration);
  if(role==='intro'){
    const progress=ease((timeMs-clip.start-style.delay)/duration,style.easing);
    return fromLegacy(animationState(style.entrance,progress,(timeMs-clip.start)/1000,style.intensity,style.direction));
  }
  if(role==='outro'){
    const progress=ease((clip.end-timeMs)/duration,style.easing);
    return fromLegacy(animationState(style.exit,progress,(clip.end-timeMs)/1000,style.intensity,-style.direction));
  }
  return fromLegacy(animationState(style.idle,1,timeMs/1000,style.intensity,style.direction,true));
}

export function resolveAnimationRoles(project:Project,clip:Clip,timeMs:number,quality:CreativeQuality):AnimationResolution{
  if(clip.kind!=='text'&&clip.kind!=='lyrics')return {state:IDENTITY_ANIMATION,sources:{intro:'none',loop:'none',outro:'none'}};
  const style=effectiveStyle(project,clip);
  let state={...IDENTITY_ANIMATION};
  const sources={} as Record<AnimationRole,AnimationSource>;
  for(const role of ['intro','loop','outro'] as const){
    const instance=clip.animations?.[role];
    if(instance){sources[role]='canonical';state=compose(state,canonicalState(project,clip,timeMs,role,instance,quality));}
    else {sources[role]='legacy';state=compose(state,legacyState(style,clip,timeMs,role));}
  }
  return {state,sources};
}
