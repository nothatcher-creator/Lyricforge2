import {describe,expect,it} from 'vitest';
import {replacePrimaryAudioProject} from '../media-import';
import {createProject,makeClip,makeTrack,type Asset} from '../model';

const DEMO_NAME='Golden hour — instrumental demo.wav';

function audioAsset(id:string,name:string,duration:number):Asset{
  return {id,name,type:'audio',mime:'audio/wav',size:100,duration};
}

describe('replacePrimaryAudioProject',()=>{
  it('replaces the demo song without deleting lyrics, text, or visual layers',()=>{
    let project=createProject('Golden hour');
    const audioTrack=project.tracks.find(track=>track.kind==='audio')!;
    const lyricTrack=project.tracks.find(track=>track.kind==='lyrics')!;
    const textTrack=makeTrack('text','Song title');
    const visualTrack=makeTrack('visualizer','Audio glow');
    const demo=audioAsset('demo-audio',DEMO_NAME,24000);
    const demoClip=makeClip('audio',audioTrack.id,0,24000,demo.name);demoClip.id='demo-clip';demoClip.assetId=demo.id;demoClip.loop=false;
    const lyric=makeClip('lyrics',lyricTrack.id,0,4000,'Keep these lyrics');lyric.id='lyrics-clip';
    const title=makeClip('text',textTrack.id,0,24000,'KEEP THIS TITLE');title.id='title-clip';
    const visual=makeClip('visualizer',visualTrack.id,0,24000);visual.id='visual-clip';
    project={...project,assets:[demo],tracks:[textTrack,...project.tracks,visualTrack],clips:[demoClip,lyric,title,visual],duration:24000};

    const song=audioAsset('real-audio','my-song.wav',93000);
    const next=replacePrimaryAudioProject(project,song);

    expect(next.assets.map(asset=>asset.id)).toContain(song.id);
    expect(next.assets.map(asset=>asset.id)).not.toContain(demo.id);
    expect(next.clips.map(clip=>clip.id)).toEqual(expect.arrayContaining(['lyrics-clip','title-clip','visual-clip']));
    expect(next.tracks.map(track=>track.id)).toEqual(expect.arrayContaining([lyricTrack.id,textTrack.id,visualTrack.id,audioTrack.id]));
    expect(next.clips.some(clip=>clip.assetId===demo.id)).toBe(false);
    const imported=next.clips.find(clip=>clip.assetId===song.id);
    expect(imported?.kind).toBe('audio');
    expect(imported?.trackId).toBe(audioTrack.id);
    expect(imported?.start).toBe(0);
    expect(imported?.end).toBe(93000);
    expect(next.duration).toBe(93000);
  });

  it('replaces only the primary audio-track clip in a normal project',()=>{
    let project=createProject('Existing video');
    const audioTrack=project.tracks.find(track=>track.kind==='audio')!;
    const lyricTrack=project.tracks.find(track=>track.kind==='lyrics')!;
    const old=audioAsset('old-audio','old.wav',20000);
    const oldClip=makeClip('audio',audioTrack.id,0,20000,old.name);oldClip.assetId=old.id;
    const lyric=makeClip('lyrics',lyricTrack.id,0,3000,'Do not delete me');lyric.id='keep-lyric';
    project={...project,assets:[old],clips:[oldClip,lyric],duration:20000};

    const song=audioAsset('new-audio','new.wav',45000);
    const next=replacePrimaryAudioProject(project,song);

    expect(next.clips.some(clip=>clip.id==='keep-lyric')).toBe(true);
    expect(next.clips.filter(clip=>clip.trackId===audioTrack.id)).toHaveLength(1);
    expect(next.clips.find(clip=>clip.trackId===audioTrack.id)?.assetId).toBe(song.id);
    expect(next.assets.map(asset=>asset.id)).toEqual(expect.arrayContaining([old.id,song.id]));
  });
});
