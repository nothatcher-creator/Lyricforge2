'use client';
import {useState} from 'react';
import type {ProjectDependency} from '@/lib/lyricforge/creative-assets';
import type {ProjectDependencyResolution} from '@/lib/lyricforge/catalog-dependencies';

export interface RestoreDependenciesPanelProps{
 missing:readonly ProjectDependencyResolution[];
 onRestore:(dependency:ProjectDependency)=>Promise<void>|void;
 onRestoreAll?:(dependencies:ProjectDependency[])=>Promise<void>|void;
 onLocate?:(dependency:ProjectDependency)=>Promise<void>|void;
 onSubstitute?:(dependency:ProjectDependency)=>Promise<void>|void;
 onBypass?:(dependency:ProjectDependency)=>Promise<void>|void;
}

export default function RestoreDependenciesPanel({missing,onRestore,onRestoreAll,onLocate,onSubstitute,onBypass}:RestoreDependenciesPanelProps){
 const unresolved=missing.filter(item=>item.status==='missing');
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState<string>();
 if(!unresolved.length)return null;

 const run=async(key:string,action:()=>Promise<void>|void)=>{
  setBusy(key);setError(undefined);
  try{await action();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{setBusy(null);}
 };
 const dependencies=unresolved.map(item=>item.dependency);
 return <section className="restore-dependencies-panel" aria-label="Restore dependencies">
  <div className="restore-dependencies-heading">
   <div><strong>Missing project dependencies</strong><p>LyricForge kept the exact asset references. Nothing downloads until you choose Restore.</p></div>
   {onRestoreAll&&<button type="button" className="soft-button" disabled={!!busy} aria-label="Restore all exact dependencies" onClick={()=>run('all',()=>onRestoreAll(dependencies))}>{busy==='all'?'Restoring…':'Restore All'}</button>}
  </div>
  {error&&<p role="alert" className="catalog-error">{error}</p>}
  <div className="restore-dependencies-list">
   {unresolved.map(({dependency})=>{
    const key=`${dependency.type}:${dependency.id}@${dependency.version}`;
    return <article key={key} className="restore-dependency-card">
     <div className="restore-dependency-meta"><strong>{dependency.id}</strong><span>{dependency.type}</span><span>{dependency.version}</span>{dependency.sourceCatalogId&&<span>{dependency.sourceCatalogId}</span>}</div>
     <div className="restore-dependency-actions">
      <button type="button" className="soft-button" disabled={!!busy} aria-label={`Restore ${dependency.id} ${dependency.version}`} onClick={()=>run(key,()=>onRestore(dependency))}>{busy===key?'Restoring…':'Restore exact'}</button>
      {onLocate&&<button type="button" className="text-button" disabled={!!busy} aria-label={`Locate ${dependency.id}`} onClick={()=>run(`locate:${key}`,()=>onLocate(dependency))}>Locate</button>}
      {onSubstitute&&<button type="button" className="text-button" disabled={!!busy} aria-label={`Substitute ${dependency.id}`} onClick={()=>run(`substitute:${key}`,()=>onSubstitute(dependency))}>Substitute</button>}
      {onBypass&&<button type="button" className="text-button" disabled={!!busy} aria-label={`Bypass ${dependency.id}`} onClick={()=>run(`bypass:${key}`,()=>onBypass(dependency))}>Bypass</button>}
     </div>
    </article>;
   })}
  </div>
 </section>;
}
