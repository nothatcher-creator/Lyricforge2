import {strFromU8,strToU8} from 'fflate';
import type {Project} from './model';
import type {CatalogStorage} from './catalog-storage';
import type {CatalogAssetType,ProjectDependency} from './catalog-types';
import {CATALOG_ID} from './catalog-types';
import {collectProjectCatalogDependencies} from './catalog-dependencies';
import {validateCatalogAssetManifest} from './catalog-validation';
import {CatalogInstaller} from './catalog-installer';

export interface CatalogBundleResult{
 project:Project;
 entries:Record<string,Uint8Array>;
}
export interface BundledCatalogRestoreResult{
 restored:ProjectDependency[];
 errors:string[];
}
export interface BundledCatalogRestoreOptions{
 appVersion:string;
 isTrustedRuntime:(type:Exclude<CatalogAssetType,'font'>,runtimeId:string)=>boolean;
}

const SEGMENT=/^[a-z0-9][a-z0-9._-]*$/i;
const VERSION=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
function basePath(type:CatalogAssetType,id:string,version:string){
 if(!SEGMENT.test(id)||!VERSION.test(version))throw new Error(`Unsafe catalog bundle identity: ${type}:${id}@${version}`);
 return `catalog/${type}/${id}/${version}`;
}

export async function bundleCatalogDependencies(project:Project,storage:CatalogStorage):Promise<CatalogBundleResult>{
 const installed=await storage.listVersions();
 const dependencies=collectProjectCatalogDependencies(project,installed);
 const entries:Record<string,Uint8Array>={};
 for(const dependency of dependencies){
  const record=await storage.getVersion(dependency.type,dependency.id,dependency.version);
  if(!record)throw new Error(`Cannot bundle missing catalog dependency: ${dependency.type}:${dependency.id}@${dependency.version}`);
  const cached=await storage.getCachedBytes(record.packageCacheKey);
  if(!cached)throw new Error(`Cannot bundle catalog dependency with missing package bytes: ${dependency.type}:${dependency.id}@${dependency.version}`);
  const base=basePath(dependency.type,dependency.id,dependency.version);
  entries[`${base}/asset.lyricforge-asset`]=new Uint8Array(cached.bytes);
  entries[`${base}/manifest.json`]=strToU8(JSON.stringify(record.manifest));
 }
 return {project:{...project,dependencies},entries};
}

export async function restoreBundledCatalogDependencies(project:Project,archive:Record<string,Uint8Array>,storage:CatalogStorage,options:BundledCatalogRestoreOptions):Promise<BundledCatalogRestoreResult>{
 const restored:ProjectDependency[]=[];
 const errors:string[]=[];
 for(const dependency of project.dependencies){
  if(dependency.id.startsWith('builtin.'))continue;
  try{
   if(await storage.getVersion(dependency.type,dependency.id,dependency.version))continue;
   const base=basePath(dependency.type,dependency.id,dependency.version);
   const packageBytes=archive[`${base}/asset.lyricforge-asset`];
   const manifestBytes=archive[`${base}/manifest.json`];
   if(!packageBytes&&!manifestBytes)continue;
   if(!packageBytes||!manifestBytes)throw new Error('Bundled catalog dependency is incomplete');
   let raw:unknown;
   try{raw=JSON.parse(strFromU8(manifestBytes));}catch{throw new Error('Bundled catalog dependency manifest is invalid JSON');}
   const manifest=validateCatalogAssetManifest(raw);
   if(manifest.type!==dependency.type||manifest.id!==dependency.id||manifest.version!==dependency.version){
    throw new Error('Bundled catalog dependency identity does not match project reference');
   }
   const installer=new CatalogInstaller({
    storage,
    appVersion:options.appVersion,
    isTrustedRuntime:options.isTrustedRuntime,
    fetchBytes:async()=>packageBytes,
    catalogId:dependency.sourceCatalogId??CATALOG_ID,
   });
   await installer.installBytes(manifest,packageBytes,{makeCurrent:false});
   restored.push({...dependency,sourceCatalogId:dependency.sourceCatalogId??CATALOG_ID});
  }catch(error){
   const message=error instanceof Error?error.message:String(error);
   errors.push(`${dependency.type}:${dependency.id}@${dependency.version}: ${message}`);
  }
 }
 return {restored,errors};
}
