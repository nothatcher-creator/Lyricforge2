import {describe,expect,it} from 'vitest';
import {creativeRegistry} from '../creative-registry';
import {EFFECT_HANDLERS,hashNoise,renderEffect} from '../render-effects';
import {TRANSITION_HANDLERS,renderTransition} from '../render-transitions';
import type {ResolvedEffect} from '../effect-runtime';

const TEMPORAL_RUNTIMES=new Set(['effect.posterize-time','effect.echo']);

function fakeContext(){
  const calls:unknown[]=[];
  const trace:unknown[][]=[];
  const ctx={
    globalAlpha:1,globalCompositeOperation:'source-over',filter:'none',fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,
    shadowColor:'transparent',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,imageSmoothingEnabled:true,
    save(){trace.push(['save']);},restore(){trace.push(['restore']);},setTransform(...args:number[]){trace.push(['setTransform',...args]);},clearRect(...args:number[]){trace.push(['clearRect',...args]);},
    translate(...args:number[]){trace.push(['translate',...args]);},rotate(...args:number[]){trace.push(['rotate',...args]);},scale(...args:number[]){trace.push(['scale',...args]);},
    beginPath(){trace.push(['beginPath']);},rect(...args:number[]){trace.push(['rect',...args]);},clip(){trace.push(['clip']);},fillRect(...args:number[]){trace.push(['fillRect',...args]);},strokeRect(...args:number[]){trace.push(['strokeRect',...args]);},
    createLinearGradient(...args:number[]){trace.push(['linearGradient',...args]);return {addColorStop(){}};},createRadialGradient(...args:number[]){trace.push(['radialGradient',...args]);return {addColorStop(){}};},
    drawImage(source:unknown,...args:unknown[]){calls.push(source);trace.push(['drawImage',source,...args]);},
    getImageData(){return {data:new Uint8ClampedArray(4),width:1,height:1};},putImageData(){},
  };
  return {ctx:ctx as unknown as CanvasRenderingContext2D,calls,trace};
}

describe('trusted creative render operations',()=>{
  it('has an executor for ordinary trusted effects while temporal effects stay renderer-owned',()=>{
    for(const def of creativeRegistry.all('effect')){
      if(TEMPORAL_RUNTIMES.has(def.runtime))expect(EFFECT_HANDLERS[def.runtime]).toBeUndefined();
      else expect(EFFECT_HANDLERS[def.runtime]).toBeTypeOf('function');
    }
    for(const def of creativeRegistry.all('transition'))expect(TRANSITION_HANDLERS[def.runtime]).toBeTypeOf('function');
  });

  it('uses deterministic procedural noise',()=>{
    expect(hashNoise(12345)).toBe(hashNoise(12345));
    expect(hashNoise(12345)).not.toBe(hashNoise(12346));
  });

  it('dispatches a trusted effect runtime without evaluating project code',()=>{
    const {ctx,calls}=fakeContext();
    const source={tag:'source'} as unknown as CanvasImageSource;
    const effect:ResolvedEffect={instanceId:'fx',assetId:'builtin.effect.brightness',version:'1.0.0',runtime:'effect.brightness',params:{amount:1.25},quality:'full',scope:'clip',audioReactive:0};
    renderEffect(ctx,source,effect,{width:100,height:50,frameIndex:2,timeMs:500});
    expect(calls).toEqual([source]);
  });

  it('draws crossfade outgoing before incoming',()=>{
    const {ctx,calls}=fakeContext();
    const outgoing={tag:'out'} as unknown as CanvasImageSource;
    const incoming={tag:'in'} as unknown as CanvasImageSource;
    renderTransition(ctx,outgoing,incoming,{runtime:'transition.crossfade',params:{},progress:.4,quality:'full',instanceId:'tr'},{width:100,height:50,frameIndex:2,timeMs:500});
    expect(calls).toEqual([outgoing,incoming]);
  });

  it('does less procedural work for simplified preview effects',()=>{
    const source={tag:'source'} as unknown as CanvasImageSource;
    const full=fakeContext();
    const low=fakeContext();
    const base:ResolvedEffect={instanceId:'grain',assetId:'builtin.effect.grain',version:'1.0.0',runtime:'effect.grain',params:{amount:.5,size:1},quality:'full',scope:'clip',audioReactive:0};
    renderEffect(full.ctx,source,base,{width:320,height:180,frameIndex:30,timeMs:1000});
    renderEffect(low.ctx,source,{...base,quality:'simplified'},{width:320,height:180,frameIndex:30,timeMs:1000});
    const fullRects=full.trace.filter(op=>op[0]==='fillRect').length;
    const lowRects=low.trace.filter(op=>op[0]==='fillRect').length;
    expect(lowRects).toBeLessThan(fullRects);
  });

  it('does less compositing work for simplified preview transitions',()=>{
    const outgoing={tag:'out'} as unknown as CanvasImageSource;
    const incoming={tag:'in'} as unknown as CanvasImageSource;
    const full=fakeContext();
    const low=fakeContext();
    const base={runtime:'transition.film-burn',params:{intensity:.75},progress:.5,quality:'full' as const,instanceId:'burn'};
    renderTransition(full.ctx,outgoing,incoming,base,{width:320,height:180,frameIndex:30,timeMs:1000});
    renderTransition(low.ctx,outgoing,incoming,{...base,quality:'simplified'},{width:320,height:180,frameIndex:30,timeMs:1000});
    expect(low.trace.filter(op=>op[0]==='fillRect').length).toBeLessThan(full.trace.filter(op=>op[0]==='fillRect').length);
  });

  it('keys procedural effect variation to timeline time instead of output frame index',()=>{
    const source={tag:'source'} as unknown as CanvasImageSource;
    const first=fakeContext();
    const second=fakeContext();
    const grain:ResolvedEffect={instanceId:'grain',assetId:'builtin.effect.grain',version:'1.0.0',runtime:'effect.grain',params:{amount:.5,size:1},quality:'full',scope:'clip',audioReactive:0};
    renderEffect(first.ctx,source,grain,{width:160,height:90,frameIndex:30,timeMs:1000});
    renderEffect(second.ctx,source,grain,{width:160,height:90,frameIndex:60,timeMs:1000});
    expect(second.trace).toEqual(first.trace);
  });

  it('keys procedural transition variation to timeline time instead of output frame index',()=>{
    const outgoing={tag:'out'} as unknown as CanvasImageSource;
    const incoming={tag:'in'} as unknown as CanvasImageSource;
    const first=fakeContext();
    const second=fakeContext();
    const glitch={runtime:'transition.glitch',params:{intensity:.8},progress:.5,quality:'full' as const,instanceId:'glitch'};
    renderTransition(first.ctx,outgoing,incoming,glitch,{width:160,height:90,frameIndex:30,timeMs:1000});
    renderTransition(second.ctx,outgoing,incoming,glitch,{width:160,height:90,frameIndex:60,timeMs:1000});
    expect(second.trace).toEqual(first.trace);
  });
});
