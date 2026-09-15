import {describe,expect,it} from 'vitest';
import {CreativeRegistry,creativeRegistry} from '../creative-registry';

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

  it('allows installed effects to reuse a trusted built-in runtime but rejects invented runtimes',()=>{
    const trusted=creativeRegistry.resolve('effect','builtin.effect.color-adjust','1.0.0')!;
    const registry=new CreativeRegistry([trusted]);
    registry.replaceInstalled([{...trusted,id:'catalog.effect.film-grade',version:'1.1.0',name:'Film Grade'}]);
    expect(registry.resolve('effect','catalog.effect.film-grade','1.1.0')?.runtime).toBe('effect.color-adjust');
    expect(()=>registry.replaceInstalled([{...trusted,id:'catalog.effect.external-shader',version:'1.0.0',name:'External Shader',runtime:'effect.external-shader'}])).toThrow('untrusted runtime');
  });
});
