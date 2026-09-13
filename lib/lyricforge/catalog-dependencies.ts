import type {Project} from './model';
import type {InstalledAssetVersion} from './catalog-types';
import {parseCatalogFontFamily,type CreativeAssetType,type ProjectDependency} from './creative-assets';

export interface ProjectDependencyResolution{
 dependency:ProjectDependency;
 status:'installed'|'missing';
 installed?:InstalledAssetVersion;
}

const refKey=(type:CreativeAssetType,id:string,version:string)=>`${type}:${id}@${version}`;
const isBuiltin=(id:string)=>id.startsWith('builtin.');

function installedByKey(installed:readonly InstalledAssetVersion[]){
 return new Map(installed.map(version=>[refKey(version.type,version.id,version.version),version]));
}

function priorSourceByKey(project:Project){
 return new Map(project.dependencies.map(dependency=>[refKey(dependency.type,dependency.id,dependency.version),dependency.sourceCatalogId]));
}

export function collectProjectCatalogDependencies(project:Project,installed:readonly InstalledAssetVersion[]):ProjectDependency[]{
 const versions=installedByKey(installed);
 const prior=priorSourceByKey(project);
 const refs=new Map<string,ProjectDependency>();

 const add=(type:CreativeAssetType,id:string,version:string)=>{
  if(!id||!version||isBuiltin(id))return;
  const key=refKey(type,id,version);
  if(refs.has(key))return;
  const versionRecord=versions.get(key);
  const sourceCatalogId=versionRecord?.catalogId??prior.get(key);
  refs.set(key,{id,type,version,...(sourceCatalogId?{sourceCatalogId}:{})});
 };

 for(const clip of project.clips){
  if(clip.animations){
   for(const role of ['intro','loop','outro'] as const){
    const animation=clip.animations[role];
    if(animation)add('text-animation',animation.assetId,animation.version);
   }
  }
  for(const effect of clip.effects)add('effect',effect.assetId,effect.version);
  const font=parseCatalogFontFamily(clip.style.font);
  if(font)add('font',font.id,font.version);
 }
 for(const effect of project.masterEffects)add('effect',effect.assetId,effect.version);
 for(const transition of project.transitions)add('transition',transition.assetId,transition.version);
 const lyricFont=parseCatalogFontFamily(project.lyricStyle.font);
 if(lyricFont)add('font',lyricFont.id,lyricFont.version);

 return [...refs.values()].sort((a,b)=>refKey(a.type,a.id,a.version).localeCompare(refKey(b.type,b.id,b.version)));
}

export function resolveProjectDependencies(project:Project,installed:readonly InstalledAssetVersion[]):ProjectDependencyResolution[]{
 const versions=installedByKey(installed);
 return collectProjectCatalogDependencies(project,installed).map(dependency=>{
  const version=versions.get(refKey(dependency.type,dependency.id,dependency.version));
  return version?{dependency,status:'installed' as const,installed:version}:{dependency,status:'missing' as const};
 });
}
