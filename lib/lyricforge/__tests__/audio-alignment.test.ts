import {describe,expect,it} from 'vitest';
import {ALIGNMENT_AUDIO_CONFIG,analyzeAlignmentAudio,findSupportedBoundary} from '../audio-alignment';

function addTone(samples:Float32Array,sampleRate:number,startMs:number,endMs:number,amplitude:number,frequency=230){
 const start=Math.floor(startMs/1000*sampleRate);
 const end=Math.min(samples.length,Math.ceil(endMs/1000*sampleRate));
 for(let i=start;i<end;i++)samples[i]+=Math.sin((i/sampleRate)*Math.PI*2*frequency)*amplitude;
}

describe('audio alignment feature extraction',()=>{
 it('uses the locked deterministic analysis constants',()=>{
  expect(ALIGNMENT_AUDIO_CONFIG).toMatchObject({frameMs:20,smoothingFrames:3,noiseFloorPercentile:.2,minBoundarySpacingMs:60,edgeSnapRadiusMs:180});
 });

 it('finds audible boundaries while leaving a quiet gap empty',()=>{
  const sampleRate=16000;
  const samples=new Float32Array(sampleRate*2);
  addTone(samples,sampleRate,450,560,.85,260);
  addTone(samples,sampleRate,1200,1320,.68,340);
  const features=analyzeAlignmentAudio(samples,sampleRate);
  expect(features.frameMs).toBe(20);
  expect(features.boundaries.some(ms=>Math.abs(ms-450)<=120)).toBe(true);
  expect(features.boundaries.some(ms=>ms>700&&ms<1050)).toBe(false);
 });

 it('keeps candidate boundaries at least 60 ms apart',()=>{
  const sampleRate=16000;
  const samples=new Float32Array(sampleRate);
  addTone(samples,sampleRate,200,235,.9,300);
  addTone(samples,sampleRate,245,280,.9,350);
  addTone(samples,sampleRate,370,410,.9,420);
  const features=analyzeAlignmentAudio(samples,sampleRate);
  for(let i=1;i<features.boundaries.length;i++)expect(features.boundaries[i]-features.boundaries[i-1]).toBeGreaterThanOrEqual(ALIGNMENT_AUDIO_CONFIG.minBoundarySpacingMs);
 });

 it('returns the strongest supported boundary inside the requested radius',()=>{
  const sampleRate=16000;
  const samples=new Float32Array(sampleRate);
  addTone(samples,sampleRate,390,450,.45,250);
  addTone(samples,sampleRate,510,590,.95,500);
  const features=analyzeAlignmentAudio(samples,sampleRate);
  const match=findSupportedBoundary(features,500,180);
  expect(match).not.toBeNull();
  expect(Math.abs(match!.time-500)).toBeLessThanOrEqual(180);
  expect(match!.strength).toBeGreaterThan(0);
 });

 it('is deterministic for identical samples',()=>{
  const sampleRate=16000;
  const samples=new Float32Array(sampleRate);
  addTone(samples,sampleRate,180,300,.7,220);
  addTone(samples,sampleRate,620,760,.55,330);
  const a=analyzeAlignmentAudio(samples,sampleRate);
  const b=analyzeAlignmentAudio(samples,sampleRate);
  expect([...a.rms]).toEqual([...b.rms]);
  expect([...a.activity]).toEqual([...b.activity]);
  expect([...a.onset]).toEqual([...b.onset]);
  expect(a.boundaries).toEqual(b.boundaries);
 });
});
