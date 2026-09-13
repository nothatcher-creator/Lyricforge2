import {makeClip,uid,parseTime,evenlyTimeWords,type Clip,type Project} from './model';
const clean=(t:string)=>t.replace(/<[^>]+>/g,'').replace(/\{[^}]+\}/g,'').replace(/\\[Nn]/g,'\n').replace(/\\h/g,' ').trim();
export function parseLyrics(text:string,extension:string,trackId:string,duration=180000):Clip[]{
 text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');const ext=extension.toLowerCase().replace('.','');let events:{start:number;end:number;text:string}[]=[];
 if(ext==='lrc'){
  const offset=Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0);
  for(const line of text.split('\n')){const stamps=[...line.matchAll(/\[(\d+:\d+(?:\.\d+)?)\]/g)];const lyric=line.replace(/\[[^\]]*\]/g,'');for(const stamp of stamps)events.push({start:Math.max(0,parseTime(stamp[1])+offset),end:0,text:clean(lyric)});}
  events.sort((a,b)=>a.start-b.start);events.forEach((e,i)=>{e.end=Math.max(e.start+10,events[i+1]?.start??Math.max(duration,e.start+3000));});
 }else if(ext==='srt'||ext==='vtt'){
  const lines=text.split('\n');for(let i=0;i<lines.length;i++){const match=lines[i].match(/((?:\d+:)?\d+:\d+[.,]\d+)\s*-->\s*((?:\d+:)?\d+:\d+[.,]\d+)/);if(match){let body='';while(i+1<lines.length&&lines[i+1].trim())body+=(body?'\n':'')+lines[++i];events.push({start:parseTime(match[1]),end:parseTime(match[2]),text:clean(body)});}}
 }else if(ext==='ass'||ext==='ssa'){
  let columns=['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];let section='';
  for(const line of text.split('\n')){if(line.startsWith('['))section=line.toLowerCase();if(section!=='[events]')continue;if(/^Format:/i.test(line))columns=line.slice(7).split(',').map(s=>s.trim().toLowerCase());if(/^Dialogue:/i.test(line)){const parts=line.slice(9).split(',');const ti=columns.indexOf('text');events.push({start:parseTime(parts[columns.indexOf('start')].trim()),end:parseTime(parts[columns.indexOf('end')].trim()),text:clean(parts.slice(ti).join(','))});}}
 }else{
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);const spacing=duration/Math.max(1,lines.length);events=lines.map((line,i)=>({text:line,start:Math.round(i*spacing),end:Math.round((i+1)*spacing)}));
 }
 return events.filter(e=>e.text&&Number.isFinite(e.start)&&e.end>e.start).map(e=>({...makeClip('lyrics',trackId,e.start,e.end,e.text),words:evenlyTimeWords(e.text,e.start,e.end),timingSource:ext==='txt'?'estimated':'manual'} as Clip));
}
function stamp(t:number,sep=','){t=Math.max(0,Math.round(t));return `${String(Math.floor(t/3600000)).padStart(2,'0')}:${String(Math.floor(t/60000)%60).padStart(2,'0')}:${String(Math.floor(t/1000)%60).padStart(2,'0')}${sep}${String(t%1000).padStart(3,'0')}`;}
export function exportLyrics(clips:Clip[],type:string){const cs=clips.filter(c=>c.kind==='lyrics').sort((a,b)=>a.start-b.start);if(type==='txt')return cs.map(c=>c.text).join('\n');if(type==='lrc')return cs.map(c=>`[${String(Math.floor(c.start/60000)).padStart(2,'0')}:${(c.start%60000/1000).toFixed(3).padStart(6,'0')}]${c.text.replace(/\n/g,' ')}`).join('\n');return (type==='vtt'?'WEBVTT\n\n':'')+cs.map((c,i)=>`${type==='srt'?i+1+'\n':''}${stamp(c.start,type==='vtt'?'.':',')} --> ${stamp(c.end,type==='vtt'?'.':',')}\n${c.text}`).join('\n\n');}
export function detectStructure(project:Project):Project {
 const cs=project.clips.filter(c=>c.kind==='lyrics').sort((a,b)=>a.start-b.start);const norm=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');const counts=new Map<string,number>();for(const c of cs){const n=norm(c.text);if(n.length>6)counts.set(n,(counts.get(n)||0)+1);}const sections:Project['sections']=[];let end=0;
 const clips=project.clips.map(c=>c.kind==='lyrics'?{...c,section:(counts.get(norm(c.text))||0)>1?'Chorus' as const:'Verse' as const}:c);
 for(const c of clips.filter(c=>c.kind==='lyrics').sort((a,b)=>a.start-b.start)){if(c.start-end>2500)sections.push({start:end,end:c.start,name:end===0?'Intro':'Instrumental',estimated:true});const last=sections.at(-1);if(last&&last.name===c.section&&c.start-last.end<1800)last.end=c.end;else sections.push({start:c.start,end:c.end,name:c.section,estimated:true});end=Math.max(end,c.end);}if(project.duration-end>2500)sections.push({start:end,end:project.duration,name:'Outro',estimated:true});return {...project,clips,sections};
}
