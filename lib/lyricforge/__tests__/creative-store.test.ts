import {describe,expect,it,vi} from 'vitest';
import type {AnimationInstance,ProjectDependency} from '../creative-assets';
import {assets} from '../assets';
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

  it('inserts a catalog element through the image asset path and reuses the same exact asset',async()=>{
    const store=freshStore();
    const dependency:ProjectDependency={id:'catalog.element.glow-ring',type:'element',version:'1.0.0',sourceCatalogId:'official'};
    const bytes=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><circle r="40"/></svg>');
    const loaded:string[]=[];
    const load=vi.spyOn(assets,'load').mockImplementation(async(asset,blob)=>{assets.blobs.set(asset.id,blob);loaded.push(asset.id);});
    try{
      const first=await store.addCatalogElement({dependency,name:'Glow Ring',bytes,mime:'image/svg+xml',time:1500,durationMs:5000,fit:'contain'});
      expect(first).toMatchObject({kind:'image',start:1500,end:6500,fit:'contain'});
      expect(store.selected).toEqual([first.id]);
      const asset=store.project.assets.find(item=>item.id===first.assetId)!;
      expect(asset).toMatchObject({name:'Glow Ring',type:'image',mime:'image/svg+xml',catalogDependency:dependency});
      expect(store.project.dependencies).toContainEqual(dependency);
      expect(store.project.tracks.find(track=>track.id===first.trackId)?.kind).toBe('image');
      expect(Array.from(new Uint8Array(await assets.blobs.get(asset.id)!.arrayBuffer()))).toEqual(Array.from(bytes));

      const second=await store.addCatalogElement({dependency,name:'Glow Ring',bytes,mime:'image/svg+xml',time:7000,durationMs:3000,fit:'cover'});
      expect(second.assetId).toBe(asset.id);
      expect(second).toMatchObject({kind:'image',start:7000,end:10000,fit:'cover'});
      expect(store.project.assets.filter(item=>item.id===asset.id)).toHaveLength(1);
      expect(loaded).toEqual([asset.id]);
    }finally{
      load.mockRestore();
      for(const id of loaded)assets.blobs.delete(id);
    }
  });
});
