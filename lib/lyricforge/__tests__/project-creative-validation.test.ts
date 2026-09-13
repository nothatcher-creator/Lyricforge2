import {describe,expect,it} from 'vitest';
import {createProject,makeClip,makeTrack} from '../model';
import {validateProject} from '../project-manager';
import {PROJECT_SCHEMA_VERSION} from '../project-migration';

const glow=()=>({
  id:'fx-glow',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,
  params:{intensity:.5},keyframes:{},
});

describe('creative project validation',()=>{
  it('preserves valid creative stacks, animation slots, dependencies and transitions',()=>{
    const project=createProject('Creative validation');
    const track=makeTrack('text','Text');
    const outgoing=makeClip('text',track.id,0,1000,'Out');
    const incoming=makeClip('text',track.id,1000,2000,'In');
    outgoing.effects=[glow()];
    outgoing.animations={intro:{assetId:'builtin.animation.fade',version:'1.0.0',role:'intro',enabled:true,params:{durationMs:250},keyframes:{}}};
    project.tracks=[track];
    project.clips=[outgoing,incoming];
    project.dependencies=[{id:'builtin.effect.glow',type:'effect',version:'1.0.0'}];
    project.masterEffects=[{...glow(),id:'master-glow'}];
    project.transitions=[{id:'tr-1',assetId:'builtin.transition.crossfade',version:'1.0.0',outgoingItemId:outgoing.id,incomingItemId:incoming.id,durationMs:400,easing:'ease-in-out',params:{}}];

    const restored=validateProject(project);
    expect(restored.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(restored.dependencies).toEqual(project.dependencies);
    expect(restored.clips[0].effects).toEqual(outgoing.effects);
    expect(restored.clips[0].animations).toEqual(outgoing.animations);
    expect(restored.masterEffects).toEqual(project.masterEffects);
    expect(restored.transitions).toEqual(project.transitions);
  });

  it('rejects malformed creative instances instead of stripping them',()=>{
    const project=createProject('Malformed creative data');
    const track=makeTrack('text','Text');
    const clip=makeClip('text',track.id,0,1000,'Hello');
    clip.effects=[{...glow(),id:''}];
    project.tracks=[track];
    project.clips=[clip];
    expect(()=>validateProject(project)).toThrow(/Invalid project file/);
  });

  it('migrates legacy project data before parsing',()=>{
    const project=createProject('Legacy project');
    const legacy=structuredClone(project) as any;
    delete legacy.schemaVersion;
    delete legacy.dependencies;
    delete legacy.masterEffects;
    delete legacy.transitions;
    for(const clip of legacy.clips){delete clip.effects;delete clip.animations;}

    const restored=validateProject(legacy);
    expect(restored.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(restored.dependencies).toEqual([]);
    expect(restored.masterEffects).toEqual([]);
    expect(restored.transitions).toEqual([]);
    expect(restored.clips.every(clip=>Array.isArray(clip.effects))).toBe(true);
  });
});
