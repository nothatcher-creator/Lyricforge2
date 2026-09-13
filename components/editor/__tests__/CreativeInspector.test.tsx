// @vitest-environment jsdom
import React from 'react';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,describe,expect,it} from 'vitest';
import {TooltipProvider} from '@/components/ui/tooltip';
import {createProject,makeClip,makeTrack} from '@/lib/lyricforge/model';
import {store} from '@/lib/lyricforge/store';
import CreativeInspector from '../CreativeInspector';

function projectWithText(){
  const project=createProject('creative inspector');
  const track=makeTrack('text','Text');
  const clip=makeClip('text',track.id,0,4000,'Hello');
  clip.id='text-a';
  project.tracks=[track];
  project.clips=[clip];
  return {project,clip};
}

function renderInspector(clipId:string|null,mode:'all'|'animations'|'effects'='all'){
  return render(<TooltipProvider><CreativeInspector clipId={clipId} mode={mode}/></TooltipProvider>);
}

describe('CreativeInspector',()=>{
  beforeEach(()=>{
    const {project}=projectWithText();
    act(()=>store.setProject(project));
  });

  it('shows canonical animation slots and clip effect creation for selected text',()=>{
    renderInspector('text-a');
    expect(screen.getByLabelText('Intro animation')).toBeTruthy();
    expect(screen.getByLabelText('Loop animation')).toBeTruthy();
    expect(screen.getByLabelText('Outro animation')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Add clip effect'})).toBeTruthy();
  });

  it('shows accessible actions for each clip effect instance',()=>{
    renderInspector('text-a');
    act(()=>{store.addClipEffect('text-a','builtin.effect.glow','1.0.0');});
    expect(screen.getByRole('button',{name:'Duplicate Glow effect'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Move Glow effect up'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Remove Glow effect'})).toBeTruthy();
  });

  it('shows master effects with no clip and changes only the master stack',()=>{
    renderInspector(null);
    expect(screen.getByText('Master effects')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Add master effect'}));
    expect(store.project.masterEffects).toHaveLength(1);
    expect(store.project.clips.every(clip=>clip.effects.length===0)).toBe(true);
  });
});
