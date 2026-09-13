import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const timeline=readFileSync('components/editor/Timeline.tsx','utf8');
const transitions=readFileSync('components/editor/TimelineTransitions.tsx','utf8');
const css=readFileSync('app/globals.css','utf8');
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
    expect(css).toMatch(/\[data-transition-handle\]\{[^}]*min-height:\s*36px/s);
  });
});
