export const BRAND = { name: 'LyricForge', fileExtension: 'lyricforge', version: 1 };
export type Kind = 'audio'|'lyrics'|'text'|'image'|'video'|'visualizer'|'effect';
export type Section = 'Verse'|'Chorus'|'Bridge'|'Intro'|'Outro'|'Instrumental';
export type Animation = 'None'|'Fade'|'Pop'|'Bounce'|'Slide'|'Zoom'|'Blur In'|'Blur Out'|'Typewriter'|'Word Reveal'|'Character Reveal'|'Stretch'|'Shake'|'Pulse'|'Flicker'|'Glitch'|'Neon Flicker'|'Spin'|'Wave'|'Float'|'Rise'|'Fall';
export const ANIMATIONS: Animation[] = ['None','Fade','Pop','Bounce','Slide','Zoom','Blur In','Blur Out','Typewriter','Word Reveal','Character Reveal','Stretch','Shake','Pulse','Flicker','Glitch','Neon Flicker','Spin','Wave','Float','Rise','Fall'];
export interface Word { text:string; start:number; end:number; confidence?:number; emphasized?:boolean; }
export interface Keyframe { id:string; time:number; property:string; value:number|string; easing:'linear'|'ease-in'|'ease-out'|'ease-in-out'; }
export interface Style {
  font:string; size:number; weight:number; italic:boolean; underline:boolean; uppercase:boolean;
  color:string; accent:string; gradient:boolean; gradientColor:string; letterSpacing:number; wordSpacing:number; lineHeight:number;
  align:'left'|'center'|'right'; x:number; y:number; scale:number; rotation:number; opacity:number;
  stroke:number; strokeColor:string; shadow:number; glow:number; blur:number; boxColor:string; boxOpacity:number; radius:number; padding:number;
  entrance:Animation; idle:Animation; exit:Animation; emphasis:Animation; animationDuration:number; intensity:number; delay:number; direction:number; easing:Keyframe['easing'];
  karaoke:'Off'|'Color'|'Fill'|'Scale'|'Bounce'; neighbors:boolean; previousColor:string; upcomingColor:string;
  chorusColor:string; verseColor:string; sectionColors:boolean;
}
export interface Clip {
  id:string; trackId:string; kind:Kind; start:number; end:number; name:string; text:string;
  assetId?:string; offset:number; loop:boolean; section:Section; words:Word[]; confidence?:number; timingSource?:'manual'|'estimated'|'detected';
  style:Partial<Style>; keyframes:Keyframe[]; group?:string;
  fit:'cover'|'contain'; brightness:number; contrast:number; saturation:number; hue:number; blend:GlobalCompositeOperation;
  visualizer?:'Bars'|'Spectrum'|'Waveform'|'Circle'|'Particles'|'Glow'|'Beat flash'; sensitivity:number; smoothing:number;
}
export interface Track { id:string; name:string; kind:Kind; visible:boolean; locked:boolean; mute:boolean; solo:boolean; opacity:number; }
export interface Asset { id:string; name:string; type:'audio'|'image'|'video'|'font'; mime:string; size:number; duration?:number; fontFamily?:string; }
export interface Project {
  version:1; id:string; name:string; createdAt:number; updatedAt:number; width:number; height:number; fps:number; duration:number;
  tracks:Track[]; clips:Clip[]; assets:Asset[]; lyricStyle:Style;
  background:{ type:'gradient'|'solid'|'pattern'; color:string; color2:string; angle:number; vignette:number; motion:number; };
  markers:{id:string;time:number;name:string}[]; beats:number[]; bpm:number; waveform:number[]; energy:number[]; spectrum:number[][]; preset:string;
  sections:{start:number;end:number;name:string;estimated:boolean}[];
}
export const uid=()=>{if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
export const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const ms=(v:number)=>Math.round(v);
export const defaultStyle:Style={font:'Arial',size:84,weight:800,italic:false,underline:false,uppercase:false,color:'#fff6ea',accent:'#f2b66d',gradient:false,gradientColor:'#ff835a',letterSpacing:-1,wordSpacing:4,lineHeight:1.25,align:'center',x:0.5,y:0.52,scale:1,rotation:0,opacity:1,stroke:0,strokeColor:'#171717',shadow:16,glow:0,blur:0,boxColor:'#101113',boxOpacity:0,radius:16,padding:22,entrance:'Fade',idle:'None',exit:'Fade',emphasis:'None',animationDuration:350,intensity:0.5,delay:0,direction:1,easing:'ease-out',karaoke:'Color',neighbors:false,previousColor:'#9996a4',upcomingColor:'#6b6b77',chorusColor:'#ffc880',verseColor:'#fff6ea',sectionColors:false};
export function makeTrack(kind:Kind,name:string):Track {return {id:uid(),name,kind,visible:true,locked:false,mute:false,solo:false,opacity:1};}
export function makeClip(kind:Kind,trackId:string,start:number,end:number,text=''):Clip {return {id:uid(),trackId,kind,start:ms(start),end:ms(Math.max(start+10,end)),name:text||kind,text,offset:0,loop:true,section:'Verse',words:kind==='lyrics'||kind==='text'?evenlyTimeWords(text,ms(start),ms(Math.max(start+10,end))):[],timingSource:kind==='lyrics'?'estimated':undefined,style:{},keyframes:[],fit:'cover',brightness:1,contrast:1,saturation:1,hue:0,blend:'source-over',sensitivity:1,smoothing:0.7};}
export function createProject(name='Untitled session'):Project {
 return {version:1,id:uid(),name,createdAt:Date.now(),updatedAt:Date.now(),width:1920,height:1080,fps:30,duration:30000,tracks:[makeTrack('lyrics','Lyrics'),makeTrack('audio','Song')],clips:[],assets:[],lyricStyle:{...defaultStyle},background:{type:'gradient',color:'#241d30',color2:'#bd6e4e',angle:135,vignette:0.6,motion:0.3},markers:[],beats:[],bpm:0,waveform:[],energy:[],spectrum:[],preset:'Indie',sections:[]};
}
export function evenlyTimeWords(text:string,start:number,end:number):Word[] {const ws=text.trim().split(/\s+/).filter(Boolean);return ws.map((w,i)=>({text:w,start:ms(start+(end-start)*i/ws.length),end:ms(start+(end-start)*(i+1)/ws.length)}));}
export function setText(clip:Clip,text:string):Clip {const same=text.trim().split(/\s+/).length===clip.words.length;return {...clip,text,name:text,words:same?clip.words.map((w,i)=>({...w,text:text.trim().split(/\s+/)[i]})):evenlyTimeWords(text,clip.start,clip.end),timingSource:same?clip.timingSource:'estimated'};}
export function retime(c:Clip,start:number,end:number):Clip {
 start=ms(clamp(start,0,86400000));end=ms(Math.max(start+10,end));
 const ratio=(end-start)/(c.end-c.start);
 return {...c,start,end,words:c.words.map(w=>({...w,start:ms(start+(w.start-c.start)*ratio),end:ms(start+(w.end-c.start)*ratio)})),keyframes:c.keyframes.map(k=>({...k,time:ms(start+(k.time-c.start)*ratio)}))};
}
export function splitClip(c:Clip,t:number):Clip[] {
 t=clamp(ms(t),c.start+10,c.end-10);if(c.end-c.start<20)return [c];
 if(c.kind!=='lyrics'&&c.kind!=='text')return [{...c,end:t},{...c,id:uid(),start:t,offset:c.offset+t-c.start}];
 const words=c.words.length?c.words:evenlyTimeWords(c.text,c.start,c.end);const pivot=clamp(words.filter(w=>w.start<t).length,1,Math.max(1,words.length-1));
 const a=words.slice(0,pivot),b=words.slice(pivot);
 return [{...c,end:t,text:a.map(w=>w.text).join(' '),name:a.map(w=>w.text).join(' '),words:a.map(w=>({...w,start:clamp(w.start,c.start,t),end:clamp(w.end,c.start,t)})),keyframes:c.keyframes.filter(k=>k.time<t)},{...c,id:uid(),start:t,text:b.map(w=>w.text).join(' '),name:b.map(w=>w.text).join(' '),words:b.map(w=>({...w,start:clamp(w.start,t,c.end),end:clamp(w.end,t,c.end)})),keyframes:c.keyframes.filter(k=>k.time>=t)}];
}
export function mergeClips(clips:Clip[]):Clip|null {if(!clips.length)return null;const sorted=[...clips].sort((a,b)=>a.start-b.start);const c=sorted[0];return {...c,end:Math.max(...sorted.map(x=>x.end)),text:sorted.map(x=>x.text).join(' '),name:sorted.map(x=>x.text).join(' '),words:sorted.flatMap(x=>x.words),keyframes:sorted.flatMap(x=>x.keyframes)};}
export function formatTime(t:number,precise=false) {t=Math.max(0,Math.round(t));return `${String(Math.floor(t/60000)).padStart(2,'0')}:${String(Math.floor(t/1000)%60).padStart(2,'0')}${precise?'.'+String(t%1000).padStart(3,'0'):''}`;}
export function parseTime(value:string):number {const p=value.replace(',','.').split(':').map(Number);if(p.some(x=>!Number.isFinite(x)))return 0;return ms(p.reduce((a,v)=>a*60+v,0)*1000);}
export function lyricClips(p:Project){return p.clips.filter(c=>c.kind==='lyrics').sort((a,b)=>a.start-b.start);}
export function effectiveStyle(p:Project,c:Clip):Style {return {...p.lyricStyle,...c.style};}
export function demoProject():Project {const p=createProject('Golden hour');p.duration=24000;p.preset='Indie';const lines=['Let the light come pouring in','We are golden in the evening','Every moment, every little thing','Feels like we could start again','Let the light come pouring in','Keep this feeling underneath our skin'];p.clips=lines.map((s,i)=>({...makeClip('lyrics',p.tracks[0].id,i*4000,(i+1)*4000,s),words:evenlyTimeWords(s,i*4000,(i+1)*4000),timingSource:'estimated' as const,section:i===0||i===4?'Chorus' as const:'Verse' as const}));const t=makeTrack('text','Song title');p.tracks.unshift(t);const title=makeClip('text',t.id,0,p.duration,'GOLDEN HOUR');title.style={size:26,weight:500,letterSpacing:12,y:0.19,color:'#f8dac5',entrance:'Fade',exit:'None',karaoke:'Off'};p.clips.push(title);const v=makeTrack('visualizer','Audio glow');p.tracks.push(v);const vc=makeClip('visualizer',v.id,0,p.duration);vc.visualizer='Waveform';vc.style={y:.8,scale:.7,opacity:.55};p.clips.push(vc);return p;}
