import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const timeline=readFileSync('components/editor/Timeline.tsx','utf8');
const transitions=readFileSync('components/editor/TimelineTransitions.tsx','utf8');
const mobileCssPath='app/mobile-portrait.css';
const css=readFileSync('app/globals.css','utf8')+(existsSync(mobileCssPath)?readFileSync(mobileCssPath,'utf8'):'');

describe('mobile timeline ergonomics',()=>{
  it('exposes stable hooks for the scroll surface, trim handles, and transition handle',()=>{
    expect(timeline).toContain('data-timeline-scroller');
    expect(timeline).toContain('data-clip-handle="start"');
    expect(timeline).toContain('data-clip-handle="end"');
    expect(transitions).toContain('data-transition-handle');
  });
  it('uses touch-sized clips, trim targets, and transition controls in portrait mode',()=>{
    expect(css).toContain('.mode-phone-portrait .timeline-clip{top:4px;height:42px');
    expect(css).toContain('.mode-phone-portrait [data-clip-handle]{width:18px');
    expect(css).toContain('.mode-phone-portrait .timeline-toolbar{overflow-x:auto');
    expect(css).toMatch(/\[data-transition-handle\]\{[^}]*min-height:\s*36px/);
  });
  it('classifies small touch movement as a tap and directional movement as timeline panning',async()=>{
    const modulePath='../timeline-interaction';
    const interaction=await import(modulePath).catch(()=>({}));
    const classify=(interaction as {classifyTimelineTouchGesture?:(dx:number,dy:number)=>string}).classifyTimelineTouchGesture;
    expect(classify).toBeTypeOf('function');
    expect(classify!(3,4)).toBe('tap');
    expect(classify!(24,5)).toBe('pan-x');
    expect(classify!(5,24)).toBe('pan-y');
  });
  it('lets a one-finger lane drag become timeline scrolling before a touch seek is committed',()=>{
    expect(timeline).toContain('classifyTimelineTouchGesture');
    expect(timeline).toContain("e.pointerType==='touch'");
    expect(css).toContain('.mode-phone-portrait .track-lane{touch-action:pan-x pan-y');
  });
  it('lets vertical touch gestures that begin on clips scroll lower tracks without seeking on pointer cancel',async()=>{
    const modulePath='../timeline-interaction';
    const interaction=await import(modulePath).catch(()=>({}));
    const shouldCommit=(interaction as {shouldCommitTimelineClipTap?:(eventType:string,moved:boolean)=>boolean}).shouldCommitTimelineClipTap;
    expect(shouldCommit).toBeTypeOf('function');
    expect(shouldCommit!('pointerup',false)).toBe(true);
    expect(shouldCommit!('pointerup',true)).toBe(false);
    expect(shouldCommit!('pointercancel',false)).toBe(false);
    expect(css).toContain('.mode-phone-portrait .timeline-clip{top:4px;height:42px;touch-action:pan-y');
  });
  it('gives portrait sheets more room and lets nested menu tabs scroll instead of squeezing',()=>{
    expect(css).toContain('.mode-phone-portrait .library-panel{');
    expect(css).toContain('height:min(68dvh,640px)');
    expect(css).toContain('.mode-phone-portrait .inspector-container{');
    expect(css).toContain('height:min(62dvh,600px)');
    expect(css).toContain('.mode-phone-portrait .panel-tabs{overflow-x:auto');
    expect(css).toContain('flex:0 0 auto!important;min-width:88px');
  });
});
