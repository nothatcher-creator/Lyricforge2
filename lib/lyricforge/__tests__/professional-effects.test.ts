import {describe,expect,it} from 'vitest';
import type {ResolvedEffect} from '../effect-runtime';
import {creativeRegistry} from '../creative-registry';
import {EFFECT_HANDLERS,renderEffect} from '../render-effects';
import {
  applyColorAdjustPixel,
  directionalBlurPlan,
  filmBurnPlan,
  lensDistortionPoint,
  lightLeakPlan,
  resolveTransformCrop,
  strobeOpacity,
  unsharpChannel,
  zoomBlurPlan,
} from '../render-effects-pro';

describe('professional single-frame effects',()=>{
  it('registers every professional runtime as a trusted renderer',()=>{
    const ids=['color-adjust','transform-crop','directional-blur','lens-distortion','chromatic-aberration','strobe','light-leak','zoom-blur','unsharp-mask','film-burn'];
    for(const id of ids){
      const def=creativeRegistry.resolve('effect',`builtin.effect.${id}`,'1.0.0');
      expect(def).not.toBeNull();
      expect(EFFECT_HANDLERS[def!.runtime]).toBeTypeOf('function');
      expect(def!.quality.export).toBe('full');
    }
  });

  it('adjusts color in one deterministic pixel transform and keeps neutral settings neutral',()=>{
    const neutral={exposure:0,temperature:0,tint:0,highlights:0,shadows:0,whites:0,blacks:0,gamma:1,saturation:1,fade:0};
    expect(applyColorAdjustPixel([100,120,140,255],neutral)).toEqual([100,120,140,255]);
    const warm=applyColorAdjustPixel([100,120,140,255],{...neutral,exposure:1,temperature:20});
    expect(warm[0]).toBeGreaterThan(100);
    expect(warm[2]-warm[0]).toBeLessThan(40);
  });

  it('resolves transform and crop geometry from normalized controls',()=>{
    const geometry=resolveTransformCrop({width:1920,height:1080},{x:.1,y:-.2,scale:1.2,scaleX:1,scaleY:.8,rotation:45,anchorX:.5,anchorY:.5,cropLeft:.1,cropRight:.2,cropTop:.05,cropBottom:.1,opacity:.7});
    expect(geometry.translateX).toBeCloseTo(192);
    expect(geometry.translateY).toBeCloseTo(-216);
    expect(geometry.crop.x).toBeCloseTo(192);
    expect(geometry.crop.width).toBeCloseTo(1344);
    expect(geometry.opacity).toBe(.7);
  });

  it('simplifies directional blur and zoom blur samples in low preview quality',()=>{
    expect(directionalBlurPlan(30,45,20,'preview-low').samples).toHaveLength(4);
    expect(directionalBlurPlan(30,45,20,'export').samples).toHaveLength(20);
    expect(zoomBlurPlan(.6,.5,.5,20,'preview-low').samples).toHaveLength(4);
    expect(zoomBlurPlan(.6,.5,.5,20,'preview-high').samples).toHaveLength(10);
    expect(zoomBlurPlan(.6,.5,.5,20,'export').samples).toHaveLength(20);
  });

  it('uses the actual preview mode when a full-quality resolved effect still has a high-preview sample cap',()=>{
    let draws=0;
    const ctx={save(){},restore(){},drawImage(){draws++;},globalAlpha:1} as unknown as CanvasRenderingContext2D;
    const effect:ResolvedEffect={instanceId:'directional-high',assetId:'builtin.effect.directional-blur',version:'1.0.0',runtime:'effect.directional-blur',params:{amount:30,angle:45,samples:20},quality:'full',scope:'clip',audioReactive:0};
    renderEffect(ctx,{} as CanvasImageSource,effect,{width:1920,height:1080,frameIndex:0,timeMs:0,quality:'preview-high'} as never);
    expect(draws).toBe(12);
  });

  it('computes deterministic lens distortion around the requested center',()=>{
    const center=lensDistortionPoint(.5,.5,.7,.5,.5);
    expect(center.x).toBeCloseTo(.5);
    expect(center.y).toBeCloseTo(.5);
    const edge=lensDistortionPoint(1,.5,.5,.5,.5);
    expect(edge.x).not.toBe(1);
  });

  it('computes strobe and light-leak plans deterministically',()=>{
    expect(strobeOpacity(0,10,.5,.8)).toBe(.8);
    expect(strobeOpacity(75,10,.5,.8)).toBe(0);
    expect(lightLeakPlan(.7,.25,.4,30,'#ff9955')).toEqual({intensity:.7,position:.25,width:.4,angle:30,color:'#ff9955'});
  });

  it('sharpens only deltas above threshold',()=>{
    expect(unsharpChannel(100,98,.8,.05)).toBe(100);
    expect(unsharpChannel(180,120,.8,.05)).toBeGreaterThan(180);
    expect(unsharpChannel(100,20,0,.05)).toBe(100);
  });

  it('builds deterministic film-burn plans for the same instance and frame',()=>{
    const a=filmBurnPlan('fx-1',1200,.7,.4,.3,.5,'#ff6a20');
    const b=filmBurnPlan('fx-1',1200,.7,.4,.3,.5,'#ff6a20');
    const c=filmBurnPlan('fx-1',1233,.7,.4,.3,.5,'#ff6a20');
    expect(a).toEqual(b);
    expect(a.opacity).toBeGreaterThanOrEqual(0);
    expect(a.opacity).toBeLessThanOrEqual(.7);
    expect(c.flicker).not.toBe(a.flicker);
  });
});
