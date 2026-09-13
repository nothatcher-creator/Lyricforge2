// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {store} from '@/lib/lyricforge/store';
import type {CreativeDiagnostic} from '@/lib/lyricforge/effect-runtime';
import CreativeDiagnostics from '../CreativeDiagnostics';

const diagnostics:CreativeDiagnostic[]=[
  {kind:'missing',instanceId:'fx-missing',assetId:'catalog.effect.future',message:'Missing effect'},
  {kind:'runtime',instanceId:'fx-bad',assetId:'builtin.effect.glitch',message:'Effect failed'},
];

describe('CreativeDiagnostics',()=>{
  afterEach(()=>cleanup());

  it('shows missing and runtime instance ids with actionable fallback text',()=>{
    render(<CreativeDiagnostics diagnostics={diagnostics}/>);
    expect(screen.getByText(/fx-missing/)).toBeTruthy();
    expect(screen.getByText(/preserved but bypassed/i)).toBeTruthy();
    expect(screen.getByText(/fx-bad/)).toBeTruthy();
    expect(screen.getByText(/disabled for this renderer session/i)).toBeTruthy();
  });

  it('deduplicates identical diagnostics by kind, instance id, and message',()=>{
    render(<CreativeDiagnostics diagnostics={[diagnostics[0],diagnostics[0],diagnostics[1]]}/>);
    expect(screen.getAllByText(/fx-missing/)).toHaveLength(1);
    expect(screen.getAllByText(/fx-bad/)).toHaveLength(1);
  });

  it('dismisses presentation only without mutating project data',()=>{
    const before=structuredClone(store.project);
    render(<CreativeDiagnostics diagnostics={diagnostics}/>);
    fireEvent.click(screen.getByRole('button',{name:/dismiss fx-missing diagnostic/i}));
    expect(screen.queryByText(/fx-missing/)).toBeNull();
    expect(store.project).toEqual(before);
  });
});
