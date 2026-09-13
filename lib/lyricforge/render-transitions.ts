import type {AssetParamValue} from './creative-assets';
import {hashNoise,hashString,type EffectCanvasContext} from './render-effects';

export interface TransitionRenderPlan{
  instanceId:string;
  runtime:string;
  params:Record<string,AssetParamValue>;
  progress:number;
  quality:'full'|'simplified';
}
export interface TransitionRenderEnvironment{width:number;height:number;frameIndex:number;}
export type TransitionRenderHandler=(ctx:EffectCanvasContext,outgoing:CanvasImageSource,incoming:CanvasImageSource,transition:TransitionRenderPlan,env:TransitionRenderEnvironment)=>void;

const n=(t:TransitionRenderPlan,key:string,fallback=0)=>typeof t.params[key]==='number'?Number(t.params[key]):fallback;
const s=(t:TransitionRenderPlan,key:string,fallback='')=>typeof t.params[key]==='string'?String(t.params[key]):fallback;
const p=(t:TransitionRenderPlan)=>Math.max(0,Math.min(1,t.progress));
const draw=(ctx:EffectCanvasContext,source:CanvasImageSource,env:TransitionRenderEnvironment)=>ctx.drawImage(source,0,0,env.width,env.height);
const seeded=(t:TransitionRenderPlan,env:TransitionRenderEnvironment,salt=0)=>hashNoise(hashString(t.instanceId)^Math.imul(env.frameIndex+1,0x45d9f3b)^salt);
function center(ctx:EffectCanvasContext,env:TransitionRenderEnvironment,scale=1,rotation=0){ctx.translate(env.width/2,env.height/2);ctx.rotate(rotation);ctx.scale(scale,scale);ctx.translate(-env.width/2,-env.height/2);}
function crossfade(ctx:EffectCanvasContext,outgoing:CanvasImageSource,incoming:CanvasImageSource,progress:number,env:TransitionRenderEnvironment){ctx.save();ctx.globalAlpha=1-progress;draw(ctx,outgoing,env);ctx.restore();ctx.save();ctx.globalAlpha=progress;draw(ctx,incoming,env);ctx.restore();}
function directionOffset(direction:string,amount:number,env:TransitionRenderEnvironment){if(direction==='right')return {x:env.width*amount,y:0};if(direction==='up')return {x:0,y:-env.height*amount};if(direction==='down')return {x:0,y:env.height*amount};return {x:-env.width*amount,y:0};}

const renderCrossfade:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>crossfade(ctx,outgoing,incoming,p(t),env);
function dip(color:string):TransitionRenderHandler{return (ctx,outgoing,incoming,t,env)=>{const progress=p(t),hold=Math.max(0,Math.min(.8,n(t,'hold',.15))),edge=Math.max(.01,(1-hold)/2);ctx.save();if(progress<.5){ctx.globalAlpha=1-Math.min(1,progress/edge);draw(ctx,outgoing,env);}else{ctx.globalAlpha=Math.max(0,Math.min(1,(progress-(.5+hold/2))/edge));draw(ctx,incoming,env);}ctx.restore();const darkness=1-Math.min(1,Math.abs(progress-.5)/Math.max(.001,hold/2+edge));ctx.save();ctx.globalAlpha=darkness;ctx.fillStyle=color;ctx.fillRect(0,0,env.width,env.height);ctx.restore();};}
const renderDipBlack=dip('#000000');
const renderDipWhite=dip('#ffffff');
const renderBlurDissolve:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),radius=n(t,'radius',24);ctx.save();ctx.globalAlpha=1-progress;ctx.filter=`blur(${radius*progress}px)`;draw(ctx,outgoing,env);ctx.restore();ctx.save();ctx.globalAlpha=progress;ctx.filter=`blur(${radius*(1-progress)}px)`;draw(ctx,incoming,env);ctx.restore();};
const renderPush:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),dir=s(t,'direction','left'),out=directionOffset(dir,progress,env),incomingOffset=directionOffset(dir,progress-1,env);ctx.save();ctx.translate(out.x,out.y);draw(ctx,outgoing,env);ctx.restore();ctx.save();ctx.translate(incomingOffset.x,incomingOffset.y);draw(ctx,incoming,env);ctx.restore();};
const renderSlide:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),dir=s(t,'direction','left');draw(ctx,outgoing,env);const offset=directionOffset(dir,progress-1,env);ctx.save();ctx.translate(offset.x,offset.y);draw(ctx,incoming,env);ctx.restore();};
function revealRect(direction:string,progress:number,env:TransitionRenderEnvironment){if(direction==='right')return {x:env.width*(1-progress),y:0,w:env.width*progress,h:env.height};if(direction==='up')return {x:0,y:env.height*(1-progress),w:env.width,h:env.height*progress};if(direction==='down')return {x:0,y:0,w:env.width,h:env.height*progress};return {x:0,y:0,w:env.width*progress,h:env.height};}
const renderWipe:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),r=revealRect(s(t,'direction','left'),progress,env);draw(ctx,outgoing,env);ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();draw(ctx,incoming,env);ctx.restore();};
const renderZoom:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),amount=n(t,'amount',.25);ctx.save();ctx.globalAlpha=1-progress;center(ctx,env,1+amount*progress);draw(ctx,outgoing,env);ctx.restore();ctx.save();ctx.globalAlpha=progress;center(ctx,env,1+amount*(1-progress));draw(ctx,incoming,env);ctx.restore();};
const renderSpin:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),turns=n(t,'turns',.3),angle=turns*Math.PI*2;ctx.save();ctx.globalAlpha=1-progress;center(ctx,env,1,angle*progress);draw(ctx,outgoing,env);ctx.restore();ctx.save();ctx.globalAlpha=progress;center(ctx,env,1,-angle*(1-progress));draw(ctx,incoming,env);ctx.restore();};
const renderFlash:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),strength=Math.max(0,Math.min(1,n(t,'strength',.7)));crossfade(ctx,outgoing,incoming,progress,env);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=Math.sin(progress*Math.PI)*strength;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,env.width,env.height);ctx.restore();};
const renderTransitionGlitch:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),intensity=Math.max(0,Math.min(1,n(t,'intensity',.5)));crossfade(ctx,outgoing,incoming,progress,env);const source=progress<.5?outgoing:incoming,slices=Math.max(2,Math.round(3+intensity*8));for(let i=0;i<slices;i++){const y=seeded(t,env,i*31)*env.height,h=Math.max(2,seeded(t,env,i*47+3)*18),dx=(seeded(t,env,i*61+7)-.5)*intensity*70;ctx.drawImage(source,0,y,env.width,h,dx,y,env.width,h);}};
const renderTransitionRgbSplit:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),amount=n(t,'amount',12)*Math.sin(progress*Math.PI);crossfade(ctx,outgoing,incoming,progress,env);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.25;ctx.drawImage(progress<.5?outgoing:incoming,-amount,0,env.width,env.height);ctx.drawImage(progress<.5?outgoing:incoming,amount,0,env.width,env.height);ctx.restore();};
const renderTransitionPixelDissolve:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),cell=Math.max(2,Math.round(n(t,'cellSize',10)));draw(ctx,outgoing,env);ctx.save();ctx.beginPath();let index=0;for(let y=0;y<env.height;y+=cell)for(let x=0;x<env.width;x+=cell,index++)if(hashNoise(hashString(t.instanceId)^index)<progress)ctx.rect(x,y,cell,cell);ctx.clip();draw(ctx,incoming,env);ctx.restore();};
const renderFilmBurn:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),intensity=Math.max(0,Math.min(1,n(t,'intensity',.75)));crossfade(ctx,outgoing,incoming,progress,env);const x=(seeded(t,env,19)*.35+.325)*env.width,g=ctx.createRadialGradient(x,env.height*.5,0,x,env.height*.5,Math.max(env.width,env.height)*.7);g.addColorStop(0,`rgba(255,245,180,${intensity*Math.sin(progress*Math.PI)})`);g.addColorStop(.35,`rgba(255,90,20,${intensity*.65*Math.sin(progress*Math.PI)})`);g.addColorStop(1,'rgba(80,0,0,0)');ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=g;ctx.fillRect(0,0,env.width,env.height);ctx.restore();};
const renderLightLeak:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>{const progress=p(t),intensity=Math.max(0,Math.min(1,n(t,'intensity',.7)));crossfade(ctx,outgoing,incoming,progress,env);const x=seeded(t,env,101)*env.width,g=ctx.createRadialGradient(x,env.height*.4,0,x,env.height*.4,Math.max(env.width,env.height)*.85);g.addColorStop(0,`rgba(255,255,220,${intensity*.75*Math.sin(progress*Math.PI)})`);g.addColorStop(.35,`rgba(255,120,80,${intensity*.45*Math.sin(progress*Math.PI)})`);g.addColorStop(1,'rgba(255,80,120,0)');ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=g;ctx.fillRect(0,0,env.width,env.height);ctx.restore();};
const renderMaskReveal:TransitionRenderHandler=(ctx,outgoing,incoming,t,env)=>renderWipe(ctx,outgoing,incoming,{...t,params:{...t.params,direction:s(t,'direction','left')}},env);

export const TRANSITION_HANDLERS:Record<string,TransitionRenderHandler>={
  'transition.crossfade':renderCrossfade,
  'transition.dip-black':renderDipBlack,
  'transition.dip-white':renderDipWhite,
  'transition.blur-dissolve':renderBlurDissolve,
  'transition.push':renderPush,
  'transition.slide':renderSlide,
  'transition.wipe':renderWipe,
  'transition.zoom':renderZoom,
  'transition.spin':renderSpin,
  'transition.flash':renderFlash,
  'transition.glitch':renderTransitionGlitch,
  'transition.rgb-split':renderTransitionRgbSplit,
  'transition.pixel-dissolve':renderTransitionPixelDissolve,
  'transition.film-burn':renderFilmBurn,
  'transition.light-leak':renderLightLeak,
  'transition.mask-reveal':renderMaskReveal,
};

export function renderTransition(ctx:EffectCanvasContext,outgoing:CanvasImageSource,incoming:CanvasImageSource,transition:TransitionRenderPlan,env:TransitionRenderEnvironment){
  const handler=TRANSITION_HANDLERS[transition.runtime];
  if(!handler)throw new Error(`No trusted renderer for ${transition.runtime}.`);
  handler(ctx,outgoing,incoming,transition,env);
}
