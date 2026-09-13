export type WorkspaceMode='phone-portrait'|'compact'|'desktop';
export function classifyWorkspace(width:number,height:number,coarsePointer:boolean):WorkspaceMode{
  if(width<=760&&height>width&&coarsePointer)return 'phone-portrait';
  if(width<1100||coarsePointer)return 'compact';
  return 'desktop';
}
