import {describe,expect,it} from 'vitest';
import {BUILTIN_CREATIVE_DEFINITIONS} from '../creative-presets';
import type {CreativeDefinition} from '../creative-registry';

const expectedAnimations=['fade','slide','blur','scale-punch','tracking','word-pop','character-cascade','spin','tilt-3d','wipe-reveal','pixel-dissolve','glitch-reveal','pulse','float','bounce','shake','wave','neon-flicker','breathing-glow','rgb-drift','sway-3d','beat-pulse'].map(x=>'builtin.animation.'+x).sort();
const expectedEffects=['glow','bloom','drop-shadow','outline','blur','sharpen','grain','vignette','brightness','contrast','saturation','hue-shift','duotone','posterize','pixelate','rgb-split','vhs','noise-displacement','shake','zoom-pulse','light-streak','glitch','beat-reactive','color-adjust','transform-crop','directional-blur','lens-distortion','chromatic-aberration','strobe','light-leak','zoom-blur','unsharp-mask','film-burn'].map(x=>'builtin.effect.'+x).sort();
const expectedTransitions=['crossfade','dip-black','dip-white','blur-dissolve','push','slide','wipe','zoom','spin','flash','glitch','rgb-split','pixel-dissolve','film-burn','light-leak','mask-reveal'].map(x=>'builtin.transition.'+x).sort();
const effectCategories=new Set(['adjust','transform','blur-sharpen','distort','stylize','light','time','audio-reactive']);

function ids(type:CreativeDefinition['type']){return BUILTIN_CREATIVE_DEFINITIONS.filter(d=>d.type===type).map(d=>d.id).sort();}

describe('built-in creative presets',()=>{
  it('contains every approved stable preset id exactly once',()=>{
    expect(ids('text-animation')).toEqual(expectedAnimations);
    expect(ids('effect')).toEqual(expectedEffects);
    expect(ids('transition')).toEqual(expectedTransitions);
    expect(new Set(BUILTIN_CREATIVE_DEFINITIONS.map(d=>`${d.type}:${d.id}@${d.version}`)).size).toBe(BUILTIN_CREATIVE_DEFINITIONS.length);
  });

  it('has nonblank versions/runtime operations and valid trusted defaults',()=>{
    for(const def of BUILTIN_CREATIVE_DEFINITIONS){
      expect(def.version.trim()).not.toBe('');
      expect(def.runtime.trim()).not.toBe('');
      expect(def.targets.length).toBeGreaterThan(0);
      expect(def.quality.export).toBe('full');
      for(const param of Object.values(def.params)){
        if(param.kind==='number')expect(param.default).toBeGreaterThanOrEqual(param.min),expect(param.default).toBeLessThanOrEqual(param.max);
        if(param.kind==='select')expect(param.options).toContain(param.default);
        if(param.kind==='color')expect(param.default).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('categorizes and describes every built-in effect',()=>{
    for(const def of BUILTIN_CREATIVE_DEFINITIONS.filter(item=>item.type==='effect')){
      expect(effectCategories.has(def.category!)).toBe(true);
      expect(def.description?.trim().length).toBeGreaterThan(8);
    }
  });

  it('declares animation roles only on text animations and only from intro loop outro',()=>{
    for(const def of BUILTIN_CREATIVE_DEFINITIONS){
      if(def.type==='text-animation'){
        expect(def.roles?.length).toBeGreaterThan(0);
        expect(def.roles?.every(role=>['intro','loop','outro'].includes(role))).toBe(true);
        expect(def.targets).toEqual(['lyrics','text']);
      }else expect(def.roles).toBeUndefined();
    }
  });
});
