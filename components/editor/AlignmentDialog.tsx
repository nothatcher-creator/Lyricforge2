'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Check,LoaderCircle,Music2,ShieldCheck,Sparkles,Upload} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {assets} from '@/lib/lyricforge/assets';
import {audioEngine} from '@/lib/lyricforge/audio';
import {alignLyricsToTranscript,alignmentBoundsForSelection,type LyricAlignmentResult} from '@/lib/lyricforge/lyric-alignment';
import {store,useEditor} from '@/lib/lyricforge/store';
import {DEFAULT_LOCAL_TRANSCRIPTION_MODEL,HttpTranscription,LocalWhisper,type TranscriptionProvider,type TranscriptionUpdate} from '@/lib/lyricforge/transcription';
import {Choice,Toggle} from './Controls';

export default function AlignmentDialog({clipIds,close}:{clipIds:string[];close:()=>void}){
  const {project}=useEditor();
  const targetIds=useMemo(()=>{
    const requested=new Set(clipIds);
    return project.clips
      .filter(clip=>clip.kind==='lyrics'&&store.editable(clip)&&(requested.size===0||requested.has(clip.id)))
      .sort((a,b)=>a.start-b.start||a.end-b.end)
      .map(clip=>clip.id);
  },[clipIds,project]);
  const targets=targetIds.map(id=>project.clips.find(clip=>clip.id===id)).filter((clip):clip is NonNullable<typeof clip>=>!!clip&&clip.kind==='lyrics');
  const songs=project.assets.filter(asset=>asset.type==='audio');
  const [song,setSong]=useState(songs[0]?.id||'');
  const [provider,setProvider]=useState('local');
  const [model,setModel]=useState(DEFAULT_LOCAL_TRANSCRIPTION_MODEL);
  const [endpoint,setEndpoint]=useState('');
  const [protectManual,setProtectManual]=useState(true);
  const [progress,setProgress]=useState<TranscriptionUpdate>({status:'Ready to align',progress:0});
  const [result,setResult]=useState<LyricAlignmentResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);

  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(song&&!songs.some(asset=>asset.id===song))setSong(songs[0]?.id||'');},[song,songs]);

  const run=async()=>{
    setError('');setResult(null);setBusy(true);audioEngine.pause();
    const ctrl=new AbortController();controller.current=ctrl;
    try{
      if(!targets.length)throw new Error('Add or select lyric lines before aligning.');
      const asset=songs.find(item=>item.id===song);
      const buffer=audioEngine.buffers.get(song);
      if(!asset||!buffer)throw new Error('Import a song before aligning lyrics.');
      let engine:TranscriptionProvider;
      if(provider==='local')engine=new LocalWhisper(model);
      else{
        const blob=assets.blobs.get(song);
        if(!endpoint.trim())throw new Error('Enter a transcription service URL.');
        if(!blob)throw new Error('The selected song is not available to upload.');
        engine=new HttpTranscription(endpoint,blob,asset.name);
      }
      setProgress({status:'Preparing audio…',progress:0});
      const samples=await audioEngine.mono16k(buffer);
      const recognized=await engine.transcribe(samples,update=>setProgress(update),ctrl.signal);
      if(!recognized.length)throw new Error('No usable word timing was detected. Try another model or align manually.');

      const sourceClip=store.project.clips.find(clip=>clip.kind==='audio'&&clip.assetId===song);
      const delta=(sourceClip?.start||0)-(sourceClip?.offset||0);
      const timelineWords=recognized.map(word=>({...word,start:word.start+delta,end:word.end+delta}));
      const currentTargets=targetIds
        .map(id=>store.project.clips.find(clip=>clip.id===id))
        .filter((clip):clip is NonNullable<typeof clip>=>!!clip&&clip.kind==='lyrics'&&store.editable(clip));
      const bounds=alignmentBoundsForSelection(store.project,currentTargets.map(clip=>clip.id));
      setProgress({status:'Matching your exact lyrics to the song…',progress:96});
      const aligned=alignLyricsToTranscript(currentTargets.map(clip=>({
        id:clip.id,
        text:clip.text,
        start:clip.start,
        end:clip.end,
        words:clip.words,
        protected:protectManual&&clip.timingSource==='manual',
      })),timelineWords,bounds);
      setResult(aligned);
      setProgress({status:'Alignment ready to review',progress:100});
    }catch(reason){
      if(reason instanceof Error&&reason.name==='AbortError')setProgress({status:'Alignment stopped. Nothing was changed.',progress:0});
      else setError(reason instanceof Error?reason.message:String(reason));
    }finally{setBusy(false);}
  };

  const apply=()=>{
    if(!result)return;
    store.applyLyricAlignment(result);
    const review=result.lines.find(line=>line.quality!=='good'&&!line.protected)??result.lines.find(line=>!line.protected);
    if(review)store.select([review.clipId]);
    toast(`Aligned ${result.lines.filter(line=>!line.protected).length} lyric lines without changing their words`);
    close();
  };

  return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent className="studio-dialog alignment-dialog" showCloseButton={!busy}>
    <DialogHeader>
      <div className="dialog-icon"><Sparkles/></div>
      <DialogTitle>Align Existing Lyrics</DialogTitle>
      <DialogDescription>Your lyric wording stays exactly as written. AI is used only to place those words and lines in time.</DialogDescription>
    </DialogHeader>
    {songs.length?<>
      <Choice label="Song to align against" value={song} onChange={value=>{setSong(value);setResult(null);}} options={songs.map(asset=>({label:asset.name,value:asset.id}))}/>
      <Choice label="Recognition provider" value={provider} onChange={value=>{setProvider(value);setResult(null);}} options={[{label:'On this device · no account or API key',value:'local'},{label:'Custom transcription service',value:'http'}]}/>
      {provider==='local'?<>
        <Choice label="Local speech model" value={model} onChange={value=>{setModel(value);setResult(null);}} options={[{label:'English · Base · recommended',value:'Xenova/whisper-base.en'},{label:'English · Tiny · fastest',value:'Xenova/whisper-tiny.en'},{label:'Multilingual · Base · recommended',value:'Xenova/whisper-base'},{label:'Multilingual · Tiny · fastest',value:'Xenova/whisper-tiny'}]}/>
        <p className="privacy-note"><ShieldCheck size={17}/><span>Recognition stays on this device. The transcript is temporary timing evidence; it never replaces your lyric text.</span></p>
      </>:<>
        <label className="dialog-field">Service endpoint<input aria-label="Alignment transcription service URL" type="url" placeholder="https://your-service.example/transcribe" value={endpoint} onChange={event=>{setEndpoint(event.target.value);setResult(null);}}/></label>
        <p className="privacy-note"><Upload size={17}/><span>The selected audio is sent to this service for word timestamps. Your stored lyric wording still remains authoritative.</span></p>
      </>}
      <Toggle label="Protect manually timed lyrics" checked={protectManual} onChange={value=>{setProtectManual(value);setResult(null);}}/>
      <p className="hint">{targets.length} lyric line{targets.length===1?'':'s'} selected for alignment. Protected manual lines stay fixed and help anchor nearby lyrics.</p>

      {(busy||result||error)&&<div className="transcription-progress"><div><span>{progress.status}</span><strong>{Math.round(progress.progress)}%</strong></div><Progress value={progress.progress}/></div>}
      {error&&<div className="error-box"><AlertCircle size={17}/><span>{error}</span></div>}
      {result&&<>
        <div className="alignment-quality" aria-label="Alignment quality summary">
          <div className="alignment-quality-good"><strong>{result.good}</strong><span>Good</span></div>
          <div className="alignment-quality-check"><strong>{result.check}</strong><span>Check</span></div>
          <div className="alignment-quality-uncertain"><strong>{result.uncertain}</strong><span>Uncertain</span></div>
        </div>
        {(result.check>0||result.uncertain>0)&&<div className="alignment-review"><strong>Review suggested</strong>{result.lines.filter(line=>line.quality!=='good'&&!line.protected).slice(0,8).map(line=>{
          const clip=store.project.clips.find(item=>item.id===line.clipId);
          return <div key={line.clipId}><span className={`alignment-confidence ${line.quality}`}>{line.quality==='check'?'Check':'Uncertain'}</span><span>{clip?.text||'Lyric line'}</span><small>{Math.round(line.confidence*100)}%</small></div>;
        })}</div>}
      </>}
      <div className="dialog-action-row">
        {busy?<button className="soft-button full" onClick={()=>controller.current?.abort()}>Stop alignment</button>:<button className="primary-button" disabled={!song||!targets.length||provider==='http'&&!endpoint.trim()} onClick={()=>void run()}><Sparkles size={16}/>{result?'Align again':'Analyze & align'}</button>}
        {result&&!busy&&<button className="primary-button" onClick={apply}><Check size={16}/>Apply alignment</button>}
      </div>
    </>:<div className="empty-state"><Music2 size={32}/><p>Import a song in the Media panel before aligning lyrics.</p></div>}
  </DialogContent></Dialog>;
}
