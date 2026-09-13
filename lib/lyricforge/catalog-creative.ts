import type {CatalogAssetManifest} from './catalog-types';
import type {CreativeDefinition,ParamDefinition} from './creative-registry';

const HEX=/^#[0-9a-f]{6}$/i;

function cloneParam(param:ParamDefinition,override:unknown):ParamDefinition{
 if(param.kind==='number'){
  const value=typeof override==='number'&&Number.isFinite(override)?Math.max(param.min,Math.min(param.max,override)):param.default;
  return {...param,default:value};
 }
 if(param.kind==='boolean'){
  return {...param,default:typeof override==='boolean'?override:param.default};
 }
 if(param.kind==='select'){
  const value=typeof override==='string'&&param.options.includes(override)?override:param.default;
  return {...param,options:[...param.options],default:value};
 }
 const value=typeof override==='string'&&HEX.test(override)?override.toLowerCase():param.default;
 return {...param,default:value};
}

export function definitionFromInstalledManifest(manifest:CatalogAssetManifest,trusted:CreativeDefinition):CreativeDefinition{
 if(manifest.type==='font')throw new Error('Font catalog assets do not create creative runtime definitions');
 if(manifest.type!==trusted.type)throw new Error(`Catalog creative type does not match trusted definition: ${manifest.type} vs ${trusted.type}`);
 if(!manifest.runtimeId||manifest.runtimeId!==trusted.runtime)throw new Error(`Catalog creative runtime does not match trusted runtime: ${manifest.runtimeId??'missing'} vs ${trusted.runtime}`);

 const params:Record<string,ParamDefinition>={};
 for(const [name,param] of Object.entries(trusted.params))params[name]=cloneParam(param,manifest.preset?.[name]);

 return {
  id:manifest.id,
  type:trusted.type,
  version:manifest.version,
  name:manifest.name,
  targets:[...trusted.targets],
  ...(trusted.roles?{roles:[...trusted.roles]}:{}),
  runtime:trusted.runtime,
  params,
  quality:{...trusted.quality},
  ...(trusted.bypassWhenNeutral?{bypassWhenNeutral:[...trusted.bypassWhenNeutral]}:{}),
 };
}
