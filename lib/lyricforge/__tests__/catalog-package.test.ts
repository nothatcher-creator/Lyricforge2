import {describe,expect,it} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import type {CatalogAssetManifest,EmbeddedAssetManifest} from '../catalog-types';
import {sha256Hex,validateCatalogPackage} from '../catalog-package';

const ZERO_HASH='0'.repeat(64);

function baseRemote(overrides:Partial<CatalogAssetManifest>={}):CatalogAssetManifest{
 return {
  schemaVersion:1,id:'catalog.effect.neon-pulse',version:'1.0.0',type:'effect',
  name:'Neon Pulse',description:'Glow pulse preset',author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['neon'],
  minAppVersion:'0.1.0',runtimeId:'effect.glow',preset:{radius:28,intensity:.8},
  preview:{kind:'image',url:'preview.svg'},
  package:{url:'catalog.effect.neon-pulse-1.0.0.lyricforge-asset',size:1,sha256:ZERO_HASH},
  ...overrides,
 };
}

async function packageFixture(extra:Record<string,Uint8Array>={},embeddedOverrides:Partial<EmbeddedAssetManifest>={}){
 const preset=strToU8(JSON.stringify({radius:28,intensity:.8}));
 const preview=strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
 const embedded:EmbeddedAssetManifest={
  schemaVersion:1,id:'catalog.effect.neon-pulse',version:'1.0.0',type:'effect',runtimeId:'effect.glow',preset:{radius:28,intensity:.8},
  files:[
   {path:'preset.json',mime:'application/json',size:preset.byteLength,sha256:await sha256Hex(preset)},
   {path:'preview.svg',mime:'image/svg+xml',size:preview.byteLength,sha256:await sha256Hex(preview)},
  ],
  ...embeddedOverrides,
 };
 const bytes=zipSync({'manifest.json':strToU8(JSON.stringify(embedded)),'preset.json':preset,'preview.svg':preview,...extra},{level:0});
 const remote=baseRemote({package:{url:'asset.lyricforge-asset',size:bytes.byteLength,sha256:await sha256Hex(bytes)}});
 return {bytes,remote,embedded};
}

async function elementPackageFixture(remoteFile='glow-ring.svg',embeddedFile='glow-ring.svg'){
 const svg=strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
 const descriptor={file:embeddedFile,mime:'image/svg+xml' as const,width:100,height:100,defaultDurationMs:5000,defaultFit:'contain' as const};
 const embedded:EmbeddedAssetManifest={
  schemaVersion:1,id:'catalog.element.glow-ring',version:'1.0.0',type:'element',element:descriptor,
  files:[{path:embeddedFile,mime:'image/svg+xml',size:svg.byteLength,sha256:await sha256Hex(svg)}],
 };
 const bytes=zipSync({'manifest.json':strToU8(JSON.stringify(embedded)),[embeddedFile]:svg},{level:0});
 const remote:CatalogAssetManifest={
  schemaVersion:1,id:embedded.id,version:embedded.version,type:'element',name:'Glow Ring',description:'SVG glow ring',author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['overlay','glow'],minAppVersion:'0.1.0',
  preview:{kind:'image',url:'preview.svg'},element:{...descriptor,file:remoteFile},
  package:{url:'asset.lyricforge-asset',size:bytes.byteLength,sha256:await sha256Hex(bytes)},
 };
 return {bytes,remote,embedded,svg};
}

describe('catalog package validation',()=>{
 it('accepts a declared package whose whole-package and file hashes match',async()=>{
  const {bytes,remote}=await packageFixture();
  const validated=await validateCatalogPackage(bytes,remote);
  expect(validated.manifest.id).toBe(remote.id);
  expect([...validated.files.keys()].sort()).toEqual(['preset.json','preview.svg']);
 });

 it('accepts a verified element package and exposes its declared SVG bytes',async()=>{
  const {bytes,remote,svg}=await elementPackageFixture();
  const validated=await validateCatalogPackage(bytes,remote);
  expect(validated.manifest.element).toEqual(remote.element);
  expect(Array.from(validated.files.get('glow-ring.svg')??[])).toEqual(Array.from(svg));
 });

 it('rejects element packages whose embedded descriptor differs from the remote manifest',async()=>{
  const {bytes,remote}=await elementPackageFixture('catalog-ring.svg','embedded-ring.svg');
  await expect(validateCatalogPackage(bytes,remote)).rejects.toThrow(/element|identity|metadata/i);
 });

 it('rejects a package whose external sha256 does not match',async()=>{
  const {bytes,remote}=await packageFixture();
  await expect(validateCatalogPackage(bytes,{...remote,package:{...remote.package,sha256:ZERO_HASH}})).rejects.toThrow(/sha-256/i);
 });

 it('rejects path traversal entries before activation',async()=>{
  const {bytes,remote}=await packageFixture({'../evil.txt':strToU8('nope')});
  await expect(validateCatalogPackage(bytes,remote)).rejects.toThrow(/path traversal|unsafe package path/i);
 });

 it('rejects undeclared files',async()=>{
  const {bytes,remote}=await packageFixture({'surprise.txt':strToU8('not declared')});
  await expect(validateCatalogPackage(bytes,remote)).rejects.toThrow(/undeclared/i);
 });

 it('rejects declared files whose bytes do not match the embedded integrity metadata',async()=>{
  const declared=strToU8('expected');
  const actual=strToU8('tampered');
  const embedded:EmbeddedAssetManifest={
   schemaVersion:1,id:'catalog.effect.neon-pulse',version:'1.0.0',type:'effect',runtimeId:'effect.glow',
   files:[{path:'preset.json',mime:'application/json',size:actual.byteLength,sha256:await sha256Hex(declared)}],
  };
  const bytes=zipSync({'manifest.json':strToU8(JSON.stringify(embedded)),'preset.json':actual},{level:0});
  const remote=baseRemote({package:{url:'asset.lyricforge-asset',size:bytes.byteLength,sha256:await sha256Hex(bytes)}});
  await expect(validateCatalogPackage(bytes,remote)).rejects.toThrow(/integrity|sha-256/i);
 });

 it('rejects embedded identity that does not match the remote manifest',async()=>{
  const {bytes,remote}=await packageFixture({}, {version:'2.0.0'});
  await expect(validateCatalogPackage(bytes,remote)).rejects.toThrow(/identity|version/i);
 });
});
