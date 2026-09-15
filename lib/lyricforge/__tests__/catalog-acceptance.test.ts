import {afterEach,describe,expect,it} from 'vitest';
import {strToU8} from 'fflate';
import {buildAssetPackage,remoteManifestFromSource,stableJson} from '../../../scripts/catalog-lib.mjs';
import {bundleCatalogDependencies,restoreBundledCatalogDependencies} from '../catalog-bundle';
import {definitionFromInstalledManifest} from '../catalog-creative';
import {catalogFontFamily} from '../catalog-fonts';
import {CatalogInstaller} from '../catalog-installer';
import {CatalogService} from '../catalog-service';
import {createMemoryCatalogStorage} from '../catalog-storage';
import type {CatalogAssetManifest,CatalogIndex} from '../catalog-types';
import {validateCatalogAssetManifest} from '../catalog-validation';
import {creativeRegistry,isTrustedRuntime} from '../creative-registry';
import {createProject,makeClip,makeTrack} from '../model';

const APP_VERSION='0.1.0';
const GENERATED_AT='2026-09-13T00:00:00.000Z';
const encoder=new TextEncoder();

type Fixture={manifest:CatalogAssetManifest;bytes:Uint8Array};

function creativeFixture(options:{
 id:string;version?:string;type:'effect'|'transition'|'text-animation';runtimeId:string;name:string;preset?:Record<string,string|number|boolean>;
}):Fixture{
 const version=options.version??'1.0.0';
 const source={
  schemaVersion:1,
  id:options.id,
  version,
  type:options.type,
  name:options.name,
  description:`Acceptance fixture for ${options.name}`,
  author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',
  license:'CC0-1.0',
  tags:['acceptance'],
  minAppVersion:APP_VERSION,
  runtimeId:options.runtimeId,
  preset:options.preset??{},
  preview:{kind:'image',file:'preview.svg'},
 } as const;
 const built=buildAssetPackage(source,{'preset.json':{mime:'application/json',bytes:encoder.encode(stableJson(source.preset))}});
 const relativeDir=`assets/${options.type}/${options.id}/${version}`;
 return {manifest:validateCatalogAssetManifest(remoteManifestFromSource(source,built,relativeDir)),bytes:built.bytes};
}

function fontFixture():Fixture{
 const source={
  schemaVersion:1,
  id:'catalog.font.bebas-neue',
  version:'1.0.0',
  type:'font' as const,
  name:'Bebas Neue',
  description:'Acceptance catalog font',
  author:'Ryoichi Tsunekawa / Dharma Type',
  sourceUrl:'https://github.com/google/fonts/tree/main/ofl/bebasneue',
  source:{provider:'Google Fonts',itemUrl:'https://github.com/google/fonts/tree/main/ofl/bebasneue',creator:'Ryoichi Tsunekawa / Dharma Type'},
  license:'OFL-1.1',
  licenseUrl:'https://openfontlicense.org/open-font-license-official-text/',
  tags:['display','condensed'],
  minAppVersion:APP_VERSION,
  font:{family:'Bebas Neue',style:'normal' as const,weight:400},
  preview:{kind:'image' as const,file:'preview.svg'},
 };
 const built=buildAssetPackage(source,{
  'BebasNeue-Regular.ttf':{mime:'font/ttf',bytes:new Uint8Array([0,1,0,0,66,101,98,97,115])},
  'OFL.txt':{mime:'text/plain',bytes:strToU8('SIL OPEN FONT LICENSE Version 1.1')},
 });
 return {manifest:validateCatalogAssetManifest(remoteManifestFromSource(source,built,'assets/font/catalog.font.bebas-neue/1.0.0')),bytes:built.bytes};
}

function officialFixtures(){
 return [
  creativeFixture({id:'catalog.effect.neon-pulse',type:'effect',runtimeId:'effect.glow',name:'Neon Pulse',preset:{radius:34,intensity:.85}}),
  creativeFixture({id:'catalog.transition.soft-glitch',type:'transition',runtimeId:'transition.glitch',name:'Soft Glitch',preset:{intensity:.35}}),
  creativeFixture({id:'catalog.animation.starlight-rise',type:'text-animation',runtimeId:'animation.slide',name:'Starlight Rise',preset:{durationMs:500,intensity:.6}}),
  fontFixture(),
 ];
}

function indexFor(fixtures:Fixture[]):CatalogIndex{
 return {schemaVersion:1,catalogId:'official',generatedAt:GENERATED_AT,items:fixtures.map(item=>item.manifest)};
}

function packageMap(fixtures:Fixture[]){return new Map(fixtures.map(item=>[item.manifest.package.url,item.bytes]));}

function projectUsing(fixtures:Fixture[]){
 const byId=new Map(fixtures.map(item=>[item.manifest.id,item.manifest]));
 const effect=byId.get('catalog.effect.neon-pulse')!;
 const transition=byId.get('catalog.transition.soft-glitch')!;
 const animation=byId.get('catalog.animation.starlight-rise')!;
 const font=byId.get('catalog.font.bebas-neue')!;
 const project=createProject('Catalog acceptance');
 const track=makeTrack('text','Catalog lyrics');
 const first=makeClip('text',track.id,0,2000,'Stars wake');
 const second=makeClip('text',track.id,2000,4000,'Light rises');
 first.animations={intro:{assetId:animation.id,version:animation.version,role:'intro',enabled:true,params:{},keyframes:{}}};
 first.effects=[{id:'acceptance-effect',assetId:effect.id,version:effect.version,enabled:true,params:{},keyframes:{}}];
 first.style={...first.style,font:catalogFontFamily(font.id,font.version,font.font!.family)};
 project.tracks=[track,...project.tracks];
 project.clips=[first,second];
 project.duration=4000;
 project.transitions=[{id:'acceptance-transition',assetId:transition.id,version:transition.version,outgoingItemId:first.id,incomingItemId:second.id,durationMs:500,easing:'linear',params:{}}];
 return project;
}

afterEach(()=>creativeRegistry.replaceInstalled([]));

describe('creative catalog acceptance',()=>{
 it('installs all asset types, survives offline reload, bundles exact versions, and restores into a clean profile',async()=>{
  const fixtures=officialFixtures();
  const index=indexFor(fixtures);
  const packages=packageMap(fixtures);
  const storage=createMemoryCatalogStorage();
  const service=new CatalogService({storage,appVersion:APP_VERSION,builtins:[],fetchIndex:async()=>index});
  const installer=new CatalogInstaller({storage,appVersion:APP_VERSION,isTrustedRuntime,fetchBytes:async url=>packages.get(url)??Promise.reject(new Error(`Missing package ${url}`))});
  await service.load();
  for(const fixture of fixtures)await installer.install(fixture.manifest);
  await service.refreshLocalState();
  const installed=service.search('',{filter:'Installed'});
  expect(installed.map(item=>item.type).sort()).toEqual(['effect','font','text-animation','transition']);
  expect(catalogFontFamily('catalog.font.bebas-neue','1.0.0','Bebas Neue')).toBe('LyricForge Catalog Bebas Neue [catalog.font.bebas-neue@1.0.0]');
  for(const fixture of fixtures.filter(item=>item.manifest.type!=='font'))expect(isTrustedRuntime(fixture.manifest.type as 'effect'|'transition'|'text-animation',fixture.manifest.runtimeId!)).toBe(true);
  creativeRegistry.replaceInstalled(fixtures.filter(item=>item.manifest.type!=='font').map(item=>definitionFromInstalledManifest(item.manifest)));
  expect(creativeRegistry.resolve('effect','catalog.effect.neon-pulse','1.0.0')?.runtime).toBe('effect.glow');

  const offline=new CatalogService({storage,appVersion:APP_VERSION,builtins:[],fetchIndex:async()=>{throw new Error('offline');}});
  await offline.load();
  expect(offline.search('',{filter:'Installed'})).toHaveLength(4);

  const project=projectUsing(fixtures);
  const bundle=await bundleCatalogDependencies(project,storage);
  expect(bundle.entries).toHaveLength(4);
  const clean=createMemoryCatalogStorage();
  const restored=await restoreBundledCatalogDependencies(bundle,clean,APP_VERSION);
  expect(restored.map(item=>item.type).sort()).toEqual(['effect','font','text-animation','transition']);
 });

 it('rejects corruption without disturbing the current version, repairs exact bytes, and rolls back without rewriting project refs',async()=>{
  const v1=creativeFixture({id:'catalog.effect.neon-pulse',version:'1.0.0',type:'effect',runtimeId:'effect.glow',name:'Neon Pulse',preset:{radius:30}});
  const v2=creativeFixture({id:'catalog.effect.neon-pulse',version:'1.1.0',type:'effect',runtimeId:'effect.glow',name:'Neon Pulse',preset:{radius:45}});
  const index=indexFor([v1,v2]);
  const packages=packageMap([v1,v2]);
  const storage=createMemoryCatalogStorage();
  const installer=new CatalogInstaller({storage,appVersion:APP_VERSION,isTrustedRuntime,fetchBytes:async url=>packages.get(url)??Promise.reject(new Error(`Missing package ${url}`))});
  await installer.install(v1.manifest);
  await installer.install(v2.manifest);
  expect(await storage.getCurrentVersion('effect',v1.manifest.id)).toBe('1.1.0');

  const corrupt=new Uint8Array(packages.get(v2.manifest.package.url)!);corrupt[0]^=255;
  packages.set(v2.manifest.package.url,corrupt);
  await expect(installer.repair('effect',v2.manifest.id,v2.manifest.version)).rejects.toThrow(/SHA-256 integrity/i);
  expect(await storage.getCurrentVersion('effect',v1.manifest.id)).toBe('1.1.0');

  packages.set(v2.manifest.package.url,v2.bytes);
  await installer.repair('effect',v2.manifest.id,v2.manifest.version);
  const project=projectUsing([v2,creativeFixture({id:'catalog.transition.soft-glitch',type:'transition',runtimeId:'transition.glitch',name:'Soft Glitch'}),creativeFixture({id:'catalog.animation.starlight-rise',type:'text-animation',runtimeId:'animation.slide',name:'Starlight Rise'}),fontFixture()]);
  const before=JSON.stringify(project);
  await installer.rollback('effect',v1.manifest.id,v1.manifest.version);
  expect(await storage.getCurrentVersion('effect',v1.manifest.id)).toBe('1.0.0');
  expect(JSON.stringify(project)).toBe(before);
 });
});