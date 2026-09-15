import type {CreativeQuality} from './creative-registry';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function posterizeSampleTime(timeMs:number,fps:number):number{
  if(!Number.isFinite(timeMs)||timeMs<=0)return 0;
  if(!Number.isFinite(fps)||fps<=0)return 0;
  const safeFps=clamp(fps,1,60);
  const frameDuration=1000/safeFps;
  return Math.max(0,Math.floor((timeMs+1e-9)/frameDuration)*frameDuration);
}

export function echoSamples(timeMs:number,delayMs:number,trails:number,decay:number,quality:CreativeQuality):{timeMs:number;alpha:number}[]{
  if(!Number.isFinite(timeMs)||timeMs<=0)return [];
  const safeDelay=clamp(Number.isFinite(delayMs)?delayMs:120,10,2000);
  const requested=clamp(Math.round(Number.isFinite(trails)?trails:4),1,12);
  const limit=quality==='preview-low'?Math.min(requested,3):quality==='preview-high'?Math.min(requested,6):requested;
  const safeDecay=clamp(Number.isFinite(decay)?decay:.6,0,1);
  const samples:{timeMs:number;alpha:number}[]=[];
  for(let index=0;index<limit;index++){
    const sampleTime=timeMs-safeDelay*(index+1);
    if(sampleTime<0)break;
    samples.push({timeMs:sampleTime,alpha:safeDecay**(index+1)});
  }
  return samples;
}
