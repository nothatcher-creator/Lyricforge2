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

export interface AlignedLyricLine{
  clipId:string;
  start:number;
  end:number;
  words:Word[];
  confidence:number;
  quality:AlignmentQuality;
  protected:boolean;
}

export interface LyricAlignmentResult{
  lines:AlignedLyricLine[];
  good:number;
  check:number;
  uncertain:number;
}

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

function qualityFor(confidence:number):AlignmentQuality{return confidence>=.78?'good':confidence>=.48?'check':'uncertain';}

function alignUnprotected(lines:readonly AlignmentInputLine[],recognized:readonly Word[],bounds:{start:number;end:number}):AlignedLyricLine[]{
  const tokens=tokenizeLyricLines(lines);
  if(!tokens.length)return lines.map(line=>({clipId:line.id,start:line.start,end:line.end,words:[],confidence:0,quality:'uncertain',protected:false}));
  const sorted=[...recognized].filter(word=>word.end>bounds.start&&word.start<bounds.end).sort((a,b)=>a.start-b.start||a.end-b.end);
  const anchors=findAnchors(tokens,sorted);
  const timed=interpolateWords(tokens,anchors,bounds);
  const indexByLine=new Map<string,number[]>();
  tokens.forEach((token,index)=>{const indices=indexByLine.get(token.lineId)??[];indices.push(index);indexByLine.set(token.lineId,indices);});
  return lines.map(line=>{
    const indices=indexByLine.get(line.id)??[];
    const words=indices.map(index=>timed[index]);
    let score=0;
    for(const index of indices){
      const anchor=anchors.get(index);
      score+=anchor?(anchor.similarity>=.98?1:.7):.35;
    }
    const confidence=indices.length?clamp(score/indices.length,0,1):0;
    const start=words[0]?.start??clamp(line.start,bounds.start,bounds.end);
    const end=words.at(-1)?.end??Math.max(start+1,clamp(line.end,start+1,bounds.end));
    return {clipId:line.id,start,end,words,confidence,quality:qualityFor(confidence),protected:false};
  });
}

function protectedResult(line:AlignmentInputLine):AlignedLyricLine{
  const raw=line.text.trim().split(/\s+/).filter(Boolean);
  const duration=Math.max(raw.length,line.end-line.start);
  const words=line.words?.length?line.words.map(word=>({...word})):raw.map((text,index)=>({text,start:Math.round(line.start+duration*index/Math.max(1,raw.length)),end:Math.round(line.start+duration*(index+1)/Math.max(1,raw.length))}));
  return {clipId:line.id,start:line.start,end:line.end,words,confidence:1,quality:'good',protected:true};
}

export function alignLyricsToTranscript(lines:readonly AlignmentInputLine[],recognized:readonly Word[],bounds:{start:number;end:number}):LyricAlignmentResult{
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
    for(const line of alignUnprotected(segment,recognized,segmentBounds))results.set(line.clipId,line);
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
