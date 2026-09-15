import type {ResolvedEffect} from './effect-runtime';
import type {CreativeQuality} from './creative-registry';
import type {EffectRenderEnvironment,EffectRenderHandler} from './render-effects';

const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
const param=(effect:ResolvedEffect,key:string,fallback=0)=>{const value=effect.params[key];return typeof value==='number'&&Number.isFinite(value)?value:fallback;};
const textParam=(effect:ResolvedEffect,key:string,fallback='')=>typeof effect.params[key]==='string'?String(effect.params[key]):fallback;
const draw=(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,source:CanvasImageSource,env:EffectRenderEnvironment)=>ctx.drawImage(source,0,0,env.width,env.height);

export interface ColorAdjustValues{exposure:number;temperature:number;tint:number;highlights:number;shadows:number;whites:number;blacks:number;gamma:number;saturation:number;fade:number}
export function applyColorAdjustPixel(rgba:[number,number,number,number],values:ColorAdjustValues):[number,number,number,number]{
  let [r,g,b,a]=rgba;
  const temperature=values.temperature/100*60;r+=temperature;b-=temperature;
  const tint=values.tint/100*24;r+=tint*.55;g-=tint;b+=tint*.55;
  const exposure=2**values.exposure;r*=exposure;g*=exposure;b*=exposure;
  let luminance=(r*.2126+g*.7152+b*.0722)/255;
  const shadows=(1-clamp(luminance*2))*values.shadows/100*70;
  const highlights=clamp((luminance-.5)*2)*values.highlights/100*70;
  const blacks=(1-clamp(luminance*4))*values.blacks/100*55;
  const whites=clamp((luminance-.75)*4)*values.whites/100*55;
  const tone=shadows+highlights+blacks+whites;r+=tone;g+=tone;b+=tone;
  const gamma=Math.max(.1,values.gamma||1);r=255*((clamp(r,0,255)/255)**(1/gamma));g=255*((clamp(g,0,255)/255)**(1/gamma));b=255*((clamp(b,0,255)/255)**(1/gamma));
  luminance=r*.2126+g*.7152+b*.0722;const saturation=Math.max(0,values.saturation);r=luminance+(r-luminance)*saturation;g=luminance+(g-luminance)*saturation;b=luminance+(b-luminance)*saturation;
  const fade=clamp(values.fade);r=r*(1-fade)+128*fade;g=g*(1-fade)+128*fade;b=b*(1-fade)+128*fade;
  return [Math.round(clamp(r,0,255)),Math.round(clamp(g,0,255)),Math.round(clamp(b,0,255)),Math.round(clamp(a,0,255))];
}

export interface TransformCropParams{x:number;y:number;scale:number;scaleX:number;scaleY:number;rotation:number;anchorX:number;anchorY:number;cropLeft:number;cropRight:number;cropTop:number;cropBottom:number;opacity:number}
export function resolveTransformCrop(env:{width:number;height:number},values:TransformCropParams){
  const left=clamp(values.cropLeft,0,.49),right=clamp(values.cropRight,0,.49),top=clamp(values.cropTop,0,.49),bottom=clamp(values.cropBottom,0,.49);
  return {
    translateX:values.x*env.width,translateY:values.y*env.height,
    scaleX:values.scale*values.scaleX,scaleY:values.scale*values.scaleY,
    rotation:values.rotation*Math.PI/180,anchorX:values.anchorX*env.width,anchorY:values.anchorY*env.height,
    crop:{x:left*env.width,y:top*env.height,width:Math.max(1,env.width*(1-left-right)),height:Math.max(1,env.height*(1-top-bottom))},
    opacity:clamp(values.opacity),
  };
}

export function directionalBlurPlan(amount:number,angle:number,samples:number,quality:CreativeQuality){
  const count=Math.max(2,Math.min(24,Math.round(quality==='preview-low'?Math.min(samples,4):quality==='preview-high'?Math.min(samples,12):samples)));
  const radians=angle*Math.PI/180,dx=Math.cos(radians)*amount,dy=Math.sin(radians)*amount;
  return {samples:Array.from({length:count},(_,index)=>{const t=count===1?0:index/(count-1)-.5;return {offsetX:dx*t,offsetY:dy*t,alpha:1/count};})};
}

export function zoomBlurPlan(amount:number,centerX:number,centerY:number,samples:number,quality:CreativeQuality){
  const count=Math.max(2,Math.min(24,Math.round(quality==='preview-low'?Math.min(samples,4):quality==='preview-high'?Math.min(samples,10):samples)));
  return {centerX:clamp(centerX),centerY:clamp(centerY),samples:Array.from({length:count},(_,index)=>({scale:1+clamp(amount)*.35*(count===1?0:index/(count-1)),alpha:1/count}))};
}

export function lensDistortionPoint(x:number,y:number,amount:number,centerX:number,centerY:number){
  const dx=x-centerX,dy=y-centerY,r2=dx*dx+dy*dy,factor=1-amount*r2*.75;
  return {x:centerX+dx*factor,y:centerY+dy*factor};
}

export function strobeOpacity(timeMs:number,rateHz:number,duty:number,intensity:number){const phase=((timeMs/1000)*Math.max(.01,rateHz))%1;return phase<clamp(duty,.05,1)?clamp(intensity):0;}
export function lightLeakPlan(intensity:number,position:number,width:number,angle:number,color:string){return {intensity:clamp(intensity),position:clamp(position),width:clamp(width,.05,1),angle,color};}
export function unsharpChannel(original:number,blurred:number,amount:number,threshold:number){const delta=original-blurred;return Math.abs(delta/255)<clamp(threshold)?original:Math.round(clamp(original+delta*Math.max(0,amount),0,255));}

function hashString(value:string){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h|0;}
function hashNoise(seed:number){let x=seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;return ((x>>>0)%1000000)/1000000;}
export function filmBurnPlan(instanceId:string,timeMs:number,intensity:number,position:number,spread:number,flicker:number,color:string){
  const bucket=Math.round(timeMs/16),noise=hashNoise(hashString(instanceId)^Math.imul(bucket+1,0x45d9f3b));
  const flickerFactor=1-clamp(flicker)*.5+noise*clamp(flicker);
  return {position:clamp(position),spread:clamp(spread,.05,1),color,flicker:noise,opacity:clamp(intensity)*flickerFactor};
}

function quality(effect:ResolvedEffect):CreativeQuality{return effect.quality==='simplified'?'preview-low':'export';}

const renderColorAdjust:EffectRenderHandler=(ctx,source,effect,env)=>{
  draw(ctx,source,env);
  try{
    const image=ctx.getImageData(0,0,env.width,env.height),data=image.data;
    const values:ColorAdjustValues={exposure:param(effect,'exposure'),temperature:param(effect,'temperature'),tint:param(effect,'tint'),highlights:param(effect,'highlights'),shadows:param(effect,'shadows'),whites:param(effect,'whites'),blacks:param(effect,'blacks'),gamma:param(effect,'gamma',1),saturation:param(effect,'saturation',1),fade:param(effect,'fade')};
    for(let i=0;i<data.length;i+=4){const next=applyColorAdjustPixel([data[i],data[i+1],data[i+2],data[i+3]],values);data[i]=next[0];data[i+1]=next[1];data[i+2]=next[2];data[i+3]=next[3];}
    ctx.putImageData(image,0,0);
  }catch{/* keep safely rendered source when pixel reads are unavailable */}
};

const renderTransformCrop:EffectRenderHandler=(ctx,source,effect,env)=>{
  const geometry=resolveTransformCrop(env,{x:param(effect,'x'),y:param(effect,'y'),scale:param(effect,'scale',1),scaleX:param(effect,'scaleX',1),scaleY:param(effect,'scaleY',1),rotation:param(effect,'rotation'),anchorX:param(effect,'anchorX',.5),anchorY:param(effect,'anchorY',.5),cropLeft:param(effect,'cropLeft'),cropRight:param(effect,'cropRight'),cropTop:param(effect,'cropTop'),cropBottom:param(effect,'cropBottom'),opacity:param(effect,'opacity',1)});
  ctx.save();ctx.beginPath();ctx.rect(geometry.crop.x,geometry.crop.y,geometry.crop.width,geometry.crop.height);ctx.clip();ctx.globalAlpha=geometry.opacity;ctx.translate(geometry.anchorX+geometry.translateX,geometry.anchorY+geometry.translateY);ctx.rotate(geometry.rotation);ctx.scale(geometry.scaleX,geometry.scaleY);ctx.translate(-geometry.anchorX,-geometry.anchorY);draw(ctx,source,env);ctx.restore();
};

const renderDirectionalBlur:EffectRenderHandler=(ctx,source,effect,env)=>{const plan=directionalBlurPlan(param(effect,'amount'),param(effect,'angle'),param(effect,'samples',10),quality(effect));ctx.save();for(const sample of plan.samples){ctx.globalAlpha=sample.alpha;ctx.drawImage(source,sample.offsetX,sample.offsetY,env.width,env.height);}ctx.restore();};

const renderLensDistortion:EffectRenderHandler=(ctx,source,effect,env)=>{
  const amount=param(effect,'amount'),cx=param(effect,'centerX',.5),cy=param(effect,'centerY',.5),grid=effect.quality==='simplified'?12:24,sw=env.width/grid,sh=env.height/grid;
  for(let gy=0;gy<grid;gy++)for(let gx=0;gx<grid;gx++){const nx=(gx+.5)/grid,ny=(gy+.5)/grid,p=lensDistortionPoint(nx,ny,amount,cx,cy);ctx.drawImage(source,gx*sw,gy*sh,sw+1,sh+1,p.x*env.width-sw/2,p.y*env.height-sh/2,sw+1,sh+1);}
};

const renderChromaticAberration:EffectRenderHandler=(ctx,source,effect,env)=>{const amount=param(effect,'amount'),angle=param(effect,'angle')*Math.PI/180,dx=Math.cos(angle)*amount,dy=Math.sin(angle)*amount;ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.42;ctx.filter='sepia(1) saturate(8) hue-rotate(-45deg)';ctx.drawImage(source,-dx,-dy,env.width,env.height);ctx.filter='sepia(1) saturate(8) hue-rotate(75deg)';ctx.drawImage(source,dx,dy,env.width,env.height);ctx.filter='none';ctx.globalAlpha=.55;draw(ctx,source,env);ctx.restore();};

const renderStrobe:EffectRenderHandler=(ctx,source,effect,env)=>{draw(ctx,source,env);const opacity=strobeOpacity(env.timeMs,param(effect,'rateHz',8),param(effect,'duty',.5),param(effect,'intensity',.5));if(!opacity)return;ctx.save();ctx.globalAlpha=opacity;ctx.fillStyle=textParam(effect,'color','#ffffff');ctx.fillRect(0,0,env.width,env.height);ctx.restore();};

const renderLightLeak:EffectRenderHandler=(ctx,source,effect,env)=>{draw(ctx,source,env);const plan=lightLeakPlan(param(effect,'intensity',.5),param(effect,'position',.5),param(effect,'width',.35),param(effect,'angle'),textParam(effect,'color','#ff9a55'));if(!plan.intensity)return;const angle=plan.angle*Math.PI/180,cx=plan.position*env.width,cy=.5*env.height,len=Math.hypot(env.width,env.height),dx=Math.cos(angle)*len*.5,dy=Math.sin(angle)*len*.5,g=ctx.createLinearGradient(cx-dx,cy-dy,cx+dx,cy+dy),edge=clamp((1-plan.width)/2,0,.49);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(edge,'rgba(0,0,0,0)');g.addColorStop(.5,plan.color);g.addColorStop(1-edge,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.save();ctx.globalAlpha=plan.intensity;ctx.globalCompositeOperation='screen';ctx.fillStyle=g;ctx.fillRect(0,0,env.width,env.height);ctx.restore();};

const renderZoomBlur:EffectRenderHandler=(ctx,source,effect,env)=>{const plan=zoomBlurPlan(param(effect,'amount'),param(effect,'centerX',.5),param(effect,'centerY',.5),param(effect,'samples',10),quality(effect)),cx=plan.centerX*env.width,cy=plan.centerY*env.height;ctx.save();for(const sample of plan.samples){ctx.save();ctx.globalAlpha=sample.alpha;ctx.translate(cx,cy);ctx.scale(sample.scale,sample.scale);ctx.translate(-cx,-cy);draw(ctx,source,env);ctx.restore();}ctx.restore();};

const renderUnsharpMask:EffectRenderHandler=(ctx,source,effect,env)=>{
  const amount=param(effect,'amount',.5),radius=param(effect,'radius',2)*(effect.quality==='simplified'?.5:1),threshold=param(effect,'threshold',.05);if(!env.pool){ctx.save();ctx.filter=`contrast(${1+amount*.2})`;draw(ctx,source,env);ctx.restore();return;}
  const blurred=env.pool.acquire(env.width,env.height,1,`unsharp:${effect.instanceId}`);blurred.ctx.save();blurred.ctx.filter=`blur(${radius}px)`;blurred.ctx.drawImage(source,0,0,env.width,env.height);blurred.ctx.restore();draw(ctx,source,env);
  try{const original=ctx.getImageData(0,0,env.width,env.height),soft=blurred.ctx.getImageData(0,0,env.width,env.height);for(let i=0;i<original.data.length;i+=4){original.data[i]=unsharpChannel(original.data[i],soft.data[i],amount,threshold);original.data[i+1]=unsharpChannel(original.data[i+1],soft.data[i+1],amount,threshold);original.data[i+2]=unsharpChannel(original.data[i+2],soft.data[i+2],amount,threshold);}ctx.putImageData(original,0,0);}catch{/* source remains drawn */}
};

const renderFilmBurn:EffectRenderHandler=(ctx,source,effect,env)=>{draw(ctx,source,env);const plan=filmBurnPlan(effect.instanceId,env.timeMs,param(effect,'intensity',.6),param(effect,'position',.5),param(effect,'spread',.35),param(effect,'flicker',.2),textParam(effect,'color','#ff6a20'));if(!plan.opacity)return;const cx=plan.position*env.width,cy=(.35+.3*plan.flicker)*env.height,r=Math.max(env.width,env.height)*plan.spread,g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(255,255,235,.95)');g.addColorStop(.18,plan.color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.save();ctx.globalAlpha=plan.opacity;ctx.globalCompositeOperation='screen';ctx.fillStyle=g;ctx.fillRect(0,0,env.width,env.height);ctx.restore();};

export const PRO_EFFECT_HANDLERS:Record<string,EffectRenderHandler>={
  'effect.color-adjust':renderColorAdjust,
  'effect.transform-crop':renderTransformCrop,
  'effect.directional-blur':renderDirectionalBlur,
  'effect.lens-distortion':renderLensDistortion,
  'effect.chromatic-aberration':renderChromaticAberration,
  'effect.strobe':renderStrobe,
  'effect.light-leak':renderLightLeak,
  'effect.zoom-blur':renderZoomBlur,
  'effect.unsharp-mask':renderUnsharpMask,
  'effect.film-burn':renderFilmBurn,
};
