import type {AssetParamValue,EffectInstance} from './creative-assets';
import {evaluateParamKeyframes} from './creative-keyframes';
import {creativeRegistry,type CreativeQuality,type CreativeTarget,type ParamDefinition} from './creative-registry';

export interface CreativeDiagnostic{
  kind:'missing'|'incompatible'|'runtime'|'invalid-transition';
  instanceId:string;
  assetId?:string;
  message:string;
}

export interface EffectResolveContext{
  scope:'clip'|'master';
  targetKind:CreativeTarget;
  timeMs:number;
  scopeStartMs:number;
  scopeDurationMs:number;
  quality:CreativeQuality;
  audioReactive:number;
}

export interface ResolvedEffect{
  instanceId:string;
  assetId:string;
  version:string;
  runtime:string;
  params:Record<string,AssetParamValue>;
  quality:'full'|'simplified';
  scope:'clip'|'master';
  audioReactive:number;
}

export interface EffectStackResolution{
  effects:ResolvedEffect[];
  diagnostics:CreativeDiagnostic[];
}

function effectTime(context:EffectResolveContext){
  return Math.max(0,Math.round(context.scope==='clip'?context.timeMs-context.scopeStartMs:context.timeMs));
}

function isNeutral(definitions:Record<string,ParamDefinition>,keys:readonly string[]|undefined,params:Record<string,AssetParamValue>){
  if(!keys?.length)return false;
  return keys.every(key=>{
    const definition=definitions[key];
    if(!definition||definition.neutral===undefined)return false;
    return params[key]===definition.neutral;
  });
}

export function resolveEffectStack(stack:readonly EffectInstance[],context:EffectResolveContext):EffectStackResolution{
  const effects:ResolvedEffect[]=[];
  const diagnostics:CreativeDiagnostic[]=[];
  const target:CreativeTarget=context.scope==='master'?'master':context.targetKind;
  const timeMs=effectTime(context);

  for(const instance of stack){
    if(!instance.enabled)continue;
    const definition=creativeRegistry.resolve('effect',instance.assetId,instance.version);
    if(!definition){
      diagnostics.push({kind:'missing',instanceId:instance.id,assetId:instance.assetId,message:`Missing creative effect ${instance.assetId}@${instance.version}.`});
      continue;
    }
    if(!definition.targets.includes(target)){
      diagnostics.push({kind:'incompatible',instanceId:instance.id,assetId:instance.assetId,message:`${definition.name} does not support ${target} effects.`});
      continue;
    }
    const behavior=definition.quality[context.quality];
    if(behavior==='bypass')continue;

    const params=creativeRegistry.normalizeParams(definition,instance.params);
    for(const [key,paramDefinition] of Object.entries(definition.params)){
      const frames=instance.keyframes[key]??[];
      if(paramDefinition.keyframeable&&frames.length){
        params[key]=evaluateParamKeyframes(params[key],frames,timeMs,paramDefinition);
      }
    }
    if(isNeutral(definition.params,definition.bypassWhenNeutral,params))continue;

    effects.push({
      instanceId:instance.id,
      assetId:instance.assetId,
      version:instance.version,
      runtime:definition.runtime,
      params,
      quality:behavior,
      scope:context.scope,
      audioReactive:Math.max(0,Math.min(1,Number.isFinite(context.audioReactive)?context.audioReactive:0)),
    });
  }

  return {effects,diagnostics};
}
