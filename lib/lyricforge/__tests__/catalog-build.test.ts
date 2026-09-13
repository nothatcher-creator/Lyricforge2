import {describe,expect,it} from 'vitest';
import {strFromU8,unzipSync} from 'fflate';
import {buildAssetPackage,stableJson,sortCatalogItems,assertTrustedCatalogSource} from '../../../scripts/catalog-lib.mjs';

const encoder=new TextEncoder();

function creativeSource(){
 return {
  schemaVersion:1,
  id:'catalog.effect.neon-pulse',
  version:'1.0.0',
  type:'effect',
  name:'Neon Pulse',
  description:'A bright neon glow preset.',
  author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',
  license:'CC0-1.0',
  tags:['neon','glow'],
  minAppVersion:'0.1.0',
  runtimeId:'effect.glow',
  preset:{intensity:.85,radius:34,color:'#66ddff'},
  preview:{kind:'image',file:'preview.svg'},
 } as const;
}

describe('official catalog builder',()=>{
 it('produces byte-identical packages and hashes for identical inputs',()=>{
  const source=creativeSource();
  const payloads={'preset.json':{mime:'application/json',bytes:encoder.encode(stableJson(source.preset))}};
  const first=buildAssetPackage(source,payloads);
  const second=buildAssetPackage(source,payloads);
  expect(first.sha256).toBe(second.sha256);
  expect(first.bytes).toEqual(second.bytes);
  expect(first.embedded.files).toEqual(second.embedded.files);
 });

 it('writes a deterministic embedded manifest before sorted payload paths',()=>{
  const source=creativeSource();
  const built=buildAssetPackage(source,{
   'z-last.txt':{mime:'text/plain',bytes:encoder.encode('last')},
   'a-first.txt':{mime:'text/plain',bytes:encoder.encode('first')},
  });
  const archive=unzipSync(built.bytes);
  const manifest=JSON.parse(strFromU8(archive['manifest.json']));
  expect(manifest.files.map((file:{path:string})=>file.path)).toEqual(['a-first.txt','z-last.txt']);
  expect(Object.keys(archive)).toEqual(['manifest.json','a-first.txt','z-last.txt']);
 });

 it('sorts catalog items by type, id, and semantic version for stable index output',()=>{
  const base=creativeSource();
  const items=[
   {...base,id:'catalog.effect.zebra',version:'1.0.0'},
   {...base,id:'catalog.effect.alpha',version:'1.1.0'},
   {...base,id:'catalog.effect.alpha',version:'1.0.0'},
   {...base,type:'transition' as const,id:'catalog.transition.alpha',runtimeId:'transition.glitch',version:'1.0.0'},
  ];
  expect(sortCatalogItems(items).map(item=>`${item.type}:${item.id}@${item.version}`)).toEqual([
   'effect:catalog.effect.alpha@1.0.0',
   'effect:catalog.effect.alpha@1.1.0',
   'effect:catalog.effect.zebra@1.0.0',
   'transition:catalog.transition.alpha@1.0.0',
  ]);
 });

 it('rejects unknown creative runtimes at build time',()=>{
  expect(()=>assertTrustedCatalogSource({...creativeSource(),runtimeId:'effect.downloaded-javascript'})).toThrow(/trusted runtime/i);
  expect(()=>assertTrustedCatalogSource(creativeSource())).not.toThrow();
 });

 it('supports a redistributable font payload with its license in the same package',()=>{
  const source={
   schemaVersion:1,id:'catalog.font.bebas-neue',version:'1.0.0',type:'font' as const,name:'Bebas Neue',description:'Condensed display font.',author:'Ryoichi Tsunekawa / Dharma Type',sourceUrl:'https://github.com/google/fonts/tree/main/ofl/bebasneue',license:'OFL-1.1',licenseUrl:'https://openfontlicense.org/open-font-license-official-text/',tags:['display','condensed'],minAppVersion:'0.1.0',font:{family:'Bebas Neue',style:'normal' as const,weight:400},preview:{kind:'image' as const,file:'preview.svg'},
  };
  assertTrustedCatalogSource(source);
  const built=buildAssetPackage(source,{
   'BebasNeue-Regular.ttf':{mime:'font/ttf',bytes:new Uint8Array([0,1,0,0,98,101,98,97,115])},
   'OFL.txt':{mime:'text/plain',bytes:encoder.encode('SIL OPEN FONT LICENSE Version 1.1')},
  });
  const archive=unzipSync(built.bytes);
  expect(archive['BebasNeue-Regular.ttf']).toBeDefined();
  expect(strFromU8(archive['OFL.txt'])).toMatch(/OPEN FONT LICENSE/);
  expect(built.embedded.font?.family).toBe('Bebas Neue');
 });
});
