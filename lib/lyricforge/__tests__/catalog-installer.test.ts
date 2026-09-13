import {describe,expect,it,vi} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import type {CatalogAssetManifest,EmbeddedAssetManifest,InstalledAssetVersion} from '../catalog-types';
import {sha256Hex} from '../catalog-package';
import {CatalogInstaller} from '../catalog-installer';
import {createMemoryCatalogStorage} from '../catalog-storage';

async function packageFor(version:string){
 const preset=strToU8(JSON.stringify({radius:28,intensity:.8}));
 const embedded:EmbeddedAssetManifest={
  schemaVersion:1,id:'catalog.effect.neon-pulse',version,type:'effect',runtimeId:'effect.glow',
  files:[{path:'preset.json',mime:'application/json',size:preset.byteLength,sha256:await sha256Hex(preset)}],
 };
 const bytes=zipSync({'manifest.json':strToU8(JSON.stringify(embedded)),'preset.json':preset},{level:0});
 const manifest:CatalogAssetManifest={
  schemaVersion:1,id:embedded.id,version,type:'effect',name:'Neon Pulse',description:'Glow pulse',author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['neon'],minAppVersion:'0.1.0',runtimeId:'effect.glow',
  preset:{radius:28,intensity:.8},preview:{kind:'image',url:'preview.svg'},
  package:{url:`https://example.test/${version}.lyricforge-asset`,size:bytes.byteLength,sha256:await sha256Hex(bytes)},
 };
 return {bytes,manifest};
}

async function seedVersion(storage:ReturnType<typeof createMemoryCatalogStorage>,version:string){
 const {bytes,manifest}=await packageFor(version);
 const record:InstalledAssetVersion={id:manifest.id,type:manifest.type,version,catalogId:'official',installedAt:1,manifest,packageCacheKey:`package:${manifest.type}:${manifest.id}@${version}`};
 await storage.putVersion(record);
 await storage.putCachedBytes(record.packageCacheKey,bytes,'application/vnd.lyricforge.asset+zip');
 return record;
}

describe('CatalogInstaller',()=>{
 it('does not replace the current version when a downloaded update is corrupt',async()=>{
  const storage=createMemoryCatalogStorage();
  await seedVersion(storage,'1.0.0');
  await storage.setCurrentVersion('effect','catalog.effect.neon-pulse','1.0.0');
  const {manifest}=await packageFor('1.1.0');
  const installer=new CatalogInstaller({storage,appVersion:'0.1.0',isTrustedRuntime:()=>true,fetchBytes:async()=>new Uint8Array([1,2,3])});
  await expect(installer.install(manifest)).rejects.toThrow(/size|sha-256|zip|integrity/i);
  expect(await storage.getCurrentVersion('effect',manifest.id)).toBe('1.0.0');
  expect(await storage.getVersion('effect',manifest.id,'1.1.0')).toBeUndefined();
 });

 it('commits the immutable version before switching the current pointer',async()=>{
  const storage=createMemoryCatalogStorage();
  const {bytes,manifest}=await packageFor('1.0.0');
  const installer=new CatalogInstaller({storage,appVersion:'0.1.0',isTrustedRuntime:()=>true,fetchBytes:async()=>bytes});
  const installed=await installer.install(manifest);
  expect(installed.version).toBe('1.0.0');
  expect(await storage.getVersion('effect',manifest.id,'1.0.0')).toBeDefined();
  expect(await storage.getCachedBytes(installed.packageCacheKey)).toBeDefined();
  expect(await storage.getCurrentVersion('effect',manifest.id)).toBe('1.0.0');
 });

 it('rejects an unknown runtime before downloading package bytes',async()=>{
  const storage=createMemoryCatalogStorage();
  const {manifest}=await packageFor('1.0.0');
  const fetchBytes=vi.fn(async()=>new Uint8Array());
  const installer=new CatalogInstaller({storage,appVersion:'0.1.0',isTrustedRuntime:()=>false,fetchBytes});
  await expect(installer.install(manifest)).rejects.toThrow(/trusted runtime/i);
  expect(fetchBytes).not.toHaveBeenCalled();
 });

 it('repairs the same exact version without changing a different current pointer',async()=>{
  const storage=createMemoryCatalogStorage();
  const old=await seedVersion(storage,'1.0.0');
  await seedVersion(storage,'1.1.0');
  await storage.setCurrentVersion('effect',old.id,'1.1.0');
  const {bytes}=await packageFor('1.0.0');
  await storage.deleteCachedBytes(old.packageCacheKey);
  const installer=new CatalogInstaller({storage,appVersion:'0.1.0',isTrustedRuntime:()=>true,fetchBytes:async()=>bytes});
  await installer.repair('effect',old.id,'1.0.0');
  expect(await storage.getCachedBytes(old.packageCacheKey)).toBeDefined();
  expect(await storage.getCurrentVersion('effect',old.id)).toBe('1.1.0');
 });

 it('rolls back only to an already installed valid version',async()=>{
  const storage=createMemoryCatalogStorage();
  const old=await seedVersion(storage,'1.0.0');
  await seedVersion(storage,'1.1.0');
  await storage.setCurrentVersion('effect',old.id,'1.1.0');
  const installer=new CatalogInstaller({storage,appVersion:'0.1.0',isTrustedRuntime:()=>true,fetchBytes:async()=>new Uint8Array()});
  await installer.rollback('effect',old.id,'1.0.0');
  expect(await storage.getCurrentVersion('effect',old.id)).toBe('1.0.0');
  await expect(installer.rollback('effect',old.id,'0.9.0')).rejects.toThrow(/not installed/i);
 });

 it('refuses to remove versions pinned by any saved project unless forced',async()=>{
  const storage=createMemoryCatalogStorage();
  const record=await seedVersion(storage,'1.0.0');
  await storage.setCurrentVersion('effect',record.id,'1.0.0');
  await storage.setProjectDependencies('saved-project',[{id:record.id,type:'effect',version:'1.0.0',sourceCatalogId:'official'}]);
  const installer=new CatalogInstaller({storage,appVersion:'0.1.0',isTrustedRuntime:()=>true,fetchBytes:async()=>new Uint8Array()});
  await expect(installer.remove('effect',record.id,'1.0.0')).rejects.toThrow(/saved project|referenced/i);
  await installer.remove('effect',record.id,'1.0.0',{force:true});
  expect(await storage.getVersion('effect',record.id,'1.0.0')).toBeUndefined();
  expect(await storage.getCachedBytes(record.packageCacheKey)).toBeUndefined();
  expect(await storage.getCurrentVersion('effect',record.id)).toBeUndefined();
 });
});
