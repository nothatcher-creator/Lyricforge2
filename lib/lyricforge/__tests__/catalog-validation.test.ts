import {describe,expect,it} from 'vitest';
import {compareSemVer,isAppVersionCompatible} from '../catalog-version';
import {validateCatalogAssetManifest,validateEmbeddedAssetManifest,validateCatalogIndex} from '../catalog-validation';

const packageHash='a'.repeat(64);

function effectManifest(){
 return {
  schemaVersion:1 as const,
  id:'catalog.effect.neon-pulse',
  version:'1.0.0',
  type:'effect' as const,
  name:'Neon Pulse',
  description:'Glow pulse preset',
  author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',
  license:'CC0-1.0',
  tags:['neon','glow'],
  minAppVersion:'0.1.0',
  runtimeId:'effect.glow',
  preset:{radius:28,intensity:.8},
  preview:{kind:'image' as const,url:'preview.svg'},
  package:{url:'catalog.effect.neon-pulse-1.0.0.lyricforge-asset',size:2048,sha256:packageHash},
 };
}

describe('catalog validation',()=>{
 it('accepts a trusted declarative effect manifest shape',()=>{
  const manifest=validateCatalogAssetManifest(effectManifest());
  expect(manifest.id).toBe('catalog.effect.neon-pulse');
  expect(manifest.runtimeId).toBe('effect.glow');
 });

 it('keeps legacy schema-v1 manifests valid without structured source metadata',()=>{
  expect(validateCatalogAssetManifest(effectManifest()).source).toBeUndefined();
 });

 it('accepts structured provider, creator, attribution, and discovery metadata',()=>{
  const manifest=validateCatalogAssetManifest({...effectManifest(),source:{
   provider:'Wikimedia Commons',
   itemUrl:'https://commons.wikimedia.org/wiki/File:Example.svg',
   creator:'Example Creator',
   attribution:'Example Creator, CC BY 4.0',
   discoveredVia:'Openverse',
  }});
  expect(manifest.source?.provider).toBe('Wikimedia Commons');
  expect(manifest.source?.discoveredVia).toBe('Openverse');
 });

 it('rejects blank providers and non-HTTPS source item URLs',()=>{
  expect(()=>validateCatalogAssetManifest({...effectManifest(),source:{provider:'',itemUrl:'https://example.com/item'}})).toThrow(/provider/i);
  expect(()=>validateCatalogAssetManifest({...effectManifest(),source:{provider:'Example',itemUrl:'http://example.com/item'}})).toThrow(/https/i);
 });

 it('rejects executable payload declarations in embedded packages',()=>{
  expect(()=>validateEmbeddedAssetManifest({
   schemaVersion:1,
   id:'catalog.effect.bad',
   version:'1.0.0',
   type:'effect',
   runtimeId:'effect.glow',
   files:[{path:'plugin.js',mime:'text/javascript',sha256:packageHash,size:4}],
  })).toThrow(/unsupported payload/i);
 });

 it('rejects duplicate catalog id and version pairs',()=>{
  const item=effectManifest();
  expect(()=>validateCatalogIndex({
   schemaVersion:1,
   catalogId:'official',
   generatedAt:'2026-09-13T00:00:00.000Z',
   items:[item,item],
  })).toThrow(/duplicate/i);
 });
});

describe('catalog semantic versions',()=>{
 it('compares numeric semver components rather than lexically',()=>{
  expect(compareSemVer('1.10.0','1.9.9')).toBeGreaterThan(0);
  expect(compareSemVer('1.0.0','1.0.0')).toBe(0);
  expect(compareSemVer('0.9.9','1.0.0')).toBeLessThan(0);
 });

 it('uses inclusive app compatibility bounds',()=>{
  expect(isAppVersionCompatible('0.1.0',{minAppVersion:'0.1.0',maxAppVersion:'0.2.0'})).toBe(true);
  expect(isAppVersionCompatible('0.2.0',{minAppVersion:'0.1.0',maxAppVersion:'0.2.0'})).toBe(true);
  expect(isAppVersionCompatible('0.2.1',{minAppVersion:'0.1.0',maxAppVersion:'0.2.0'})).toBe(false);
 });

 it('rejects non-canonical semantic versions',()=>{
  expect(()=>compareSemVer('1.0','1.0.0')).toThrow(/semantic version/i);
  expect(()=>compareSemVer('01.0.0','1.0.0')).toThrow(/semantic version/i);
 });
});
