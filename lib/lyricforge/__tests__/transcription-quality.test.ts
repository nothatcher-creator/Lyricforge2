import {describe,expect,it} from 'vitest';
import type {Word} from '../model';

describe('local transcription quality',()=>{
  it('uses the more accurate English base model by default',async()=>{
    const mod=await import('../transcription');
    expect(new mod.LocalWhisper().model).toBe('Xenova/whisper-base.en');
  });

  it('builds 30 second windows with five seconds of overlap',async()=>{
    const mod=await import('../transcription');
    const fn=(mod as any).buildTranscriptionWindows;
    expect(typeof fn).toBe('function');
    if(typeof fn!=='function')return;
    expect(fn(65*16000,16000)).toEqual([
      {start:0,end:30*16000},
      {start:25*16000,end:55*16000},
      {start:50*16000,end:65*16000},
    ]);
  });

  it('deduplicates repeated words created by overlapping recognition windows',async()=>{
    const mod=await import('../transcription');
    const fn=(mod as any).normalizeTranscribedWords;
    expect(typeof fn).toBe('function');
    if(typeof fn!=='function')return;
    const words:Word[]=[
      {text:' hello ',start:1000,end:1320},
      {text:'hello',start:1040,end:1340},
      {text:'world',start:1380,end:1700},
    ];
    expect(fn(words)).toEqual([
      {text:'hello',start:1000,end:1320},
      {text:'world',start:1380,end:1700},
    ]);
  });

  it('keeps legitimate repeated lyric words when their timestamps are sequential',async()=>{
    const {normalizeTranscribedWords}=await import('../transcription');
    expect(normalizeTranscribedWords([
      {text:'no',start:1000,end:1240},
      {text:'no',start:1300,end:1540},
      {text:'no',start:1600,end:1840},
    ])).toEqual([
      {text:'no',start:1000,end:1240},
      {text:'no',start:1300,end:1540},
      {text:'no',start:1600,end:1840},
    ]);
  });

  it('breaks long detections into shorter readable lyric lines',async()=>{
    const {wordsToClips}=await import('../transcription');
    const words:Word[]=Array.from({length:8},(_,i)=>({text:`word${i+1}`,start:i*800,end:i*800+500}));
    const clips=wordsToClips(words,'lyrics-track');
    expect(clips.length).toBeGreaterThan(1);
    expect(clips.every(c=>(c.words?.length||0)<=7)).toBe(true);
  });
});
