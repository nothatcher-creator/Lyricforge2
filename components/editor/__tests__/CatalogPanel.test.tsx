// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {CatalogAssetManifest,CatalogIndex,InstalledAssetVersion} from '@/lib/lyricforge/catalog-types';
import {CatalogService} from '@/lib/lyricforge/catalog-service';
import {createMemoryCatalogStorage} from '@/lib/lyricforge/catalog-storage';
import CatalogPanel from '../CatalogPanel';

function effect(version:string):CatalogAssetManifest{
 return {
  schemaVersion:1,id:'catalog.effect.neon-pulse',version,type:'effect',name:'Neon Pulse',description:'Bright lyric glow',author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['neon','lyrics'],minAppVersion:'0.1.0',runtimeId:'effect.glow',
  preset:{radius:30,intensity:.8},preview:{kind:'image',url:'assets/effect/catalog.effect.neon-pulse/1.1.0/preview.svg'},
  package:{url:`assets/effect/catalog.effect.neon-pulse/${version}/asset.lyricforge-asset`,size:128,sha256:'a'.repeat(64)},
 };
}

function element():CatalogAssetManifest{
 return {
  schemaVersion:1,id:'catalog.element.glow-ring',version:'1.0.0',type:'element',name:'Glow Ring',description:'Reusable SVG glow ring',author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['overlay','glow'],minAppVersion:'0.1.0',
  preview:{kind:'image',url:'assets/element/catalog.element.glow-ring/1.0.0/preview.svg'},
  package:{url:'assets/element/catalog.element.glow-ring/1.0.0/asset.lyricforge-asset',size:128,sha256:'c'.repeat(64)},
  element:{file:'glow-ring.svg',mime:'image/svg+xml',width:1080,height:1080,defaultDurationMs:5000,defaultFit:'contain'},
 };
}

function commonsEffect():CatalogAssetManifest{
 return {
  schemaVersion:1,id:'catalog.effect.commons-glow',version:'1.0.0',type:'effect',name:'Commons Glow',description:'Soft sourced glow',author:'Example Artist',
  sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.svg',source:{provider:'Wikimedia Commons',itemUrl:'https://commons.wikimedia.org/wiki/File:Example.svg',creator:'Example Artist',attribution:'Example Artist, CC BY 4.0',discoveredVia:'Openverse'},
  license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',tags:['soft','glow'],minAppVersion:'0.1.0',runtimeId:'effect.glow',
  preset:{radius:24,intensity:.55},preview:{kind:'image',url:'assets/effect/catalog.effect.commons-glow/1.0.0/preview.svg'},
  package:{url:'assets/effect/catalog.effect.commons-glow/1.0.0/asset.lyricforge-asset',size:128,sha256:'b'.repeat(64)},
 };
}

function installed(manifest:CatalogAssetManifest):InstalledAssetVersion{
 return {id:manifest.id,type:manifest.type,version:manifest.version,catalogId:'official',manifest,installedAt:1,packageCacheKey:`package:${manifest.type}:${manifest.id}@${manifest.version}`};
}

async function fixture(withInstalled=true,withMultipleProviders=false){
 const storage=createMemoryCatalogStorage();
 const old=effect('1.0.0');
 const latest=effect('1.1.0');
 if(withInstalled){await storage.putVersion(installed(old));await storage.setCurrentVersion('effect',old.id,old.version);}
 const items=withMultipleProviders?[latest,commonsEffect()]:[latest];
 const index:CatalogIndex={schemaVersion:1,catalogId:'official',generatedAt:'2026-09-13T17:00:00.000Z',items};
 const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>index,builtins:[]});
 await service.load();
 const installer={
  install:vi.fn(async(manifest:CatalogAssetManifest)=>installed(manifest)),
  repair:vi.fn(async()=>installed(old)),
  rollback:vi.fn(async()=>installed(old)),
  remove:vi.fn(async()=>{}),
 };
 return {service,installer,latest};
}

async function elementFixture(withInstalled=false){
 const storage=createMemoryCatalogStorage();
 const manifest=element();
 if(withInstalled){await storage.putVersion(installed(manifest));await storage.setCurrentVersion('element',manifest.id,manifest.version);}
 const index:CatalogIndex={schemaVersion:1,catalogId:'official',generatedAt:'2026-09-16T07:00:00.000Z',items:[manifest]};
 const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>index,builtins:[]});
 await service.load();
 const installer={
  install:vi.fn(async(input:CatalogAssetManifest)=>installed(input)),
  repair:vi.fn(async()=>installed(manifest)),
  rollback:vi.fn(async()=>installed(manifest)),
  remove:vi.fn(async()=>{}),
 };
 return {service,installer,manifest};
}

afterEach(()=>cleanup());

describe('CatalogPanel',()=>{
 it('filters installed effects and exposes the compatible update action',async()=>{
  const user=userEvent.setup();
  const {service,installer,latest}=await fixture(true);
  render(<CatalogPanel service={service} installer={installer} mobile={false}/>);

  await user.click(screen.getByRole('tab',{name:'Effects'}));
  await user.click(screen.getByRole('button',{name:'Installed'}));
  expect(screen.getByText('Neon Pulse')).toBeTruthy();
  const update=screen.getByRole('button',{name:'Update Neon Pulse'});
  expect(update).toBeTruthy();
  await user.click(update);
  expect(installer.install).toHaveBeenCalledWith(latest);
 });

 it('opens item details when the large catalog preview is tapped',async()=>{
  const user=userEvent.setup();
  const {service,installer}=await fixture(false);
  render(<CatalogPanel service={service} installer={installer} mobile/>);
  await user.click(screen.getByRole('tab',{name:'Effects'}));
  await user.click(screen.getByRole('button',{name:'Online'}));
  await user.click(screen.getByRole('button',{name:'Open details for Neon Pulse'}));
  expect(screen.getByRole('heading',{name:'Neon Pulse'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Close catalog details'})).toBeTruthy();
 });

 it('shows source provider chips and filters a multi-provider category',async()=>{
  const user=userEvent.setup();
  const {service,installer}=await fixture(false,true);
  render(<CatalogPanel service={service} installer={installer} mobile={false}/>);
  await user.click(screen.getByRole('tab',{name:'Effects'}));
  await user.click(screen.getByRole('button',{name:'Online'}));
  expect(screen.getByLabelText('Source provider Wikimedia Commons')).toBeTruthy();
  const provider=screen.getByLabelText('Provider filter');
  await user.selectOptions(provider,'Wikimedia Commons');
  expect(screen.getByText('Commons Glow')).toBeTruthy();
  expect(screen.queryByText('Neon Pulse')).toBeNull();
  await user.selectOptions(provider,'LyricForge');
  expect(screen.getByText('Neon Pulse')).toBeTruthy();
  expect(screen.queryByText('Commons Glow')).toBeNull();
 });

 it('does not show a provider selector when the current category has only one source',async()=>{
  const {service,installer}=await fixture(false,false);
  render(<CatalogPanel service={service} installer={installer} mobile={false}/>);
  expect(screen.queryByLabelText('Provider filter')).toBeNull();
  expect(screen.getByLabelText('Source provider LyricForge')).toBeTruthy();
 });

 it('uses full-height dialog semantics and touch-sized install controls on phone portrait',async()=>{
  const user=userEvent.setup();
  const {service,installer}=await fixture(false);
  render(<CatalogPanel service={service} installer={installer} mobile/>);

  const dialog=screen.getByRole('dialog',{name:'Asset catalog'});
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.className).toContain('catalog-sheet');
  await user.click(screen.getByRole('tab',{name:'Effects'}));
  await user.click(screen.getByRole('button',{name:'Online'}));
  const install=screen.getByRole('button',{name:'Install Neon Pulse'});
  expect(Number.parseFloat(install.style.minHeight)).toBeGreaterThanOrEqual(44);
 });

 it('shows an Elements tab and installs an online element',async()=>{
  const user=userEvent.setup();
  const {service,installer,manifest}=await elementFixture(false);
  render(<CatalogPanel service={service} installer={installer} mobile={false}/>);
  await user.click(screen.getByRole('tab',{name:'Elements'}));
  await user.click(screen.getByRole('button',{name:'Online'}));
  const install=screen.getByRole('button',{name:'Install Glow Ring'});
  await user.click(install);
  expect(installer.install).toHaveBeenCalledWith(manifest);
 });

 it('adds an installed element to the project using its exact id and version',async()=>{
  const user=userEvent.setup();
  const {service,installer,manifest}=await elementFixture(true);
  const onAddElement=vi.fn(async()=>{});
  render(<CatalogPanel service={service} installer={installer} mobile onAddElement={onAddElement}/>);
  await user.click(screen.getByRole('tab',{name:'Elements'}));
  await user.click(screen.getByRole('button',{name:'Installed'}));
  const add=screen.getByRole('button',{name:'Add to project Glow Ring'});
  expect(Number.parseFloat(add.style.minHeight)).toBeGreaterThanOrEqual(44);
  await user.click(add);
  expect(onAddElement).toHaveBeenCalledWith({id:manifest.id,version:manifest.version});
  expect(installer.install).not.toHaveBeenCalled();
 });
});

describe('CatalogPanel touch activation',()=>{
 it('makes the mobile preview a large touch target that opens asset details',async()=>{
  const user=userEvent.setup();
  const {service,installer}=await fixture(false);
  render(<CatalogPanel service={service} installer={installer} mobile/>);
  const preview=screen.getByRole('button',{name:'Open details for Neon Pulse'});
  expect(Number.parseFloat(preview.style.minHeight)).toBeGreaterThanOrEqual(44);
  await user.click(preview);
  expect(screen.getByRole('heading',{name:'Neon Pulse'})).toBeTruthy();
 });
});
