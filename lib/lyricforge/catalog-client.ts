'use client';
import {definitionFromInstalledManifest} from './catalog-creative';
import {clearCatalogFonts,getCatalogFontsSnapshot,loadInstalledCatalogFont,unloadCatalogFont} from './catalog-fonts';
import {CatalogInstaller,type CatalogInstallerOptions,type CatalogInstallBytesOptions,type CatalogRemoveOptions} from './catalog-installer';
import {CatalogService} from './catalog-service';
import {getBrowserCatalogStorage,type CatalogStorage} from './catalog-storage';
import {CATALOG_APP_VERSION,type CatalogAssetManifest,type CatalogAssetType,type InstalledAssetVersion} from './catalog-types';
import {compareSemVer} from './catalog-version';
import {creativeRegistry,isTrustedRuntime} from './creative-registry';
import {publicPath} from './public-path';

function catalogAssetUrl(value:string){
 if(/^https?:\/\//i.test(value))return value;
 const clean=value.replace(/^\.\//,'').replace(/^\//,'');
 return publicPath(clean.startsWith('catalog/')?`/${clean}`:`/catalog/${clean}`);
}

async function fetchBytes(url:string){
 const response=await fetch(catalogAssetUrl(url),{cache:'no-cache'});
 if(!response.ok)throw new Error(`Catalog asset download failed with HTTP ${response.status}`);
 return new Uint8Array(await response.arrayBuffer());
}

async function orderedInstalledVersions(storage:CatalogStorage,records:InstalledAssetVersion[]){
 const current=new Map<string,string|undefined>();
 const keys=[...new Set(records.map(record=>`${record.type}:${record.id}`))];
 await Promise.all(keys.map(async key=>{
  const separator=key.indexOf(':');
  const type=key.slice(0,separator) as CatalogAssetType;
  const id=key.slice(separator+1);
  current.set(key,await storage.getCurrentVersion(type,id));
 }));
 return [...records].sort((left,right)=>{
  const leftKey=`${left.type}:${left.id}`,rightKey=`${right.type}:${right.id}`;
  const keyOrder=leftKey.localeCompare(rightKey);if(keyOrder)return keyOrder;
  const selected=current.get(leftKey);
  if(left.version===selected&&right.version!==selected)return -1;
  if(right.version===selected&&left.version!==selected)return 1;
  return compareSemVer(right.version,left.version);
 });
}

class SyncingCatalogInstaller extends CatalogInstaller{
 constructor(options:CatalogInstallerOptions,private readonly afterChange:()=>Promise<unknown>){super(options);}
 override async install(input:CatalogAssetManifest){const result=await super.install(input);await this.afterChange();return result;}
 override async installBytes(input:CatalogAssetManifest,bytes:Uint8Array|ArrayBuffer,options:CatalogInstallBytesOptions={}){const result=await super.installBytes(input,bytes,options);await this.afterChange();return result;}
 override async repair(type:CatalogAssetType,id:string,version:string){const result=await super.repair(type,id,version);await this.afterChange();return result;}
 override async rollback(type:CatalogAssetType,id:string,version:string){const result=await super.rollback(type,id,version);await this.afterChange();return result;}
 override async remove(type:CatalogAssetType,id:string,version:string,options:CatalogRemoveOptions={}){await super.remove(type,id,version,options);await this.afterChange();}
}

export interface BrowserCatalogClient{
 service:CatalogService;
 installer:CatalogInstaller;
 syncInstalled:()=>Promise<string[]>;
}

let sharedClient:BrowserCatalogClient|undefined;
export function getBrowserCatalogClient():BrowserCatalogClient{
 if(sharedClient)return sharedClient;
 const storage=getBrowserCatalogStorage();
 const service=new CatalogService({storage,appVersion:CATALOG_APP_VERSION});

 const syncInstalled=async()=>{
  const errors:string[]=[];
  let ordered:InstalledAssetVersion[];
  try{ordered=await orderedInstalledVersions(storage,await storage.listVersions());}
  catch(error){return [error instanceof Error?error.message:String(error)];}

  const definitions=[];
  for(const record of ordered){
   if(record.type==='font')continue;
   try{
    const runtimeId=record.manifest.runtimeId;
    const trusted=runtimeId?creativeRegistry.trustedRuntime(record.type,runtimeId):null;
    if(!trusted)throw new Error(`Installed asset ${record.id}@${record.version} requires an unavailable trusted runtime`);
    definitions.push(definitionFromInstalledManifest(record.manifest,trusted));
   }catch(error){errors.push(error instanceof Error?error.message:String(error));}
  }
  try{creativeRegistry.replaceInstalled(definitions);}
  catch(error){errors.push(error instanceof Error?error.message:String(error));creativeRegistry.replaceInstalled([]);}

  const fontRecords=ordered.filter(record=>record.type==='font');
  const desired=new Set(fontRecords.map(record=>`${record.id}@${record.version}`));
  for(const loaded of getCatalogFontsSnapshot())if(!desired.has(`${loaded.id}@${loaded.version}`))unloadCatalogFont(loaded.id,loaded.version);
  if(!fontRecords.length)clearCatalogFonts();
  for(const record of fontRecords){
   try{
    const cached=await storage.getCachedBytes(record.packageCacheKey);
    if(!cached)throw new Error(`Installed font ${record.id}@${record.version} is missing cached package bytes`);
    await loadInstalledCatalogFont(record,cached.bytes);
   }catch(error){errors.push(error instanceof Error?error.message:String(error));}
  }
  return errors;
 };

 const installer=new SyncingCatalogInstaller({storage,appVersion:CATALOG_APP_VERSION,isTrustedRuntime,fetchBytes},syncInstalled);
 sharedClient={service,installer,syncInstalled};
 void syncInstalled();
 return sharedClient;
}
