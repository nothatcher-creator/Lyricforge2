from pathlib import Path

# Preview quality + diagnostics wiring.
path=Path('components/editor/Preview.tsx')
source=path.read_text()
source=source.replace(
    "import {Renderer} from '@/lib/lyricforge/renderer';\n",
    "import {Renderer} from '@/lib/lyricforge/renderer';\nimport type {CreativeDiagnostic} from '@/lib/lyricforge/effect-runtime';\n"
)
source=source.replace(
    "import {Choice,IconButton,Range} from './Controls';\n",
    "import {Choice,IconButton,Range} from './Controls';\nimport CreativeDiagnostics,{creativeDiagnosticKey,dedupeCreativeDiagnostics} from './CreativeDiagnostics';\n"
)
old="type PreviewProps={onFormat:()=>void;onLeft:()=>void;onRight:()=>void;onTextSelected?:(id:string)=>void};\nexport default function Preview({onFormat,onLeft,onRight,onTextSelected}:PreviewProps){"
new="""export type PreviewQuality='preview-low'|'preview-high';
export function normalizePreviewQuality(value:unknown):PreviewQuality{return value==='preview-low'||value==='preview-high'?value:'preview-high';}
type PreviewProps={onFormat:()=>void;onLeft:()=>void;onRight:()=>void;onTextSelected?:(id:string)=>void;quality:PreviewQuality;onQualityChange:(quality:PreviewQuality)=>void};
export default function Preview({onFormat,onLeft,onRight,onTextSelected,quality,onQualityChange}:PreviewProps){"""
if old not in source: raise SystemExit('Preview props anchor missing')
source=source.replace(old,new,1)
old="  const [editingId,setEditingId]=useState<string|null>(null);\n  const lastTap=useRef<{id?:string;at:number}>({at:0});\n  const current=useRef({project,selected,guides});current.current={project,selected,guides};"
new="""  const [editingId,setEditingId]=useState<string|null>(null);
  const [diagnostics,setDiagnostics]=useState<CreativeDiagnostic[]>([]);
  const lastTap=useRef<{id?:string;at:number}>({at:0});
  const lastDiagnosticsKey=useRef('');
  const current=useRef({project,selected,guides,quality});current.current={project,selected,guides,quality};"""
if old not in source: raise SystemExit('Preview state anchor missing')
source=source.replace(old,new,1)
old="    const render=new Renderer();renderer.current=render;let raf=0;let lastT=-1,lastP=project,lastSel=selected,lastGuide=false;const el=canvas.current!;"
new="    const render=new Renderer();renderer.current=render;let raf=0;let lastT=-1,lastP=project,lastSel=selected,lastGuide=false,lastQuality:PreviewQuality|null=null;const el=canvas.current!;"
if old not in source: raise SystemExit('Preview cache anchor missing')
source=source.replace(old,new,1)
old="    const loop=()=>{const state=current.current,t=Math.min(audioEngine.time(),Math.max(0,state.project.duration-1));if(lastP.width!==state.project.width||lastP.height!==state.project.height)fit();if(lastP!==state.project||lastSel!==state.selected||lastGuide!==state.guides||lastT!==t||performance.now()-lastDraw>120){render.draw(el,state.project,t,{selected:state.selected,guides:state.guides});lastT=t;lastP=state.project;lastSel=state.selected;lastGuide=state.guides;lastDraw=performance.now();}raf=requestAnimationFrame(loop);};"
new="""    const loop=()=>{const state=current.current,t=Math.min(audioEngine.time(),Math.max(0,state.project.duration-1));if(lastP.width!==state.project.width||lastP.height!==state.project.height)fit();if(lastP!==state.project||lastSel!==state.selected||lastGuide!==state.guides||lastQuality!==state.quality||lastT!==t||performance.now()-lastDraw>120){render.draw(el,state.project,t,{selected:state.selected,guides:state.guides,quality:state.quality});const nextDiagnostics=dedupeCreativeDiagnostics(render.creativeDiagnostics);const nextDiagnosticsKey=nextDiagnostics.map(creativeDiagnosticKey).join('\\u0001');if(lastDiagnosticsKey.current!==nextDiagnosticsKey){lastDiagnosticsKey.current=nextDiagnosticsKey;setDiagnostics(nextDiagnostics);}lastT=t;lastP=state.project;lastSel=state.selected;lastGuide=state.guides;lastQuality=state.quality;lastDraw=performance.now();}raf=requestAnimationFrame(loop);};"""
if old not in source: raise SystemExit('Preview loop anchor missing')
source=source.replace(old,new,1)
old='<div className="viewer-options"><button className="format-badge" onClick={onFormat}>'
new='''<div className="viewer-options"><Choice label="Preview quality" className="preview-quality-choice" value={quality} onChange={value=>onQualityChange(normalizePreviewQuality(value))} options={[{label:'Low — faster editing',value:'preview-low'},{label:'High — closer to export',value:'preview-high'}]}/><button className="format-badge" onClick={onFormat}>'''
if old not in source: raise SystemExit('Preview toolbar anchor missing')
source=source.replace(old,new,1)
old='</div><button className="fullscreen-exit" onClick={()=>void document.exitFullscreen()}>'
new='</div><CreativeDiagnostics diagnostics={diagnostics}/><button className="fullscreen-exit" onClick={()=>void document.exitFullscreen()}>'
if old not in source: raise SystemExit('Preview diagnostics placement anchor missing')
source=source.replace(old,new,1)
path.write_text(source)

# Editor persistence and prop wiring.
path=Path('components/editor/Editor.tsx')
source=path.read_text()
old="import Preview from './Preview';"
new="import Preview,{normalizePreviewQuality,type PreviewQuality} from './Preview';"
if old not in source: raise SystemExit('Editor Preview import anchor missing')
source=source.replace(old,new,1)
old="function Workspace(){const {project,selected}=useEditor();const [ready,setReady]=useState(false);const [tab,setTab]=useState('lyrics');"
new="function Workspace(){const {project,selected}=useEditor();const [ready,setReady]=useState(false);const [creativePreviewQuality,setCreativePreviewQuality]=useState<PreviewQuality>('preview-high');const [tab,setTab]=useState('lyrics');"
if old not in source: raise SystemExit('Editor Workspace state anchor missing')
source=source.replace(old,new,1)
old="const layout=await loadSetting<{leftWidth:number;rightWidth:number;timelineHeight:number;guide:boolean}>('workspace');"
new="const savedPreviewQuality=await loadSetting<unknown>('creativePreviewQuality');setCreativePreviewQuality(normalizePreviewQuality(savedPreviewQuality));const layout=await loadSetting<{leftWidth:number;rightWidth:number;timelineHeight:number;guide:boolean}>('workspace');"
if old not in source: raise SystemExit('Editor load setting anchor missing')
source=source.replace(old,new,1)
old=" useEffect(()=>{if(ready&&workspaceMode!=='phone-portrait')void saveSetting('workspace',{leftWidth,rightWidth,timelineHeight,guide});},[leftWidth,rightWidth,timelineHeight,guide,ready,workspaceMode]);"
new=old+"\n useEffect(()=>{if(ready)void saveSetting('creativePreviewQuality',creativePreviewQuality);},[creativePreviewQuality,ready]);"
if old not in source: raise SystemExit('Editor save workspace anchor missing')
source=source.replace(old,new,1)
old='<Preview onFormat={()=>setModal(\'format\')}'
new='<Preview quality={creativePreviewQuality} onQualityChange={setCreativePreviewQuality} onFormat={()=>setModal(\'format\')}'
if old not in source: raise SystemExit('Editor Preview render anchor missing')
source=source.replace(old,new,1)
path.write_text(source)

# Styling for quality control and diagnostics overlay.
path=Path('app/globals.css')
css=path.read_text()
sentinel='/* creative-preview-quality-diagnostics */'
if sentinel not in css:
    css += '''\n\n/* creative-preview-quality-diagnostics */\n.preview-quality-choice{min-width:176px}.creative-diagnostics{position:absolute;top:12px;right:12px;z-index:8;display:grid;gap:8px;width:min(390px,calc(100% - 24px));pointer-events:auto}.creative-diagnostic{display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:9px;padding:10px;border:1px solid #4a4b55;border-radius:9px;background:rgba(29,30,35,.94);box-shadow:0 10px 30px #0007;color:#dedfe5;backdrop-filter:blur(8px)}.creative-diagnostic>svg{margin-top:2px;color:#efb86f}.creative-diagnostic-copy{display:grid;gap:2px;min-width:0}.creative-diagnostic-copy strong{font-size:12px;color:#fff;overflow-wrap:anywhere}.creative-diagnostic-copy span{font-size:12px;color:#d4d5dc}.creative-diagnostic-copy small{font-size:11px;color:#9fa1ab}.creative-diagnostic>button{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:#aeb0b9}.creative-diagnostic>button:hover{background:#ffffff10;color:#fff}\n@media(max-width:760px){.preview-quality-choice{min-width:44px;max-width:156px}.creative-diagnostics{top:8px;right:8px;width:calc(100% - 16px)}.creative-diagnostic{padding:8px;gap:7px}}\n'''
    path.write_text(css)
