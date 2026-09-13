import {describe,expect,it} from 'vitest';
import {animationRoleTime,resolveAnimationRoles} from '../animation-runtime';
import {createProject,makeClip,makeTrack} from '../model';
import type {AnimationInstance,AnimationRole} from '../creative-assets';

function animation(assetId:string,role:AnimationRole,params:Record<string,string|number|boolean>={}):AnimationInstance{
  return {assetId,version:'1.0.0',role,enabled:true,params:{durationMs:1000,delayMs:0,intensity:.5,direction:'forward',...params},keyframes:{}};
}
function textProject(duration=4000){
  const p=createProject('Animation runtime');
  const track=makeTrack('text','Text');
  const clip=makeClip('text',track.id,0,duration,'hello');
  p.tracks=[track];p.clips=[clip];p.duration=duration;
  return {p,clip};
}

describe('creative animation runtime',()=>{
  it('uses clip-start-relative Intro timing',()=>{
    const {p,clip}=textProject();
    clip.animations={intro:animation('builtin.animation.fade','intro')};
    const start=resolveAnimationRoles(p,clip,0,'preview-high');
    const middle=resolveAnimationRoles(p,clip,500,'preview-high');
    const settled=resolveAnimationRoles(p,clip,1500,'preview-high');
    expect(start.state.alpha).toBe(0);
    expect(middle.state.alpha).toBeGreaterThan(0);expect(middle.state.alpha).toBeLessThan(1);
    expect(settled.state.alpha).toBe(1);
  });

  it('evaluates Loop in the clip interior and Outro from the clip end',()=>{
    const {p,clip}=textProject();
    clip.animations={
      loop:animation('builtin.animation.float','loop',{periodMs:1200}),
      outro:animation('builtin.animation.fade','outro'),
    };
    const loop=resolveAnimationRoles(p,clip,1300,'preview-high');
    const outro=resolveAnimationRoles(p,clip,3500,'preview-high');
    expect(Math.abs(loop.state.y)).toBeGreaterThan(0);
    expect(outro.state.alpha).toBeGreaterThan(0);expect(outro.state.alpha).toBeLessThan(1);
  });

  it('composes Intro and Outro when their role windows overlap on a short clip',()=>{
    const {p,clip}=textProject(200);
    clip.animations={
      intro:animation('builtin.animation.slide','intro',{durationMs:350}),
      outro:animation('builtin.animation.fade','outro',{durationMs:350}),
    };
    const state=resolveAnimationRoles(p,clip,100,'preview-high').state;
    expect(Math.abs(state.x)).toBeGreaterThan(0);
    expect(state.alpha).toBeGreaterThan(0);expect(state.alpha).toBeLessThan(1);
  });

  it('uses canonical role data only for roles that exist',()=>{
    const {p,clip}=textProject();
    clip.style={entrance:'Fade',idle:'Pulse',exit:'Fade'};
    clip.animations={intro:animation('builtin.animation.slide','intro',{durationMs:350})};
    const resolved=resolveAnimationRoles(p,clip,1000,'preview-high');
    expect(resolved.sources).toEqual({intro:'canonical',loop:'legacy',outro:'legacy'});
  });

  it('keeps legacy animation behavior when no canonical slots exist',()=>{
    const {p,clip}=textProject();
    clip.style={entrance:'Fade',idle:'None',exit:'Fade',animationDuration:1000,delay:0,intensity:.5,direction:1};
    expect(resolveAnimationRoles(p,clip,0,'preview-high').state.alpha).toBe(0);
    const ending=resolveAnimationRoles(p,clip,3500,'preview-high').state.alpha;
    expect(ending).toBeGreaterThan(0);expect(ending).toBeLessThan(1);
  });

  it('exposes the same role-relative clock used by canonical keyframes',()=>{
    const {clip}=textProject();
    clip.start=1000;clip.end=5000;
    expect(animationRoleTime(clip,'intro',1700,{durationMs:1000,delayMs:200})).toBe(500);
    expect(animationRoleTime(clip,'loop',2400,{periodMs:1200})).toBe(1400);
    expect(animationRoleTime(clip,'outro',4500,{durationMs:1000})).toBe(500);
  });
});
