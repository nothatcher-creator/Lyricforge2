import {clamp,lyricClips,retime,type Project} from './model';

/** Keeps the original line order while tap timing crosses estimated boundaries. */
export class TapSynchronizer {
  private projectId='';
  private order:string[]=[];
  private next='';

  tap(project:Project,selected:string[],playhead:number){
    const lines=lyricClips(project);
    const current=lines.find(c=>selected.includes(c.id))??lines[0];
    if(!current||project.tracks.find(t=>t.id===current.trackId)?.locked)return null;
    if(this.projectId!==project.id||current.id!==this.next){
      this.projectId=project.id;
      this.order=lines.map(c=>c.id);
    }
    const index=this.order.indexOf(current.id);
    const nextId=this.order[index+1];
    const nextLine=lines.find(c=>c.id===nextId);
    const time=Math.round(clamp(playhead,0,project.duration-10));
    const end=Math.min(project.duration,Math.max(time+500,nextLine?.start??project.duration));
    const previousId=this.order[index-1];
    const clips=project.clips.map(c=>{
      if(project.tracks.find(t=>t.id===c.trackId)?.locked)return c;
      if(c.id===current.id)return {...retime(c,time,Math.max(time+10,end)),timingSource:'manual' as const};
      if(c.id===previousId&&time>c.start)return {...retime(c,c.start,time),timingSource:'manual' as const};
      return c;
    });
    this.next=nextId??'';
    return {project:{...project,clips},nextId};
  }
}
