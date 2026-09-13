import {describe,expect,it} from 'vitest';
import {creativeRegistry} from '../creative-registry';
import {EFFECT_HANDLERS,hashNoise,renderEffect} from '../render-effects';
import {TRANSITION_HANDLERS,renderTransition} from '../render-transitions';
import type {ResolvedEffect} from '../effect-runtime';

function fakeContext(){
  const calls:unknown[]=[];
  const ctx={
    globalAlpha:1,globalCompositeOperation:'source-over',filter:'none',fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,
    shadowColor:'transparent',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,imageSmoothingEnabled:true,
    save(){},restore(){},setTransform(){},clearRect(){},translate(){},rotate(){},scale(){},beginPath(){},rect(){},clip(){},fillRect(){},strokeRect(){},
    createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};},
    drawImage(source:unknown){calls.push(source);},
    getImageData(){return {data:new Uint8ClampedArray(4),width:1,height:1};},putImageData(){},
  };
  return {ctx:ctx as unknown as CanvasRenderingContext2D,calls};
}

describe('trusted creative render operations',()=>{
  it('has an executor for every trusted effect and transition runtime',()=>{
    for(const def of creativeRegistry.all('effect'))expect(EFFECT_HANDLERS[def.runtime]).toBeTypeOf('function');
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
    renderEffect(ctx,source,effect,{width:100,height:50,frameIndex:2});
    expect(calls).toEqual([source]);
  });

  it('draws crossfade outgoing before incoming',()=>{
    const {ctx,calls}=fakeContext();
    const outgoing={tag:'out'} as unknown as CanvasImageSource;
    const incoming={tag:'in'} as unknown as CanvasImageSource;
    renderTransition(ctx,outgoing,incoming,{runtime:'transition.crossfade',params:{},progress:.4,quality:'full',instanceId:'tr'},{width:100,height:50,frameIndex:2});
    expect(calls).toEqual([outgoing,incoming]);
  });
});
