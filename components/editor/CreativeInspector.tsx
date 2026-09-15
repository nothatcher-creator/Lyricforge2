'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import type {AnimationInstance,AnimationRole,AssetParamValue,CreativeKeyframe,EffectInstance,TransitionInstance} from '@/lib/lyricforge/creative-assets';
import {animationRoleTime} from '@/lib/lyricforge/animation-runtime';
import {audioEngine} from '@/lib/lyricforge/audio';
import {creativeRegistry,type CreativeDefinition,type CreativeTarget,type EffectCategory,type ParamDefinition} from '@/lib/lyricforge/creative-registry';
import {clamp,type Clip,type Project,uid} from '@/lib/lyricforge/model';
import {store,useEditor} from '@/lib/lyricforge/store';
import {isValidTransitionPair,transitionWindow} from '@/lib/lyricforge/transition-runtime';
import {Choice,ColorField,NumberField,Range,Section,Toggle} from './Controls';

export type CreativeInspectorMode='all'|'animations'|'effects'|'transition';
type EffectScope='clip'|'master';
type EffectFilter='all'|EffectCategory;
const EFFECT_CATEGORIES:readonly {value:EffectFilter;label:string}[]=[
  {value:'all',label:'All'},
  {value:'adjust',label:'Adjust'},
  {value:'transform',label:'Transform'},
  {value:'blur-sharpen',label:'Blur & Sharpen'},
  {value:'distort',label:'Distort'},
  {value:'stylize',label:'Stylize'},
  {value:'light',label:'Light'},
  {value:'time',label:'Time'},
  {value:'audio-reactive',label:'Audio-reactive'},
];

function title(value:string){return value[0].toUpperCase()+value.slice(1);}
function paramName(key:string){return key.replace(/Ms$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();}

function animationOptions(role:AnimationRole,target:CreativeTarget){
  return [
    {label:'None',value:'none'},
    ...creativeRegistry.preferred('text-animation')
      .filter(def=>def.roles?.includes(role)&&def.targets.includes(target))
      .map(def=>({label:def.name,value:def.id})),
  ];
}

function animationInstance(definition:CreativeDefinition,role:AnimationRole):AnimationInstance{
  return {
    assetId:definition.id,
    version:definition.version,
    role,
    enabled:true,
    params:creativeRegistry.normalizeParams(definition,{}),
    keyframes:{},
  };
}

function upsertFrame(frames:readonly CreativeKeyframe[],timeMs:number,value:AssetParamValue){
  const time=Math.max(0,Math.round(timeMs));
  const existing=frames.find(frame=>frame.timeMs===time);
  return [...frames.filter(frame=>frame.timeMs!==time),{id:existing?.id??uid(),timeMs:time,value,easing:existing?.easing??'ease-in-out' as const}].sort((a,b)=>a.timeMs-b.timeMs);
}

function ParamControl({label,definition,value,onChange,onKeyframe}:{
  label:string;definition:ParamDefinition;value:AssetParamValue;
  onChange:(value:AssetParamValue)=>void;onKeyframe?:()=>void;
}){
  return <div className="creative-param">
    {definition.kind==='number'&&<Range label={label} value={typeof value==='number'?value:definition.default} min={definition.min} max={definition.max} step={definition.step} onChange={onChange} onBegin={()=>store.begin()} onEnd={()=>store.end()}/>} 
    {definition.kind==='boolean'&&<Toggle label={label} checked={typeof value==='boolean'?value:definition.default} onChange={onChange}/>} 
    {definition.kind==='select'&&<Choice label={label} value={typeof value==='string'?value:definition.default} options={definition.options.map(option=>({label:title(option.replace(/-/g,' ')),value:option}))} onChange={onChange}/>} 
    {definition.kind==='color'&&<ColorField label={label} value={typeof value==='string'?value:definition.default} onChange={onChange}/>} 
    {onKeyframe&&<button type="button" className="creative-keyframe-button" aria-label={`Add ${label} keyframe`} onClick={onKeyframe}>◆</button>}
  </div>;
}

function AnimationRoleEditor({clip,role,target}:{clip:Clip;role:AnimationRole;target:CreativeTarget}){
  const instance=clip.animations?.[role];
  const definition=instance?creativeRegistry.resolve('text-animation',instance.assetId,instance.version):null;
  const update=(next:AnimationInstance|null)=>store.setAnimation(clip.id,role,next);
  return <div className="creative-animation-role">
    <Choice
      label={`${title(role)} animation`}
      value={instance?.assetId??'none'}
      options={animationOptions(role,target)}
      onChange={assetId=>{
        if(assetId==='none'){update(null);return;}
        const next=creativeRegistry.preferred('text-animation').find(def=>def.id===assetId&&def.roles?.includes(role)&&def.targets.includes(target));
        if(next)update(animationInstance(next,role));
      }}
    />
    {instance&&<Toggle label={`Disable ${title(role)} role`} checked={!instance.enabled} onChange={disabled=>update({...instance,enabled:!disabled})}/>} 
    {instance&&definition&&<div className="creative-param-list">{Object.entries(definition.params).map(([key,param])=>{
      const value=instance.params[key]??param.default;
      const label=`${definition.name} ${paramName(key)}`;
      return <ParamControl key={key} label={label} definition={param} value={value} onChange={next=>update({...instance,params:{...instance.params,[key]:next}})} onKeyframe={param.keyframeable?()=>{
        const timeMs=animationRoleTime(clip,role,audioEngine.time(),instance.params);
        update({...instance,keyframes:{...instance.keyframes,[key]:upsertFrame(instance.keyframes[key]??[],timeMs,value)}});
      }:undefined}/>;
    })}</div>}
  </div>;
}

function effectDefinition(effect:EffectInstance){
  return creativeRegistry.resolve('effect',effect.assetId,effect.version);
}

function EffectRow({effect,scope,clip,project,index,total}:{effect:EffectInstance;scope:EffectScope;clip?:Clip;project:Project;index:number;total:number}){
  const definition=effectDefinition(effect);
  const name=definition?.name??effect.assetId;
  const clipId=scope==='clip'?clip?.id:null;
  const patch=(value:Partial<EffectInstance>)=>clipId?store.patchClipEffect(clipId,effect.id,value):store.patchMasterEffect(effect.id,value);
  const move=(delta:-1|1)=>clipId?store.moveClipEffect(clipId,effect.id,delta):store.moveMasterEffect(effect.id,delta);
  const duplicate=()=>clipId?store.duplicateClipEffect(clipId,effect.id):store.duplicateMasterEffect(effect.id);
  const remove=()=>clipId?store.removeClipEffect(clipId,effect.id):store.removeMasterEffect(effect.id);
  return <div className="creative-effect-card">
    <div className="creative-effect-row">
      <Toggle label={`${name} enabled`} checked={effect.enabled} onChange={enabled=>patch({enabled})}/>
      <div className="creative-effect-actions">
        <button type="button" aria-label={`Move ${name} effect up`} disabled={index===0} onClick={()=>move(-1)}>↑</button>
        <button type="button" aria-label={`Move ${name} effect down`} disabled={index===total-1} onClick={()=>move(1)}>↓</button>
        <button type="button" aria-label={`Duplicate ${name} effect`} onClick={duplicate}>Duplicate</button>
        <button type="button" aria-label={`Remove ${name} effect`} onClick={remove}>Remove</button>
      </div>
    </div>
    {definition&&<details className="creative-effect-details" open>
      <summary>{name} parameters</summary>
      <div className="creative-param-list">{Object.entries(definition.params).map(([key,param])=>{
        const value=effect.params[key]??param.default;
        const label=`${name} ${paramName(key)}`;
        return <ParamControl key={key} label={label} definition={param} value={value} onChange={next=>patch({params:{...effect.params,[key]:next}})} onKeyframe={param.keyframeable?()=>{
          const now=audioEngine.time();
          const timeMs=scope==='clip'&&clip?Math.round(clamp(now-clip.start,0,clip.end-clip.start)):Math.round(clamp(now,0,project.duration));
          patch({keyframes:{...effect.keyframes,[key]:upsertFrame(effect.keyframes[key]??[],timeMs,value)}});
        }:undefined}/>;
      })}</div>
    </details>}
  </div>;
}

function EffectBrowser({definitions,category,query,onCategory,onQuery,onAdd}:{definitions:readonly CreativeDefinition[];category:EffectFilter;query:string;onCategory:(category:EffectFilter)=>void;onQuery:(query:string)=>void;onAdd:(definition:CreativeDefinition)=>void}){
  const normalized=query.trim().toLowerCase();
  const visible=definitions.filter(definition=>{
    if(category!=='all'&&definition.category!==category)return false;
    if(!normalized)return true;
    return `${definition.name} ${definition.description??''}`.toLowerCase().includes(normalized);
  });
  return <div className="effect-browser">
    <input className="effect-browser-search" aria-label="Search effects" placeholder="Search effects…" value={query} onChange={event=>onQuery(event.target.value)}/>
    <div className="effect-browser-categories" role="group" aria-label="Effect categories">
      {EFFECT_CATEGORIES.map(item=><button key={item.value} type="button" className={category===item.value?'active':''} aria-label={`Filter effects: ${item.label}`} aria-pressed={category===item.value} onClick={()=>onCategory(item.value)}>{item.label}</button>)}
    </div>
    <div className="effect-browser-grid">
      {visible.map(definition=><button key={`${definition.id}@${definition.version}`} type="button" className="effect-browser-card" aria-label={`Add ${definition.name} effect`} onClick={()=>onAdd(definition)}>
        <span className="effect-browser-card-title">{definition.name}</span>
        <span className="effect-browser-card-category">{EFFECT_CATEGORIES.find(item=>item.value===definition.category)?.label??'Effect'}</span>
        <span className="effect-browser-card-description">{definition.description??'Trusted LyricForge effect.'}</span>
        <span className="effect-browser-card-add">+ Add</span>
      </button>)}
      {!visible.length&&<p className="hint effect-browser-empty">No effects match this search.</p>}
    </div>
  </div>;
}

function clipLabel(clip:Clip|undefined,id:string){return clip?.text?.trim()||clip?.name||clip?.id||id||'Missing clip';}

function TransitionEditor({project,transitionId}:{project:Project;transitionId:string}){
  const transition=project.transitions.find(item=>item.id===transitionId);
  if(!transition)return <p className="hint" role="alert">This transition no longer exists.</p>;
  const outgoing=project.clips.find(item=>item.id===transition.outgoingItemId);
  const incoming=project.clips.find(item=>item.id===transition.incomingItemId);
  const pair=isValidTransitionPair(project,transition);
  const window=transitionWindow(project,transition);
  const definition=creativeRegistry.resolve('transition',transition.assetId,transition.version);
  const definitions=creativeRegistry.preferred('transition').filter(def=>{
    if(!outgoing||!incoming)return true;
    return def.targets.includes(outgoing.kind as CreativeTarget)&&def.targets.includes(incoming.kind as CreativeTarget);
  });
  const presetOptions=definitions.map(def=>({label:def.name,value:def.id}));
  if(definition&&!presetOptions.some(option=>option.value===definition.id))presetOptions.unshift({label:definition.name,value:definition.id});
  const effective=window?`${Math.round(window.effectiveDurationMs)} ms`:'Unavailable';
  return <div className="transition-inspector">
    <div className="transition-pair">{clipLabel(outgoing,transition.outgoingItemId)} → {clipLabel(incoming,transition.incomingItemId)}</div>
    {!pair.valid&&<p className="transition-warning" role="alert">{pair.diagnostic?.message??'This transition is not valid at its current cut.'}</p>}
    <Section title="Transition" open>
      <Choice label="Transition preset" value={transition.assetId} options={presetOptions} onChange={assetId=>{
        const next=definitions.find(def=>def.id===assetId);if(!next)return;
        store.patchTransition(transition.id,{assetId:next.id,version:next.version,params:creativeRegistry.normalizeParams(next,{})});
      }}/>
      <NumberField label="Requested duration" value={transition.durationMs} min={50} step={10} suffix="ms" onChange={durationMs=>store.patchTransition(transition.id,{durationMs:Math.max(50,Math.round(durationMs))})}/>
      <Choice label="Transition easing" value={transition.easing} options={['linear','ease-in','ease-out','ease-in-out']} onChange={easing=>store.patchTransition(transition.id,{easing:easing as TransitionInstance['easing']})}/>
      <div className="transition-meta"><span>Effective duration</span><strong>{effective}</strong></div>
    </Section>
    {definition&&Object.keys(definition.params).length>0&&<Section title={`${definition.name} parameters`} open><div className="creative-param-list">{Object.entries(definition.params).map(([key,param])=>{
      const value=transition.params[key]??param.default;
      return <ParamControl key={key} label={`${definition.name} ${paramName(key)}`} definition={param} value={value} onChange={next=>store.patchTransition(transition.id,{params:{...transition.params,[key]:next}})}/>;
    })}</div></Section>}
    <button type="button" className="soft-button full transition-remove" aria-label="Remove transition" onClick={()=>store.removeTransition(transition.id)}>Remove transition</button>
  </div>;
}

export default function CreativeInspector({clipId,mode='all',transitionId=null}:{clipId:string|null;mode?:CreativeInspectorMode;transitionId?:string|null}){
  useSyncExternalStore(creativeRegistry.subscribe,creativeRegistry.getSnapshot,creativeRegistry.getSnapshot);
  const {project}=useEditor();
  const clip=clipId?project.clips.find(item=>item.id===clipId):undefined;
  const target=clip&&(['lyrics','text','image','video','visualizer'] as string[]).includes(clip.kind)?clip.kind as CreativeTarget:null;
  const textTarget=clip&&(clip.kind==='text'||clip.kind==='lyrics')?clip.kind as CreativeTarget:null;
  const showAnimations=(mode==='all'||mode==='animations')&&!!textTarget;
  const showEffects=mode==='all'||mode==='effects';
  const [scopeState,setScope]=useState<EffectScope>(()=>target?'clip':'master');
  const [presetState,setPreset]=useState('builtin.effect.glow');
  const [effectQuery,setEffectQuery]=useState('');
  const [effectCategory,setEffectCategory]=useState<EffectFilter>('all');
  useEffect(()=>{setScope(target?'clip':'master');},[clipId,target]);
  const scope:EffectScope=target?scopeState:'master';
  const effectTarget:CreativeTarget=scope==='clip'&&target?target:'master';
  const effectDefs=creativeRegistry.preferred('effect').filter(def=>def.targets.includes(effectTarget));
  const preset=effectDefs.some(def=>def.id===presetState)?presetState:(effectDefs[0]?.id??'');
  const effects=scope==='clip'&&clip?clip.effects:project.masterEffects;
  const scopeLabel=scope==='clip'?'Clip effects':'Master effects';
  const addDefinition=(definition:CreativeDefinition)=>{
    if(scope==='clip'&&clip)store.addClipEffect(clip.id,definition.id,definition.version);
    else store.addMasterEffect(definition.id,definition.version);
  };
  const addEffect=()=>{const definition=effectDefs.find(def=>def.id===preset);if(definition)addDefinition(definition);};

  if(mode==='transition')return <div className="creative-inspector">{transitionId?<TransitionEditor project={project} transitionId={transitionId}/>:<p className="hint">Select a transition to edit.</p>}</div>;

  return <div className="creative-inspector">
    {showAnimations&&<Section title="Text animations" open>{(['intro','loop','outro'] as const).map(role=><AnimationRoleEditor key={role} clip={clip!} role={role} target={textTarget!}/>)}</Section>}

    {showEffects&&<Section title={scopeLabel} open>
      {target&&<Choice label="Effect scope" value={scope} options={[{label:'Clip',value:'clip'},{label:'Master',value:'master'}]} onChange={value=>setScope(value as EffectScope)}/>} 
      <EffectBrowser definitions={effectDefs} category={effectCategory} query={effectQuery} onCategory={setEffectCategory} onQuery={setEffectQuery} onAdd={addDefinition}/>
      <div className="effect-browser-quick-add">
        <span className="hint">Quick add</span>
        <Choice label={scope==='clip'?'Clip effect preset':'Master effect preset'} value={preset} options={effectDefs.map(def=>({label:def.name,value:def.id}))} onChange={setPreset}/>
        <button type="button" className="soft-button full creative-add-effect" aria-label={scope==='clip'?'Add clip effect':'Add master effect'} onClick={addEffect}>{scope==='clip'?'Add clip effect':'Add master effect'}</button>
      </div>
      {effects.map((effect,index)=><EffectRow key={effect.id} effect={effect} scope={scope} clip={scope==='clip'?clip:undefined} project={project} index={index} total={effects.length}/>)}
    </Section>}
  </div>;
}
