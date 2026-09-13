import {describe,expect,it} from 'vitest';
import {createProject,makeClip} from '../model';

describe('creative runtime model defaults',()=>{
  it('creates clips with an empty ordered effect stack',()=>{
    const clip=makeClip('text','track-1',0,1000,'Hello');
    expect(clip.effects).toEqual([]);
    expect(clip.animations).toBeUndefined();
  });

  it('creates projects with creative runtime collections',()=>{
    const project=createProject('Creative runtime');
    expect(project.schemaVersion).toBe(3);
    expect(project.dependencies).toEqual([]);
    expect(project.masterEffects).toEqual([]);
    expect(project.transitions).toEqual([]);
  });
});
