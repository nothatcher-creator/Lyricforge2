// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import type {CatalogAssetManifest,EmbeddedAssetManifest,InstalledAssetVersion} from '../catalog-types';
import {sha256Hex} from '../catalog-package';
import {parseCatalogFontFamily} from '../creative-assets';
import {catalogFontFamily,clearCatalogFonts,getCatalogFontsSnapshot,loadInstalledCatalogFont,unloadCatalogFont} from '../catalog-fonts';

const FONT_BYTES=new Uint8Array([0,1,0,0,0,12,0,128,0,3,0,80]);

async function fontFixture(version='1.0.0'){
 const filePath='BebasNeue-Regular.ttf';
 const embedded:EmbeddedAssetManifest={
  schemaVersion:1,id:'catalog.font.bebas-neue',version,type:'font',font:{family:'Bebas Neue',style:'normal',weight:400},
  files:[{path:filePath,mime:'font/ttf',size:FONT_BYTES.byteLength,sha256:await sha256Hex(FONT_BYTES)}],
 };
 const bytes=zipSync({'manifest.json':strToU8(JSON.stringify(embedded)),[filePath]:FONT_BYTES},{level:0});
 const manifest:CatalogAssetManifest={
  schemaVersion:1,id:embedded.id,version,type:'font',name:'Bebas Neue',description:'Tall display type',author:'Ryoichi Tsunekawa',
  sourceUrl:'https://github.com/google/fonts',license:'OFL-1.1',licenseUrl:'https://openfontlicense.org',tags:['display'],minAppVersion:'0.1.0',
  preview:{kind:'image',url:'preview.svg'},package:{url:`bebas-${version}.lyricforge-asset`,size:bytes.byteLength,sha256:await sha256Hex(bytes)},font:embedded.font,
 };
 const record:InstalledAssetVersion={id:manifest.id,type:'font',version,catalogId:'official',installedAt:1,manifest,packageCacheKey:`package:font:${manifest.id}@${version}`};
 return {record,bytes};
}

class TestFontFace{
 family:string;
 status='unloaded';
 constructor(family:string,_source:string|BufferSource,_descriptors?:FontFaceDescriptors){this.family=family;}
 async load(){this.status='loaded';return this as unknown as FontFace;}
}

let added:FontFace[]=[];
let removed:FontFace[]=[];

beforeEach(()=>{
 added=[];removed=[];
 Object.defineProperty(globalThis,'FontFace',{configurable:true,writable:true,value:TestFontFace});
 Object.defineProperty(document,'fonts',{configurable:true,value:{
  add:(face:FontFace)=>{added.push(face);return face;},
  delete:(face:FontFace)=>{removed.push(face);return true;},
 } as unknown as FontFaceSet});
});
afterEach(()=>clearCatalogFonts());

describe('catalog fonts',()=>{
 it('uses deterministic distinct CSS family names for exact installed versions',()=>{
  const first=catalogFontFamily('catalog.font.bebas-neue','1.0.0','Bebas Neue');
  const second=catalogFontFamily('catalog.font.bebas-neue','1.1.0','Bebas Neue');
  expect(first).toBe('LyricForge Catalog Bebas Neue [catalog.font.bebas-neue@1.0.0]');
  expect(second).not.toBe(first);
  expect(parseCatalogFontFamily(first)).toEqual({id:'catalog.font.bebas-neue',type:'font',version:'1.0.0'});
 });

 it('validates the stored package before registering a versioned FontFace',async()=>{
  const {record,bytes}=await fontFixture();
  const loaded=await loadInstalledCatalogFont(record,bytes);
  expect(loaded.family).toBe(catalogFontFamily(record.id,record.version,'Bebas Neue'));
  expect(loaded.name).toBe('Bebas Neue');
  expect(getCatalogFontsSnapshot()).toEqual([expect.objectContaining({id:record.id,version:'1.0.0',name:'Bebas Neue',family:loaded.family})]);
  expect(added).toHaveLength(1);
  unloadCatalogFont(record.id,record.version);
  expect(getCatalogFontsSnapshot()).toEqual([]);
  expect(removed).toHaveLength(1);
 });

 it('refuses a package whose bytes no longer match the installed manifest',async()=>{
  const {record,bytes}=await fontFixture();
  const corrupt=new Uint8Array(bytes);corrupt[corrupt.length-1]^=1;
  await expect(loadInstalledCatalogFont(record,corrupt)).rejects.toThrow(/sha-256|integrity|zip/i);
  expect(getCatalogFontsSnapshot()).toEqual([]);
  expect(added).toHaveLength(0);
 });
});
