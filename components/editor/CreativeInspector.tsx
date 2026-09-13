'use client';
import {useEffect,useState} from 'react';
import type {AnimationInstance,AnimationRole,AssetParamValue,CreativeKeyframe,EffectInstance} from '@/lib/lyricforge/creative-assets';
import {animationRoleTime} from '@/lib/lyricforge/animation-runtime';
import {audioEngine} from '@/lib/lyricforge/audio';
import {creativeRegistry,type CreativeDefinition,type CreativeTarget,type ParamDefinition} from '@/lib/lyricforge/creative-registry';
import {clamp,type Clip,type Project,uid} from '@/lib/lyricforge/model';
import {store,useEditor} from '@/lib/lyricforge/store';
import {Choice,ColorField,Range,Section,Toggle} from './Controls';

export type CreativeInspectorMode='all'|'animations'|'effects';
type EffectScope='clip'|'master';

function title(value:string){return value[0].toUpperCase()+value.slice(1);}
function paramName(key:string){return key.replace(/Ms$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();}

function animationOptions(role:AnimationRole,target:CreativeTarget){
  return [
    {label:'None',value:'none'},
    ...creativeRegistry.all('text-animation')
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
        const next=creativeRegistry.all('text-animation').find(def=>def.id===assetId&&def.roles?.includes(role)&&def.targets.includes(target));
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

export default function CreativeInspector({clipId,mode='all'}:{clipId:string|null;mode?:CreativeInspectorMode}){
  const {project}=useEditor();
  const clip=clipId?project.clips.find(item=>item.id===clipId):undefined;
  const target=clip&&(['lyrics','text','image','video','visualizer'] as string[]).includes(clip.kind)?clip.kind as CreativeTarget:null;
  const textTarget=clip&&(clip.kind==='text'||clip.kind==='lyrics')?clip.kind as CreativeTarget:null;
  const showAnimations=(mode==='all'||mode==='animations')&&!!textTarget;
  const showEffects=mode==='all'||mode==='effects';
  const [scopeState,setScope]=useState<EffectScope>(()=>target?'clip':'master');
  const [presetState,setPreset]=useState('builtin.effect.glow');
  useEffect(()=>{setScope(target?'clip':'master');},[clipId,target]);
  const scope:EffectScope=target?scopeState:'master';
  const effectTarget:CreativeTarget=scope==='clip'&&target?target:'master';
  const effectDefs=creativeRegistry.all('effect').filter(def=>def.targets.includes(effectTarget));
  const preset=effectDefs.some(def=>def.id===presetState)?presetState:(effectDefs[0]?.id??'');
  const effects=scope==='clip'&&clip?clip.effects:project.masterEffects;
  const scopeLabel=scope==='clip'?'Clip effects':'Master effects';
  const addEffect=()=>{
    const definition=effectDefs.find(def=>def.id===preset);if(!definition)return;
    if(scope==='clip'&&clip)store.addClipEffect(clip.id,definition.id,definition.version);
    else store.addMasterEffect(definition.id,definition.version);
  };

  return <div className="creative-inspector">
    {showAnimations&&<Section title="Text animations" open>{(['intro','loop','outro'] as const).map(role=><AnimationRoleEditor key={role} clip={clip!} role={role} target={textTarget!}/>)}</Section>}

    {showEffects&&<Section title={scopeLabel} open>
      {target&&<Choice label="Effect scope" value={scope} options={[{label:'Clip',value:'clip'},{label:'Master',value:'master'}]} onChange={value=>setScope(value as EffectScope)}/>} 
      <Choice label={scope==='clip'?'Clip effect preset':'Master effect preset'} value={preset} options={effectDefs.map(def=>({label:def.name,value:def.id}))} onChange={setPreset}/>
      <button type="button" className="soft-button full creative-add-effect" aria-label={scope==='clip'?'Add clip effect':'Add master effect'} onClick={addEffect}>{scope==='clip'?'Add clip effect':'Add master effect'}</button>
      {effects.map((effect,index)=><EffectRow key={effect.id} effect={effect} scope={scope} clip={scope==='clip'?clip:undefined} project={project} index={index} total={effects.length}/>)}
    </Section>}
  </div>;
}
