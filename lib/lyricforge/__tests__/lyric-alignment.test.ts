import {describe,expect,it} from 'vitest';
import {createProject,makeClip,type Word} from '../model';

const recognized=(items:[string,number,number][]):Word[]=>items.map(([text,start,end])=>({text,start,end}));

async function alignment(){return import('../lyric-alignment');}

describe('forced lyric alignment',()=>{
  it('normalizes punctuation and contractions without changing raw user words',async()=>{
    const {tokenizeLyricLines,normalizedTokenSimilarity}=await alignment();
    const tokens=tokenizeLyricLines([{id:'a',text:"I'm here, don't go!",start:0,end:2000,protected:false}]);
    expect(tokens.map(t=>t.raw)).toEqual(["I'm",'here,',"don't",'go!']);
    expect(normalizedTokenSimilarity(tokens[0],'im')).toBeGreaterThan(.9);
    expect(normalizedTokenSimilarity(tokens[2],'dont')).toBeGreaterThan(.9);
    expect(tokens[0].variants).toContain('i am');
  });

  it('aligns exact repeated lyric words monotonically',async()=>{
    const {alignLyricsToTranscript}=await alignment();
    const result=alignLyricsToTranscript(
      [{id:'l1',text:'we go we go',start:0,end:1800,protected:false}],
      recognized([
        ['we',100,250],['go',300,450],['we',800,950],['go',1000,1150],
      ]),
      {start:0,end:1800},
    );
    expect(result.lines[0].words.map(w=>w.text)).toEqual(['we','go','we','go']);
    expect(result.lines[0].words.map(w=>w.start)).toEqual([100,300,800,1000]);
    expect(result.lines[0].quality).toBe('good');
  });

  it('tolerates extra recognized words and interpolates a missed user word',async()=>{
    const {alignLyricsToTranscript}=await alignment();
    const result=alignLyricsToTranscript(
      [{id:'l1',text:'hello brave new world',start:0,end:2200,protected:false}],
      recognized([
        ['yeah',50,120],['hello',200,400],['new',900,1100],['world',1250,1500],
      ]),
      {start:0,end:2200},
    );
    const line=result.lines[0];
    expect(line.words.map(w=>w.text)).toEqual(['hello','brave','new','world']);
    expect(line.words[1].start).toBeGreaterThanOrEqual(line.words[0].end);
    expect(line.words[1].end).toBeLessThanOrEqual(line.words[2].start);
    expect(line.quality).not.toBe('uncertain');
  });

  it('marks a completely unmatched lyric line uncertain while preserving its text',async()=>{
    const {alignLyricsToTranscript}=await alignment();
    const original='Xylophones orbit quietly';
    const result=alignLyricsToTranscript(
      [{id:'l1',text:original,start:100,end:1500,protected:false}],
      recognized([['baby',200,400],['love',600,800]]),
      {start:0,end:1800},
    );
    expect(result.lines[0].words.map(w=>w.text).join(' ')).toBe(original);
    expect(result.lines[0].quality).toBe('uncertain');
    expect(result.uncertain).toBe(1);
  });

  it('uses protected manual lines as fixed timing anchors',async()=>{
    const {alignLyricsToTranscript}=await alignment();
    const protectedWords=recognized([['middle',2000,2300],['anchor',2350,2700]]);
    const lines=[
      {id:'a',text:'first line',start:0,end:1500,protected:false},
      {id:'b',text:'middle anchor',start:2000,end:2800,protected:true,words:protectedWords},
      {id:'c',text:'last line',start:3200,end:4500,protected:false},
    ];
    const result=alignLyricsToTranscript(lines,recognized([
      ['first',200,450],['line',500,750],['middle',2000,2300],['anchor',2350,2700],['last',3400,3650],['line',3700,4000],
    ]),{start:0,end:5000});
    const middle=result.lines.find(line=>line.clipId==='b')!;
    expect(middle.start).toBe(2000);
    expect(middle.end).toBe(2800);
    expect(middle.words).toEqual(protectedWords);
    expect(middle.protected).toBe(true);
    expect(result.lines.find(line=>line.clipId==='a')!.end).toBeLessThanOrEqual(2000);
    expect(result.lines.find(line=>line.clipId==='c')!.start).toBeGreaterThanOrEqual(2800);
  });

  it('bounds selected lyric alignment between neighboring unselected lines',async()=>{
    const {alignmentBoundsForSelection}=await alignment();
    const project=createProject('bounds');
    const track=project.tracks.find(t=>t.kind==='lyrics')!;
    const a=makeClip('lyrics',track.id,0,1000,'before');
    const b=makeClip('lyrics',track.id,1500,2500,'selected one');
    const c=makeClip('lyrics',track.id,2600,3400,'selected two');
    const d=makeClip('lyrics',track.id,4000,5000,'after');
    project.duration=6000;project.clips=[a,b,c,d];
    expect(alignmentBoundsForSelection(project,[b.id,c.id])).toEqual({start:1000,end:4000});
  });
});
