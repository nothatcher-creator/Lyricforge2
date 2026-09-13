import type {CatalogAssetManifest,CatalogAssetType,InstalledAssetVersion} from './catalog-types';
import {CATALOG_ID,catalogVersionKey} from './catalog-types';
import type {CatalogStorage} from './catalog-storage';
import {validateCatalogAssetManifest} from './catalog-validation';
import {isAppVersionCompatible} from './catalog-version';
import {validateCatalogPackage} from './catalog-package';

export interface CatalogInstallerOptions{
 storage:CatalogStorage;
 appVersion:string;
 isTrustedRuntime:(type:Exclude<CatalogAssetType,'font'>,runtimeId:string)=>boolean;
 fetchBytes:(url:string)=>Promise<Uint8Array|ArrayBuffer>;
 catalogId?:string;
 now?:()=>number;
}

export interface CatalogRemoveOptions{force?:boolean;}

const packageCacheKey=(manifest:Pick<CatalogAssetManifest,'type'|'id'|'version'>)=>`package:${catalogVersionKey(manifest.type,manifest.id,manifest.version)}`;

export class CatalogInstaller{
 private readonly storage:CatalogStorage;
 private readonly appVersion:string;
 private readonly trust:CatalogInstallerOptions['isTrustedRuntime'];
 private readonly fetchBytes:CatalogInstallerOptions['fetchBytes'];
 private readonly catalogId:string;
 private readonly now:()=>number;

 constructor(options:CatalogInstallerOptions){
  this.storage=options.storage;
  this.appVersion=options.appVersion;
  this.trust=options.isTrustedRuntime;
  this.fetchBytes=options.fetchBytes;
  this.catalogId=options.catalogId??CATALOG_ID;
  this.now=options.now??(()=>Date.now());
 }

 private assertInstallable(manifest:CatalogAssetManifest){
  if(!isAppVersionCompatible(this.appVersion,manifest)){
   throw new Error(`Catalog asset ${manifest.id}@${manifest.version} is incompatible with LyricForge ${this.appVersion}`);
  }
  if(manifest.type!=='font'){
   if(!manifest.runtimeId||!this.trust(manifest.type,manifest.runtimeId)){
    throw new Error(`Catalog asset ${manifest.id}@${manifest.version} requires an unknown or untrusted runtime`);
   }
  }
 }

 async install(input:CatalogAssetManifest):Promise<InstalledAssetVersion>{
  const manifest=validateCatalogAssetManifest(input);
  this.assertInstallable(manifest);
  const bytesInput=await this.fetchBytes(manifest.package.url);
  const validated=await validateCatalogPackage(bytesInput,manifest);
  const key=packageCacheKey(manifest);
  const record:InstalledAssetVersion={
   id:manifest.id,
   type:manifest.type,
   version:manifest.version,
   catalogId:this.catalogId,
   manifest,
   installedAt:this.now(),
   packageCacheKey:key,
  };

  let cached=false;
  let versionCommitted=false;
  try{
   await this.storage.putCachedBytes(key,validated.bytes,'application/vnd.lyricforge.asset+zip');
   cached=true;
   await this.storage.putVersion(record);
   versionCommitted=true;
   await this.storage.setCurrentVersion(record.type,record.id,record.version);
   return record;
  }catch(error){
   if(cached&&!versionCommitted){
    try{await this.storage.deleteCachedBytes(key);}catch{/* preserve the original install error */}
   }
   throw error;
  }
 }

 async repair(type:CatalogAssetType,id:string,version:string):Promise<InstalledAssetVersion>{
  const record=await this.storage.getVersion(type,id,version);
  if(!record)throw new Error(`Catalog asset version is not installed: ${type}:${id}@${version}`);
  this.assertInstallable(record.manifest);
  const bytesInput=await this.fetchBytes(record.manifest.package.url);
  const validated=await validateCatalogPackage(bytesInput,record.manifest);
  await this.storage.putCachedBytes(record.packageCacheKey,validated.bytes,'application/vnd.lyricforge.asset+zip');
  return record;
 }

 async rollback(type:CatalogAssetType,id:string,version:string):Promise<InstalledAssetVersion>{
  const record=await this.storage.getVersion(type,id,version);
  if(!record)throw new Error(`Catalog asset version is not installed: ${type}:${id}@${version}`);
  this.assertInstallable(record.manifest);
  const cached=await this.storage.getCachedBytes(record.packageCacheKey);
  if(!cached)throw new Error(`Catalog asset version is installed but its package bytes are missing: ${type}:${id}@${version}`);
  await validateCatalogPackage(cached.bytes,record.manifest);
  await this.storage.setCurrentVersion(type,id,version);
  return record;
 }

 async remove(type:CatalogAssetType,id:string,version:string,options:CatalogRemoveOptions={}):Promise<void>{
  const record=await this.storage.getVersion(type,id,version);
  if(!record)throw new Error(`Catalog asset version is not installed: ${type}:${id}@${version}`);
  if(!options.force&&await this.storage.isVersionReferenced(type,id,version)){
   throw new Error(`Catalog asset version ${type}:${id}@${version} is referenced by a saved project`);
  }
  await this.storage.deleteCachedBytes(record.packageCacheKey);
  await this.storage.deleteVersion(type,id,version);
  if(await this.storage.getCurrentVersion(type,id)===version)await this.storage.setCurrentVersion(type,id,undefined);
 }
}
