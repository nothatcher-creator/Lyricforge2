// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {createProject,makeClip,makeTrack,type Track} from '@/lib/lyricforge/model';
import {store} from '@/lib/lyricforge/store';
import TimelineTransitions from '../TimelineTransitions';

function textPair(gap=0,overlap=0){
  const project=createProject('Transitions');
  const track=makeTrack('text','Text');
  const a=makeClip('text',track.id,0,1000,'A');
  const bStart=1000+gap-overlap;
  const b=makeClip('text',track.id,bStart,2000,'B');
  a.id='a';b.id='b';
  project.tracks=[track];project.clips=[a,b];project.duration=2200;
  return {project,track,a,b};
}

function renderLane(track:Track,scale=100){
  return render(<TimelineTransitions trackId={track.id} scale={scale}/>);
}

afterEach(()=>cleanup());

describe('TimelineTransitions',()=>{
  it('shows an add affordance for one valid touching visual cut',()=>{
    const {project,track}=textPair();
    act(()=>store.setProject(project));
    renderLane(track);
    expect(screen.getByRole('button',{name:'Add transition between A and B'})).toBeTruthy();
  });

  it('creates Crossfade at a valid cut and renders the transition marker instead of another add button',()=>{
    const {project,track}=textPair();
    act(()=>store.setProject(project));
    renderLane(track);
    fireEvent.click(screen.getByRole('button',{name:'Add transition between A and B'}));
    expect(screen.queryByRole('button',{name:'Add transition between A and B'})).toBeNull();
    expect(screen.getByRole('button',{name:/Crossfade transition between A and B/})).toBeTruthy();
  });

  it('drags requested duration symmetrically and records the gesture as one undo step',()=>{
    const {project,track,a,b}=textPair();
    act(()=>{store.setProject(project);store.addTransition(a.id,b.id);});
    const view=renderLane(track,100);
    const handle=view.container.querySelector<HTMLElement>('[data-transition-handle]');
    expect(handle).toBeTruthy();
    fireEvent.pointerDown(handle!,{clientX:100,pointerId:1,button:0});
    fireEvent.pointerMove(window,{clientX:125,pointerId:1});
    fireEvent.pointerUp(window,{clientX:125,pointerId:1});
    expect(store.project.transitions[0].durationMs).toBe(1500);
    act(()=>store.undo());
    expect(store.project.transitions[0].durationMs).toBe(1000);
  });

  it('does not offer invalid, occupied, audio, cross-track, overlapping, gapped, or non-adjacent cuts',()=>{
    const gap=textPair(2,0);
    act(()=>store.setProject(gap.project));
    const view=renderLane(gap.track);
    expect(screen.queryByRole('button',{name:'Add transition between A and B'})).toBeNull();
    view.unmount();

    const overlap=textPair(0,1);
    act(()=>store.setProject(overlap.project));
    const overlapView=renderLane(overlap.track);
    expect(screen.queryByRole('button',{name:'Add transition between A and B'})).toBeNull();
    overlapView.unmount();

    const occupied=textPair();
    act(()=>{store.setProject(occupied.project);store.addTransition(occupied.a.id,occupied.b.id);});
    const occupiedView=renderLane(occupied.track);
    expect(screen.queryByRole('button',{name:'Add transition between A and B'})).toBeNull();
    expect(screen.getByRole('button',{name:/Crossfade transition between A and B/})).toBeTruthy();
    occupiedView.unmount();

    const audioProject=createProject('Audio cut');
    const audioTrack=makeTrack('audio','Audio');
    const audioA=makeClip('audio',audioTrack.id,0,1000,'Audio A');
    const audioB=makeClip('audio',audioTrack.id,1000,2000,'Audio B');
    audioProject.tracks=[audioTrack];audioProject.clips=[audioA,audioB];
    act(()=>store.setProject(audioProject));
    const audioView=renderLane(audioTrack);
    expect(screen.queryByRole('button',{name:/Add transition/})).toBeNull();
    audioView.unmount();

    const crossProject=createProject('Cross track');
    const first=makeTrack('text','First');const second=makeTrack('text','Second');
    const crossA=makeClip('text',first.id,0,1000,'Cross A');
    const crossB=makeClip('text',second.id,1000,2000,'Cross B');
    crossProject.tracks=[first,second];crossProject.clips=[crossA,crossB];
    act(()=>store.setProject(crossProject));
    const crossView=renderLane(first);
    expect(screen.queryByRole('button',{name:'Add transition between Cross A and Cross B'})).toBeNull();
    crossView.unmount();

    const nonAdjacent=textPair();
    const middle=makeClip('text',nonAdjacent.track.id,1000,1500,'Middle');
    const c=makeClip('text',nonAdjacent.track.id,1500,2000,'C');
    nonAdjacent.a.end=1000;nonAdjacent.project.clips=[nonAdjacent.a,middle,c];
    act(()=>store.setProject(nonAdjacent.project));
    const nonAdjacentView=renderLane(nonAdjacent.track);
    expect(screen.queryByRole('button',{name:'Add transition between A and C'})).toBeNull();
    nonAdjacentView.unmount();
  });
});
