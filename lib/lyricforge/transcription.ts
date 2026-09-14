'use client';
import {makeClip,type Clip,type Word} from './model';
import {publicPath} from './public-path';
export interface TranscriptionUpdate {status:string;progress:number;words?:Word[];}
export interface TranscriptionProvider { id:string;label:string;local:boolean;transcribe(audio:Float32Array,onProgress:(u:TranscriptionUpdate)=>void,signal:AbortSignal):Promise<Word[]>; }
export const DEFAULT_LOCAL_TRANSCRIPTION_MODEL='Xenova/whisper-base.en';

export interface TranscriptionWindow{start:number;end:number}
export function buildTranscriptionWindows(totalSamples:number,sampleRate=16000,windowSeconds=30,overlapSeconds=5):TranscriptionWindow[]{
 const window=Math.max(1,Math.round(windowSeconds*sampleRate));
 const overlap=Math.max(0,Math.min(window-1,Math.round(overlapSeconds*sampleRate)));
 const step=Math.max(1,window-overlap);
 const out:TranscriptionWindow[]=[];
 for(let start=0;start<totalSamples;start+=step){const end=Math.min(totalSamples,start+window);out.push({start,end});if(end>=totalSamples)break;}
 return out;
}

export function normalizeTranscribedWords(input:Word[]):Word[]{
 const words=input.map(w=>({text:String(w.text||'').trim(),start:Math.max(0,Math.round(w.start)),end:Math.max(0,Math.round(w.end)),...(typeof w.confidence==='number'?{confidence:w.confidence}:{})})).filter(w=>w.text&&Number.isFinite(w.start)&&Number.isFinite(w.end)).map(w=>({...w,end:Math.max(w.start+10,w.end)})).sort((a,b)=>a.start-b.start||a.end-b.end);
 const out:Word[]=[];
 for(const word of words){
  const prev=out.at(-1);
  const sameText=!!prev&&prev.text.toLocaleLowerCase()===word.text.toLocaleLowerCase();
  const overlap=prev?Math.min(prev.end,word.end)-Math.max(prev.start,word.start):0;
  const minDuration=prev?Math.max(1,Math.min(prev.end-prev.start,word.end-word.start)):1;
  const same=!!prev&&sameText&&(Math.abs(prev.start-word.start)<=120||overlap/minDuration>=.5);
  if(same){
   const prevConfidence=prev.confidence??-1,nextConfidence=word.confidence??-1;
   if(nextConfidence>prevConfidence)out[out.length-1]=word;
   continue;
  }
  out.push(word);
 }
 return out;
}

export class LocalWhisper implements TranscriptionProvider {
 id='local-whisper';label='Whisper · on this device';local=true;
 constructor(public model=DEFAULT_LOCAL_TRANSCRIPTION_MODEL){}
 transcribe(audio:Float32Array,onProgress:(u:TranscriptionUpdate)=>void,signal:AbortSignal){return new Promise<Word[]>((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Transcription cancelled','AbortError'));return;}const worker=new Worker(publicPath('/workers/transcription.js'),{type:'module'});const abort=()=>{worker.terminate();reject(new DOMException('Transcription cancelled','AbortError'));};signal.addEventListener('abort',abort,{once:true});worker.onerror=e=>{worker.terminate();signal.removeEventListener('abort',abort);reject(new Error(e.message||'The local model could not start.'));};worker.onmessage=({data})=>{if(data.type==='done'||data.type==='error'){worker.terminate();signal.removeEventListener('abort',abort);data.type==='done'?resolve(normalizeTranscribedWords(data.words||[])):reject(new Error(data.error));}else onProgress(data);};worker.postMessage({audio,model:this.model},[audio.buffer]);});}
}
export class HttpTranscription implements TranscriptionProvider {
 id='http';label='Custom transcription endpoint';local=false;
 constructor(public endpoint:string,public audioFile:Blob,public filename:string){}
 async transcribe(_audio:Float32Array,onProgress:(u:TranscriptionUpdate)=>void,signal:AbortSignal){const url=new URL(this.endpoint);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Use an HTTPS transcription endpoint.');onProgress({status:'Uploading audio to '+url.host,progress:5});const form=new FormData();form.append('file',this.audioFile,this.filename);form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');const res=await fetch(url,{method:'POST',body:form,signal,credentials:'omit'});if(!res.ok)throw new Error(`Transcription endpoint returned ${res.status}.`);const data=await res.json() as {words?:unknown};if(!Array.isArray(data.words)||data.words.length>200000)throw new Error('The endpoint must return { words: [{ word, start, end, confidence? }] } with timestamps in seconds.');const words:Word[]=(data.words as {word?:string;text?:string;start:number;end:number;confidence?:number}[]).map((w:{word?:string;text?:string;start:number;end:number;confidence?:number})=>({text:String(w.word??w.text??''),start:Math.round(w.start*1000),end:Math.round(w.end*1000),...(typeof w.confidence==='number'?{confidence:w.confidence}:{})}));if(words.some(w=>!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start||w.end>86400000||w.text.length>500||w.confidence!==undefined&&(!Number.isFinite(w.confidence)||w.confidence<0||w.confidence>1)))throw new Error('Invalid timestamps returned by the provider.');return normalizeTranscribedWords(words);}
}
export function wordsToClips(words:Word[],trackId:string):Clip[]{const clean=normalizeTranscribedWords(words);const groups:Word[][]=[];let current:Word[]=[];for(const w of clean){const prev=current.at(-1);const span=current.length?w.end-current[0].start:0;if(current.length&&(w.start-prev!.end>650||current.length>=7||span>4800&&current.length>=4||/[.!?…]$/.test(prev!.text))){groups.push(current);current=[];}current.push(w);}if(current.length)groups.push(current);return groups.map(ws=>{const text=ws.map(w=>w.text.trim()).join(' ');const confidence=ws.every(w=>typeof w.confidence==='number')?ws.reduce((v,w)=>v+w.confidence!,0)/ws.length:undefined;return {...makeClip('lyrics',trackId,ws[0].start,Math.max(ws.at(-1)!.end,ws[0].start+100),text),words:ws,confidence,timingSource:'detected'};});}
