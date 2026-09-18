'use client';
import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {Heart,RefreshCw,Search,X} from 'lucide-react';
import type {CatalogAssetManifest,CatalogAssetType,InstalledAssetVersion} from '@/lib/lyricforge/catalog-types';
import type {CatalogBrowseItem,CatalogFilter,CatalogService} from '@/lib/lyricforge/catalog-service';
import CatalogPreview from './CatalogPreview';
import AdvancedInstaller from './AdvancedInstaller';

export interface CatalogInstallerLike{
 install(manifest:CatalogAssetManifest):Promise<InstalledAssetVersion>;
 installBytes?(manifest:CatalogAssetManifest,bytes:Uint8Array|ArrayBuffer,options?:{makeCurrent?:boolean}):Promise<InstalledAssetVersion>;
 repair(type:CatalogAssetType,id:string,version:string):Promise<InstalledAssetVersion>;
 rollback(type:CatalogAssetType,id:string,version:string):Promise<InstalledAssetVersion>;
 remove(type:CatalogAssetType,id:string,version:string,options?:{force?:boolean}):Promise<void>;
}

export interface CatalogPanelProps{
 service:CatalogService;
 installer:CatalogInstallerLike;
 mobile?:boolean;
 onClose?:()=>void;
 onAddElement?:(element:{id:string;version:string})=>Promise<void>|void;
}

const ASSET_TABS:readonly {label:string;type:CatalogAssetType}[]=[
 {label:'Fonts',type:'font'},
 {label:'Effects',type:'effect'},
 {label:'Transitions',type:'transition'},
 {label:'Text Animations',type:'text-animation'},
 {label:'Elements',type:'element'},
];
const FILTERS:readonly CatalogFilter[]=['Built-in','Online','Installed','Favorites','Updates'];
const formatBytes=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(bytes<10240?1:0)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;

export default function CatalogPanel({service,installer,mobile=false,onClose,onAddElement}:CatalogPanelProps){
 useSyncExternalStore(service.subscribe,service.getSnapshot,service.getSnapshot);
 const [type,setType]=useState<CatalogAssetType>('effect');
 const [filter,setFilter]=useState<CatalogFilter>('Online');
 const [query,setQuery]=useState('');
 const [provider,setProvider]=useState('');
 const [selected,setSelected]=useState<CatalogBrowseItem|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [actionError,setActionError]=useState('');
 const snapshot=service.getSnapshot();

 useEffect(()=>{void service.load();},[service]);
 const providerItems=useMemo(()=>service.search(query,{type,filter}),[service,query,type,filter,snapshot]);
 const providers=useMemo(()=>[...new Set(providerItems.map(item=>item.provider))].sort((a,b)=>a.localeCompare(b)),[providerItems]);
 const items=useMemo(()=>service.search(query,{type,filter,...(provider?{provider}:{})}),[service,query,type,filter,provider,snapshot]);
 useEffect(()=>{if(provider&&!providers.includes(provider))setProvider('');},[provider,providers]);
 useEffect(()=>{if(selected){const fresh=items.find(item=>item.id===selected.id&&item.type===selected.type);if(fresh)setSelected(fresh);}},[items,selected]);

 async function refreshAfter(action:()=>Promise<unknown>,key:string){
  setBusy(key);setActionError('');
  try{await action();await service.refreshLocalState();}
  catch(error){setActionError(error instanceof Error?error.message:String(error));}
  finally{setBusy(null);}
 }
 async function runAction(action:()=>Promise<unknown>|unknown,key:string){
  setBusy(key);setActionError('');
  try{await action();}
  catch(error){setActionError(error instanceof Error?error.message:String(error));}
  finally{setBusy(null);}
 }
 async function primaryAction(item:CatalogBrowseItem){
  if(!item.compatible)return;
  const key=`${item.type}:${item.id}`;
  if(item.availableUpdate){
   const update=service.findExact(item.type,item.id,item.availableUpdate);
   if(update)await refreshAfter(()=>installer.install(update),key);
   return;
  }
  if(item.type==='element'&&item.installed){
   if(onAddElement)await runAction(()=>onAddElement({id:item.id,version:item.currentVersion??item.version}),key);
   return;
  }
  if(!item.installed&&item.manifest)await refreshAfter(()=>installer.install(item.manifest!),key);
 }
 async function toggleFavorite(item:CatalogBrowseItem){
  setActionError('');
  try{await service.setFavorite(item.type,item.id,!item.favorite);}catch(error){setActionError(error instanceof Error?error.message:String(error));}
 }

 const rootProps=mobile?{role:'dialog' as const,'aria-label':'Asset catalog','aria-modal':true}:{'aria-label':'Asset catalog'};
 return <section {...rootProps} className={`catalog-panel${mobile?' catalog-sheet':''}`}>
  <div className="catalog-header">
   <div><strong>Asset Catalog</strong><span>{snapshot.refreshing?'Refreshing…':'Official LyricForge catalog'}</span></div>
   <div className="catalog-header-actions">
    <button type="button" className="catalog-icon-button" aria-label="Refresh catalog" onClick={()=>void service.refresh()}><RefreshCw size={17}/></button>
    {mobile&&onClose?<button type="button" className="catalog-icon-button" aria-label="Close catalog" onClick={onClose}><X size={18}/></button>:null}
   </div>
  </div>

  <div className="catalog-tabs" role="tablist" aria-label="Catalog asset types">
   {ASSET_TABS.map(tab=><button key={tab.type} type="button" role="tab" aria-selected={type===tab.type} className={type===tab.type?'active':''} onClick={()=>{setType(tab.type);setProvider('');setSelected(null);}}>{tab.label}</button>)}
  </div>
  <label className="catalog-search"><Search size={16}/><span className="sr-only">Search catalog</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search assets, authors, providers, tags…" aria-label="Search catalog"/></label>
  <div className="catalog-filters" aria-label="Catalog filters">
   {FILTERS.map(value=><button key={value} type="button" className={filter===value?'active':''} aria-pressed={filter===value} onClick={()=>{setFilter(value);setProvider('');setSelected(null);}}>{value}</button>)}
  </div>
  {providers.length>1?<label className="catalog-provider-filter"><span>Provider</span><select aria-label="Provider filter" value={provider} onChange={event=>{setProvider(event.target.value);setSelected(null);}}><option value="">All providers</option>{providers.map(value=><option key={value} value={value}>{value}</option>)}</select></label>:null}

  {snapshot.refreshError?<div className="catalog-notice" role="status">Offline or refresh issue: {snapshot.refreshError}</div>:null}
  {actionError?<div className="catalog-error" role="alert">{actionError}</div>:null}

  <div className={`catalog-content${selected?' has-detail':''}`}>
   <div className="catalog-grid" aria-live="polite">
    {items.length?items.map(item=>{
     const key=`${item.type}:${item.id}`;
     const updating=Boolean(item.availableUpdate);
     const adding=item.type==='element'&&item.installed&&!updating;
     const label=!item.compatible?'Incompatible':updating?'Update':adding?'Add to project':item.installed?'Installed':'Install';
     const disabled=!item.compatible||busy===key||(item.installed&&!updating&&!adding)||(adding&&!onAddElement);
     return <article className="catalog-card" key={`${item.type}:${item.id}@${item.version}`}>
      <button type="button" aria-label={`Open details for ${item.name}`} onClick={()=>setSelected(item)} style={{display:'block',width:'100%',padding:0,border:0,background:'transparent',color:'inherit',textAlign:'inherit',touchAction:'manipulation',...(mobile?{minHeight:'44px'}:{})}}><CatalogPreview item={item}/></button>
      <div className="catalog-card-body">
       <div className="catalog-card-title"><div><strong>{item.name}</strong><span>{item.author}</span></div><button type="button" className={`catalog-favorite${item.favorite?' active':''}`} aria-label={item.favorite?`Remove ${item.name} from favorites`:`Favorite ${item.name}`} onClick={()=>void toggleFavorite(item)}><Heart size={17} fill={item.favorite?'currentColor':'none'}/></button></div>
       <p>{item.description}</p>
       <div className="catalog-meta"><span className="catalog-provider-chip" aria-label={`Source provider ${item.provider}`}>{item.provider}</span><span>v{updating?item.availableUpdate:item.version}</span><span>{item.license}</span>{item.manifest?<span>{formatBytes(item.manifest.package.size)}</span>:null}</div>
       <div className="catalog-card-actions">
        <button type="button" className="catalog-secondary" onClick={()=>setSelected(item)} aria-label={`Details ${item.name}`}>Details</button>
        <button type="button" className="catalog-primary" style={mobile?{minHeight:'44px'}:undefined} disabled={disabled} aria-label={`${label} ${item.name}`} onClick={()=>void primaryAction(item)}>{busy===key?'Working…':label}</button>
       </div>
      </div>
     </article>;
    }):<div className="catalog-empty">No {type.replace('text-animation','text animation')} assets match this view.</div>}
   </div>

   {selected?<aside className="catalog-detail" aria-label={`${selected.name} details`}>
    <button type="button" className="catalog-detail-close" aria-label="Close catalog details" onClick={()=>setSelected(null)}><X size={18}/></button>
    <CatalogPreview item={selected}/>
    <h3>{selected.name}</h3>
    <p>{selected.description}</p>
    <dl>
     <div><dt>Version</dt><dd>{selected.version}</dd></div>
     <div><dt>Author</dt><dd>{selected.author}</dd></div>
     <div><dt>Provider</dt><dd>{selected.provider}</dd></div>
     <div><dt>License</dt><dd>{selected.license}</dd></div>
     <div><dt>Status</dt><dd>{selected.compatible?selected.installed?'Installed':'Compatible':'Incompatible'}</dd></div>
     {selected.manifest?.source?.creator?<div><dt>Creator</dt><dd>{selected.manifest.source.creator}</dd></div>:null}
     {selected.manifest?.source?.attribution?<div><dt>Attribution</dt><dd>{selected.manifest.source.attribution}</dd></div>:null}
     {selected.manifest?.runtimeId?<div><dt>Trusted runtime</dt><dd>{selected.manifest.runtimeId}</dd></div>:null}
     {selected.manifest?<div><dt>Package</dt><dd>{formatBytes(selected.manifest.package.size)}</dd></div>:null}
    </dl>
    {selected.manifest?.changelog?<><h4>Changelog</h4><p>{selected.manifest.changelog}</p></>:null}
    {selected.manifest?.preset&&Object.keys(selected.manifest.preset).length?<><h4>Preset</h4><div className="catalog-param-list">{Object.entries(selected.manifest.preset).map(([name,value])=><span key={name}>{name}: {String(value)}</span>)}</div></>:null}
    {selected.manifest?.source?.itemUrl?<a href={selected.manifest.source.itemUrl} target="_blank" rel="noreferrer">View original item</a>:selected.manifest?.sourceUrl?<a href={selected.manifest.sourceUrl} target="_blank" rel="noreferrer">View source</a>:null}
    {selected.manifest?.licenseUrl?<a href={selected.manifest.licenseUrl} target="_blank" rel="noreferrer">View license</a>:null}
   </aside>:null}
  </div>
  {installer.installBytes?<details className="catalog-advanced"><summary>Advanced install</summary><AdvancedInstaller installer={{install:manifest=>installer.install(manifest),installBytes:(manifest,bytes,options)=>installer.installBytes!(manifest,bytes,options)}} onInstalled={async()=>{await service.refreshLocalState();}}/></details>:null}
 </section>;
}