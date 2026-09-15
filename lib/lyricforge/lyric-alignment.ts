import {ALIGNMENT_AUDIO_CONFIG,alignmentFeatureStrength,findSupportedBoundary,type AudioAlignmentFeatures} from './audio-alignment';
import {clamp,type AlignmentQuality,type Project,type Word} from './model';

export interface AlignmentInputLine{
  id:string;
  text:string;
  start:number;
  end:number;
  protected:boolean;
  words?:Word[];
}

export interface LyricToken{
  lineId:string;
  wordIndex:number;
  raw:string;
  normalized:string;
  variants:string[];
  emphasized?:boolean;
}

export type AlignmentReason='text-anchored'|'audio-assisted'|'weak-recognition'|'protected-anchor';

export interface AlignedLyricLine{
  clipId:string;
  start:number;
  end:number;
  words:Word[];
  confidence:number;
  quality:AlignmentQuality;
  protected:boolean;
  reason?:AlignmentReason;
}

export interface LyricAlignmentResult{
  lines:AlignedLyricLine[];
  good:number;
  check:number;
  uncertain:number;
}

export interface LyricAlignmentOptions{
  audioFeatures?:AudioAlignmentFeatures;
  audioAware?:boolean;
}

export const ALIGNMENT_CONFIDENCE_WEIGHTS={text:.65,audio:.25,continuity:.10} as const;

const CONTRACTIONS:Record<string,string[]>= {
  im:['i am'],ive:['i have'],ill:['i will'],id:['i would','i had'],
  youre:['you are'],youve:['you have'],youll:['you will'],youd:['you would','you had'],
  hes:['he is','he has'],shes:['she is','she has'],its:['it is','it has'],
  were:['we are'],weve:['we have'],well:['we will'],wed:['we would','we had'],
  theyre:['they are'],theyve:['they have'],theyll:['they will'],theyd:['they would','they had'],
  dont:['do not'],doesnt:['does not'],didnt:['did not'],cant:['can not','cannot'],couldnt:['could not'],
  wont:['will not'],wouldnt:['would not'],isnt:['is not'],arent:['are not'],wasnt:['was not'],werent:['were not'],
  havent:['have not'],hasnt:['has not'],hadnt:['had not'],shouldnt:['should not'],mustnt:['must not'],
};

function normalize(value:string){
  return value.normalize('NFKD').replace(/[’‘`]/g,"'").toLocaleLowerCase().replace(/[^\p{L}\p{N}'\s]+/gu,'').replace(/'/g,'').replace(/\s+/g,' ').trim();
}

function variantsFor(normalized:string){
  const values=new Set<string>();
  if(normalized)values.add(normalized);
  for(const phrase of CONTRACTIONS[normalized]??[]){
    values.add(phrase);
    for(const part of phrase.split(' '))values.add(part);
  }
  return [...values];
}

export function tokenizeLyricLines(lines:readonly AlignmentInputLine[]):LyricToken[]{
  const out:LyricToken[]=[];
  for(const line of lines){
    const rawWords=line.text.trim().split(/\s+/).filter(Boolean);
    rawWords.forEach((raw,wordIndex)=>{
      const normalized=normalize(raw);
      out.push({lineId:line.id,wordIndex,raw,normalized,variants:variantsFor(normalized),...(line.words?.[wordIndex]?.emphasized?{emphasized:true}:{})});
    });
  }
  return out;
}

function editDistance(a:string,b:string){
  if(a===b)return 0;
  if(!a.length)return b.length;
  if(!b.length)return a.length;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const current=new Array<number>(b.length+1);current[0]=i;
    for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
    previous=current;
  }
  return previous[b.length];
}

export function normalizedTokenSimilarity(token:LyricToken,recognizedText:string):number{
  const candidate=normalize(recognizedText);
  if(!token.normalized||!candidate)return 0;
  if(token.variants.includes(candidate))return 1;
  let best=0;
  for(const variant of token.variants){
    if(variant.includes(' '))continue;
    const distance=editDistance(variant,candidate);
    best=Math.max(best,1-distance/Math.max(variant.length,candidate.length,1));
  }
  return clamp(best,0,1);
}

function matchScore(similarity:number){return similarity>=.98?6:similarity>=.82?4:similarity>=.68?2:-4;}

interface Anchor{word:Word;similarity:number}

function findAnchors(tokens:readonly LyricToken[],recognized:readonly Word[]):Map<number,Anchor>{
  const n=tokens.length,m=recognized.length;
  const anchors=new Map<number,Anchor>();
  if(!n||!m)return anchors;
  const width=m+1;
  const trace=new Uint8Array((n+1)*width);
  let previous=new Float64Array(width),current=new Float64Array(width);
  for(let j=1;j<=m;j++){previous[j]=previous[j-1]-2;trace[j]=2;}
  for(let i=1;i<=n;i++){
    current[0]=previous[0]-3;trace[i*width]=1;
    for(let j=1;j<=m;j++){
      const similarity=normalizedTokenSimilarity(tokens[i-1],recognized[j-1].text);
      const diagonal=previous[j-1]+matchScore(similarity);
      const up=previous[j]-3;
      const left=current[j-1]-2;
      let score=diagonal,direction=0;
      if(left>score){score=left;direction=2;}
      if(up>score){score=up;direction=1;}
      current[j]=score;trace[i*width+j]=direction;
    }
    const swap=previous;previous=current;current=swap;
  }
  let i=n,j=m;
  while(i>0||j>0){
    const direction=trace[i*width+j];
    if(i>0&&j>0&&direction===0){
      const similarity=normalizedTokenSimilarity(tokens[i-1],recognized[j-1].text);
      if(similarity>=.68)anchors.set(i-1,{word:recognized[j-1],similarity});
      i--;j--;
    }else if(i>0&&(j===0||direction===1))i--;
    else if(j>0)j--;
    else break;
  }
  return anchors;
}

function interpolateWords(tokens:readonly LyricToken[],anchors:Map<number,Anchor>,bounds:{start:number;end:number}){
  const words=new Array<Word>(tokens.length);
  const anchored=[...anchors.keys()].sort((a,b)=>a-b);
  for(const index of anchored){
    const anchor=anchors.get(index)!;
    words[index]={text:tokens[index].raw,start:Math.round(anchor.word.start),end:Math.max(Math.round(anchor.word.start)+1,Math.round(anchor.word.end)),...(tokens[index].emphasized?{emphasized:true}:{})};
  }
  const boundaries=[-1,...anchored,tokens.length];
  for(let b=0;b<boundaries.length-1;b++){
    const leftIndex=boundaries[b],rightIndex=boundaries[b+1];
    const first=leftIndex+1,last=rightIndex-1,count=last-first+1;
    if(count<=0)continue;
    const leftTime=leftIndex>=0?words[leftIndex].end:bounds.start;
    const rightTime=rightIndex<tokens.length?words[rightIndex].start:bounds.end;
    const available=Math.max(count,Math.round(rightTime-leftTime));
    for(let k=0;k<count;k++){
      const start=Math.round(leftTime+available*k/count);
      const end=Math.max(start+1,Math.round(leftTime+available*(k+1)/count));
      words[first+k]={text:tokens[first+k].raw,start,end,...(tokens[first+k].emphasized?{emphasized:true}:{})};
    }
  }
  return words;
}

function refineWithAudio(
  tokens:readonly LyricToken[],
  anchors:Map<number,Anchor>,
  baseWords:readonly Word[],
  bounds:{start:number;end:number},
  features:AudioAlignmentFeatures,
  lines:readonly AlignmentInputLine[],
){
  const words=baseWords.map(word=>({...word}));
  const supported=new Set<number>();
  const lineById=new Map(lines.map(line=>[line.id,line]));
  let cursor=0;
  while(cursor<tokens.length){
    if(anchors.has(cursor)){cursor++;continue;}
    const first=cursor;
    while(cursor<tokens.length&&!anchors.has(cursor))cursor++;
    const last=cursor-1,count=last-first+1;
    const leftIndex=first-1,rightIndex=cursor;
    const leftTime=leftIndex>=0?words[leftIndex].end:bounds.start;
    const rightTime=rightIndex<tokens.length?words[rightIndex].start:bounds.end;
    if(rightTime<=leftTime)continue;

    const candidates=features.boundaries
      .filter(time=>time>=leftTime&&time<rightTime)
      .map(time=>({time,strength:alignmentFeatureStrength(features,time)}))
      .filter(candidate=>candidate.strength>.05)
      .sort((a,b)=>b.strength-a.strength||a.time-b.time)
      .slice(0,count)
      .sort((a,b)=>a.time-b.time);

    const assigned=new Map<number,number>();
    for(let j=0;j<candidates.length;j++){
      let relative=Math.round((j+1)*(count+1)/(candidates.length+1)-1);
      relative=Math.max(0,Math.min(count-1,relative));
      while(assigned.has(relative)&&relative<count-1)relative++;
      while(assigned.has(relative)&&relative>0)relative--;
      const tokenIndex=first+relative;
      let time=candidates[j].time;
      const token=tokens[tokenIndex];
      const sourceLine=lineById.get(token.lineId);
      if(token.wordIndex===0&&sourceLine){
        const edge=findSupportedBoundary(features,sourceLine.start,ALIGNMENT_AUDIO_CONFIG.edgeSnapRadiusMs);
        if(!edge)continue;
        time=edge.time;
      }
      assigned.set(relative,clamp(Math.round(time),Math.round(leftTime),Math.max(Math.round(leftTime),Math.round(rightTime)-1)));
      supported.add(tokenIndex);
    }

    const points=[{position:-1,time:leftTime},...([...assigned.entries()].map(([relative,time])=>({position:relative,time})).sort((a,b)=>a.position-b.position)),{position:count,time:rightTime}];
    const starts=new Array<number>(count);
    for(let p=0;p<points.length-1;p++){
      const a=points[p],b=points[p+1];
      const span=b.position-a.position;
      for(let position=a.position+1;position<b.position;position++){
        const ratio=(position-a.position)/span;
        starts[position]=Math.round(a.time+(b.time-a.time)*ratio);
      }
      if(b.position<count)starts[b.position]=Math.round(b.time);
    }
    for(let relative=0;relative<count;relative++){
      const index=first+relative;
      const start=Math.max(Math.round(leftTime),relative?starts[relative-1]+1:starts[relative]??Math.round(leftTime),starts[relative]??Math.round(leftTime));
      const nextStart=relative+1<count?(starts[relative+1]??rightTime):rightTime;
      const end=Math.max(start+1,Math.min(Math.round(rightTime),Math.round(nextStart)));
      words[index]={...words[index],start,end};
    }
  }

  for(const [index,anchor] of anchors){
    words[index]={text:tokens[index].raw,start:Math.round(anchor.word.start),end:Math.max(Math.round(anchor.word.start)+1,Math.round(anchor.word.end)),...(tokens[index].emphasized?{emphasized:true}:{})};
  }

  for(let i=0;i<words.length;i++){
    if(i>0&&!anchors.has(i))words[i].start=Math.max(words[i].start,words[i-1].end);
    if(i+1<words.length&&!anchors.has(i))words[i].end=Math.max(words[i].start+1,Math.min(words[i].end,words[i+1].start));
    words[i].start=clamp(words[i].start,bounds.start,Math.max(bounds.start,bounds.end-1));
    words[i].end=clamp(Math.max(words[i].start+1,words[i].end),words[i].start+1,bounds.end);
  }
  return {words,supported};
}

function qualityFor(confidence:number):AlignmentQuality{return confidence>=.78?'good':confidence>=.48?'check':'uncertain';}

function alignUnprotected(lines:readonly AlignmentInputLine[],recognized:readonly Word[],bounds:{start:number;end:number},options:LyricAlignmentOptions):AlignedLyricLine[]{
  const tokens=tokenizeLyricLines(lines);
  if(!tokens.length)return lines.map(line=>({clipId:line.id,start:line.start,end:line.end,words:[],confidence:0,quality:'uncertain',protected:false,reason:'weak-recognition'}));
  const sorted=[...recognized].filter(word=>word.end>bounds.start&&word.start<bounds.end).sort((a,b)=>a.start-b.start||a.end-b.end);
  const anchors=findAnchors(tokens,sorted);
  const base=interpolateWords(tokens,anchors,bounds);
  const useAudio=options.audioAware!==false&&!!options.audioFeatures;
  const refined=useAudio?refineWithAudio(tokens,anchors,base,bounds,options.audioFeatures!,lines):{words:base,supported:new Set<number>()};
  const timed=refined.words;
  const indexByLine=new Map<string,number[]>();
  tokens.forEach((token,index)=>{const indices=indexByLine.get(token.lineId)??[];indices.push(index);indexByLine.set(token.lineId,indices);});
  return lines.map(line=>{
    const indices=indexByLine.get(line.id)??[];
    const words=indices.map(index=>timed[index]);
    let confidence=0;
    if(useAudio){
      const textEvidence=indices.length?indices.reduce((score,index)=>score+(anchors.get(index)?.similarity??0),0)/indices.length:0;
      const unanchored=indices.filter(index=>!anchors.has(index));
      const audioEvidence=unanchored.length?unanchored.filter(index=>refined.supported.has(index)).length/unanchored.length:1;
      const continuity=words.every((word,index)=>word.start>=bounds.start&&word.end<=bounds.end&&(index===0||word.start>=words[index-1].end))?1:0;
      confidence=clamp(textEvidence*ALIGNMENT_CONFIDENCE_WEIGHTS.text+audioEvidence*ALIGNMENT_CONFIDENCE_WEIGHTS.audio+continuity*ALIGNMENT_CONFIDENCE_WEIGHTS.continuity,0,1);
    }else{
      let score=0;
      for(const index of indices){
        const anchor=anchors.get(index);
        score+=anchor?(anchor.similarity>=.98?1:.7):.35;
      }
      confidence=indices.length?clamp(score/indices.length,0,1):0;
    }
    const start=words[0]?.start??clamp(line.start,bounds.start,bounds.end);
    const end=words.at(-1)?.end??Math.max(start+1,clamp(line.end,start+1,bounds.end));
    const hasAudioSupport=indices.some(index=>refined.supported.has(index));
    const allAnchored=indices.length>0&&indices.every(index=>anchors.has(index));
    const reason:AlignmentReason=hasAudioSupport?'audio-assisted':allAnchored?'text-anchored':'weak-recognition';
    return {clipId:line.id,start,end,words,confidence,quality:qualityFor(confidence),protected:false,reason};
  });
}

function protectedResult(line:AlignmentInputLine):AlignedLyricLine{
  const raw=line.text.trim().split(/\s+/).filter(Boolean);
  const duration=Math.max(raw.length,line.end-line.start);
  const words=line.words?.length?line.words.map(word=>({...word})):raw.map((text,index)=>({text,start:Math.round(line.start+duration*index/Math.max(1,raw.length)),end:Math.round(line.start+duration*(index+1)/Math.max(1,raw.length))}));
  return {clipId:line.id,start:line.start,end:line.end,words,confidence:1,quality:'good',protected:true,reason:'protected-anchor'};
}

export function alignLyricsToTranscript(lines:readonly AlignmentInputLine[],recognized:readonly Word[],bounds:{start:number;end:number},options:LyricAlignmentOptions={}):LyricAlignmentResult{
  const safeBounds={start:Math.max(0,Math.round(bounds.start)),end:Math.max(Math.round(bounds.start)+1,Math.round(bounds.end))};
  const results=new Map<string,AlignedLyricLine>();
  let cursor=0;
  while(cursor<lines.length){
    if(lines[cursor].protected){results.set(lines[cursor].id,protectedResult(lines[cursor]));cursor++;continue;}
    const startIndex=cursor;
    while(cursor<lines.length&&!lines[cursor].protected)cursor++;
    const segment=lines.slice(startIndex,cursor);
    const previousProtected=startIndex>0&&lines[startIndex-1].protected?lines[startIndex-1]:undefined;
    const nextProtected=cursor<lines.length&&lines[cursor].protected?lines[cursor]:undefined;
    const segmentBounds={start:previousProtected?.end??safeBounds.start,end:nextProtected?.start??safeBounds.end};
    for(const line of alignUnprotected(segment,recognized,segmentBounds,options))results.set(line.clipId,line);
  }
  const ordered=lines.map(line=>results.get(line.id)??protectedResult(line));
  return {
    lines:ordered,
    good:ordered.filter(line=>line.quality==='good').length,
    check:ordered.filter(line=>line.quality==='check').length,
    uncertain:ordered.filter(line=>line.quality==='uncertain').length,
  };
}

export function alignmentBoundsForSelection(project:Project,clipIds:readonly string[]):{start:number;end:number}{
  const selected=new Set(clipIds);
  const lyrics=project.clips.filter(clip=>clip.kind==='lyrics').sort((a,b)=>a.start-b.start||a.end-b.end);
  const targets=lyrics.filter(clip=>selected.has(clip.id));
  if(!targets.length)return {start:0,end:project.duration};
  const firstIndex=lyrics.findIndex(clip=>clip.id===targets[0].id);
  const lastId=targets.at(-1)!.id,lastIndex=lyrics.findIndex(clip=>clip.id===lastId);
  let start=0,end=project.duration;
  for(let i=firstIndex-1;i>=0;i--)if(!selected.has(lyrics[i].id)){start=lyrics[i].end;break;}
  for(let i=lastIndex+1;i<lyrics.length;i++)if(!selected.has(lyrics[i].id)){end=lyrics[i].start;break;}
  return {start:Math.max(0,start),end:Math.max(start+1,end)};
}
