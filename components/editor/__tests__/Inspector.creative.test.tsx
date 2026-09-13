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

function renderInspector(){
  return render(<TooltipProvider><Inspector onFontImport={()=>{}}/></TooltipProvider>);
}

function projectWith(kind:'text'|'lyrics'){
  const project=createProject('inspector creative');
  const track=makeTrack(kind,kind==='lyrics'?'Lyrics':'Text');
  const clip=makeClip(kind,track.id,0,4000,kind==='lyrics'?'Line':'Title');
  clip.id=`${kind}-a`;
  project.tracks=[track];
  project.clips=[clip];
  return {project,clip};
}

describe('main Inspector creative integration',()=>{
  beforeAll(()=>{globalThis.ResizeObserver=TestResizeObserver;});
  afterEach(()=>cleanup());

  it('uses canonical roles for an individual text clip and preserves legacy emphasis plus ordinary keyframes',()=>{
    const {project,clip}=projectWith('text');
    act(()=>{store.setProject(project);store.select([clip.id]);});
    renderInspector();

    fireEvent.click(screen.getByRole('tab',{name:'Motion'}));
    expect(screen.getByLabelText('Intro animation')).toBeTruthy();
    expect(screen.getByLabelText('Loop animation')).toBeTruthy();
    expect(screen.getByLabelText('Outro animation')).toBeTruthy();
    expect(screen.getByLabelText('emphasis animation')).toBeTruthy();
    expect(screen.queryByLabelText('entrance animation')).toBeNull();
    expect(screen.getByText('Keyframes')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab',{name:'Effects'}));
    expect(screen.getByRole('button',{name:'Add clip effect'})).toBeTruthy();
  });

  it('keeps the full legacy animation controls for All lyrics scope',()=>{
    const {project,clip}=projectWith('lyrics');
    act(()=>{store.setProject(project);store.select([clip.id]);});
    renderInspector();

    fireEvent.click(screen.getByRole('tab',{name:'Motion'}));
    expect(screen.getByLabelText('entrance animation')).toBeTruthy();
    expect(screen.getByLabelText('idle animation')).toBeTruthy();
    expect(screen.getByLabelText('emphasis animation')).toBeTruthy();
    expect(screen.getByLabelText('exit animation')).toBeTruthy();
    expect(screen.queryByLabelText('Intro animation')).toBeNull();
  });

  it('shows Master effects from the Effects tab when no clip is selected',()=>{
    const {project}=projectWith('text');
    act(()=>{store.setProject(project);store.select([]);});
    renderInspector();

    fireEvent.click(screen.getByRole('tab',{name:'Effects'}));
    expect(screen.getByText('Master effects')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Add master effect'})).toBeTruthy();
  });
});
