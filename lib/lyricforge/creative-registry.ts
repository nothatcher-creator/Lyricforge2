import type {AnimationRole,AssetParamValue} from './creative-assets';
import {BUILTIN_CREATIVE_DEFINITIONS} from './creative-presets';

export type CreativeQuality='preview-low'|'preview-high'|'export';
export type CreativeTarget='lyrics'|'text'|'image'|'video'|'visualizer'|'master';
export type QualityBehavior='full'|'simplified'|'bypass';

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
  quality:{'preview-low':QualityBehavior;'preview-high':QualityBehavior;export:'full'};
  compatibleVersions?:readonly string[];
  bypassWhenNeutral?:readonly string[];
}

const HEX=/^#[0-9a-f]{6}$/i;

function cloneParam(param:ParamDefinition):ParamDefinition{
  return param.kind==='select'?{...param,options:[...param.options]}:{...param};
}

function cloneDefinition(definition:CreativeDefinition,allowCompatibility=true):CreativeDefinition{
  const params:Record<string,ParamDefinition>={};
  for(const [name,param] of Object.entries(definition.params))params[name]=cloneParam(param);
  return {
    id:definition.id,
    type:definition.type,
    version:definition.version,
    name:definition.name,
    targets:[...definition.targets],
    ...(definition.roles?{roles:[...definition.roles]}:{}),
    runtime:definition.runtime,
    params,
    quality:{...definition.quality},
    ...(allowCompatibility&&definition.compatibleVersions?{compatibleVersions:[...definition.compatibleVersions]}:{}),
    ...(definition.bypassWhenNeutral?{bypassWhenNeutral:[...definition.bypassWhenNeutral]}:{}),
  };
}

export class CreativeRegistry{
  private readonly builtins:readonly CreativeDefinition[];
  private installed:readonly CreativeDefinition[]=[];
  private readonly byKey=new Map<string,CreativeDefinition[]>();

  constructor(definitions:readonly CreativeDefinition[]){
    this.builtins=definitions.map(definition=>cloneDefinition(definition));
    this.reindex();
  }

  get definitions():readonly CreativeDefinition[]{return [...this.builtins,...this.installed];}

  private reindex(){
    this.byKey.clear();
    for(const def of [...this.builtins,...this.installed]){
      const key=`${def.type}:${def.id}`;
      const current=this.byKey.get(key)??[];
      current.push(def);
      this.byKey.set(key,current);
    }
  }

  replaceInstalled(definitions:readonly CreativeDefinition[]){
    const seen=new Set<string>();
    const installed:CreativeDefinition[]=[];
    for(const definition of definitions){
      if(this.builtins.some(builtin=>builtin.type===definition.type&&builtin.id===definition.id)){
        throw new Error(`Installed creative definitions cannot replace built-in asset ids: ${definition.type}:${definition.id}`);
      }
      if(!this.builtins.some(builtin=>builtin.type===definition.type&&builtin.runtime===definition.runtime)){
        throw new Error(`Installed creative definition uses an untrusted runtime: ${definition.runtime}`);
      }
      const key=`${definition.type}:${definition.id}@${definition.version}`;
      if(seen.has(key))throw new Error(`Duplicate installed creative definition: ${key}`);
      seen.add(key);
      installed.push(cloneDefinition(definition,false));
    }
    this.installed=installed;
    this.reindex();
  }

  all(type:CreativeDefinition['type']):readonly CreativeDefinition[]{
    return this.definitions.filter(definition=>definition.type===type);
  }

  resolve(type:CreativeDefinition['type'],id:string,version:string):CreativeDefinition|null{
    const defs=this.byKey.get(`${type}:${id}`)??[];
    const exact=defs.find(definition=>definition.version===version);
    if(exact)return exact;
    return this.builtins.find(definition=>definition.type===type&&definition.id===id&&definition.compatibleVersions?.includes(version))??null;
  }

  normalizeParams(definition:CreativeDefinition,raw:Record<string,unknown>|undefined|null):Record<string,AssetParamValue>{
    const source=raw??{};
    const normalized:Record<string,AssetParamValue>={};
    for(const [key,param] of Object.entries(definition.params)){
      const value=source[key];
      if(param.kind==='number'){
        const numberValue=typeof value==='number'&&Number.isFinite(value)?value:param.default;
        normalized[key]=Math.max(param.min,Math.min(param.max,numberValue));
      }else if(param.kind==='boolean'){
        normalized[key]=typeof value==='boolean'?value:param.default;
      }else if(param.kind==='select'){
        normalized[key]=typeof value==='string'&&param.options.includes(value)?value:param.default;
      }else{
        normalized[key]=typeof value==='string'&&HEX.test(value)?value.toLowerCase():param.default.toLowerCase();
      }
    }
    return normalized;
  }
}

export const creativeRegistry=new CreativeRegistry(BUILTIN_CREATIVE_DEFINITIONS);

export function isTrustedRuntime(type:'effect'|'transition'|'text-animation',runtimeId:string):boolean{
  return BUILTIN_CREATIVE_DEFINITIONS.some(definition=>definition.type===type&&definition.runtime===runtimeId);
}
