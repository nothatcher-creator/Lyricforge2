'use client';
import {assets} from './assets';
import type {Clip} from './model';

/** Each renderer owns its decoders, so preview seeking cannot disturb export. */
export class VideoPool {
  private entries=new Map<string,{assetId:string;video:HTMLVideoElement;ready:Promise<void>}>();
  get(clip:Clip){
    const existing=this.entries.get(clip.id);
    if(existing?.assetId===clip.assetId)return existing;
    if(existing){existing.video.pause();existing.video.removeAttribute('src');existing.video.load();}
    const src=assets.urls.get(clip.assetId??'');
    if(!src)return null;
    const video=document.createElement('video');
    video.preload='auto';video.muted=true;video.playsInline=true;
    const ready=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('The background video took too long to load.')),20000);
      const finish=(error?:Error)=>{clearTimeout(timer);video.onloadeddata=null;video.onerror=null;error?reject(error):resolve();};
      video.onloadeddata=()=>finish();
      video.onerror=()=>finish(new Error('This browser cannot decode the background video.'));
    });
    void ready.catch(()=>{});
    video.src=src;
    const entry={assetId:clip.assetId!,video,ready};
    this.entries.set(clip.id,entry);
    return entry;
  }
  prune(ids:Set<string>){for(const [id,e] of this.entries)if(!ids.has(id)){e.video.pause();e.video.removeAttribute('src');e.video.load();this.entries.delete(id);}}
  dispose(){this.prune(new Set());}
}
