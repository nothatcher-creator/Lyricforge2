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

function installed(manifest:CatalogAssetManifest):InstalledAssetVersion{
 return {id:manifest.id,type:manifest.type,version:manifest.version,catalogId:'official',manifest,installedAt:1,packageCacheKey:`package:${manifest.type}:${manifest.id}@${manifest.version}`};
}

async function fixture(withInstalled=true){
 const storage=createMemoryCatalogStorage();
 const old=effect('1.0.0');
 const latest=effect('1.1.0');
 if(withInstalled){await storage.putVersion(installed(old));await storage.setCurrentVersion('effect',old.id,old.version);}
 const index:CatalogIndex={schemaVersion:1,catalogId:'official',generatedAt:'2026-09-13T17:00:00.000Z',items:[latest]};
 const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>index,builtins:[]});
 await service.load();
 const installer={
  install:vi.fn(async()=>installed(latest)),
  repair:vi.fn(async()=>installed(old)),
  rollback:vi.fn(async()=>installed(old)),
  remove:vi.fn(async()=>{}),
 };
 return {service,installer,latest};
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
});
