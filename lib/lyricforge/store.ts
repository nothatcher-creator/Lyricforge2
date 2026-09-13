'use client';
import {useSyncExternalStore} from 'react';
import {demoProject, type Project, type Clip, retime, uid, makeClip, makeTrack, lyricClips, splitClip, mergeClips} from './model';
import {History} from './history';
export class EditorStore {
 project:Project; selected:string[]=[]; listeners=new Set<()=>void>(); history=new History(); revision=0; private snapshot:{project:Project;selected:string[];revision:number}; clipboard:Clip[]=[]; private gesture:Project|null=null;
 constructor(){this.project=demoProject();this.snapshot={project:this.project,selected:[],revision:0};}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
 getSnapshot=()=>this.snapshot;
 emit(){this.snapshot={project:this.project,selected:this.selected,revision:this.revision};this.listeners.forEach(f=>f());}
 update(fn:(p:Project)=>Project,key=''){const next=fn(this.project);if(next===this.project)return;if(!this.gesture)this.history.push(this.project,key);this.project={...next,updatedAt:Date.now()};this.revision++;this.emit();}
 select(ids:string[]){this.selected=ids;this.emit();}
 setProject(p:Project){this.history.clear();this.gesture=null;this.selected=[];this.project=p;this.revision++;this.emit();}
 undo(){this.project=this.history.undo(this.project);this.revision++;this.selected=this.selected.filter(id=>this.project.clips.some(c=>c.id===id));this.emit();}
 redo(){this.project=this.history.redo(this.project);this.revision++;this.selected=this.selected.filter(id=>this.project.clips.some(c=>c.id===id));this.emit();}
 begin(){if(!this.gesture)this.gesture=this.project;}
 end(){if(this.gesture&&this.gesture!==this.project)this.history.push(this.gesture);this.gesture=null;this.emit();}
 editable(c:Clip){return !this.project.tracks.find(t=>t.id===c.trackId)?.locked;}
 patch(id:string,patch:Partial<Clip>,key=''){const c=this.project.clips.find(c=>c.id===id);if(!c||!this.editable(c))return;this.update(p=>({...p,duration:Math.max(p.duration,patch.end??0),clips:p.clips.map(c=>c.id===id?{...c,...patch}:c)}),key||id);}
 remove(){const ids=new Set(this.selected);this.update(p=>({...p,clips:p.clips.filter(c=>!ids.has(c.id)||!this.editable(c))}));this.select([]);}
 copy(){this.clipboard=structuredClone(this.project.clips.filter(c=>this.selected.includes(c.id)));}
 paste(t:number){if(!this.clipboard.length)return;const earliest=Math.min(...this.clipboard.map(c=>c.start));const cs=this.clipboard.filter(c=>this.project.tracks.some(tr=>tr.id===c.trackId&&!tr.locked)).map(c=>({...retime(c,c.start+t-earliest,c.end+t-earliest),id:uid(),keyframes:c.keyframes.map(k=>({...k,id:uid(),time:k.time+t-earliest}))}));this.update(p=>({...p,duration:Math.max(p.duration,...cs.map(c=>c.end)),clips:[...p.clips,...cs]}));this.select(cs.map(c=>c.id));}
 duplicate(){this.copy();if(this.clipboard.length)this.paste(Math.max(...this.clipboard.map(c=>c.end)));}
 split(t:number){const ids=new Set(this.selected);this.update(p=>({...p,clips:p.clips.flatMap(c=>ids.has(c.id)&&this.editable(c)&&t>c.start&&t<c.end?splitClip(c,t):[c])}));}
 merge(){const cs=this.project.clips.filter(c=>this.selected.includes(c.id)&&this.editable(c));if(cs.length<2||!cs.every(c=>c.trackId===cs[0].trackId&&(c.kind==='lyrics'||c.kind==='text')))return;const merged=mergeClips(cs)!;this.update(p=>({...p,clips:[...p.clips.filter(c=>!cs.some(s=>s.id===c.id)),merged]}));this.select([merged.id]);}
 offset(delta:number,all=false){if(!Number.isFinite(delta)||delta===0)return;const cs=(all?lyricClips(this.project):this.project.clips.filter(c=>this.selected.includes(c.id))).filter(c=>this.editable(c));if(!cs.length)return;const ids=new Set(cs.map(c=>c.id));const safe=Math.max(delta,-Math.min(...cs.map(c=>c.start)));if(!safe)return;this.update(p=>({...p,clips:p.clips.map(c=>ids.has(c.id)?retime(c,c.start+safe,c.end+safe):c),duration:Math.max(p.duration,...cs.map(c=>c.end+safe))}));}
 add(kind:Clip['kind'],time:number,text=''){let track=this.project.tracks.find(t=>t.kind===kind&&!t.locked);if(kind!=='lyrics'&&kind!=='audio')track=undefined;const tr=track||makeTrack(kind,kind==='text'?'Text layer':kind==='visualizer'?'Visualizer':kind);const c=makeClip(kind,tr.id,time,Math.min(Math.max(time+4000,this.project.duration),time+(kind==='text'||kind==='lyrics'?4000:this.project.duration)),text);if(kind==='text')c.style={size:48,y:.25,karaoke:'Off'};if(kind==='visualizer'){c.visualizer='Bars';c.style={y:.8,scale:.7};}this.update(p=>({...p,duration:Math.max(p.duration,c.end),tracks:track?p.tracks:[tr,...p.tracks],clips:[...p.clips,c]}));this.select([c.id]);return c;}
}
export const store=new EditorStore();
export function useEditor(){return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);}
