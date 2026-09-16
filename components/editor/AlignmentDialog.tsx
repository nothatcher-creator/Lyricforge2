'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Check,Music2,ShieldCheck,Sparkles,Upload} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {assets} from '@/lib/lyricforge/assets';
import {audioEngine} from '@/lib/lyricforge/audio';
import {analyzeAlignmentAudio,buildFocusedRelistenWindows,shiftAudioAlignmentFeatures,type AudioAlignmentFeatures,type AlignmentWindow} from '@/lib/lyricforge/audio-alignment';
import {alignLyricsToTranscript,alignmentBoundsForSelection,alignmentTargetClipIds,type AlignmentInputLine,type AlignmentReason,type LyricAlignmentResult} from '@/lib/lyricforge/lyric-alignment';
import {store,useEditor} from '@/lib/lyricforge/store';
import {DEFAULT_LOCAL_TRANSCRIPTION_MODEL,HttpTranscription,LocalWhisper,normalizeTranscribedWords,type TranscriptionProvider,type TranscriptionUpdate} from '@/lib/lyricforge/transcription';
import {Choice,Toggle} from './Controls';

const reasonLabel=(reason?:AlignmentReason)=>reason==='audio-assisted'?'Audio assisted':reason==='weak-recognition'?'Weak recognition':reason==='protected-anchor'?'Protected anchor':'Text anchored';

function concatenateWindows(samples:Float32Array,windows:readonly AlignmentWindow[],sampleRate=16000){
  const segments=windows.map(window=>{
    const startSample=Math.max(0,Math.floor(window.start/1000*sampleRate));
    const endSample=Math.min(samples.length,Math.ceil(window.end/1000*sampleRate));
    return {window,startSample,endSample,length:Math.max(0,endSample-startSample)};
  }).filter(segment=>segment.length>0);
  const output=new Float32Array(segments.reduce((total,segment)=>total+segment.length,0));
  let cursor=0;
  const map:{concatStartMs:number;concatEndMs:number;sourceStartMs:number}[]=[];
  for(const segment of segments){
    output.set(samples.subarray(segment.startSample,segment.endSample),cursor);
    const concatStartMs=cursor/sampleRate*1000;
    cursor+=segment.length;
    map.push({concatStartMs,concatEndMs:cursor/sampleRate*1000,sourceStartMs:segment.window.start});
  }
  return {samples:output,map};
}

export default function AlignmentDialog({clipIds,close}:{clipIds:string[];close:()=>void}){
  const {project,selected}=useEditor();
  const targetIds=useMemo(()=>alignmentTargetClipIds(project,selected,clipIds),[clipIds,project,selected]);
  const targets=targetIds.map(id=>project.clips.find(clip=>clip.id===id)).filter((clip):clip is NonNullable<typeof clip>=>!!clip&&clip.kind==='lyrics');
  const songs=project.assets.filter(asset=>asset.type==='audio');
  const [song,setSong]=useState(songs[0]?.id||'');
  const [provider,setProvider]=useState('local');
  const [model,setModel]=useState(DEFAULT_LOCAL_TRANSCRIPTION_MODEL);
  const [endpoint,setEndpoint]=useState('');
  const [protectManual,setProtectManual]=useState(true);
  const [audioAware,setAudioAware]=useState(true);
  const [progress,setProgress]=useState<TranscriptionUpdate>({status:'Ready to align',progress:0});
  const [result,setResult]=useState<LyricAlignmentResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [warning,setWarning]=useState('');
  const controller=useRef<AbortController|null>(null);

  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(song&&!songs.some(asset=>asset.id===song))setSong(songs[0]?.id||'');},[song,songs]);

  const run=async()=>{
    setError('');setWarning('');setResult(null);setBusy(true);audioEngine.pause();
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
      let rawFeatures:AudioAlignmentFeatures|undefined;
      if(audioAware){
        setProgress({status:'Listening for vocal timing…',progress:8});
        try{rawFeatures=analyzeAlignmentAudio(samples,16000);}
        catch{setWarning('Waveform timing analysis was unavailable. Alignment will use recognized word timing only.');}
      }

      setProgress({status:'Recognizing words…',progress:15});
      let recognized=await engine.transcribe(samples.slice(),update=>setProgress({status:update.status,progress:15+update.progress*.72}),ctrl.signal);
      if(!recognized.length)throw new Error('No usable word timing was detected. Try another model or align manually.');

      const sourceClip=store.project.clips.find(clip=>clip.kind==='audio'&&clip.assetId===song);
      const delta=(sourceClip?.start||0)-(sourceClip?.offset||0);
      const timelineFeatures=rawFeatures?shiftAudioAlignmentFeatures(rawFeatures,delta):undefined;
      const currentTargets=targetIds
        .map(id=>store.project.clips.find(clip=>clip.id===id))
        .filter((clip):clip is NonNullable<typeof clip>=>!!clip&&clip.kind==='lyrics'&&store.editable(clip));
      const lineInputs=():AlignmentInputLine[]=>currentTargets.map(clip=>({
        id:clip.id,text:clip.text,start:clip.start,end:clip.end,words:clip.words,
        protected:protectManual&&clip.timingSource==='manual',
      }));
      const bounds=alignmentBoundsForSelection(store.project,currentTargets.map(clip=>clip.id));
      const toTimeline=(words:typeof recognized)=>words.map(word=>({...word,start:word.start+delta,end:word.end+delta}));
      let timelineWords=toTimeline(recognized);

      setProgress({status:'Matching your exact lyrics to the song…',progress:90});
      let aligned=alignLyricsToTranscript(lineInputs(),timelineWords,bounds,{audioAware:audioAware&&!!timelineFeatures,audioFeatures:timelineFeatures});

      if(provider==='local'&&audioAware){
        const uncertain=aligned.lines.filter(line=>!line.protected&&line.quality!=='good');
        if(uncertain.length){
          const durationMs=samples.length/16000*1000;
          const windows=buildFocusedRelistenWindows(uncertain.map(line=>({start:line.start-delta,end:line.end-delta})),durationMs);
          const focused=concatenateWindows(samples,windows);
          if(focused.samples.length){
            setProgress({status:'Re-listening to uncertain sections…',progress:94});
            const relistenEngine=new LocalWhisper(model);
            const relisten=await relistenEngine.transcribe(focused.samples,()=>setProgress({status:'Re-listening to uncertain sections…',progress:96}),ctrl.signal);
            const remapped=relisten.flatMap(word=>{
              const middle=(word.start+word.end)/2;
              const segment=focused.map.find(item=>middle>=item.concatStartMs&&middle<item.concatEndMs);
              if(!segment)return [];
              const sourceOffset=segment.sourceStartMs-segment.concatStartMs;
              return [{...word,start:word.start+sourceOffset,end:word.end+sourceOffset}];
            });
            recognized=normalizeTranscribedWords([...recognized,...remapped]);
            timelineWords=toTimeline(recognized);
            aligned=alignLyricsToTranscript(lineInputs(),timelineWords,bounds,{audioAware:!!timelineFeatures,audioFeatures:timelineFeatures});
          }
        }
      }

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
      <DialogDescription>Your lyric wording stays exactly as written. AI and song audio are used only to place those words and lines in time.</DialogDescription>
    </DialogHeader>
    {songs.length?<>
      <Choice label="Song to align against" value={song} onChange={value=>{setSong(value);setResult(null);}} options={songs.map(asset=>({label:asset.name,value:asset.id}))}/>
      <Choice label="Recognition provider" value={provider} onChange={value=>{setProvider(value);setResult(null);}} options={[{label:'On this device · no account or API key',value:'local'},{label:'Custom transcription service',value:'http'}]}/>
      {provider==='local'?<>
        <Choice label="Local speech model" value={model} onChange={value=>{setModel(value);setResult(null);}} options={[{label:'English · Base · recommended',value:'Xenova/whisper-base.en'},{label:'English · Tiny · fastest',value:'Xenova/whisper-tiny.en'},{label:'Multilingual · Base · recommended',value:'Xenova/whisper-base'},{label:'Multilingual · Tiny · fastest',value:'Xenova/whisper-tiny'}]}/>
        <p className="privacy-note"><ShieldCheck size={17}/><span>Recognition stays on this device. Weak sections may be re-listened to locally; the temporary transcript never replaces your lyric text.</span></p>
      </>:<>
        <label className="dialog-field">Service endpoint<input aria-label="Alignment transcription service URL" type="url" placeholder="https://your-service.example/transcribe" value={endpoint} onChange={event=>{setEndpoint(event.target.value);setResult(null);}}/></label>
        <p className="privacy-note"><Upload size={17}/><span>The selected audio is sent once to this service for word timestamps. Audio-aware waveform refinement still happens locally.</span></p>
      </>}
      <Toggle label="Audio-aware refinement" checked={audioAware} onChange={value=>{setAudioAware(value);setResult(null);}}/>
      <Toggle label="Protect manually timed lyrics" checked={protectManual} onChange={value=>{setProtectManual(value);setResult(null);}}/>
      <p className="hint">{targets.length} lyric line{targets.length===1?'':'s'} selected. Protected manual lines stay fixed and can anchor the lyrics around them; audio-aware refinement listens for audible phrase and syllable changes when recognition misses words.</p>

      {(busy||result||error||warning)&&<div className="transcription-progress"><div><span>{progress.status}</span><strong>{Math.round(progress.progress)}%</strong></div><Progress value={progress.progress}/></div>}
      {warning&&<div className="catalog-notice" role="status"><AlertCircle size={17}/><span>{warning}</span></div>}
      {error&&<div className="error-box"><AlertCircle size={17}/><span>{error}</span></div>}
      {result&&<>
        <div className="alignment-quality" aria-label="Alignment quality summary">
          <div className="alignment-quality-good"><strong>{result.good}</strong><span>Good</span></div>
          <div className="alignment-quality-check"><strong>{result.check}</strong><span>Check</span></div>
          <div className="alignment-quality-uncertain"><strong>{result.uncertain}</strong><span>Uncertain</span></div>
        </div>
        <div className="alignment-review"><strong>{result.check||result.uncertain?'Review suggested':'Alignment evidence'}</strong>{result.lines.filter(line=>!line.protected||line.reason==='protected-anchor').slice(0,10).map(line=>{
          const clip=store.project.clips.find(item=>item.id===line.clipId);
          return <div key={line.clipId}><span className={`alignment-confidence ${line.quality}`}>{line.quality==='check'?'Check':line.quality==='uncertain'?'Uncertain':'Good'}</span><span>{clip?.text||'Lyric line'}</span><small>{reasonLabel(line.reason)} · {Math.round(line.confidence*100)}%</small></div>;
        })}</div>
      </>}
      <div className="dialog-action-row">
        {busy?<button className="soft-button full" onClick={()=>controller.current?.abort()}>Stop alignment</button>:<button className="primary-button" disabled={!song||!targets.length||provider==='http'&&!endpoint.trim()} onClick={()=>void run()}><Sparkles size={16}/>{result?'Align again':'Analyze & align'}</button>}
        {result&&!busy&&<button className="primary-button" onClick={apply}><Check size={16}/>Apply alignment</button>}
      </div>
    </>:<div className="empty-state"><Music2 size={32}/><p>Import a song in the Media panel before aligning lyrics.</p></div>}
  </DialogContent></Dialog>;
}