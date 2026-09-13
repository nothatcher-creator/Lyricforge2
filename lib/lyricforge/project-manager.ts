'use client';
import {zip,unzip,strToU8,strFromU8} from 'fflate';
import {z} from 'zod';
import {assets} from './assets';
import {prepareDownload} from './downloads';
import {defaultStyle,ANIMATIONS,type Project,type Asset} from './model';
import {migrateProjectDocument,PROJECT_SCHEMA_VERSION} from './project-migration';
import {collectProjectCatalogDependencies,resolveProjectDependencies} from './catalog-dependencies';
import {bundleCatalogDependencies,restoreBundledCatalogDependencies} from './catalog-bundle';
import {getBrowserCatalogStorage} from './catalog-storage';
import {CATALOG_APP_VERSION} from './catalog-types';
import {isTrustedRuntime} from './creative-registry';

let database:Promise<IDBDatabase>|null=null;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('lyricforge-studio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});r.result.createObjectStore('assets');r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transaction<T>(stores:string[],mode:IDBTransactionMode,action:(t:IDBTransaction)=>IDBRequest<T>|void):Promise<T|undefined>{const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(stores,mode);const r=action(tx);tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
const persistedAssets=new Map<string,Blob>();
let lastCatalogRestoreErrors:string[]=[];

export function getLastCatalogRestoreErrors(){return [...lastCatalogRestoreErrors];}
export interface ProjectBundleOptions{allowUnknownFontLicenses?:boolean;}
export class UnknownFontLicenseBundleError extends Error{
 readonly fonts:string[];
 constructor(fonts:string[]){super(`Bundling these user-imported fonts may redistribute files with unknown license rights: ${fonts.join(', ')}`);this.name='UnknownFontLicenseBundleError';this.fonts=[...fonts];}
}
export function assertProjectFontBundleLicenses(p:Project,options:ProjectBundleOptions={}){const fonts=p.assets.filter(asset=>asset.type==='font').map(asset=>asset.name);if(fonts.length&&!options.allowUnknownFontLicenses)throw new UnknownFontLicenseBundleError(fonts);}
export async function resolveCurrentProjectDependencies(p:Project){return resolveProjectDependencies(p,await getBrowserCatalogStorage().listVersions());}
export async function saveProject(p:Project){const catalog=getBrowserCatalogStorage();const dependencies=collectProjectCatalogDependencies(p,await catalog.listVersions());const saved={...p,dependencies};const pending=saved.assets.map(a=>({id:a.id,blob:assets.blobs.get(a.id)})).filter(a=>a.blob&&persistedAssets.get(a.id)!==a.blob);await transaction(['projects','assets','settings'],'readwrite',tx=>{tx.objectStore('projects').put(saved);for(const a of pending)tx.objectStore('assets').put(a.blob,a.id);tx.objectStore('settings').put(saved.id,'lastProject');});await catalog.setProjectDependencies(saved.id,dependencies);for(const a of pending)persistedAssets.set(a.id,a.blob!);}
export async function recentProjects(){return await transaction<Project[]>(['projects'],'readonly',t=>t.objectStore('projects').getAll())||[];}
export async function openProject(id:string){const raw=await transaction<unknown>(['projects'],'readonly',t=>t.objectStore('projects').get(id));if(!raw)throw new Error('This project was not found on this device.');const p=validateProject(raw);await hydrate(p);return p;}
export async function lastProject(){return await transaction<string>(['settings'],'readonly',t=>t.objectStore('settings').get('lastProject'));}
export async function saveSetting(key:string,value:unknown){await transaction(['settings'],'readwrite',t=>t.objectStore('settings').put(value,key));}
export async function loadSetting<T>(key:string){return await transaction<T>(['settings'],'readonly',t=>t.objectStore('settings').get(key));}
export async function hydrate(p:Project){for(const a of p.assets){if(assets.blobs.has(a.id))continue;const b=await transaction<Blob>(['assets'],'readonly',t=>t.objectStore('assets').get(a.id));if(!b)throw new Error(`Missing media: ${a.name}. Open a bundled project file or reimport this file.`);await assets.load(a,b);persistedAssets.set(a.id,b);}}
export async function projectFile(p:Project,options:ProjectBundleOptions={}){assertProjectFontBundleLicenses(p,options);const directDependencies=collectProjectCatalogDependencies(p,[]);const bundle=directDependencies.length?await bundleCatalogDependencies(p,getBrowserCatalogStorage()):{project:{...p,dependencies:[]},entries:{} as Record<string,Uint8Array>};const entries:Record<string,Uint8Array>={'project.json':strToU8(JSON.stringify(bundle.project)),...bundle.entries};for(const a of bundle.project.assets){const b=assets.blobs.get(a.id);if(!b)throw new Error(`Cannot bundle missing media: ${a.name}`);entries['assets/'+a.id]=new Uint8Array(await b.arrayBuffer());}return new Promise<Blob>((resolve,reject)=>zip(entries,{level:0},(error,data)=>error?reject(error):resolve(new Blob([data as BlobPart],{type:'application/zip'}))));}

const finite=z.number().finite();
const time=finite.min(0).max(86400000);
const id=z.string().min(1).max(120);
const version=z.string().min(1).max(80);
const color=z.string().regex(/^#[0-9a-f]{6}$/i);
const easing=z.enum(['linear','ease-in','ease-out','ease-in-out']);
const creativeValue=z.union([z.string().max(1000),finite,z.boolean()]);
const creativeKeyframe=z.object({id,timeMs:time,value:creativeValue,easing});
const paramKeyframes=z.record(z.array(creativeKeyframe).max(5000));
const params=z.record(creativeValue);
const animationInstance=z.object({assetId:id,version,role:z.enum(['intro','loop','outro']),enabled:z.boolean(),params,keyframes:paramKeyframes});
const effectInstance=z.object({id,assetId:id,version,enabled:z.boolean(),params,keyframes:paramKeyframes});
const transitionInstance=z.object({id,assetId:id,version,incomingItemId:id,outgoingItemId:id,durationMs:finite.min(1).max(60000),easing,params});
const dependency=z.object({id,type:z.enum(['font','effect','transition','text-animation']),version,sourceCatalogId:z.string().min(1).max(120).optional()});
const animations=z.object({intro:animationInstance.optional(),loop:animationInstance.optional(),outro:animationInstance.optional()}).optional();
const style=z.object(Object.fromEntries(Object.entries(defaultStyle).map(([k,v])=>[k,typeof v==='boolean'?z.boolean():typeof v==='number'?finite:typeof v==='string'&&v.startsWith('#')?color:z.string().max(160)]))).partial();
const word=z.object({text:z.string().max(500),start:time,end:time,confidence:finite.min(0).max(1).optional(),emphasized:z.boolean().optional()}).refine(w=>w.end>=w.start,'Word end must follow its start');
const key=z.object({id,time,property:z.enum(['x','y','scale','rotation','opacity','blur','size','color','glow','intensity']),value:z.union([finite,color]),easing});
const clip=z.object({id,trackId:id,kind:z.enum(['audio','lyrics','text','image','video','visualizer','effect']),start:time,end:time,name:z.string().max(10000),text:z.string().max(10000),assetId:id.optional(),offset:time,loop:z.boolean(),section:z.enum(['Verse','Chorus','Bridge','Intro','Outro','Instrumental']),words:z.array(word).max(3000),confidence:finite.min(0).max(1).optional(),timingSource:z.enum(['manual','estimated','detected']).optional(),style,keyframes:z.array(key).max(5000),group:id.optional(),animations,effects:z.array(effectInstance).max(200),fit:z.enum(['cover','contain']),brightness:finite.min(0).max(5),contrast:finite.min(0).max(5),saturation:finite.min(0).max(5),hue:finite.min(-360).max(360),blend:z.enum(['source-over','multiply','screen','overlay','lighten','darken','difference','color-dodge']),visualizer:z.enum(['Bars','Spectrum','Waveform','Circle','Particles','Glow','Beat flash']).optional(),sensitivity:finite.min(0).max(10),smoothing:finite.min(0).max(1)}).refine(c=>c.end>c.start,'Clip end must follow its start');
const schema=z.object({version:z.literal(1),schemaVersion:z.literal(PROJECT_SCHEMA_VERSION),id,name:z.string().max(300),createdAt:finite,updatedAt:finite,width:finite.int().min(128).max(7680),height:finite.int().min(128).max(7680),fps:z.union([z.literal(24),z.literal(30),z.literal(60)]),duration:time.min(10),tracks:z.array(z.object({id,name:z.string().max(300),kind:z.enum(['audio','lyrics','text','image','video','visualizer','effect']),visible:z.boolean(),locked:z.boolean(),mute:z.boolean(),solo:z.boolean(),opacity:finite.min(0).max(1)})).max(200),clips:z.array(clip).max(20000),assets:z.array(z.object({id,name:z.string().max(500),type:z.enum(['audio','image','video','font']),mime:z.string().max(200),size:finite.min(0).max(2e9),duration:time.optional(),fontFamily:z.string().max(160).optional()})).max(2000),dependencies:z.array(dependency).max(2000),masterEffects:z.array(effectInstance).max(200),transitions:z.array(transitionInstance).max(5000),lyricStyle:style,background:z.object({type:z.enum(['gradient','solid','pattern']),color,color2:color,angle:finite,vignette:finite.min(0).max(1),motion:finite.min(0).max(1)}),markers:z.array(z.object({id,time,name:z.string().max(300)})).max(10000),beats:z.array(time).max(100000),bpm:finite.min(0).max(300),waveform:z.array(finite).max(100000),energy:z.array(finite).max(5000000),spectrum:z.array(z.array(finite).max(64)).max(2500000).optional(),preset:z.string().max(200),sections:z.array(z.object({start:time,end:time,name:z.string().max(100),estimated:z.boolean()})).max(10000)});

export function validateProject(data:unknown):Project {
  const migrated=migrateProjectDocument(data);
  const res=schema.safeParse(migrated);
  if(!res.success)throw new Error('Invalid project file: '+res.error.issues[0].path.join('.')+' '+res.error.issues[0].message);
  const p=res.data as unknown as Project;
  const trackIds=new Set(p.tracks.map(t=>t.id));
  const clipIds=new Set(p.clips.map(c=>c.id));
  if(trackIds.size!==p.tracks.length||new Set(p.assets.map(a=>a.id)).size!==p.assets.length)throw new Error('Duplicate track or media IDs in project.');
  for(const c of p.clips){
    if(['audio','image','video'].includes(c.kind)&&!p.assets.some(a=>a.id===c.assetId&&a.type===c.kind))throw new Error('A clip references missing or incompatible media.');
    if(c.animations){for(const role of ['intro','loop','outro'] as const){const instance=c.animations[role];if(instance&&instance.role!==role)throw new Error('Animation role does not match its slot.');}}
  }
  for(const transition of p.transitions){if(!clipIds.has(transition.incomingItemId)||!clipIds.has(transition.outgoingItemId))throw new Error('A transition references a missing clip.');}
  for(const a of p.assets){if(a.type==='font'&&!a.fontFamily)throw new Error('An imported font is missing its family name.');}
  if(p.clips.some(c=>!trackIds.has(c.trackId)))throw new Error('A clip references a missing track.');
  if(clipIds.size!==p.clips.length)throw new Error('Duplicate clip IDs in project.');
  for(const s of [p.lyricStyle,...p.clips.map(c=>c.style)]){for(const field of ['entrance','idle','exit','emphasis'] as const)if(s[field]&&!ANIMATIONS.includes(s[field]!))throw new Error('Unsupported animation.');if(s.size!==undefined&&(s.size<1||s.size>600))throw new Error('Font size outside supported range.');if(s.scale!==undefined&&(s.scale<.01||s.scale>10))throw new Error('Scale outside supported range.');}
  p.lyricStyle={...defaultStyle,...p.lyricStyle};
  p.spectrum??=[];
  return p;
}

export async function importProject(file:File){if(file.size>750e6)throw new Error('This project exceeds the 750 MB browser import limit.');const bytes=new Uint8Array(await file.arrayBuffer());lastCatalogRestoreErrors=[];if(file.name.endsWith('.json')){const p=validateProject(JSON.parse(strFromU8(bytes)));await hydrate(p);return p;}let total=0;const archive=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>unzip(bytes,{filter:f=>{total+=f.originalSize;if(total>750e6)throw new Error('Project archive is too large.');return f.name==='project.json'||f.name.startsWith('assets/')||f.name.startsWith('catalog/');}},(e,d)=>e?reject(e):resolve(d)));if(!archive['project.json'])throw new Error('This is not a LyricForge project file.');const p=validateProject(JSON.parse(strFromU8(archive['project.json'])));const restored=await restoreBundledCatalogDependencies(p,archive,getBrowserCatalogStorage(),{appVersion:CATALOG_APP_VERSION,isTrustedRuntime});lastCatalogRestoreErrors=restored.errors;for(const a of p.assets){const data=archive['assets/'+a.id];if(!data)throw new Error(`Project archive is missing ${a.name}.`);await assets.load(a,new Blob([data as BlobPart],{type:a.mime}));}return p;}
export const download = prepareDownload;
