'use client';

import type {TransitionInstance} from '@/lib/lyricforge/creative-assets';
import {creativeRegistry} from '@/lib/lyricforge/creative-registry';
import {store,useEditor} from '@/lib/lyricforge/store';
import {TRANSITION_KINDS,isValidTransitionPair,transitionWindow} from '@/lib/lyricforge/transition-runtime';
import type {Clip} from '@/lib/lyricforge/model';

function label(clip:Clip){
  return clip.text?.trim()||clip.name||clip.id;
}

function beginDurationDrag(event:React.PointerEvent<HTMLSpanElement>,transitionId:string,baseDuration:number,scale:number){
  if(event.button!==0)return;
  event.preventDefault();
  event.stopPropagation();
  const originX=event.clientX;
  store.begin();
  const move=(moveEvent:PointerEvent)=>{
    const deltaPx=moveEvent.clientX-originX;
    const deltaMs=2*deltaPx/Math.max(scale,.0001)*1000;
    const durationMs=Math.max(50,Math.round(baseDuration+deltaMs));
    store.patchTransition(transitionId,{durationMs});
  };
  const finish=()=>{
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',finish);
    window.removeEventListener('pointercancel',finish);
    store.end();
  };
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',finish);
  window.addEventListener('pointercancel',finish);
}

function candidate(outgoing:Clip,incoming:Clip):TransitionInstance{
  return {
    id:`candidate:${outgoing.id}:${incoming.id}`,
    assetId:'builtin.transition.crossfade',
    version:'1.0.0',
    outgoingItemId:outgoing.id,
    incomingItemId:incoming.id,
    durationMs:1000,
    easing:'linear',
    params:{},
  };
}

export default function TimelineTransitions({trackId,scale}:{trackId:string;scale:number}){
  const {project,selectedTransitionId}=useEditor();
  const clips=project.clips
    .map((clip,index)=>({clip,index}))
    .filter(({clip})=>clip.trackId===trackId&&(TRANSITION_KINDS as readonly string[]).includes(clip.kind))
    .sort((a,b)=>a.clip.start-b.clip.start||a.clip.end-b.clip.end||a.index-b.index)
    .map(({clip})=>clip);

  const controls=[] as React.ReactNode[];
  for(let index=0;index<clips.length-1;index++){
    const outgoing=clips[index];
    const incoming=clips[index+1];
    const probe=candidate(outgoing,incoming);
    const pair=isValidTransitionPair(project,probe);
    if(!pair.valid||pair.cutMs===undefined)continue;
    const existing=project.transitions.find(item=>item.outgoingItemId===outgoing.id&&item.incomingItemId===incoming.id);
    const center=pair.cutMs/1000*scale;

    if(!existing){
      controls.push(<button
        key={`add:${outgoing.id}:${incoming.id}`}
        type="button"
        className="timeline-transition-add"
        style={{left:center}}
        aria-label={`Add transition between ${label(outgoing)} and ${label(incoming)}`}
        onPointerDown={event=>event.stopPropagation()}
        onClick={event=>{
          event.stopPropagation();
          const created=store.addTransition(outgoing.id,incoming.id);
          if(created)store.selectTransition(created.id);
        }}
      >+</button>);
      continue;
    }

    const definition=creativeRegistry.resolve('transition',existing.assetId,existing.version);
    const name=definition?.name??existing.assetId;
    const window=transitionWindow(project,existing);
    const width=Math.max(12,(window?.effectiveDurationMs??0)/1000*scale);
    controls.push(<button
      key={existing.id}
      type="button"
      className={`timeline-transition ${selectedTransitionId===existing.id?'selected':''}`}
      style={{left:center,width}}
      aria-label={`${name} transition between ${label(outgoing)} and ${label(incoming)}`}
      onPointerDown={event=>event.stopPropagation()}
      onClick={event=>{event.stopPropagation();store.selectTransition(existing.id);}}
    >
      <span className="timeline-transition-name">{name}</span>
      <span data-transition-handle aria-hidden="true" onPointerDown={event=>beginDurationDrag(event,existing.id,existing.durationMs,scale)}/>
    </button>);
  }

  return <div className="timeline-transition-layer" aria-hidden={controls.length===0||undefined}>{controls}</div>;
}
