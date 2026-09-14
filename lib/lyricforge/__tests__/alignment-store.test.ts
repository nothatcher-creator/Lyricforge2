import {describe,expect,it} from 'vitest';
import {createProject,makeClip,type Word} from '../model';
import type {LyricAlignmentResult} from '../lyric-alignment';
import {EditorStore} from '../store';

function freshStore(){
  const store=new EditorStore();
  const project=createProject('alignment store');
  const track=project.tracks.find(t=>t.kind==='lyrics')!;
  const first=makeClip('lyrics',track.id,100,1100,"I'm still here,");first.id='first';
  const second=makeClip('lyrics',track.id,1200,2200,"don't rewrite me!");second.id='second';
  second.timingSource='manual';
  project.duration=4000;project.clips=[first,second];
  store.setProject(project);
  return store;
}

const words=(pairs:[string,number,number][]):Word[]=>pairs.map(([text,start,end])=>({text,start,end}));

function result():LyricAlignmentResult{
  return {
    lines:[
      {clipId:'first',start:400,end:1500,words:words([["I'm",400,700],['still',720,900],['here,',920,1500]]),confidence:.93,quality:'good',protected:false},
      {clipId:'second',start:1700,end:2700,words:words([["don't",1700,2100],['rewrite',2120,2400],['me!',2420,2700]]),confidence:.55,quality:'check',protected:true},
    ],
    good:1,check:1,uncertain:0,
  };
}

describe('EditorStore lyric alignment application',()=>{
  it('changes only alignment timing metadata and preserves lyric text byte-for-byte',()=>{
    const store=freshStore();
    const before=store.project.clips.map(c=>({id:c.id,text:c.text,name:c.name,start:c.start,end:c.end,words:structuredClone(c.words),timingSource:c.timingSource}));
    store.applyLyricAlignment(result());
    const first=store.project.clips.find(c=>c.id==='first')!;
    const second=store.project.clips.find(c=>c.id==='second')!;

    expect(store.project.clips.map(c=>c.text)).toEqual(before.map(c=>c.text));
    expect(first.name).toBe(before[0].name);
    expect(first.start).toBe(400);
    expect(first.end).toBe(1500);
    expect(first.words.map(w=>w.text)).toEqual(["I'm",'still','here,']);
    expect(first.timingSource).toBe('aligned');
    expect(first.alignmentConfidence).toBe(.93);
    expect(first.alignmentQuality).toBe('good');

    expect(second.start).toBe(before[1].start);
    expect(second.end).toBe(before[1].end);
    expect(second.words).toEqual(before[1].words);
    expect(second.timingSource).toBe('manual');
  });

  it('applies every unprotected line as one undoable transaction',()=>{
    const store=freshStore();
    const alignment=result();
    alignment.lines[1]={...alignment.lines[1],protected:false};
    const before=structuredClone(store.project.clips.map(c=>({id:c.id,text:c.text,start:c.start,end:c.end,words:c.words,timingSource:c.timingSource})));

    store.applyLyricAlignment(alignment);
    expect(store.project.clips.find(c=>c.id==='first')?.start).toBe(400);
    expect(store.project.clips.find(c=>c.id==='second')?.start).toBe(1700);

    store.undo();
    expect(store.project.clips.map(c=>({id:c.id,text:c.text,start:c.start,end:c.end,words:c.words,timingSource:c.timingSource}))).toEqual(before);
  });
});
