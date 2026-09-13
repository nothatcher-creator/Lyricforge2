import {describe,expect,it} from 'vitest';
import type {AnimationInstance} from '../creative-assets';
import {createProject,makeClip,makeTrack} from '../model';
import {EditorStore} from '../store';

function freshStore(){
  const store=new EditorStore();
  store.setProject(createProject('creative store'));
  return store;
}

function textClip(store:EditorStore){
  return store.add('text',0,'hello');
}

function transitionProject(gap=0){
  const project=createProject('transition store');
  const track=makeTrack('text','Text');
  const a=makeClip('text',track.id,0,1000,'A');a.id='a';
  const b=makeClip('text',track.id,1000+gap,2000+gap,'B');b.id='b';
  project.tracks=[track];
  project.clips=[a,b];
  return project;
}

describe('EditorStore creative operations',()=>{
  it('duplicates an effect with a new instance id and copied settings',()=>{
    const store=freshStore();
    const clip=textClip(store);
    const first=store.addClipEffect(clip.id,'builtin.effect.glow','1.0.0')!;
    store.patchClipEffect(clip.id,first.id,{params:{intensity:.35}});
    const second=store.duplicateClipEffect(clip.id,first.id)!;
    expect(second.id).not.toBe(first.id);
    expect(second.params).toEqual({intensity:.35});
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects.map(effect=>effect.id)).toEqual([first.id,second.id]);
  });

  it('makes clip effect add, patch, reorder and remove undoable',()=>{
    const store=freshStore();
    const clip=textClip(store);
    const glow=store.addClipEffect(clip.id,'builtin.effect.glow','1.0.0')!;
    const blur=store.addClipEffect(clip.id,'builtin.effect.blur','1.0.0')!;

    store.moveClipEffect(clip.id,blur.id,-1);
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects.map(effect=>effect.id)).toEqual([blur.id,glow.id]);
    store.undo();
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects.map(effect=>effect.id)).toEqual([glow.id,blur.id]);

    store.patchClipEffect(clip.id,glow.id,{enabled:false});
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects[0].enabled).toBe(false);
    store.undo();
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects[0].enabled).toBe(true);

    store.removeClipEffect(clip.id,glow.id);
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects.some(effect=>effect.id===glow.id)).toBe(false);
    store.undo();
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects.some(effect=>effect.id===glow.id)).toBe(true);
  });

  it('edits canonical animation roles without erasing sibling roles',()=>{
    const store=freshStore();
    const clip=textClip(store);
    const intro:AnimationInstance={assetId:'builtin.animation.fade',version:'1.0.0',role:'intro',enabled:true,params:{},keyframes:{}};
    const loop:AnimationInstance={assetId:'builtin.animation.pulse',version:'1.0.0',role:'loop',enabled:true,params:{},keyframes:{}};
    store.setAnimation(clip.id,'intro',intro);
    store.setAnimation(clip.id,'loop',loop);
    store.setAnimation(clip.id,'intro',null);
    const animations=store.project.clips.find(c=>c.id===clip.id)?.animations;
    expect(animations?.intro).toBeUndefined();
    expect(animations?.loop?.assetId).toBe('builtin.animation.pulse');
    store.undo();
    expect(store.project.clips.find(c=>c.id===clip.id)?.animations?.intro?.assetId).toBe('builtin.animation.fade');
  });

  it('keeps master effects separate from clip effects',()=>{
    const store=freshStore();
    const clip=textClip(store);
    const master=store.addMasterEffect('builtin.effect.grain','1.0.0')!;
    expect(store.project.masterEffects.map(effect=>effect.id)).toEqual([master.id]);
    expect(store.project.clips.find(c=>c.id===clip.id)?.effects).toEqual([]);
    store.patchMasterEffect(master.id,{enabled:false});
    expect(store.project.masterEffects[0].enabled).toBe(false);
    store.undo();
    expect(store.project.masterEffects[0].enabled).toBe(true);
  });

  it('transition selection and clip selection are mutually exclusive',()=>{
    const store=freshStore();
    store.select(['clip-a']);
    store.selectTransition('tr-a');
    expect(store.selected).toEqual([]);
    expect(store.getSnapshot().selectedTransitionId).toBe('tr-a');
    store.select(['clip-b']);
    expect(store.getSnapshot().selectedTransitionId).toBeNull();
  });

  it('adds only valid adjacent same-track transitions and clears stale transition selection',()=>{
    const store=freshStore();
    store.setProject(transitionProject());
    const transition=store.addTransition('a','b')!;
    expect(transition.assetId).toBe('builtin.transition.crossfade');
    expect(store.project.transitions.map(item=>item.id)).toEqual([transition.id]);

    store.selectTransition(transition.id);
    store.undo();
    expect(store.project.transitions).toEqual([]);
    expect(store.getSnapshot().selectedTransitionId).toBeNull();
    store.redo();
    expect(store.project.transitions).toHaveLength(1);
    expect(store.getSnapshot().selectedTransitionId).toBeNull();

    store.selectTransition(store.project.transitions[0].id);
    store.setProject(transitionProject());
    expect(store.getSnapshot().selectedTransitionId).toBeNull();

    store.setProject(transitionProject(2));
    expect(store.addTransition('a','b')).toBeUndefined();
    expect(store.project.transitions).toEqual([]);
  });
});
