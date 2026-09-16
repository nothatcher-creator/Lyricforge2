import {describe,expect,it} from 'vitest';
import type {InstalledAssetVersion} from '../catalog-types';
import type {ProjectDependency} from '../creative-assets';
import {collectProjectCatalogDependencies,resolveProjectDependencies} from '../catalog-dependencies';
import {createProject,makeClip} from '../model';

function installed(type:InstalledAssetVersion['type'],id:string,version:string):InstalledAssetVersion{
 return {
  type,id,version,catalogId:'official',installedAt:1,packageCacheKey:`package:${type}:${id}@${version}`,
  manifest:{schemaVersion:1,type,id,version,name:id,description:id,author:'LyricForge',sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:[],minAppVersion:'0.1.0',...(type==='font'?{font:{family:'Bebas Neue',style:'normal' as const,weight:400}}:type==='element'?{element:{file:'element.svg',mime:'image/svg+xml' as const}}:{runtimeId:type==='effect'?'effect.glow':type==='transition'?'transition.glitch':'animation.slide'}),preview:{kind:'image',url:'preview.svg'},package:{url:'asset.lyricforge-asset',size:1,sha256:'a'.repeat(64)}},
 };
}

function projectUsingCatalogAssets(){
 const project=createProject('Catalog deps');
 const clip=makeClip('text',project.tracks[0].id,0,2000,'Hello');
 clip.animations={intro:{assetId:'catalog.animation.starlight-rise',version:'1.0.0',role:'intro',enabled:true,params:{},keyframes:{}}};
 clip.effects=[
  {id:'fx-catalog',assetId:'catalog.effect.neon-pulse',version:'1.0.0',enabled:true,params:{},keyframes:{}},
  {id:'fx-built-in',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,params:{},keyframes:{}},
 ];
 clip.style.font='LyricForge Catalog Bebas Neue [catalog.font.bebas-neue@1.0.0]';
 project.clips=[clip];
 project.masterEffects=[{id:'master',assetId:'catalog.effect.neon-pulse',version:'1.0.0',enabled:true,params:{},keyframes:{}}];
 project.transitions=[{id:'transition',assetId:'catalog.transition.soft-glitch',version:'1.0.0',incomingItemId:clip.id,outgoingItemId:clip.id,durationMs:400,easing:'linear',params:{}}];
 project.dependencies=[{id:'catalog.animation.starlight-rise',type:'text-animation',version:'1.0.0',sourceCatalogId:'legacy-source'}];
 return project;
}

describe('project catalog dependencies',()=>{
 it('collects exact versions actually used across creative instances and catalog fonts',()=>{
  const project=projectUsingCatalogAssets();
  const versions=[
   installed('effect','catalog.effect.neon-pulse','1.0.0'),
   installed('transition','catalog.transition.soft-glitch','1.0.0'),
   installed('font','catalog.font.bebas-neue','1.0.0'),
  ];
  const deps=collectProjectCatalogDependencies(project,versions);
  expect(deps).toEqual([
   {id:'catalog.effect.neon-pulse',type:'effect',version:'1.0.0',sourceCatalogId:'official'},
   {id:'catalog.font.bebas-neue',type:'font',version:'1.0.0',sourceCatalogId:'official'},
   {id:'catalog.animation.starlight-rise',type:'text-animation',version:'1.0.0',sourceCatalogId:'legacy-source'},
   {id:'catalog.transition.soft-glitch',type:'transition',version:'1.0.0',sourceCatalogId:'official'},
  ]);
  expect(deps.some(dependency=>dependency.id.startsWith('builtin.'))).toBe(false);
 });

 it('deduplicates repeated exact references but keeps different exact versions distinct',()=>{
  const project=projectUsingCatalogAssets();
  project.masterEffects.push({id:'newer',assetId:'catalog.effect.neon-pulse',version:'1.1.0',enabled:true,params:{},keyframes:{}});
  const deps=collectProjectCatalogDependencies(project,[installed('effect','catalog.effect.neon-pulse','1.0.0'),installed('effect','catalog.effect.neon-pulse','1.1.0')]);
  expect(deps.filter(dependency=>dependency.id==='catalog.effect.neon-pulse').map(dependency=>dependency.version)).toEqual(['1.0.0','1.1.0']);
 });

 it('resolves exact installed versions rather than the newest or current version',()=>{
  const project=projectUsingCatalogAssets();
  const old=installed('effect','catalog.effect.neon-pulse','1.0.0');
  const newer=installed('effect','catalog.effect.neon-pulse','1.1.0');
  const resolutions=resolveProjectDependencies(project,[newer,old]);
  const effect=resolutions.find(item=>item.dependency.type==='effect'&&item.dependency.id==='catalog.effect.neon-pulse'&&item.dependency.version==='1.0.0');
  expect(effect?.status).toBe('installed');
  expect(effect?.installed?.version).toBe('1.0.0');
  const animation=resolutions.find(item=>item.dependency.type==='text-animation');
  expect(animation?.status).toBe('missing');
 });

 it('collects exact element dependencies from image asset provenance and reports missing versions',()=>{
  const project=createProject('Element deps');
  const dependency:ProjectDependency={id:'catalog.element.glow-ring',type:'element',version:'1.0.0',sourceCatalogId:'official'};
  project.assets=[{id:'element-image',name:'Glow Ring',type:'image',mime:'image/svg+xml',size:123,catalogDependency:dependency} as any];
  project.dependencies=[dependency];
  expect(collectProjectCatalogDependencies(project,[])).toEqual([dependency]);
  expect(resolveProjectDependencies(project,[])).toEqual([{dependency,status:'missing'}]);
  const current=installed('element',dependency.id,dependency.version);
  expect(resolveProjectDependencies(project,[current])[0]).toMatchObject({dependency,status:'installed',installed:{type:'element',version:'1.0.0'}});
 });
});
