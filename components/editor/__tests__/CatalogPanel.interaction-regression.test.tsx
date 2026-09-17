// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {CatalogAssetManifest,CatalogIndex,InstalledAssetVersion} from '@/lib/lyricforge/catalog-types';
import {CatalogService} from '@/lib/lyricforge/catalog-service';
import {createMemoryCatalogStorage} from '@/lib/lyricforge/catalog-storage';
import CatalogPanel from '../CatalogPanel';

const manifest:CatalogAssetManifest={
  schemaVersion:1,id:'catalog.effect.tap-test',version:'1.0.0',type:'effect',name:'Tap Test Glow',description:'A catalog interaction fixture',author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',license:'CC0-1.0',tags:['tap'],minAppVersion:'0.1.0',runtimeId:'effect.glow',preset:{radius:20},
  preview:{kind:'image',url:'assets/effect/catalog.effect.tap-test/1.0.0/preview.svg'},package:{url:'assets/effect/catalog.effect.tap-test/1.0.0/asset.lyricforge-asset',size:128,sha256:'a'.repeat(64)},
};
const installed=(input:CatalogAssetManifest):InstalledAssetVersion=>({id:input.id,type:input.type,version:input.version,catalogId:'official',manifest:input,installedAt:1,packageCacheKey:`package:${input.type}:${input.id}@${input.version}`});

async function fixture(){
  const storage=createMemoryCatalogStorage();
  const index:CatalogIndex={schemaVersion:1,catalogId:'official',generatedAt:'2026-09-17T00:00:00.000Z',items:[manifest]};
  const service=new CatalogService({storage,appVersion:'0.1.0',fetchIndex:async()=>index,builtins:[]});
  await service.load();
  const installer={install:vi.fn(async(input:CatalogAssetManifest)=>installed(input)),repair:vi.fn(),rollback:vi.fn(),remove:vi.fn()};
  return {service,installer};
}

afterEach(()=>cleanup());

describe('catalog touch interactions',()=>{
  it('opens details when the user taps the visible card body, not only the preview or Details button',async()=>{
    const user=userEvent.setup();
    const {service,installer}=await fixture();
    render(<CatalogPanel service={service} installer={installer} mobile/>);
    await user.click(screen.getByText('Tap Test Glow'));
    expect(screen.getByLabelText('Tap Test Glow details')).toBeTruthy();
  });

  it('provides the primary install action inside the details view',async()=>{
    const user=userEvent.setup();
    const {service,installer}=await fixture();
    render(<CatalogPanel service={service} installer={installer} mobile/>);
    await user.click(screen.getByRole('button',{name:'Details Tap Test Glow'}));
    const detail=screen.getByLabelText('Tap Test Glow details');
    const install=within(detail).getByRole('button',{name:'Install Tap Test Glow'});
    await user.click(install);
    expect(installer.install).toHaveBeenCalledWith(manifest);
  });
});