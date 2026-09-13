import type {ProjectDependency} from './creative-assets';
import type {CatalogAssetType,InstalledAssetVersion} from './catalog-types';
import {catalogAssetKey,catalogVersionKey} from './catalog-types';

const DB_NAME='lyricforge-catalog';
const DB_VERSION=1;
const CACHE_NAME='lyricforge-catalog-v1';
const STORE_NAMES=['installedVersions','currentVersions','preferences','projectDependencies','binaryFallback'] as const;
type StoreName=typeof STORE_NAMES[number];

interface CurrentVersionRecord{key:string;type:CatalogAssetType;id:string;version:string;}
interface PreferenceRecord{key:string;value:unknown;}
interface ProjectDependenciesRecord{projectId:string;dependencies:ProjectDependency[];}
export interface CachedCatalogBytes{bytes:Uint8Array;contentType:string;}

interface CatalogStorageBackend{
 get<T>(store:StoreName,key:string):Promise<T|undefined>;
 put<T>(store:StoreName,key:string,value:T):Promise<void>;
 delete(store:StoreName,key:string):Promise<void>;
 getAll<T>(store:StoreName):Promise<T[]>;
}

interface CatalogBinaryCache{
 put(key:string,value:CachedCatalogBytes):Promise<void>;
 get(key:string):Promise<CachedCatalogBytes|undefined>;
 delete(key:string):Promise<void>;
}

const cloneBytes=(bytes:Uint8Array)=>{const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy;};
const cloneCached=(value:CachedCatalogBytes):CachedCatalogBytes=>({bytes:cloneBytes(value.bytes),contentType:value.contentType});
const favoriteKey=(type:CatalogAssetType,id:string)=>`favorite:${catalogAssetKey(type,id)}`;

export class CatalogStorage{
 constructor(private readonly backend:CatalogStorageBackend,private readonly binary:CatalogBinaryCache){}

 async putVersion(record:InstalledAssetVersion){await this.backend.put('installedVersions',catalogVersionKey(record.type,record.id,record.version),structuredClone(record));}
 async getVersion(type:CatalogAssetType,id:string,version:string){return this.backend.get<InstalledAssetVersion>('installedVersions',catalogVersionKey(type,id,version));}
 async listVersions(type?:CatalogAssetType,id?:string){
  const all=await this.backend.getAll<InstalledAssetVersion>('installedVersions');
  return all.filter(item=>(!type||item.type===type)&&(!id||item.id===id));
 }
 async deleteVersion(type:CatalogAssetType,id:string,version:string){await this.backend.delete('installedVersions',catalogVersionKey(type,id,version));}

 async setCurrentVersion(type:CatalogAssetType,id:string,version:string|undefined){
  const key=catalogAssetKey(type,id);
  if(version===undefined){await this.backend.delete('currentVersions',key);return;}
  const record:CurrentVersionRecord={key,type,id,version};
  await this.backend.put('currentVersions',key,record);
 }
 async getCurrentVersion(type:CatalogAssetType,id:string){return (await this.backend.get<CurrentVersionRecord>('currentVersions',catalogAssetKey(type,id)))?.version;}

 async setFavorite(type:CatalogAssetType,id:string,value:boolean){
  const key=favoriteKey(type,id);
  if(!value){await this.backend.delete('preferences',key);return;}
  await this.backend.put<PreferenceRecord>('preferences',key,{key,value:true});
 }
 async isFavorite(type:CatalogAssetType,id:string){return (await this.backend.get<PreferenceRecord>('preferences',favoriteKey(type,id)))?.value===true;}
 async listFavorites(){
  const all=await this.backend.getAll<PreferenceRecord>('preferences');
  return all.filter(item=>item.key.startsWith('favorite:')&&item.value===true).map(item=>item.key.slice('favorite:'.length)).sort();
 }

 async setProjectDependencies(projectId:string,dependencies:ProjectDependency[]){
  const unique=new Map<string,ProjectDependency>();
  for(const dependency of dependencies)unique.set(catalogVersionKey(dependency.type,dependency.id,dependency.version),structuredClone(dependency));
  await this.backend.put<ProjectDependenciesRecord>('projectDependencies',projectId,{projectId,dependencies:[...unique.values()]});
 }
 async getProjectDependencies(projectId:string){return (await this.backend.get<ProjectDependenciesRecord>('projectDependencies',projectId))?.dependencies??[];}
 async removeProjectDependencies(projectId:string){await this.backend.delete('projectDependencies',projectId);}
 async isVersionReferenced(type:CatalogAssetType,id:string,version:string){
  const projects=await this.backend.getAll<ProjectDependenciesRecord>('projectDependencies');
  return projects.some(project=>project.dependencies.some(dependency=>dependency.type===type&&dependency.id===id&&dependency.version===version));
 }

 async putCachedBytes(key:string,bytes:Uint8Array,contentType='application/octet-stream'){await this.binary.put(key,{bytes:cloneBytes(bytes),contentType});}
 async getCachedBytes(key:string){const value=await this.binary.get(key);return value?cloneCached(value):undefined;}
 async deleteCachedBytes(key:string){await this.binary.delete(key);}
}

class MemoryBackend implements CatalogStorageBackend{
 private stores=new Map<StoreName,Map<string,unknown>>(STORE_NAMES.map(name=>[name,new Map()]));
 async get<T>(store:StoreName,key:string){const value=this.stores.get(store)!.get(key);return value===undefined?undefined:structuredClone(value) as T;}
 async put<T>(store:StoreName,key:string,value:T){this.stores.get(store)!.set(key,structuredClone(value));}
 async delete(store:StoreName,key:string){this.stores.get(store)!.delete(key);}
 async getAll<T>(store:StoreName){return [...this.stores.get(store)!.values()].map(value=>structuredClone(value) as T);}
}

class MemoryBinaryCache implements CatalogBinaryCache{
 private entries=new Map<string,CachedCatalogBytes>();
 async put(key:string,value:CachedCatalogBytes){this.entries.set(key,cloneCached(value));}
 async get(key:string){const value=this.entries.get(key);return value?cloneCached(value):undefined;}
 async delete(key:string){this.entries.delete(key);}
}

function requestResult<T>(request:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('IndexedDB request failed'));});
}

class IndexedDbBackend implements CatalogStorageBackend{
 private dbPromise?:Promise<IDBDatabase>;
 private db(){
  if(!this.dbPromise)this.dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open(DB_NAME,DB_VERSION);
   request.onupgradeneeded=()=>{for(const name of STORE_NAMES)if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error??new Error('Unable to open catalog IndexedDB'));
  });
  return this.dbPromise;
 }
 async get<T>(store:StoreName,key:string){const db=await this.db();return requestResult<T|undefined>(db.transaction(store,'readonly').objectStore(store).get(key));}
 async put<T>(store:StoreName,key:string,value:T){const db=await this.db();await requestResult(db.transaction(store,'readwrite').objectStore(store).put(value,key));}
 async delete(store:StoreName,key:string){const db=await this.db();await requestResult(db.transaction(store,'readwrite').objectStore(store).delete(key));}
 async getAll<T>(store:StoreName){const db=await this.db();return requestResult<T[]>(db.transaction(store,'readonly').objectStore(store).getAll());}
}

class IndexedDbBinaryFallback implements CatalogBinaryCache{
 constructor(private readonly backend:CatalogStorageBackend){}
 async put(key:string,value:CachedCatalogBytes){await this.backend.put('binaryFallback',key,cloneCached(value));}
 async get(key:string){const value=await this.backend.get<CachedCatalogBytes>('binaryFallback',key);return value?cloneCached(value):undefined;}
 async delete(key:string){await this.backend.delete('binaryFallback',key);}
}

class BrowserCacheStorage implements CatalogBinaryCache{
 constructor(private readonly fallback:CatalogBinaryCache){}
 private request(key:string){return new Request(`${location.origin}/__lyricforge_catalog_cache__/${encodeURIComponent(key)}`);}
 async put(key:string,value:CachedCatalogBytes){
  try{const cache=await caches.open(CACHE_NAME);await cache.put(this.request(key),new Response(cloneBytes(value.bytes),{headers:{'content-type':value.contentType}}));}
  catch{await this.fallback.put(key,value);}
 }
 async get(key:string){
  try{
   const cache=await caches.open(CACHE_NAME);const response=await cache.match(this.request(key));
   if(response)return {bytes:new Uint8Array(await response.arrayBuffer()),contentType:response.headers.get('content-type')??'application/octet-stream'};
  }catch{/* fall through to IndexedDB fallback */}
  return this.fallback.get(key);
 }
 async delete(key:string){
  try{const cache=await caches.open(CACHE_NAME);await cache.delete(this.request(key));}catch{/* also clear fallback */}
  await this.fallback.delete(key);
 }
}

export function createMemoryCatalogStorage(){return new CatalogStorage(new MemoryBackend(),new MemoryBinaryCache());}

export function createBrowserCatalogStorage(){
 if(typeof indexedDB==='undefined')throw new Error('Catalog storage requires IndexedDB');
 const backend=new IndexedDbBackend();
 const fallback=new IndexedDbBinaryFallback(backend);
 const binary=typeof caches!=='undefined'&&typeof location!=='undefined'?new BrowserCacheStorage(fallback):fallback;
 return new CatalogStorage(backend,binary);
}

let sharedBrowserStorage:CatalogStorage|undefined;
export function getBrowserCatalogStorage(){
 return sharedBrowserStorage??=createBrowserCatalogStorage();
}
