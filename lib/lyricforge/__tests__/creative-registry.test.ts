import {describe,expect,it} from 'vitest';
import {creativeRegistry} from '../creative-registry';

describe('creative registry',()=>{
  it('resolves exact versions and refuses undeclared substitutions',()=>{
    expect(creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')?.id).toBe('builtin.effect.glow');
    expect(creativeRegistry.resolve('effect','builtin.effect.glow','9.0.0')).toBeNull();
  });

  it('normalizes only declared parameters',()=>{
    const def=creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')!;
    const params=creativeRegistry.normalizeParams(def,{intensity:999,unknown:'not executable'});
    expect(params.intensity).toBe(1);
    expect(params).not.toHaveProperty('unknown');
  });

  it('falls back to trusted defaults for invalid select and color values',()=>{
    const transition=creativeRegistry.resolve('transition','builtin.transition.push','1.0.0')!;
    expect(creativeRegistry.normalizeParams(transition,{direction:'diagonal'}).direction).toBe('left');
    const shadow=creativeRegistry.resolve('effect','builtin.effect.drop-shadow','1.0.0')!;
    expect(creativeRegistry.normalizeParams(shadow,{color:'javascript:bad'}).color).toBe('#000000');
  });
});
