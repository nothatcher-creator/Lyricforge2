import {describe,expect,it} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import type {CatalogAssetManifest,EmbeddedAssetManifest,InstalledAssetVersion} from '../catalog-types';
import {sha256Hex} from '../catalog-package';
import {bundleCatalogDependencies,restoreBundledCatalogDependencies} from '../catalog-bundle';
import {createMemoryCatalogStorage} from '../catalog-storage';
import {createProject} from '../model';
import {projectFile} from '../project-manager';

async function effectPackage(version:string){
 const preset=strToU8(JSON.stringify({radius:28,intensity:.8}));
 const embedded:EmbeddedAssetManifest={schemaVersion:1,id:'catalog.effect.neon-pulse',version,type:'effect',runtimeId:'effect.glow',files:[{path:'preset.json',mime:'application/json',size:preset.byteLength,sha256:await sha256Hex(preset)}]};
 const bytes=zipSync({'manifest.json':strToU8(JSON.stringify(embedded)),'preset.json':preset},{level:0});
 const manifest:CatalogAssetManifest={schemaVersion:1,id:embedded.id,version,type:'effect',name:'Neon Pulse',description:'Glow pulse',author:'LyricForge',sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['neon'],minAppVersion:'0.1.0',runtimeId:'effect.glow',preset:{radius:28,intensity:.8},preview:{kind:'image',url:'preview.svg'},package:{url:`https://example.test/${version}.lyricforge-asset`,size:bytes.byteLength,sha256:await sha256Hex(bytes)}};
 return {bytes,manifest};
}

async function seed(storage:ReturnType<typeof createMemoryCatalogStorage>,version:string){
 const {bytes,manifest}=await effectPackage(version);
 const record:InstalledAssetVersion={id:manifest.id,type:'effect',version,catalogId:'official',installedAt:1,manifest,packageCacheKey:`package:effect:${manifest.id}@${version}`};
 await storage.putVersion(record);
 await storage.putCachedBytes(record.packageCacheKey,bytes,'application/vnd.lyricforge.asset+zip');
 return record;
}

function projectAt(version:string){
 const project=createProject('Portable catalog project');
 project.masterEffects=[{id:'master',assetId:'catalog.effect.neon-pulse',version,enabled:true,params:{radius:28,intensity:.8},keyframes:{}}];
 return project;
}

describe('catalog dependency bundles',()=>{
 it('bundles catalog-free projects without requiring browser IndexedDB',async()=>{
  const project=createProject('Catalog-free project');
  await expect(projectFile(project)).resolves.toBeInstanceOf(Blob);
 });

 it('bundles exact package bytes plus the external integrity manifest under versioned paths',async()=>{
  const storage=createMemoryCatalogStorage();
  const record=await seed(storage,'1.0.0');
  const result=await bundleCatalogDependencies(projectAt('1.0.0'),storage);
  expect(result.project.dependencies).toEqual([{id:record.id,type:'effect',version:'1.0.0',sourceCatalogId:'official'}]);
  expect(result.entries[`catalog/effect/${record.id}/1.0.0/asset.lyricforge-asset`]).toBeDefined();
  expect(result.entries[`catalog/effect/${record.id}/1.0.0/manifest.json`]).toBeDefined();
 });

 it('restores an embedded exact version without changing a newer current-version preference',async()=>{
  const source=createMemoryCatalogStorage();
  await seed(source,'1.0.0');
  const bundle=await bundleCatalogDependencies(projectAt('1.0.0'),source);

  const target=createMemoryCatalogStorage();
  const newer=await seed(target,'1.1.0');
  await target.setCurrentVersion('effect',newer.id,'1.1.0');
  const restored=await restoreBundledCatalogDependencies(bundle.project,bundle.entries,target,{appVersion:'0.1.0',isTrustedRuntime:()=>true});
  expect(restored.errors).toEqual([]);
  expect(restored.restored).toEqual([{id:newer.id,type:'effect',version:'1.0.0',sourceCatalogId:'official'}]);
  expect(await target.getVersion('effect',newer.id,'1.0.0')).toBeDefined();
  expect(await target.getCurrentVersion('effect',newer.id)).toBe('1.1.0');
 });

 it('reports a corrupt embedded package and does not activate it',async()=>{
  const source=createMemoryCatalogStorage();
  const record=await seed(source,'1.0.0');
  const bundle=await bundleCatalogDependencies(projectAt('1.0.0'),source);
  const path=`catalog/effect/${record.id}/1.0.0/asset.lyricforge-asset`;
  bundle.entries[path]=new Uint8Array([1,2,3]);
  const target=createMemoryCatalogStorage();
  const restored=await restoreBundledCatalogDependencies(bundle.project,bundle.entries,target,{appVersion:'0.1.0',isTrustedRuntime:()=>true});
  expect(restored.restored).toEqual([]);
  expect(restored.errors.join(' ')).toMatch(/size|sha-256|integrity|zip/i);
  expect(await target.getVersion('effect',record.id,'1.0.0')).toBeUndefined();
 });
});
