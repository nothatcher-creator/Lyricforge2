// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {CatalogAssetManifest} from '@/lib/lyricforge/catalog-types';
import AdvancedInstaller,{validateManualManifestUrl} from '../AdvancedInstaller';

function manifest():CatalogAssetManifest{
 return {
  schemaVersion:1,id:'catalog.effect.manual-glow',version:'1.0.0',type:'effect',name:'Manual Glow',description:'A direct manifest install',author:'Example Author',
  sourceUrl:'https://example.test/source',license:'CC0-1.0',tags:['manual'],minAppVersion:'0.1.0',runtimeId:'effect.glow',preset:{radius:24,intensity:.7},
  preview:{kind:'image',url:'preview.svg'},package:{url:'asset.lyricforge-asset',size:20,sha256:'a'.repeat(64)},
 };
}

afterEach(()=>cleanup());

describe('advanced catalog installer',()=>{
 it('accepts HTTPS and local-development HTTP but rejects insecure remote HTTP',()=>{
  expect(validateManualManifestUrl('https://example.test/effect.json').protocol).toBe('https:');
  expect(validateManualManifestUrl('http://localhost:3000/effect.json').hostname).toBe('localhost');
  expect(validateManualManifestUrl('http://127.0.0.1:8080/effect.json').hostname).toBe('127.0.0.1');
  expect(()=>validateManualManifestUrl('http://example.test/effect.json')).toThrow(/https|localhost|insecure/i);
  expect(()=>validateManualManifestUrl('javascript:alert(1)')).toThrow(/https|url/i);
 });

 it('does not fetch a manifest until the user explicitly asks to review it',async()=>{
  const user=userEvent.setup();
  const fetchManifest=vi.fn(async()=>manifest());
  const installer={install:vi.fn(async()=>({})),installBytes:vi.fn(async()=>({}))};
  render(<AdvancedInstaller installer={installer} fetchManifest={fetchManifest}/>);
  await user.type(screen.getByLabelText('Direct manifest URL'),'https://example.test/effect.json');
  expect(fetchManifest).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Review manifest'}));
  expect(fetchManifest).toHaveBeenCalledWith('https://example.test/effect.json');
  expect(screen.getByText('Manual Glow')).toBeTruthy();
  expect(screen.getByText('Example Author')).toBeTruthy();
  expect(screen.getByText('CC0-1.0')).toBeTruthy();
  expect(installer.install).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Install Manual Glow'}));
  expect(installer.install).toHaveBeenCalledWith(manifest());
 });

 it('rejects HTML responses instead of scraping a webpage for a manifest',async()=>{
  const fetcher=vi.fn(async()=>new Response('<html>not a manifest</html>',{headers:{'content-type':'text/html'}}));
  const installer={install:vi.fn(async()=>({})),installBytes:vi.fn(async()=>({}))};
  render(<AdvancedInstaller installer={installer} fetcher={fetcher}/>);
  const user=userEvent.setup();
  await user.type(screen.getByLabelText('Direct manifest URL'),'https://example.test/page');
  await user.click(screen.getByRole('button',{name:'Review manifest'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/direct json manifest|html/i);
  expect(installer.install).not.toHaveBeenCalled();
 });
});
