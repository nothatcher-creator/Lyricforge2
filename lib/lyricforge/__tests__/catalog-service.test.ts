import {describe,expect,it,vi} from 'vitest';
import type {CatalogAssetManifest,CatalogIndex,InstalledAssetVersion} from '../catalog-types';
import {createMemoryCatalogStorage} from '../catalog-storage';
import {CatalogService} from '../catalog-service';

function manifest(id:string,version:string,overrides:Partial<CatalogAssetManifest>={}):CatalogAssetManifest{
 return {schemaVersion:1,id,version,type:'effect',name:id==='catalog.effect.neon-pulse'?'Neon Pulse':'Dream Glow',description:'Bright cinematic glow',author:'LyricForge',sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['neon','glow'],minAppVersion:'0.1.0',runtimeId:'effect.glow',preview:{kind:'image',url:'preview.svg'},package:{url:`${id}-${version}.lyricforge-asset`,size:100,sha256:'a'.repeat(64)},...overrides};
}
function index(generatedAt:string,items:CatalogAssetManifest[]):CatalogIndex{return {schemaVersion:1,catalogId:'official',generatedAt,items};}
async function cacheIndex(storage:ReturnType<typeof createMemoryCatalogStorage>,value:CatalogIndex){await storage.putCachedBytes('catalog:index:official',new TextEncoder().encode(JSON.stringify(value)),'application/json');}
async function install(storage:ReturnType<typeof createMemoryCatalogStorage>,item:CatalogAssetManifest,current=true){const record:InstalledAssetVersion={id:item.id,type:item.type,version:item.version,catalogId:'official',manifest:item,installedAt:1,packageCacheKey:`package:${item.type}:${item.id}@${item.version}`};await storage.putVersion(record);if(current)await storage.setCurrentVersion(item.type,item.id,item.version);return record;}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

describe('CatalogService',()=>{
 it('publishes a valid cached catalog before a delayed network refresh resolves',async()=>{
  const storage=createMemoryCatalogStorage();
  const cached=index('2026-09-13T12:00:00.000Z',[manifest('catalog.effect.neon-pulse','1.0.0')]);
  const fresh=index('2026-09-13T13:00:00.000Z',[manifest('catalog.effect.neon-pulse','1.1.0')]);
  await cacheIndex(storage,cached);
  let release!:(value:unknown)=>void;
  const network=new Promise<unknown>(resolve=>{release=resolve;});
  const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:()=>network,indexUrl:'/catalog/index.json',builtins:[]});
  const loading=service.load();
  await tick();
  expect(service.getSnapshot().index?.generatedAt).toBe(cached.generatedAt);
  expect(service.getSnapshot().refreshing).toBe(true);
  release(fresh);
  await loading;
  expect(service.getSnapshot().index?.generatedAt).toBe(fresh.generatedAt);
  expect(service.getSnapshot().refreshError).toBeUndefined();
 });

 it('keeps the last valid cached index when a refresh is malformed',async()=>{
  const storage=createMemoryCatalogStorage();
  const cached=index('2026-09-13T12:00:00.000Z',[manifest('catalog.effect.neon-pulse','1.0.0')]);
  await cacheIndex(storage,cached);
  const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>({bad:true}),builtins:[]});
  await service.load();
  expect(service.getSnapshot().index?.generatedAt).toBe(cached.generatedAt);
  expect(service.getSnapshot().refreshError).toMatch(/catalog/i);
  const persisted=await storage.getCachedBytes('catalog:index:official');
  expect(JSON.parse(new TextDecoder().decode(persisted!.bytes)).generatedAt).toBe(cached.generatedAt);
 });

 it('resolves an exact official dependency before the catalog UI has loaded',async()=>{
  const storage=createMemoryCatalogStorage();
  const exact=manifest('catalog.effect.neon-pulse','1.0.0');
  const fetchIndex=vi.fn(async()=>index('2026-09-13T14:00:00.000Z',[exact]));
  const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex,builtins:[]});
  expect(service.findExact('effect',exact.id,exact.version)).toBeUndefined();
  await expect(service.ensureExact('effect',exact.id,exact.version)).resolves.toEqual(exact);
  expect(fetchIndex).toHaveBeenCalledTimes(1);
 });

 it('searches normalized metadata and filters installed and favorites locally',async()=>{
  const storage=createMemoryCatalogStorage();
  const neon=manifest('catalog.effect.neon-pulse','1.0.0');
  const dream=manifest('catalog.effect.dream-glow','1.0.0',{author:'Guest Artist',tags:['dreamy']});
  await cacheIndex(storage,index('2026-09-13T12:00:00.000Z',[neon,dream]));
  await install(storage,neon);
  await storage.setFavorite('effect',dream.id,true);
  const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>{throw new Error('offline');},builtins:[]});
  await service.load();
  expect(service.search('guest dreamy',{type:'effect',filter:'Online'}).map(item=>item.id)).toEqual([dream.id]);
  expect(service.search('',{type:'effect',filter:'Installed'}).map(item=>item.id)).toEqual([neon.id]);
  expect(service.search('',{type:'effect',filter:'Favorites'}).map(item=>item.id)).toEqual([dream.id]);
 });

 it('persists favorite changes and publishes them to subscribers',async()=>{
  const storage=createMemoryCatalogStorage();
  const neon=manifest('catalog.effect.neon-pulse','1.0.0');
  await cacheIndex(storage,index('2026-09-13T12:00:00.000Z',[neon]));
  const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>{throw new Error('offline');},builtins:[]});
  await service.load();
  const listener=vi.fn();
  const unsubscribe=service.subscribe(listener);
  await service.setFavorite('effect',neon.id,true);
  expect(await storage.isFavorite('effect',neon.id)).toBe(true);
  expect(service.search('',{filter:'Favorites'}).map(item=>item.id)).toEqual([neon.id]);
  expect(listener).toHaveBeenCalled();
  unsubscribe();
 });

 it('reports only newer compatible versions above the current version pointer',async()=>{
  const storage=createMemoryCatalogStorage();
  const v1=manifest('catalog.effect.neon-pulse','1.0.0');
  const v11=manifest('catalog.effect.neon-pulse','1.1.0');
  const v2=manifest('catalog.effect.neon-pulse','2.0.0',{minAppVersion:'9.0.0'});
  await cacheIndex(storage,index('2026-09-13T12:00:00.000Z',[v2,v1,v11]));
  await install(storage,v1);
  const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>{throw new Error('offline');},builtins:[]});
  await service.load();
  expect(service.getUpdateState('effect',v1.id)).toEqual({currentVersion:'1.0.0',availableVersion:'1.1.0'});
  expect(service.search('',{filter:'Updates'}).map(item=>item.version)).toEqual(['1.1.0']);
 });
});
