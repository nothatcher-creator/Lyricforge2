import type {ResolvedEffect} from './effect-runtime';
import type {CreativeQuality} from './creative-registry';
import type {RenderSurfacePool} from './render-surfaces';
import {PRO_EFFECT_HANDLERS} from './render-effects-pro';

export type EffectCanvasContext=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
export interface EffectRenderEnvironment{
  width:number;
  height:number;
  frameIndex:number;
  timeMs:number;
  quality:CreativeQuality;
  pool?:RenderSurfacePool;
}
export type EffectRenderHandler=(ctx:EffectCanvasContext,source:CanvasImageSource,effect:ResolvedEffect,env:EffectRenderEnvironment)=>void;

const numberParam=(effect:ResolvedEffect,key:string,fallback=0)=>{
  const value=effect.params[key];
  return typeof value==='number'&&Number.isFinite(value)?value:fallback;
};
const stringParam=(effect:ResolvedEffect,key:string,fallback='')=>typeof effect.params[key]==='string'?String(effect.params[key]):fallback;
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
const draw=(ctx:EffectCanvasContext,source:CanvasImageSource,env:EffectRenderEnvironment)=>ctx.drawImage(source,0,0,env.width,env.height);

export function hashNoise(seed:number){
  let x=seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;
  return ((x>>>0)%1000000)/1000000;
}
export function hashString(value:string){
  let h=2166136261;
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
  return h|0;
}
function seeded(effect:ResolvedEffect,env:EffectRenderEnvironment,salt=0){const time=Math.round(env.timeMs);return hashNoise(hashString(effect.instanceId)^Math.imul(time+1,0x45d9f3b)^salt);}
function withFilter(ctx:EffectCanvasContext,source:CanvasImageSource,env:EffectRenderEnvironment,filter:string){ctx.save();ctx.filter=filter;draw(ctx,source,env);ctx.restore();}
function centerTransform(ctx:EffectCanvasContext,env:EffectRenderEnvironment,scale=1,rotation=0,x=0,y=0){ctx.translate(env.width/2+x,env.height/2+y);ctx.rotate(rotation);ctx.scale(scale,scale);ctx.translate(-env.width/2,-env.height/2);}

const renderGlow:EffectRenderHandler=(ctx,source,effect,env)=>{
  const radius=numberParam(effect,'radius',18),intensity=clamp01(numberParam(effect,'intensity',.6));
  ctx.save();ctx.globalAlpha=intensity;ctx.filter=`blur(${radius}px) brightness(${1+intensity})`;ctx.globalCompositeOperation='screen';draw(ctx,source,env);ctx.restore();draw(ctx,source,env);
};
const renderBloom:EffectRenderHandler=(ctx,source,effect,env)=>{
  const radius=numberParam(effect,'radius',22)*(effect.quality==='simplified'?.5:1),intensity=clamp01(numberParam(effect,'intensity',.45));
  ctx.save();ctx.globalAlpha=intensity;ctx.globalCompositeOperation='screen';ctx.filter=`blur(${radius}px) brightness(${1+intensity})`;draw(ctx,source,env);ctx.restore();draw(ctx,source,env);
};
const renderDropShadow:EffectRenderHandler=(ctx,source,effect,env)=>{
  const blur=numberParam(effect,'blur',14),x=numberParam(effect,'offsetX'),y=numberParam(effect,'offsetY',8),opacity=clamp01(numberParam(effect,'opacity',.55)),color=stringParam(effect,'color','#000000');
  withFilter(ctx,source,env,`drop-shadow(${x}px ${y}px ${blur}px ${color}${Math.round(opacity*255).toString(16).padStart(2,'0')})`);
};
const renderOutline:EffectRenderHandler=(ctx,source,effect,env)=>{
  const width=numberParam(effect,'width',3),opacity=clamp01(numberParam(effect,'opacity',1)),color=stringParam(effect,'color','#ffffff');
  ctx.save();ctx.filter=`drop-shadow(${width}px 0 0 ${color}) drop-shadow(${-width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 ${-width}px 0 ${color})`;ctx.globalAlpha=opacity;draw(ctx,source,env);ctx.restore();draw(ctx,source,env);
};
const renderBlur:EffectRenderHandler=(ctx,source,effect,env)=>withFilter(ctx,source,env,`blur(${numberParam(effect,'radius',8)}px)`);
const renderSharpen:EffectRenderHandler=(ctx,source,effect,env)=>{const amount=numberParam(effect,'amount',.4)*(effect.quality==='simplified'?.5:1);withFilter(ctx,source,env,`contrast(${1+amount*.3}) saturate(${1+amount*.08})`);};
const renderBrightness:EffectRenderHandler=(ctx,source,effect,env)=>withFilter(ctx,source,env,`brightness(${numberParam(effect,'amount',1)})`);
const renderContrast:EffectRenderHandler=(ctx,source,effect,env)=>withFilter(ctx,source,env,`contrast(${numberParam(effect,'amount',1)})`);
const renderSaturation:EffectRenderHandler=(ctx,source,effect,env)=>withFilter(ctx,source,env,`saturate(${numberParam(effect,'amount',1)})`);
const renderHueShift:EffectRenderHandler=(ctx,source,effect,env)=>withFilter(ctx,source,env,`hue-rotate(${numberParam(effect,'degrees')}deg)`);
const renderGrain:EffectRenderHandler=(ctx,source,effect,env)=>{
  draw(ctx,source,env);const amount=clamp01(numberParam(effect,'amount',.2));if(!amount)return;
  const size=Math.max(1,numberParam(effect,'size',1));const baseCells=Math.min(900,Math.ceil(env.width*env.height/Math.max(1,size*size*250))),cells=Math.max(1,Math.floor(baseCells*(effect.quality==='simplified'?.25:1)));
  ctx.save();ctx.globalCompositeOperation='overlay';
  for(let i=0;i<cells;i++){const n=seeded(effect,env,i*7919),m=seeded(effect,env,i*104729+17);ctx.globalAlpha=amount*(.08+.22*seeded(effect,env,i*31337));ctx.fillStyle=seeded(effect,env,i*65537)>.5?'#ffffff':'#000000';ctx.fillRect(Math.floor(n*env.width),Math.floor(m*env.height),size,size);}
  ctx.restore();
};
const renderVignette:EffectRenderHandler=(ctx,source,effect,env)=>{
  draw(ctx,source,env);const amount=clamp01(numberParam(effect,'amount',.35)),soft=Math.max(.05,numberParam(effect,'softness',.55));if(!amount)return;
  const r=Math.max(env.width,env.height)*.72,g=ctx.createRadialGradient(env.width/2,env.height/2,r*(1-soft),env.width/2,env.height/2,r);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${amount})`);ctx.save();ctx.fillStyle=g;ctx.fillRect(0,0,env.width,env.height);ctx.restore();
};
const renderDuotone:EffectRenderHandler=(ctx,source,effect,env)=>{
  const amount=clamp01(numberParam(effect,'amount',1));draw(ctx,source,env);if(!amount)return;
  ctx.save();ctx.globalAlpha=amount;ctx.globalCompositeOperation='color';ctx.fillStyle=stringParam(effect,'shadow','#182030');ctx.fillRect(0,0,env.width,env.height);ctx.globalCompositeOperation='screen';ctx.globalAlpha=amount*.55;ctx.fillStyle=stringParam(effect,'highlight','#f2b66d');ctx.fillRect(0,0,env.width,env.height);ctx.restore();
};
const renderPosterize:EffectRenderHandler=(ctx,source,effect,env)=>{
  draw(ctx,source,env);const levels=Math.max(2,Math.round(numberParam(effect,'levels',6)));
  try{const image=ctx.getImageData(0,0,env.width,env.height),step=255/(levels-1);for(let i=0;i<image.data.length;i+=4){image.data[i]=Math.round(image.data[i]/step)*step;image.data[i+1]=Math.round(image.data[i+1]/step)*step;image.data[i+2]=Math.round(image.data[i+2]/step)*step;}ctx.putImageData(image,0,0);}catch{/* source may be protected; retain the safely drawn source */}
};
const renderPixelate:EffectRenderHandler=(ctx,source,effect,env)=>{
  const size=Math.max(1,Math.round(numberParam(effect,'size',8)*(effect.quality==='simplified'?2:1)));
  if(!env.pool||size<=1){ctx.save();ctx.imageSmoothingEnabled=false;draw(ctx,source,env);ctx.restore();return;}
  const w=Math.max(1,Math.ceil(env.width/size)),h=Math.max(1,Math.ceil(env.height/size));const low=env.pool.acquire(w,h,1,`pixelate:${effect.instanceId}`);low.ctx.imageSmoothingEnabled=false;low.ctx.drawImage(source,0,0,w,h);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(low.canvas,0,0,w,h,0,0,env.width,env.height);ctx.restore();
};
const renderRgbSplit:EffectRenderHandler=(ctx,source,effect,env)=>{
  const amount=numberParam(effect,'amount',6);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.55;ctx.drawImage(source,-amount,0,env.width,env.height);ctx.drawImage(source,amount,0,env.width,env.height);ctx.restore();ctx.save();ctx.globalAlpha=.55;draw(ctx,source,env);ctx.restore();
};
const renderVhs:EffectRenderHandler=(ctx,source,effect,env)=>{
  const jitter=numberParam(effect,'jitter',.15),noise=numberParam(effect,'noise',.2),scanlines=numberParam(effect,'scanlines',.45),dx=(seeded(effect,env)-.5)*jitter*18;ctx.drawImage(source,dx,0,env.width,env.height);
  const scanStep=effect.quality==='simplified'?8:4,noiseDots=effect.quality==='simplified'?20:60;ctx.save();ctx.globalAlpha=scanlines*.25;ctx.fillStyle='#000000';for(let y=0;y<env.height;y+=scanStep)ctx.fillRect(0,y,env.width,1);ctx.globalAlpha=noise*.2;ctx.fillStyle=seeded(effect,env,99)>.5?'#ffffff':'#000000';for(let i=0;i<noiseDots;i++){ctx.fillRect(seeded(effect,env,i*31)*env.width,seeded(effect,env,i*47+7)*env.height,1,1);}ctx.restore();
};
const renderNoiseDisplacement:EffectRenderHandler=(ctx,source,effect,env)=>{
  const amount=numberParam(effect,'amount',8),band=Math.max(2,Math.round(numberParam(effect,'scale',24)*(effect.quality==='simplified'?2:1)));for(let y=0,i=0;y<env.height;y+=band,i++){const h=Math.min(band,env.height-y),dx=(seeded(effect,env,i)-.5)*amount*2;ctx.drawImage(source,0,y,env.width,h,dx,y,env.width,h);}
};
const renderShake:EffectRenderHandler=(ctx,source,effect,env)=>{
  const amount=numberParam(effect,'amount',8),speed=numberParam(effect,'speed',8),phase=env.timeMs/1000*Math.max(.01,speed)*7.8;ctx.save();ctx.translate(Math.sin(phase)*amount,Math.cos(phase*1.37)*amount);draw(ctx,source,env);ctx.restore();
};
const renderZoomPulse:EffectRenderHandler=(ctx,source,effect,env)=>{
  const amount=numberParam(effect,'amount',.08),period=Math.max(100,numberParam(effect,'periodMs',800)),t=env.timeMs,scale=1+Math.sin(t/period*Math.PI*2)*amount;ctx.save();centerTransform(ctx,env,scale);draw(ctx,source,env);ctx.restore();
};
const renderLightStreak:EffectRenderHandler=(ctx,source,effect,env)=>{
  draw(ctx,source,env);const intensity=clamp01(numberParam(effect,'intensity',.4)),angle=numberParam(effect,'angle',25)*Math.PI/180,cx=env.width/2,cy=env.height/2,len=Math.hypot(env.width,env.height),dx=Math.cos(angle)*len/2,dy=Math.sin(angle)*len/2,g=ctx.createLinearGradient(cx-dx,cy-dy,cx+dx,cy+dy);g.addColorStop(.35,'rgba(255,255,255,0)');g.addColorStop(.5,`rgba(255,255,255,${intensity})`);g.addColorStop(.65,'rgba(255,255,255,0)');ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=g;ctx.fillRect(0,0,env.width,env.height);ctx.restore();
};
const renderGlitch:EffectRenderHandler=(ctx,source,effect,env)=>{
  const intensity=clamp01(numberParam(effect,'intensity',.35)),rate=clamp01(numberParam(effect,'rate',.25));if(seeded(effect,env,5)>rate){draw(ctx,source,env);return;}draw(ctx,source,env);const slices=Math.max(2,Math.round((3+intensity*10)*(effect.quality==='simplified'?.5:1)));for(let i=0;i<slices;i++){const y=Math.floor(seeded(effect,env,i*19)*env.height),h=Math.max(1,Math.floor(seeded(effect,env,i*23+3)*18+2)),dx=(seeded(effect,env,i*29+7)-.5)*intensity*80;ctx.drawImage(source,0,y,env.width,h,dx,y,env.width,h);}
};
const renderBeatReactive:EffectRenderHandler=(ctx,source,effect,env)=>{
  const intensity=numberParam(effect,'intensity',.5),sensitivity=numberParam(effect,'sensitivity',1),scale=1+clamp01(effect.audioReactive*sensitivity)*intensity*.12;ctx.save();centerTransform(ctx,env,scale);draw(ctx,source,env);ctx.restore();
};

export const EFFECT_HANDLERS:Record<string,EffectRenderHandler>={
  'effect.glow':renderGlow,
  'effect.bloom':renderBloom,
  'effect.drop-shadow':renderDropShadow,
  'effect.outline':renderOutline,
  'effect.blur':renderBlur,
  'effect.sharpen':renderSharpen,
  'effect.grain':renderGrain,
  'effect.vignette':renderVignette,
  'effect.brightness':renderBrightness,
  'effect.contrast':renderContrast,
  'effect.saturation':renderSaturation,
  'effect.hue-shift':renderHueShift,
  'effect.duotone':renderDuotone,
  'effect.posterize':renderPosterize,
  'effect.pixelate':renderPixelate,
  'effect.rgb-split':renderRgbSplit,
  'effect.vhs':renderVhs,
  'effect.noise-displacement':renderNoiseDisplacement,
  'effect.shake':renderShake,
  'effect.zoom-pulse':renderZoomPulse,
  'effect.light-streak':renderLightStreak,
  'effect.glitch':renderGlitch,
  'effect.beat-reactive':renderBeatReactive,
  ...PRO_EFFECT_HANDLERS,
};

export function renderEffect(ctx:EffectCanvasContext,source:CanvasImageSource,effect:ResolvedEffect,env:EffectRenderEnvironment){
  const handler=EFFECT_HANDLERS[effect.runtime];
  if(!handler)throw new Error(`No trusted renderer for ${effect.runtime}.`);
  handler(ctx,source,effect,env);
}
