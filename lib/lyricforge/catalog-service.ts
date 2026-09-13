import type {CatalogAssetManifest,CatalogAssetType,CatalogIndex,InstalledAssetVersion} from './catalog-types';
import type {CatalogStorage} from './catalog-storage';
import {catalogAssetKey} from './catalog-types';
import {validateCatalogIndex} from './catalog-validation';
import {compareSemVer,isAppVersionCompatible} from './catalog-version';
import {publicPath} from './public-path';
import {creativeRegistry} from './creative-registry';

export const CATALOG_INDEX_CACHE_KEY='catalog:index:official';
export type CatalogFilter='Built-in'|'Online'|'Installed'|'Favorites'|'Updates';

export interface CatalogBuiltinItem{
 id:string;
 type:Exclude<CatalogAssetType,'font'>|CatalogAssetType;
 version:string;
 name:string;
 description?:string;
 author?:string;
 tags?:string[];
}

export interface CatalogBrowseItem{
 source:'builtin'|'online'|'installed-only';
 id:string;
 type:CatalogAssetType;
 version:string;
 name:string;
 description:string;
 author:string;
 license:string;
 tags:string[];
 manifest?:CatalogAssetManifest;
 compatible:boolean;
 installed:boolean;
 favorite:boolean;
 currentVersion?:string;
 availableUpdate?:string;
}

export interface CatalogSearchOptions{
 type?:CatalogAssetType;
 filter?:CatalogFilter;
}

export interface CatalogUpdateState{
 currentVersion:string;
 availableVersion?:string;
}

export interface CatalogSnapshot{
 index?:CatalogIndex;
 refreshing:boolean;
 refreshError?:string;
 installed:readonly InstalledAssetVersion[];
 favorites:readonly string[];
 currentVersions:Readonly<Record<string,string>>;
}

export interface CatalogServiceOptions{
 storage:CatalogStorage;
 appVersion:string;
 fetchIndex?:(url:string)=>Promise<unknown>;
 indexUrl?:string;
 builtins?:readonly CatalogBuiltinItem[];
}

function defaultBuiltins():CatalogBuiltinItem[]{
 return creativeRegistry.definitions.filter(definition=>definition.id.startsWith('builtin.')).map(definition=>({
  id:definition.id,type:definition.type,version:definition.version,name:definition.name,description:`Built-in ${definition.name}`,author:'LyricForge',tags:['built-in'],
 }));
}

async function defaultFetchIndex(url:string):Promise<unknown>{
 const response=await fetch(url,{cache:'no-cache'});
 if(!response.ok)throw new Error(`Catalog refresh failed with HTTP ${response.status}`);
 return response.json();
}

const installedKey=(record:Pick<InstalledAssetVersion,'type'|'id'>)=>catalogAssetKey(record.type,record.id);
const normalize=(value:string)=>value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export class CatalogService{
 private readonly storage:CatalogStorage;
 private readonly appVersion:string;
 private readonly fetchIndex:(url:string)=>Promise<unknown>;
 private readonly indexUrl:string;
 private readonly builtins:readonly CatalogBuiltinItem[];
 private readonly listeners=new Set<()=>void>();
 private snapshot:CatalogSnapshot={refreshing:false,installed:[],favorites:[],currentVersions:{}};

 constructor(options:CatalogServiceOptions){
  this.storage=options.storage;
  this.appVersion=options.appVersion;
  this.fetchIndex=options.fetchIndex??defaultFetchIndex;
  this.indexUrl=options.indexUrl??publicPath('/catalog/index.json');
  this.builtins=options.builtins??defaultBuiltins();
 }

 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
 getSnapshot=()=>this.snapshot;

 private publish(patch:Partial<CatalogSnapshot>){
  this.snapshot={...this.snapshot,...patch};
  for(const listener of this.listeners)listener();
 }

 async refreshLocalState(){
  const installed=await this.storage.listVersions();
  const favorites=await this.storage.listFavorites();
  const keys=new Set(installed.map(installedKey));
  const currentVersions:Record<string,string>={};
  await Promise.all([...keys].map(async key=>{
   const record=installed.find(item=>installedKey(item)===key)!;
   const current=await this.storage.getCurrentVersion(record.type,record.id);
   if(current)currentVersions[key]=current;
  }));
  this.publish({installed,favorites,currentVersions});
 }

 private async loadCachedIndex(){
  const cached=await this.storage.getCachedBytes(CATALOG_INDEX_CACHE_KEY);
  if(!cached)return;
  try{
   const raw=JSON.parse(new TextDecoder().decode(cached.bytes));
   const index=validateCatalogIndex(raw);
   this.publish({index});
  }catch(error){
   const message=error instanceof Error?error.message:String(error);
   this.publish({refreshError:`Cached catalog could not be validated: ${message}`});
  }
 }

 async load(){
  await Promise.all([this.refreshLocalState(),this.loadCachedIndex()]);
  await this.refresh();
 }

 async refresh(){
  this.publish({refreshing:true});
  try{
   const raw=await this.fetchIndex(this.indexUrl);
   const index=validateCatalogIndex(raw);
   const bytes=new TextEncoder().encode(JSON.stringify(index));
   await this.storage.putCachedBytes(CATALOG_INDEX_CACHE_KEY,bytes,'application/json');
   this.publish({index,refreshing:false,refreshError:undefined});
  }catch(error){
   const message=error instanceof Error?error.message:String(error);
   this.publish({refreshing:false,refreshError:message});
  }
 }

 async setFavorite(type:CatalogAssetType,id:string,value:boolean){
  await this.storage.setFavorite(type,id,value);
  const favorites=await this.storage.listFavorites();
  this.publish({favorites});
 }

 findExact(type:CatalogAssetType,id:string,version:string){
  return this.snapshot.index?.items.find(item=>item.type===type&&item.id===id&&item.version===version);
 }

 getUpdateState(type:CatalogAssetType,id:string):CatalogUpdateState|undefined{
  const key=catalogAssetKey(type,id);
  const currentVersion=this.snapshot.currentVersions[key];
  if(!currentVersion)return undefined;
  const candidates=(this.snapshot.index?.items??[]).filter(item=>item.type===type&&item.id===id&&isAppVersionCompatible(this.appVersion,item)&&compareSemVer(item.version,currentVersion)>0);
  if(!candidates.length)return {currentVersion};
  const availableVersion=[...candidates].sort((a,b)=>compareSemVer(b.version,a.version))[0].version;
  return {currentVersion,availableVersion};
 }

 private newestRemoteItems(){
  const byAsset=new Map<string,CatalogAssetManifest>();
  for(const item of this.snapshot.index?.items??[]){
   const key=catalogAssetKey(item.type,item.id);
   const previous=byAsset.get(key);
   if(!previous||compareSemVer(item.version,previous.version)>0)byAsset.set(key,item);
  }
  return byAsset;
 }

 private newestInstalledItems(){
  const byAsset=new Map<string,InstalledAssetVersion>();
  for(const item of this.snapshot.installed){
   const key=installedKey(item);
   const current=this.snapshot.currentVersions[key];
   const previous=byAsset.get(key);
   if(current){
    if(item.version===current)byAsset.set(key,item);
    else if(!previous)byAsset.set(key,item);
   }else if(!previous||compareSemVer(item.version,previous.version)>0)byAsset.set(key,item);
  }
  return byAsset;
 }

 private browseFromManifest(manifest:CatalogAssetManifest,source:'online'|'installed-only'):CatalogBrowseItem{
  const key=catalogAssetKey(manifest.type,manifest.id);
  const currentVersion=this.snapshot.currentVersions[key];
  const update=this.getUpdateState(manifest.type,manifest.id)?.availableVersion;
  return {
   source,id:manifest.id,type:manifest.type,version:manifest.version,name:manifest.name,description:manifest.description,author:manifest.author,license:manifest.license,tags:[...manifest.tags],manifest,
   compatible:isAppVersionCompatible(this.appVersion,manifest),installed:this.snapshot.installed.some(item=>item.type===manifest.type&&item.id===manifest.id),favorite:this.snapshot.favorites.includes(key),currentVersion,availableUpdate:update,
  };
 }

 private builtinItems():CatalogBrowseItem[]{
  return this.builtins.map(item=>{
   const key=catalogAssetKey(item.type,item.id);
   return {source:'builtin',id:item.id,type:item.type,version:item.version,name:item.name,description:item.description??`Built-in ${item.name}`,author:item.author??'LyricForge',license:'Built-in',tags:item.tags?[...item.tags]:['built-in'],compatible:true,installed:true,favorite:this.snapshot.favorites.includes(key),currentVersion:item.version};
  });
 }

 search(query='',options:CatalogSearchOptions={}):CatalogBrowseItem[]{
  const remote=this.newestRemoteItems();
  const installed=this.newestInstalledItems();
  let items:CatalogBrowseItem[]=[];
  switch(options.filter){
   case 'Built-in':items=this.builtinItems();break;
   case 'Online':items=[...remote.values()].map(item=>this.browseFromManifest(item,'online'));break;
   case 'Installed':items=[...installed.values()].map(record=>this.browseFromManifest(record.manifest,remote.has(installedKey(record))?'online':'installed-only'));break;
   case 'Favorites':{
    const combined=new Map<string,CatalogBrowseItem>();
    for(const item of this.builtinItems())combined.set(catalogAssetKey(item.type,item.id),item);
    for(const manifest of remote.values())combined.set(catalogAssetKey(manifest.type,manifest.id),this.browseFromManifest(manifest,'online'));
    for(const record of installed.values())if(!combined.has(installedKey(record)))combined.set(installedKey(record),this.browseFromManifest(record.manifest,'installed-only'));
    items=[...combined.values()].filter(item=>item.favorite);break;
   }
   case 'Updates':{
    for(const [key,record] of installed){
     const state=this.getUpdateState(record.type,record.id);
     if(!state?.availableVersion)continue;
     const manifest=this.findExact(record.type,record.id,state.availableVersion);
     if(manifest)items.push(this.browseFromManifest(manifest,'online'));
    }
    break;
   }
   default:{
    items=this.builtinItems();
    const present=new Set(items.map(item=>catalogAssetKey(item.type,item.id)));
    for(const manifest of remote.values()){const key=catalogAssetKey(manifest.type,manifest.id);if(!present.has(key)){items.push(this.browseFromManifest(manifest,'online'));present.add(key);}}
    for(const record of installed.values()){const key=installedKey(record);if(!present.has(key)){items.push(this.browseFromManifest(record.manifest,'installed-only'));present.add(key);}}
   }
  }
  if(options.type)items=items.filter(item=>item.type===options.type);
  const tokens=normalize(query).split(' ').filter(Boolean);
  if(tokens.length)items=items.filter(item=>{const haystack=normalize([item.name,item.description,item.author,...item.tags].join(' '));return tokens.every(token=>haystack.includes(token));});
  return items.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)||compareSemVer(b.version,a.version));
 }
}
