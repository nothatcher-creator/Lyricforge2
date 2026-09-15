import {clamp} from './model';

export const ALIGNMENT_AUDIO_CONFIG={
 frameMs:20,
 smoothingFrames:3,
 noiseFloorPercentile:.2,
 minBoundarySpacingMs:60,
 edgeSnapRadiusMs:180,
} as const;

export interface AudioAlignmentFeatures{
 frameMs:number;
 rms:Float32Array;
 activity:Float32Array;
 onset:Float32Array;
 boundaries:number[];
}

function percentile(values:Float32Array,ratio:number){
 if(!values.length)return 0;
 const sorted=Array.from(values).sort((a,b)=>a-b);
 const index=Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*ratio)));
 return sorted[index];
}

function smooth(values:Float32Array,frames:number){
 if(frames<=1||values.length<2)return new Float32Array(values);
 const radius=Math.floor(frames/2);
 const out=new Float32Array(values.length);
 for(let i=0;i<values.length;i++){
  let total=0,count=0;
  for(let j=Math.max(0,i-radius);j<=Math.min(values.length-1,i+radius);j++){total+=values[j];count++;}
  out[i]=count?total/count:0;
 }
 return out;
}

function normalize(values:Float32Array,floor=0){
 let max=floor;
 for(const value of values)if(value>max)max=value;
 const span=Math.max(1e-9,max-floor);
 const out=new Float32Array(values.length);
 for(let i=0;i<values.length;i++)out[i]=clamp((values[i]-floor)/span,0,1);
 return out;
}

export function analyzeAlignmentAudio(samples:Float32Array,sampleRate=16000):AudioAlignmentFeatures{
 if(!Number.isFinite(sampleRate)||sampleRate<=0)throw new Error('Audio alignment sample rate must be positive');
 const frameMs=ALIGNMENT_AUDIO_CONFIG.frameMs;
 const samplesPerFrame=Math.max(1,Math.round(sampleRate*frameMs/1000));
 const frameCount=Math.ceil(samples.length/samplesPerFrame);
 const rawRms=new Float32Array(frameCount);
 const rawDiff=new Float32Array(frameCount);
 for(let frame=0;frame<frameCount;frame++){
  const start=frame*samplesPerFrame,end=Math.min(samples.length,start+samplesPerFrame);
  let squares=0,diff=0,count=0,previous=start>0?samples[start-1]:samples[start]??0;
  for(let i=start;i<end;i++){
   const value=samples[i];
   squares+=value*value;
   diff+=Math.abs(value-previous);
   previous=value;count++;
  }
  rawRms[frame]=count?Math.sqrt(squares/count):0;
  rawDiff[frame]=count?diff/count:0;
 }
 const rms=smooth(rawRms,ALIGNMENT_AUDIO_CONFIG.smoothingFrames);
 const noiseFloor=percentile(rms,ALIGNMENT_AUDIO_CONFIG.noiseFloorPercentile);
 const activity=normalize(rms,noiseFloor);
 const diffNorm=normalize(smooth(rawDiff,ALIGNMENT_AUDIO_CONFIG.smoothingFrames),percentile(rawDiff,ALIGNMENT_AUDIO_CONFIG.noiseFloorPercentile));
 const onset=new Float32Array(frameCount);
 for(let i=0;i<frameCount;i++){
  const rise=i===0?activity[i]:Math.max(0,activity[i]-activity[i-1]);
  onset[i]=clamp(rise*.78+diffNorm[i]*.22,0,1);
 }

 const candidates:{time:number;strength:number}[]=[];
 for(let i=0;i<frameCount;i++){
  const strength=onset[i]*.72+activity[i]*.28;
  if(activity[i]<.08||strength<.16)continue;
  const left=i>0?onset[i-1]*.72+activity[i-1]*.28:-1;
  const right=i+1<frameCount?onset[i+1]*.72+activity[i+1]*.28:-1;
  if(strength>=left&&strength>=right)candidates.push({time:i*frameMs,strength});
 }

 const chosen:{time:number;strength:number}[]=[];
 for(const candidate of candidates.sort((a,b)=>b.strength-a.strength||a.time-b.time)){
  if(chosen.every(existing=>Math.abs(existing.time-candidate.time)>=ALIGNMENT_AUDIO_CONFIG.minBoundarySpacingMs))chosen.push(candidate);
 }
 chosen.sort((a,b)=>a.time-b.time);
 return {frameMs,rms,activity,onset,boundaries:chosen.map(item=>item.time)};
}

export function findSupportedBoundary(features:AudioAlignmentFeatures,targetMs:number,radiusMs:number){
 const radius=Math.max(0,radiusMs);
 let best:{time:number;strength:number}|null=null;
 for(const time of features.boundaries){
  const distance=Math.abs(time-targetMs);
  if(distance>radius)continue;
  const index=Math.min(features.onset.length-1,Math.max(0,Math.round(time/features.frameMs)));
  const strength=(features.onset[index]??0)*.72+(features.activity[index]??0)*.28;
  if(!best||strength>best.strength||strength===best.strength&&distance<Math.abs(best.time-targetMs))best={time,strength};
 }
 return best;
}
