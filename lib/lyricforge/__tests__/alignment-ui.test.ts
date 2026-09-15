import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const lyrics=read('components/editor/LyricPanel.tsx');
const transitions=read('components/editor/TimelineTransitions.tsx');
const portraitCss=read('app/mobile-portrait.css');
let alignmentDialog='';
try{alignmentDialog=read('components/editor/AlignmentDialog.tsx');}catch{}

describe('Align Existing Lyrics workflow',()=>{
  it('keeps Auto Detect Lyrics and adds a separate alignment entry point',()=>{
    expect(lyrics).toContain('Auto Detect Lyrics');
    expect(lyrics).toContain('Align Existing Lyrics');
    expect(lyrics).toContain('AlignmentDialog');
  });

  it('offers alignment immediately after the existing paste flow adds new lyric clips',()=>{
    expect(lyrics).toContain('recentlyPasted');
    expect(lyrics).toContain('Align now');
    expect(lyrics).toContain('new lines added');
  });

  it('uses the existing recognition providers and protects manual timing by default',()=>{
    expect(alignmentDialog).toContain('Align Existing Lyrics');
    expect(alignmentDialog).toContain('DEFAULT_LOCAL_TRANSCRIPTION_MODEL');
    expect(alignmentDialog).toContain('LocalWhisper');
    expect(alignmentDialog).toContain('HttpTranscription');
    expect(alignmentDialog).toContain('Protect manually timed lyrics');
    expect(alignmentDialog).toMatch(/useState\(true\)/);
    expect(alignmentDialog).toContain('applyLyricAlignment');
  });

  it('shows Good Check and Uncertain review states before apply',()=>{
    expect(alignmentDialog).toContain('Good');
    expect(alignmentDialog).toContain('Check');
    expect(alignmentDialog).toContain('Uncertain');
    expect(alignmentDialog).toContain('Apply alignment');
  });

  it('keeps low-confidence alignment visible after the dialog closes',()=>{
    expect(lyrics).toContain('alignmentQuality');
    expect(lyrics).toContain('alignment-confidence');
    expect(transitions).toContain('alignmentQuality');
    expect(transitions).toContain('alignment-flag');
  });

  it('keeps the alignment dialog usable on phone portrait',()=>{
    expect(portraitCss).toContain('.alignment-dialog');
    expect(portraitCss).toContain('.alignment-quality');
  });
});
