from pathlib import Path

# Timeline duration drag.
path = Path('components/editor/TimelineTransitions.tsx')
source = path.read_text()
anchor = "function candidate(outgoing:Clip,incoming:Clip):TransitionInstance{\n"
helper = """function beginDurationDrag(event:React.PointerEvent<HTMLSpanElement>,transitionId:string,baseDuration:number,scale:number){
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

"""
if helper not in source:
    if anchor not in source:
        raise SystemExit('Timeline candidate anchor missing')
    source = source.replace(anchor, helper + anchor, 1)
old = '<span data-transition-handle aria-hidden="true"/>'
new = '<span data-transition-handle aria-hidden="true" onPointerDown={event=>beginDurationDrag(event,existing.id,existing.durationMs,scale)}/>'
if old in source:
    source = source.replace(old, new, 1)
elif new not in source:
    raise SystemExit('Transition handle anchor missing')
path.write_text(source)

# Creative transition inspector.
path = Path('components/editor/CreativeInspector.tsx')
source = path.read_text()
source = source.replace(
    "import type {AnimationInstance,AnimationRole,AssetParamValue,CreativeKeyframe,EffectInstance} from '@/lib/lyricforge/creative-assets';",
    "import type {AnimationInstance,AnimationRole,AssetParamValue,CreativeKeyframe,EffectInstance,TransitionInstance} from '@/lib/lyricforge/creative-assets';",
)
source = source.replace(
    "import {store,useEditor} from '@/lib/lyricforge/store';\nimport {Choice,ColorField,Range,Section,Toggle} from './Controls';",
    "import {store,useEditor} from '@/lib/lyricforge/store';\nimport {isValidTransitionPair,transitionWindow} from '@/lib/lyricforge/transition-runtime';\nimport {Choice,ColorField,NumberField,Range,Section,Toggle} from './Controls';",
)
source = source.replace(
    "export type CreativeInspectorMode='all'|'animations'|'effects';",
    "export type CreativeInspectorMode='all'|'animations'|'effects'|'transition';",
)
transition_editor = """
function clipLabel(clip:Clip|undefined,id:string){return clip?.text?.trim()||clip?.name||clip?.id||id||'Missing clip';}

function TransitionEditor({project,transitionId}:{project:Project;transitionId:string}){
  const transition=project.transitions.find(item=>item.id===transitionId);
  if(!transition)return <p className="hint" role="alert">This transition no longer exists.</p>;
  const outgoing=project.clips.find(item=>item.id===transition.outgoingItemId);
  const incoming=project.clips.find(item=>item.id===transition.incomingItemId);
  const pair=isValidTransitionPair(project,transition);
  const window=transitionWindow(project,transition);
  const definition=creativeRegistry.resolve('transition',transition.assetId,transition.version);
  const definitions=creativeRegistry.all('transition').filter(def=>{
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

"""
export_anchor = 'export default function CreativeInspector'
if transition_editor not in source:
    if export_anchor not in source:
        raise SystemExit('CreativeInspector export anchor missing')
    source = source.replace(export_anchor, transition_editor + export_anchor, 1)
old = "export default function CreativeInspector({clipId,mode='all'}:{clipId:string|null;mode?:CreativeInspectorMode}){\n  const {project}=useEditor();"
new = "export default function CreativeInspector({clipId,mode='all',transitionId=null}:{clipId:string|null;mode?:CreativeInspectorMode;transitionId?:string|null}){\n  const {project}=useEditor();"
if old in source:
    source = source.replace(old, new, 1)
elif new not in source:
    raise SystemExit('CreativeInspector signature anchor missing')
return_anchor = '  return <div className="creative-inspector">'
transition_return = "  if(mode==='transition')return <div className=\"creative-inspector\">{transitionId?<TransitionEditor project={project} transitionId={transitionId}/>:<p className=\"hint\">Select a transition to edit.</p>}</div>;\n\n"
if transition_return not in source:
    if return_anchor not in source:
        raise SystemExit('CreativeInspector return anchor missing')
    source = source.replace(return_anchor, transition_return + return_anchor, 1)
path.write_text(source)

# Main Inspector selected-transition branch after all local state hooks.
path = Path('components/editor/Inspector.tsx')
source = path.read_text()
source = source.replace("const {project,selected}=useEditor();", "const {project,selected,selectedTransitionId}=useEditor();", 1)
old = "const [property,setProperty]=useState('x');const textMode="
branch = """const [property,setProperty]=useState('x');if(selectedTransitionId){return <aside className="inspector"><MobileSheetHandle/><div className="panel-heading"><h2>Transition</h2><SlidersHorizontal size={16}/></div><div className="inspector-scroll"><CreativeInspector clipId={null} mode="transition" transitionId={selectedTransitionId}/></div><div className="inspector-footer">Transition</div></aside>;}const textMode="""
if old in source:
    source = source.replace(old, branch, 1)
elif branch not in source:
    raise SystemExit('Inspector state anchor missing')
path.write_text(source)

# Transition inspector styling/mobile touch target.
path = Path('app/globals.css')
css = path.read_text()
sentinel = '/* transition-inspector */'
if sentinel not in css:
    css += """

/* transition-inspector */
.transition-inspector{display:grid;gap:10px;min-width:0}.transition-pair{padding:9px 10px;border:1px solid #3b3c44;border-radius:7px;background:#25262b;color:#e8e8ec;font-weight:600;overflow-wrap:anywhere}.transition-warning{margin:0;padding:9px 10px;border:1px solid #8e5c4d;border-radius:7px;background:#3b2622;color:#f2b9a9}.transition-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;color:#b8b9c1}.transition-meta strong{color:#ececf0}.transition-remove{min-height:36px}.mode-phone-portrait .transition-pair,.mode-phone-portrait .transition-warning,.mode-phone-portrait .transition-meta,.mode-phone-portrait .transition-remove{min-height:36px}
"""
    path.write_text(css)
