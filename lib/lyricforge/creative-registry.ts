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

export class CreativeRegistry{
  private readonly byKey=new Map<string,CreativeDefinition[]>();
  readonly definitions:readonly CreativeDefinition[];

  constructor(definitions:readonly CreativeDefinition[]){
    this.definitions=[...definitions];
    for(const def of definitions){
      const key=`${def.type}:${def.id}`;
      const current=this.byKey.get(key)??[];
      current.push(def);
      this.byKey.set(key,current);
    }
  }

  resolve(type:CreativeDefinition['type'],id:string,version:string):CreativeDefinition|null{
    const defs=this.byKey.get(`${type}:${id}`)??[];
    return defs.find(d=>d.version===version)
      ?? defs.find(d=>d.compatibleVersions?.includes(version))
      ?? null;
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
