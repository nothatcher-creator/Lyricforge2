'use client';
import {useSyncExternalStore} from 'react';
import {demoProject, type Project, type Clip, retime, uid, makeClip, makeTrack, lyricClips, splitClip, mergeClips} from './model';
import type {AnimationInstance,AnimationRole,EffectInstance,TransitionInstance} from './creative-assets';
import {creativeRegistry,type CreativeTarget} from './creative-registry';
import {isValidTransitionPair} from './transition-runtime';
import {History} from './history';

export class EditorStore {
 project:Project;
 selected:string[]=[];
 selectedTransitionId:string|null=null;
 listeners=new Set<()=>void>();
 history=new History();
 revision=0;
 private snapshot:{project:Project;selected:string[];selectedTransitionId:string|null;revision:number};
 clipboard:Clip[]=[];
 private gesture:Project|null=null;

 constructor(){
  this.project=demoProject();
  this.snapshot={project:this.project,selected:[],selectedTransitionId:null,revision:0};
 }
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
 getSnapshot=()=>this.snapshot;
 emit(){this.snapshot={project:this.project,selected:this.selected,selectedTransitionId:this.selectedTransitionId,revision:this.revision};this.listeners.forEach(f=>f());}
 update(fn:(p:Project)=>Project,key=''){const next=fn(this.project);if(next===this.project)return;if(!this.gesture)this.history.push(this.project,key);this.project={...next,updatedAt:Date.now()};this.revision++;this.emit();}
 select(ids:string[]){this.selected=ids;this.selectedTransitionId=null;this.emit();}
 selectTransition(id:string|null){this.selected=[];this.selectedTransitionId=id;this.emit();}
 setProject(p:Project){this.history.clear();this.gesture=null;this.selected=[];this.selectedTransitionId=null;this.project=p;this.revision++;this.emit();}
 private reconcileSelection(){
  this.selected=this.selected.filter(id=>this.project.clips.some(c=>c.id===id));
  if(this.selectedTransitionId&&!this.project.transitions.some(t=>t.id===this.selectedTransitionId))this.selectedTransitionId=null;
 }
 undo(){this.project=this.history.undo(this.project);this.revision++;this.reconcileSelection();this.emit();}
 redo(){this.project=this.history.redo(this.project);this.revision++;this.reconcileSelection();this.emit();}
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

 setAnimation(clipId:string,role:AnimationRole,instance:AnimationInstance|null){
  const clip=this.project.clips.find(c=>c.id===clipId);
  if(!clip||!this.editable(clip)||(clip.kind!=='lyrics'&&clip.kind!=='text'))return;
  this.update(p=>({...p,clips:p.clips.map(c=>{
   if(c.id!==clipId)return c;
   const animations={...(c.animations??{})};
   if(instance)animations[role]={...structuredClone(instance),role};else delete animations[role];
   return {...c,animations:Object.keys(animations).length?animations:undefined};
  })}));
 }

 private createEffect(assetId:string,version:string,target:CreativeTarget):EffectInstance|undefined{
  const definition=creativeRegistry.resolve('effect',assetId,version);
  if(!definition||!definition.targets.includes(target))return;
  return {id:uid(),assetId,version,enabled:true,params:creativeRegistry.normalizeParams(definition,{}),keyframes:{}};
 }

 addClipEffect(clipId:string,assetId:string,version:string):EffectInstance|undefined{
  const clip=this.project.clips.find(c=>c.id===clipId);
  if(!clip||!this.editable(clip)||!(['lyrics','text','image','video','visualizer'] as string[]).includes(clip.kind))return;
  const effect=this.createEffect(assetId,version,clip.kind as CreativeTarget);
  if(!effect)return;
  this.update(p=>({...p,clips:p.clips.map(c=>c.id===clipId?{...c,effects:[...c.effects,effect]}:c)}));
  return effect;
 }

 patchClipEffect(clipId:string,instanceId:string,patch:Partial<EffectInstance>){
  const clip=this.project.clips.find(c=>c.id===clipId);
  if(!clip||!this.editable(clip)||!clip.effects.some(effect=>effect.id===instanceId))return;
  const {id:_ignored,...safePatch}=patch;
  this.update(p=>({...p,clips:p.clips.map(c=>c.id===clipId?{...c,effects:c.effects.map(effect=>effect.id===instanceId?{...effect,...safePatch,id:effect.id}:effect)}:c)}));
 }

 moveClipEffect(clipId:string,instanceId:string,delta:-1|1){
  const clip=this.project.clips.find(c=>c.id===clipId);
  if(!clip||!this.editable(clip))return;
  const index=clip.effects.findIndex(effect=>effect.id===instanceId);const next=index+delta;
  if(index<0||next<0||next>=clip.effects.length)return;
  this.update(p=>({...p,clips:p.clips.map(c=>{
   if(c.id!==clipId)return c;
   const effects=[...c.effects];[effects[index],effects[next]]=[effects[next],effects[index]];
   return {...c,effects};
  })}));
 }

 duplicateClipEffect(clipId:string,instanceId:string):EffectInstance|undefined{
  const clip=this.project.clips.find(c=>c.id===clipId);
  if(!clip||!this.editable(clip))return;
  const index=clip.effects.findIndex(effect=>effect.id===instanceId);if(index<0)return;
  const duplicate={...structuredClone(clip.effects[index]),id:uid()};
  this.update(p=>({...p,clips:p.clips.map(c=>c.id===clipId?{...c,effects:[...c.effects.slice(0,index+1),duplicate,...c.effects.slice(index+1)]}:c)}));
  return duplicate;
 }

 removeClipEffect(clipId:string,instanceId:string){
  const clip=this.project.clips.find(c=>c.id===clipId);
  if(!clip||!this.editable(clip)||!clip.effects.some(effect=>effect.id===instanceId))return;
  this.update(p=>({...p,clips:p.clips.map(c=>c.id===clipId?{...c,effects:c.effects.filter(effect=>effect.id!==instanceId)}:c)}));
 }

 addMasterEffect(assetId:string,version:string):EffectInstance|undefined{
  const effect=this.createEffect(assetId,version,'master');if(!effect)return;
  this.update(p=>({...p,masterEffects:[...p.masterEffects,effect]}));
  return effect;
 }

 patchMasterEffect(instanceId:string,patch:Partial<EffectInstance>){
  if(!this.project.masterEffects.some(effect=>effect.id===instanceId))return;
  const {id:_ignored,...safePatch}=patch;
  this.update(p=>({...p,masterEffects:p.masterEffects.map(effect=>effect.id===instanceId?{...effect,...safePatch,id:effect.id}:effect)}));
 }

 moveMasterEffect(instanceId:string,delta:-1|1){
  const index=this.project.masterEffects.findIndex(effect=>effect.id===instanceId);const next=index+delta;
  if(index<0||next<0||next>=this.project.masterEffects.length)return;
  this.update(p=>{const masterEffects=[...p.masterEffects];[masterEffects[index],masterEffects[next]]=[masterEffects[next],masterEffects[index]];return {...p,masterEffects};});
 }

 duplicateMasterEffect(instanceId:string):EffectInstance|undefined{
  const index=this.project.masterEffects.findIndex(effect=>effect.id===instanceId);if(index<0)return;
  const duplicate={...structuredClone(this.project.masterEffects[index]),id:uid()};
  this.update(p=>({...p,masterEffects:[...p.masterEffects.slice(0,index+1),duplicate,...p.masterEffects.slice(index+1)]}));
  return duplicate;
 }

 removeMasterEffect(instanceId:string){
  if(!this.project.masterEffects.some(effect=>effect.id===instanceId))return;
  this.update(p=>({...p,masterEffects:p.masterEffects.filter(effect=>effect.id!==instanceId)}));
 }

 addTransition(outgoingId:string,incomingId:string,assetId='builtin.transition.crossfade'):TransitionInstance|undefined{
  if(this.project.transitions.some(t=>t.outgoingItemId===outgoingId&&t.incomingItemId===incomingId))return;
  const definition=creativeRegistry.all('transition').find(item=>item.id===assetId);if(!definition)return;
  const instance:TransitionInstance={id:uid(),assetId,version:definition.version,outgoingItemId:outgoingId,incomingItemId:incomingId,durationMs:1000,easing:'linear',params:creativeRegistry.normalizeParams(definition,{})};
  const pair=isValidTransitionPair(this.project,instance);
  if(!pair.valid||!pair.outgoing||!pair.incoming)return;
  if(!definition.targets.includes(pair.outgoing.kind as CreativeTarget)||!definition.targets.includes(pair.incoming.kind as CreativeTarget))return;
  this.update(p=>({...p,transitions:[...p.transitions,instance]}));
  return instance;
 }

 patchTransition(id:string,patch:Partial<TransitionInstance>){
  if(!this.project.transitions.some(t=>t.id===id))return;
  const {id:_ignored,...safePatch}=patch;
  this.update(p=>({...p,transitions:p.transitions.map(t=>t.id===id?{...t,...safePatch,id:t.id}:t)}));
 }

 removeTransition(id:string){
  if(!this.project.transitions.some(t=>t.id===id))return;
  this.update(p=>({...p,transitions:p.transitions.filter(t=>t.id!==id)}));
  if(this.selectedTransitionId===id){this.selectedTransitionId=null;this.emit();}
 }
}
export const store=new EditorStore();
export function useEditor(){return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);}
