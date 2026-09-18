// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createProject,makeClip} from '@/lib/lyricforge/model';
import {store} from '@/lib/lyricforge/store';
import LyricPanel from '../LyricPanel';

const audioMock=vi.hoisted(()=>({
 time:vi.fn(()=>0),
 seek:vi.fn(),
 subscribe:vi.fn(()=>()=>{}),
}));
vi.mock('@/lib/lyricforge/audio',()=>({audioEngine:audioMock}));
vi.mock('../AlignmentDialog',()=>({
 default:({clipIds}:{clipIds:string[]})=><div data-testid="alignment-dialog">{clipIds.join('|')}</div>,
}));

afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('LyricPanel alignment scope',()=>{
 it('uses a manually timed selected lyric as an anchor for the surrounding lyric track',async()=>{
  const user=userEvent.setup();
  const project=createProject('manual anchor');
  const track=project.tracks.find(item=>item.kind==='lyrics')!;
  const before=makeClip('lyrics',track.id,0,1000,'before');
  const anchor={...makeClip('lyrics',track.id,1500,2300,'manual anchor'),timingSource:'manual' as const};
  const after=makeClip('lyrics',track.id,2800,3800,'after');
  project.clips=[before,anchor,after];
  store.setProject(project);
  store.select([anchor.id]);

  render(<LyricPanel onAuto={()=>{}} onPaste={()=>{}} onImport={()=>{}}/>);
  await user.click(screen.getByRole('button',{name:/Align Existing Lyrics/i}));

  expect(screen.getByTestId('alignment-dialog').textContent).toBe([before.id,anchor.id,after.id].join('|'));
 });
});
