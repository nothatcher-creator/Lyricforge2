import {describe,expect,it} from 'vitest';
import type {InstalledAssetVersion} from '../catalog-types';
import {createMemoryCatalogStorage} from '../catalog-storage';

function version(id:string,version:string):InstalledAssetVersion{
 return {
  id,type:'effect',version,catalogId:'official',installedAt:Date.now(),packageCacheKey:`pkg:${id}@${version}`,
  manifest:{
   schemaVersion:1,id,version,type:'effect',name:id,description:'test',author:'LyricForge',
   sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:[],minAppVersion:'0.1.0',
   runtimeId:'effect.glow',preview:{kind:'image',url:'preview.svg'},
   package:{url:'asset.lyricforge-asset',size:1,sha256:'a'.repeat(64)},
  },
 };
}

describe('catalog storage',()=>{
 it('keeps immutable exact versions side by side and tracks a separate current pointer',async()=>{
  const storage=createMemoryCatalogStorage();
  await storage.putVersion(version('catalog.effect.neon-pulse','1.0.0'));
  await storage.putVersion(version('catalog.effect.neon-pulse','1.1.0'));
  await storage.setCurrentVersion('effect','catalog.effect.neon-pulse','1.1.0');
  expect((await storage.listVersions('effect','catalog.effect.neon-pulse')).map(item=>item.version).sort()).toEqual(['1.0.0','1.1.0']);
  expect(await storage.getCurrentVersion('effect','catalog.effect.neon-pulse')).toBe('1.1.0');
 });

 it('persists favorites independently from installation state',async()=>{
  const storage=createMemoryCatalogStorage();
  await storage.setFavorite('effect','catalog.effect.neon-pulse',true);
  expect(await storage.isFavorite('effect','catalog.effect.neon-pulse')).toBe(true);
  expect(await storage.listFavorites()).toEqual(['effect:catalog.effect.neon-pulse']);
 });

 it('pins exact versions referenced by any locally saved project',async()=>{
  const storage=createMemoryCatalogStorage();
  await storage.setProjectDependencies('project-a',[{id:'catalog.effect.neon-pulse',type:'effect',version:'1.0.0',sourceCatalogId:'official'}]);
  await storage.setProjectDependencies('project-b',[{id:'catalog.effect.neon-pulse',type:'effect',version:'1.1.0',sourceCatalogId:'official'}]);
  expect(await storage.isVersionReferenced('effect','catalog.effect.neon-pulse','1.0.0')).toBe(true);
  expect(await storage.isVersionReferenced('effect','catalog.effect.neon-pulse','1.1.0')).toBe(true);
  expect(await storage.isVersionReferenced('effect','catalog.effect.neon-pulse','2.0.0')).toBe(false);
  await storage.removeProjectDependencies('project-a');
  expect(await storage.isVersionReferenced('effect','catalog.effect.neon-pulse','1.0.0')).toBe(false);
 });

 it('stores cache bytes without sharing mutable array references',async()=>{
  const storage=createMemoryCatalogStorage();
  const input=new Uint8Array([1,2,3]);
  await storage.putCachedBytes('preview:test',input,'image/png');
  input[0]=9;
  const cached=await storage.getCachedBytes('preview:test');
  expect(cached?.bytes).toEqual(new Uint8Array([1,2,3]));
  if(cached)cached.bytes[1]=8;
  expect((await storage.getCachedBytes('preview:test'))?.bytes).toEqual(new Uint8Array([1,2,3]));
 });
});
