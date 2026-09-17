import {describe,expect,it} from 'vitest';
import type {AudioAlignmentFeatures} from '../audio-alignment';
import {alignLyricsToTranscript} from '../lyric-alignment';
import type {Word} from '../model';

const recognized=(items:[string,number,number][]):Word[]=>items.map(([text,start,end])=>({text,start,end}));

function audioFeatures(boundaries:number[],durationMs=6000):AudioAlignmentFeatures{
  const frameMs=20;
  const length=Math.ceil(durationMs/frameMs)+1;
  const rms=new Float32Array(length),activity=new Float32Array(length),onset=new Float32Array(length);
  for(const time of boundaries){
    const index=Math.round(time/frameMs);
    if(index>=0&&index<length){rms[index]=1;activity[index]=1;onset[index]=1;}
  }
  return {frameMs,rms,activity,onset,boundaries:[...boundaries]};
}

describe('audio-aware sung lyric confidence',()=>{
  it('does not mark a manually bounded sung phrase uncertain just because Whisper misses most words',()=>{
    const lines=[
      {id:'before',text:'fixed before',start:300,end:1000,protected:true,words:recognized([['fixed',300,550],['before',570,900]])},
      {id:'target',text:'take me back into the light tonight',start:1100,end:3200,protected:false},
      {id:'after',text:'fixed after',start:3600,end:4300,protected:true,words:recognized([['fixed',3600,3850],['after',3870,4200]])},
    ];
    const result=alignLyricsToTranscript(
      lines,
      [],
      {start:0,end:5000},
      {audioAware:true,audioFeatures:audioFeatures([1450,2300],5000)},
    );
    const target=result.lines.find(line=>line.clipId==='target')!;
    expect(target.reason).toBe('audio-assisted');
    expect(target.quality).toBe('check');
    expect(target.confidence).toBeGreaterThanOrEqual(.48);
    expect(target.words.map(word=>word.text).join(' ')).toBe('take me back into the light tonight');
    expect(target.start).toBeGreaterThanOrEqual(1000);
    expect(target.end).toBeLessThanOrEqual(3600);
  });
});