// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ProjectDependencyResolution} from '@/lib/lyricforge/catalog-dependencies';
import RestoreDependenciesPanel from '../RestoreDependenciesPanel';

const missing:ProjectDependencyResolution[]=[
 {dependency:{id:'catalog.effect.neon-pulse',type:'effect',version:'1.0.0',sourceCatalogId:'official'},status:'missing'},
 {dependency:{id:'catalog.transition.soft-glitch',type:'transition',version:'1.0.0',sourceCatalogId:'official'},status:'missing'},
];

afterEach(()=>cleanup());

describe('RestoreDependenciesPanel',()=>{
 it('shows exact missing versions without restoring anything before user action',()=>{
  const restore=vi.fn();
  render(<RestoreDependenciesPanel missing={missing} onRestore={restore}/>);
  expect(screen.getByText('catalog.effect.neon-pulse')).toBeTruthy();
  expect(screen.getAllByText('1.0.0').length).toBeGreaterThan(0);
  expect(restore).not.toHaveBeenCalled();
 });

 it('restores one exact dependency only after its Restore button is clicked',async()=>{
  const user=userEvent.setup();
  const restore=vi.fn(async()=>{});
  render(<RestoreDependenciesPanel missing={missing} onRestore={restore}/>);
  await user.click(screen.getByRole('button',{name:'Restore catalog.effect.neon-pulse 1.0.0'}));
  expect(restore).toHaveBeenCalledTimes(1);
  expect(restore).toHaveBeenCalledWith(missing[0].dependency);
 });

 it('Restore All is explicit and includes only missing exact dependencies',async()=>{
  const user=userEvent.setup();
  const restoreAll=vi.fn(async()=>{});
  render(<RestoreDependenciesPanel missing={missing} onRestore={async()=>{}} onRestoreAll={restoreAll}/>);
  expect(restoreAll).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Restore all exact dependencies'}));
  expect(restoreAll).toHaveBeenCalledWith(missing.map(item=>item.dependency));
 });

 it('exposes locate, substitute, and bypass as explicit fallback actions when supplied',()=>{
  render(<RestoreDependenciesPanel missing={[missing[0]]} onRestore={async()=>{}} onLocate={()=>{}} onSubstitute={()=>{}} onBypass={()=>{}}/>);
  expect(screen.getByRole('button',{name:'Locate catalog.effect.neon-pulse'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Substitute catalog.effect.neon-pulse'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Bypass catalog.effect.neon-pulse'})).toBeTruthy();
 });
});
