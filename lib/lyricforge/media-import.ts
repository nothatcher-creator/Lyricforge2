import {makeClip,makeTrack,type Asset,type Project} from './model';

export const DEMO_AUDIO_NAME='Golden hour — instrumental demo.wav';

type AnalysisWorkerLike={terminate:()=>void};

export function isCurrentPrimaryAudioAsset(project:Project,assetId:string):boolean{
  const track=project.tracks.find(item=>item.kind==='audio'&&!item.locked);
  if(!track)return false;
  return project.clips.some(item=>item.kind==='audio'&&item.trackId===track.id&&item.assetId===assetId);
}

export function supersedeAnalysisWorker<T extends AnalysisWorkerLike>(previous:T|null,next:T):T{
  previous?.terminate();
  return next;
}

export function activeProcessingLabel(blocking:string,analysis:string):string{
  return blocking||analysis;
}

export function replacePrimaryAudioProject(project:Project,asset:Asset):Project{
  if(asset.type!=='audio'||!asset.duration)throw new Error('Primary audio replacement requires a decoded audio asset.');

  let track=project.tracks.find(item=>item.kind==='audio'&&!item.locked);
  const created=!track;
  if(!track)track=makeTrack('audio','Song');

  const demoIds=new Set(project.assets.filter(item=>item.type==='audio'&&item.name===DEMO_AUDIO_NAME).map(item=>item.id));
  const clip=makeClip('audio',track.id,0,Math.round(asset.duration),asset.name);
  clip.assetId=asset.id;
  clip.loop=false;

  const assets=[...project.assets.filter(item=>!demoIds.has(item.id)&&item.id!==asset.id),asset];
  const clips=[
    ...project.clips.filter(item=>item.trackId!==track.id&&!demoIds.has(item.assetId??'')),
    clip,
  ];

  return {
    ...project,
    name:project.name==='Golden hour'||project.name==='Untitled session'?asset.name.replace(/\.[^.]+$/,''):project.name,
    assets,
    tracks:created?[...project.tracks,track]:project.tracks,
    clips,
    duration:Math.round(asset.duration),
    waveform:[],
    energy:[],
    spectrum:[],
    beats:[],
    bpm:0,
    sections:[],
  };
}
