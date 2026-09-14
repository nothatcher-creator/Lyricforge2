import type {Clip} from './model';
export interface PreviewBound{id:string;x:number;y:number;width:number;height:number}
export function pickTextBound(bounds:PreviewBound[],clips:Pick<Clip,'id'|'kind'>[],x:number,y:number,previousId?:string):PreviewBound|null{
  const textIds=new Set(clips.filter(c=>c.kind==='lyrics'||c.kind==='text').map(c=>c.id));
  const hits=[...bounds].reverse().filter(b=>textIds.has(b.id)&&x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height);
  if(!hits.length)return null;
  if(!previousId)return hits[0];
  const index=hits.findIndex(b=>b.id===previousId);
  return index<0?hits[0]:hits[(index+1)%hits.length];
}

export function shouldStartInlineEdit(previousId:string|undefined,previousAt:number,currentId:string,now:number,threshold=360):boolean{
  return previousId===currentId&&now>=previousAt&&now-previousAt<=threshold;
}

export function shouldOpenPreviewProperties(pointerType:string,elapsed:number,movement:number,threshold=520,tolerance=10):boolean{
  return (pointerType==='touch'||pointerType==='pen')&&elapsed>=threshold&&movement<=tolerance;
}
