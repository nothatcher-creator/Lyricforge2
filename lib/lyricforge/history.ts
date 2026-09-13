import { type Project } from './model';
export class History {
 past:Project[]=[]; future:Project[]=[]; private key='';private at=0;
 push(p:Project,key=''){if(!key||key!==this.key||Date.now()-this.at>650){this.past.push(p);if(this.past.length>100)this.past.shift();}this.key=key;this.at=Date.now();this.future=[];}
 undo(p:Project){const old=this.past.pop();if(!old)return p;this.future.push(p);this.key='';return old;}
 redo(p:Project){const next=this.future.pop();if(!next)return p;this.past.push(p);this.key='';return next;}
 clear(){this.past=[];this.future=[];this.key='';}
}
