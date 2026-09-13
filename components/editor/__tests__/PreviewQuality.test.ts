import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

function source(path:string){return readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');}

describe('creative preview quality wiring',()=>{
  it('persists only Low or High preview quality and passes it into Preview',()=>{
    const editor=source('components/editor/Editor.tsx');
    expect(editor).toContain("creativePreviewQuality");
    expect(editor).toContain("loadSetting");
    expect(editor).toContain("saveSetting");
    expect(editor).toMatch(/<Preview[\s\S]*quality=\{creativePreviewQuality\}/);
  });

  it('renders exact quality labels and forwards quality into Renderer.draw',()=>{
    const preview=source('components/editor/Preview.tsx');
    expect(preview).toContain('Low — faster editing');
    expect(preview).toContain('High — closer to export');
    expect(preview).toContain('preview-low');
    expect(preview).toContain('preview-high');
    expect(preview).toMatch(/render\.draw\(el,state\.project,t,\{[\s\S]*quality:state\.quality/);
  });

  it('includes quality in draw-cache invalidation so changes redraw immediately',()=>{
    const preview=source('components/editor/Preview.tsx');
    expect(preview).toContain('lastQuality');
    expect(preview).toMatch(/lastQuality!==state\.quality/);
  });
});
