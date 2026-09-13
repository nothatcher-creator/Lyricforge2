'use client';
import type {AnimationInstance,AnimationRole,EffectInstance} from '@/lib/lyricforge/creative-assets';
import {creativeRegistry,type CreativeDefinition,type CreativeTarget} from '@/lib/lyricforge/creative-registry';
import {store,useEditor} from '@/lib/lyricforge/store';
import {Choice,Section,Toggle} from './Controls';

export type CreativeInspectorMode='all'|'animations'|'effects';

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

function effectDefinition(effect:EffectInstance){
  return creativeRegistry.resolve('effect',effect.assetId,effect.version);
}

function EffectRow({effect,clipId,index,total}:{effect:EffectInstance;clipId:string|null;index:number;total:number}){
  const definition=effectDefinition(effect);
  const name=definition?.name??effect.assetId;
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
  </div>;
}

export default function CreativeInspector({clipId,mode='all'}:{clipId:string|null;mode?:CreativeInspectorMode}){
  const {project}=useEditor();
  const clip=clipId?project.clips.find(item=>item.id===clipId):undefined;
  const target=clip&&(['lyrics','text','image','video','visualizer'] as const).includes(clip.kind as never)?clip.kind as CreativeTarget:null;
  const textTarget=clip&&(clip.kind==='text'||clip.kind==='lyrics')?clip.kind as CreativeTarget:null;
  const showAnimations=(mode==='all'||mode==='animations')&&!!textTarget;
  const showEffects=mode==='all'||mode==='effects';
  const effects=target?clip!.effects:project.masterEffects;
  const scopeLabel=target?'Clip effects':'Master effects';
  const addEffect=()=>{
    if(target)store.addClipEffect(clip!.id,'builtin.effect.glow','1.0.0');
    else store.addMasterEffect('builtin.effect.glow','1.0.0');
  };

  return <div className="creative-inspector">
    {showAnimations&&<Section title="Text animations" open>{(['intro','loop','outro'] as const).map(role=>{
      const instance=clip!.animations?.[role];
      return <div className="creative-animation-role" key={role}>
        <Choice
          label={`${role[0].toUpperCase()+role.slice(1)} animation`}
          value={instance?.assetId??'none'}
          options={animationOptions(role,textTarget!)}
          onChange={assetId=>{
            if(assetId==='none'){store.setAnimation(clip!.id,role,null);return;}
            const definition=creativeRegistry.all('text-animation').find(def=>def.id===assetId&&def.roles?.includes(role)&&def.targets.includes(textTarget!));
            if(definition)store.setAnimation(clip!.id,role,animationInstance(definition,role));
          }}
        />
        {instance&&<Toggle label={`Disable ${role[0].toUpperCase()+role.slice(1)} role`} checked={!instance.enabled} onChange={disabled=>store.setAnimation(clip!.id,role,{...instance,enabled:!disabled})}/>} 
      </div>;
    })}</Section>}

    {showEffects&&<Section title={scopeLabel} open>
      <button type="button" className="soft-button full creative-add-effect" aria-label={target?'Add clip effect':'Add master effect'} onClick={addEffect}>{target?'Add clip effect':'Add master effect'}</button>
      {effects.map((effect,index)=><EffectRow key={effect.id} effect={effect} clipId={target?clip!.id:null} index={index} total={effects.length}/>)}
    </Section>}
  </div>;
}
