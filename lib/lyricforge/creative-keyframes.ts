import type {AssetParamValue,CreativeKeyframe} from './creative-assets';
import type {ParamDefinition} from './creative-registry';
import {ease} from './animation';

const HEX=/^#[0-9a-f]{6}$/i;

function normalizeValue(value:unknown,definition:ParamDefinition):AssetParamValue{
  if(definition.kind==='number'){
    const raw=typeof value==='number'&&Number.isFinite(value)?value:definition.default;
    return Math.max(definition.min,Math.min(definition.max,raw));
  }
  if(definition.kind==='boolean')return typeof value==='boolean'?value:definition.default;
  if(definition.kind==='select')return typeof value==='string'&&definition.options.includes(value)?value:definition.default;
  return typeof value==='string'&&HEX.test(value)?value.toLowerCase():definition.default.toLowerCase();
}

function mixColor(a:string,b:string,t:number){
  if(!HEX.test(a)||!HEX.test(b))return t<1?a:b;
  return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
}

function canonicalFrames(frames:readonly CreativeKeyframe[]){
  const byTime=new Map<number,CreativeKeyframe>();
  for(const frame of frames){
    const timeMs=Math.max(0,Math.round(Number.isFinite(frame.timeMs)?frame.timeMs:0));
    byTime.set(timeMs,{...frame,timeMs});
  }
  return [...byTime.values()].sort((a,b)=>a.timeMs-b.timeMs);
}

export function evaluateParamKeyframes(baseValue:AssetParamValue,frames:readonly CreativeKeyframe[],timeMs:number,definition:ParamDefinition):AssetParamValue{
  const base=normalizeValue(baseValue,definition);
  const keys=canonicalFrames(frames);
  if(!keys.length)return base;
  const t=Math.max(0,Math.round(Number.isFinite(timeMs)?timeMs:0));
  if(t<=keys[0].timeMs)return normalizeValue(keys[0].value,definition);
  if(t>=keys[keys.length-1].timeMs)return normalizeValue(keys[keys.length-1].value,definition);
  let left=keys[0],right=keys[keys.length-1];
  for(let i=1;i<keys.length;i++)if(keys[i].timeMs>=t){left=keys[i-1];right=keys[i];break;}
  const a=normalizeValue(left.value,definition),b=normalizeValue(right.value,definition);
  if(definition.kind==='number'&&typeof a==='number'&&typeof b==='number'){
    const progress=ease((t-left.timeMs)/Math.max(1,right.timeMs-left.timeMs),right.easing);
    return Math.max(definition.min,Math.min(definition.max,a+(b-a)*progress));
  }
  if(definition.kind==='color'&&definition.interpolation==='color'&&typeof a==='string'&&typeof b==='string'){
    const progress=ease((t-left.timeMs)/Math.max(1,right.timeMs-left.timeMs),right.easing);
    return mixColor(a,b,progress);
  }
  return a;
}
