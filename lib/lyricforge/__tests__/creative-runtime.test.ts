import {describe,expect,it} from 'vitest';
import {createProject,makeClip,makeTrack} from '../model';
import {resolveCreativeFrame,validateCreativeProject} from '../creative-runtime';

function projectAtCut(){
  const p=createProject('creative frame');
  const track=makeTrack('text','Text');
  const a=makeClip('text',track.id,0,1000,'A');a.id='text-a';
  const b=makeClip('text',track.id,1000,2000,'B');b.id='text-b';
  a.effects=[{id:'clip-glow',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,params:{intensity:.4},keyframes:{}}];
  p.tracks=[track];p.clips=[a,b];
  p.transitions=[{id:'tr-1',assetId:'builtin.transition.crossfade',version:'1.0.0',outgoingItemId:a.id,incomingItemId:b.id,durationMs:500,easing:'linear',params:{}}];
  p.masterEffects=[{id:'master-grain',assetId:'builtin.effect.grain',version:'1.0.0',enabled:true,params:{amount:.15},keyframes:{}}];
  return p;
}

describe('shared creative frame runtime',()=>{
  it('orders clip effects before transition and master effects last',()=>{
    const plan=resolveCreativeFrame(projectAtCut(),1000,'preview-high');
    expect(plan.operationOrder).toEqual([
      'clip:source:text-a',
      'clip:effect:clip-glow',
      'transition:tr-1',
      'scene:composite',
      'master:effect:master-grain',
    ]);
  });

  it('resolves both transition sides with held virtual-overlap samples',()=>{
    const plan=resolveCreativeFrame(projectAtCut(),900,'preview-high');
    const transition=plan.transitions.find(item=>item.instance.id==='tr-1')!;
    expect(transition.resolution.active).toBe(true);
    expect(transition.outgoing.sampleTimeMs).toBe(900);
    expect(transition.incoming.sampleTimeMs).toBe(1000);
    expect(transition.outgoing.effects.effects.map(effect=>effect.instanceId)).toEqual(['clip-glow']);
  });

  it('resolves canonical text animation state through the same frame plan',()=>{
    const p=projectAtCut();
    p.clips[0].animations={intro:{assetId:'builtin.animation.slide',version:'1.0.0',role:'intro',enabled:true,params:{durationMs:350,delayMs:0,intensity:.5,direction:'forward'},keyframes:{}}};
    const plan=resolveCreativeFrame(p,100,'preview-high');
    const clip=plan.clips.find(item=>item.clip.id==='text-a')!;
    expect(clip.animation.sources.intro).toBe('canonical');
    expect(clip.animation.state.alpha).toBeLessThan(1);
  });

  it('reports unresolved executable references before export',()=>{
    const p=projectAtCut();
    p.masterEffects.push({id:'missing-fx',assetId:'online.effect.not-installed',version:'1.0.0',enabled:true,params:{},keyframes:{}});
    p.transitions[0]={...p.transitions[0],assetId:'online.transition.not-installed'};
    const diagnostics=validateCreativeProject(p);
    expect(diagnostics.map(item=>item.instanceId)).toEqual(expect.arrayContaining(['missing-fx','tr-1']));
    expect(diagnostics.every(item=>item.kind==='missing'||item.kind==='incompatible'||item.kind==='invalid-transition')).toBe(true);
  });
});
