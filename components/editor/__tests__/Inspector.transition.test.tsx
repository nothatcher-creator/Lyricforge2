// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeAll,describe,expect,it} from 'vitest';
import {TooltipProvider} from '@/components/ui/tooltip';
import {createProject,makeClip,makeTrack} from '@/lib/lyricforge/model';
import {store} from '@/lib/lyricforge/store';
import Inspector from '../Inspector';

class TestResizeObserver implements ResizeObserver{
  observe(){}
  unobserve(){}
  disconnect(){}
}

function setup(assetId='builtin.transition.wipe'){
  const project=createProject('Transition inspector');
  const track=makeTrack('text','Text');
  const a=makeClip('text',track.id,0,1000,'A');
  const b=makeClip('text',track.id,1000,2000,'B');
  a.id='a';b.id='b';project.tracks=[track];project.clips=[a,b];project.duration=2000;
  act(()=>{
    store.setProject(project);
    const transition=store.addTransition(a.id,b.id,assetId)!;
    store.selectTransition(transition.id);
  });
  return {a,b};
}

function renderInspector(){return render(<TooltipProvider><Inspector onFontImport={()=>{}}/></TooltipProvider>);}

describe('selected transition inspector',()=>{
  beforeAll(()=>{globalThis.ResizeObserver=TestResizeObserver;});
  afterEach(()=>cleanup());

  it('shows the selected transition, timing, trusted preset schema, pair names, and remove action',()=>{
    setup();
    renderInspector();
    expect(screen.getByRole('heading',{name:'Transition'})).toBeTruthy();
    expect(screen.getByText('A → B')).toBeTruthy();
    expect(screen.getByLabelText('Transition preset')).toBeTruthy();
    expect(screen.getByLabelText('Requested duration')).toBeTruthy();
    expect(screen.getByLabelText('Transition easing')).toBeTruthy();
    expect(screen.getByLabelText('Wipe direction')).toBeTruthy();
    expect(screen.getByRole('slider',{name:'Wipe softness'})).toBeTruthy();
    expect(screen.getByText(/Effective duration/i)).toBeTruthy();
    expect(screen.getByRole('button',{name:'Remove transition'})).toBeTruthy();
  });

  it('keeps invalid references selected and explains the problem instead of relinking them',()=>{
    const {b}=setup();
    act(()=>store.patch(b.id,{start:1002}));
    renderInspector();
    expect(store.selectedTransitionId).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/must touch at the cut/i);
    expect(screen.getByText('A → B')).toBeTruthy();
  });

  it('removes the selected transition and clears transition selection',()=>{
    setup();
    renderInspector();
    fireEvent.click(screen.getByRole('button',{name:'Remove transition'}));
    expect(store.project.transitions).toHaveLength(0);
    expect(store.selectedTransitionId).toBeNull();
  });
});
