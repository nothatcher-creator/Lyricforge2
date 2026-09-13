import {describe,expect,it} from 'vitest';
import {resolveEffectStack,type EffectResolveContext} from '../effect-runtime';
import type {EffectInstance} from '../creative-assets';

const effect=(id:string,assetId:string):EffectInstance=>({id,assetId,version:'1.0.0',enabled:true,params:{},keyframes:{}});
const clipContext:EffectResolveContext={scope:'clip',targetKind:'text',timeMs:500,scopeStartMs:0,scopeDurationMs:2000,quality:'preview-high',audioReactive:0};

describe('ordered effect runtime',()=>{
  it('preserves array order and bypasses disabled instances',()=>{
    const stack=[effect('a','builtin.effect.blur'),{...effect('b','builtin.effect.glow'),enabled:false},effect('c','builtin.effect.grain')];
    const result=resolveEffectStack(stack,clipContext);
    expect(result.effects.map(x=>x.instanceId)).toEqual(['a','c']);
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps duplicate preset instances independent',()=>{
    const result=resolveEffectStack([
      {...effect('a','builtin.effect.glow'),params:{intensity:.2}},
      {...effect('b','builtin.effect.glow'),params:{intensity:.8}},
    ],clipContext);
    expect(result.effects.map(x=>x.params.intensity)).toEqual([.2,.8]);
  });

  it('bypasses missing versions and unsupported targets with diagnostics',()=>{
    const missing={...effect('missing','builtin.effect.glow'),version:'9.0.0'};
    const missingResult=resolveEffectStack([missing],clipContext);
    expect(missingResult.effects).toEqual([]);
    expect(missingResult.diagnostics[0]).toMatchObject({kind:'missing',instanceId:'missing',assetId:'builtin.effect.glow'});

    const master:EffectResolveContext={...clipContext,scope:'master',targetKind:'master'};
    const unsupported=resolveEffectStack([effect('outline','builtin.effect.outline')],master);
    expect(unsupported.effects).toEqual([]);
    expect(unsupported.diagnostics[0]).toMatchObject({kind:'incompatible',instanceId:'outline'});
  });

  it('uses clip-relative keyframe time but project time for master effects',()=>{
    const keyed={...effect('bright','builtin.effect.brightness'),params:{amount:1},keyframes:{amount:[
      {id:'a',timeMs:0,value:1,easing:'linear' as const},
      {id:'b',timeMs:1000,value:2,easing:'linear' as const},
    ]}};
    const clip=resolveEffectStack([keyed],{...clipContext,timeMs:1500,scopeStartMs:1000}).effects[0];
    const master=resolveEffectStack([keyed],{...clipContext,scope:'master',targetKind:'master',timeMs:500,scopeStartMs:1000}).effects[0];
    expect(clip.params.amount).toBe(1.5);
    expect(master.params.amount).toBe(1.5);
  });

  it('honors preview-low simplification and explicit neutral bypass',()=>{
    const bloom=resolveEffectStack([effect('bloom','builtin.effect.bloom')],{...clipContext,quality:'preview-low'}).effects[0];
    expect(bloom.quality).toBe('simplified');
    const neutral=resolveEffectStack([{...effect('blur','builtin.effect.blur'),params:{radius:0}}],clipContext);
    expect(neutral.effects).toEqual([]);
  });
});
