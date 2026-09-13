export type WorkspaceMode='phone-portrait'|'compact'|'desktop';
export interface WorkspacePanels{left:boolean;right:boolean}
export type WorkspacePanelAction='initialize'|'library'|'inspector';
export function classifyWorkspace(width:number,height:number,coarsePointer:boolean):WorkspaceMode{
  if(width<=760&&height>width&&coarsePointer)return 'phone-portrait';
  if(width<1100||coarsePointer)return 'compact';
  return 'desktop';
}
export function resolveWorkspacePanels(mode:WorkspaceMode,current:WorkspacePanels,action:WorkspacePanelAction,open=true):WorkspacePanels{
  if(mode!=='phone-portrait'){
    if(action==='initialize')return current;
    return action==='library'?{...current,left:open}:{...current,right:open};
  }
  if(action==='initialize')return {left:false,right:false};
  if(action==='library')return open?{left:true,right:false}:{...current,left:false};
  return open?{left:false,right:true}:{...current,right:false};
}
