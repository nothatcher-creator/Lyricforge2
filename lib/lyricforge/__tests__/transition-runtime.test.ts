import {describe,expect,it} from 'vitest';
import type {TransitionInstance} from '../creative-assets';
import {createProject,makeClip,makeTrack,type Project} from '../model';
import {
  TRANSITION_KINDS,
  isValidTransitionPair,
  transitionWindow,
  transitionSampleTimes,
  resolveTransition,
} from '../transition-runtime';

function transition(outgoingItemId='a',incomingItemId='b'):TransitionInstance{
  return {id:'tr',assetId:'builtin.transition.crossfade',version:'1.0.0',outgoingItemId,incomingItemId,durationMs:1000,easing:'linear',params:{}};
}

function pairProject(opts:{aStart?:number;aEnd?:number;bStart?:number;bEnd?:number;differentTracks?:boolean}={}):Project{
  const p=createProject('pair');
  const ta=makeTrack('text','A');
  const tb=opts.differentTracks?makeTrack('text','B'):ta;
  const a=makeClip('text',ta.id,opts.aStart??0,opts.aEnd??1000,'A');a.id='a';
  const b=makeClip('text',tb.id,opts.bStart??1000,opts.bEnd??2000,'B');b.id='b';
  p.tracks=[ta,...(tb===ta?[]:[tb])];p.clips=[a,b];
  return p;
}

describe('explicit transition runtime',()=>{
  it('supports only approved visual clip kinds',()=>{
    expect(TRANSITION_KINDS).toEqual(['lyrics','text','image','video','visualizer']);
  });

  it('accepts a touching same-track pair within one millisecond',()=>{
    expect(isValidTransitionPair(pairProject({aEnd:1000,bStart:1001}),transition()).valid).toBe(true);
  });

  it('rejects gaps, overlaps and cross-track pairs',()=>{
    expect(isValidTransitionPair(pairProject({aEnd:1000,bStart:1002}),transition()).valid).toBe(false);
    expect(isValidTransitionPair(pairProject({aEnd:1100,bStart:1000}),transition()).valid).toBe(false);
    expect(isValidTransitionPair(pairProject({differentTracks:true}),transition()).valid).toBe(false);
  });

  it('invalidates an old pair when another compatible clip becomes adjacent',()=>{
    const p=pairProject({aEnd:1000,bStart:2000,bEnd:3000});
    const c=makeClip('text',p.tracks[0].id,1000,2000,'C');c.id='c';
    p.clips.splice(1,0,c);
    expect(isValidTransitionPair(p,transition()).valid).toBe(false);
  });

  it('centers a one-second window on the cut',()=>{
    const w=transitionWindow(pairProject({aEnd:5000,bStart:5000}),{...transition(),durationMs:1000});
    expect(w).toMatchObject({cutMs:5000,startMs:4500,endMs:5500,effectiveDurationMs:1000});
  });

  it('clamps effective duration without rewriting requested duration',()=>{
    const tr={...transition(),durationMs:2000};
    const w=transitionWindow(pairProject({aStart:4500,aEnd:5000,bStart:5000,bEnd:5400}),tr)!;
    expect(w.effectiveDurationMs).toBe(800);
    expect(tr.durationMs).toBe(2000);
  });

  it('clamps non-looping video by decoded source duration after offset',()=>{
    const p=createProject('video pair');
    const track=makeTrack('video','Video');
    const a=makeClip('video',track.id,0,1000);a.id='a';a.assetId='va';a.loop=false;a.offset=800;
    const b=makeClip('video',track.id,1000,2000);b.id='b';b.assetId='vb';b.loop=false;
    p.tracks=[track];p.clips=[a,b];
    p.assets=[
      {id:'va',name:'a.mp4',type:'video',mime:'video/mp4',size:1,duration:1000},
      {id:'vb',name:'b.mp4',type:'video',mime:'video/mp4',size:1,duration:2000},
    ];
    expect(transitionWindow(p,transition())?.effectiveDurationMs).toBe(400);
  });

  it('holds source sampling at clip boundaries across the virtual overlap',()=>{
    const p=pairProject({aStart:0,aEnd:1000,bStart:1000,bEnd:2000});
    const tr=transition();
    const w=transitionWindow(p,tr)!;
    expect(transitionSampleTimes(p,tr,750,w)).toEqual({outgoingMs:750,incomingMs:1000});
    expect(transitionSampleTimes(p,tr,1250,w)).toEqual({outgoingMs:999,incomingMs:1250});
  });

  it('resolves trusted progress and normalized parameters',()=>{
    const p=pairProject();
    const tr={...transition(),assetId:'builtin.transition.wipe',params:{softness:9,direction:'right',ignored:'nope'}};
    const resolved=resolveTransition(p,tr,750,'preview-high');
    expect(resolved.hardCut).toBe(false);
    expect(resolved.active).toBe(true);
    expect(resolved.progress).toBeCloseTo(.25);
    expect(resolved.runtime).toBe('transition.wipe');
    expect(resolved.params).toEqual({direction:'right',softness:.5});
  });

  it('hard-cuts with a diagnostic when the definition is missing',()=>{
    const p=pairProject();
    const resolved=resolveTransition(p,{...transition(),version:'9.0.0'},1000,'preview-high');
    expect(resolved.hardCut).toBe(true);
    expect(resolved.diagnostics[0]).toMatchObject({kind:'missing',instanceId:'tr',assetId:'builtin.transition.crossfade'});
  });
});
