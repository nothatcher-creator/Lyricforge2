'use client';
import {useState} from 'react';
import {AlertTriangle,X} from 'lucide-react';
import type {CreativeDiagnostic} from '@/lib/lyricforge/effect-runtime';

export function creativeDiagnosticKey(diagnostic:CreativeDiagnostic){
  return `${diagnostic.kind}\u0000${diagnostic.instanceId}\u0000${diagnostic.message}`;
}

export function dedupeCreativeDiagnostics(diagnostics:readonly CreativeDiagnostic[]){
  const seen=new Set<string>();
  return diagnostics.filter(diagnostic=>{
    const key=creativeDiagnosticKey(diagnostic);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function fallbackText(diagnostic:CreativeDiagnostic){
  if(diagnostic.kind==='runtime')return 'This item is disabled for this renderer session.';
  if(diagnostic.kind==='invalid-transition')return 'This transition is preserved; preview uses a hard cut.';
  return 'This item is preserved but bypassed.';
}

export default function CreativeDiagnostics({diagnostics}:{diagnostics:readonly CreativeDiagnostic[]}){
  const [dismissed,setDismissed]=useState<Set<string>>(()=>new Set());
  const visible=dedupeCreativeDiagnostics(diagnostics).filter(diagnostic=>!dismissed.has(creativeDiagnosticKey(diagnostic)));
  if(!visible.length)return null;
  return <div className="creative-diagnostics" role="status" aria-label="Creative preview diagnostics">
    {visible.map(diagnostic=>{
      const key=creativeDiagnosticKey(diagnostic);
      return <div className={`creative-diagnostic creative-diagnostic-${diagnostic.kind}`} key={key}>
        <AlertTriangle size={16} aria-hidden="true"/>
        <div className="creative-diagnostic-copy"><strong>{diagnostic.instanceId}</strong><span>{diagnostic.message}</span><small>{fallbackText(diagnostic)}</small></div>
        <button type="button" aria-label={`Dismiss ${diagnostic.instanceId} diagnostic`} onClick={()=>setDismissed(current=>{const next=new Set(current);next.add(key);return next;})}><X size={14}/></button>
      </div>;
    })}
  </div>;
}
