import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {createProject,makeClip,makeTrack} from '../model';
import {Renderer} from '../renderer';

function project(){
  const p=createProject('renderer');
  const track=makeTrack('text','Text');
  const a=makeClip('text',track.id,0,1000,'A');a.id='a';
  const b=makeClip('text',track.id,1000,2000,'B');b.id='b';
  a.effects=[{id:'fx',assetId:'builtin.effect.glow',version:'1.0.0',enabled:true,params:{intensity:.5},keyframes:{}}];
  p.tracks=[track];p.clips=[a,b];
  p.transitions=[{id:'tr',assetId:'builtin.transition.crossfade',version:'1.0.0',outgoingItemId:'a',incomingItemId:'b',durationMs:400,easing:'linear',params:{}}];
  return p;
}

describe('Renderer creative frame adapter',()=>{
  it('records editor overlay last in preview',()=>{
    const renderer=new Renderer();
    const preview=renderer.recordFrame(project(),1000,{quality:'preview-high'});
    expect(preview.operations.at(-1)).toBe('editor:overlay');
    expect(preview.plan.quality).toBe('preview-high');
  });

  it('forces export quality and omits editor overlays',()=>{
    const renderer=new Renderer();
    const exported=renderer.recordFrame(project(),1000,{export:true,quality:'preview-low'});
    expect(exported.operations).not.toContain('editor:overlay');
    expect(exported.plan.quality).toBe('export');
  });

  it('validates creative references before hardware encoder initialization',()=>{
    const source=readFileSync(resolve(process.cwd(),'lib/lyricforge/exporter.ts'),'utf8');
    expect(source).toContain("import {validateCreativeProject} from './creative-runtime'");
    expect(source).toContain('validateCreativeProject(project)');
    const renderVideoStart=source.indexOf('export async function renderVideo');
    const renderVideoSource=source.slice(renderVideoStart);
    const validation=renderVideoSource.indexOf('assertCreativeExportReady(project)');
    const encoderImport=renderVideoSource.indexOf("await import('mediabunny')");
    expect(validation).toBeGreaterThan(-1);
    expect(encoderImport).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(encoderImport);
  });

  it('forces the same export-quality renderer in both export paths',()=>{
    const hardware=readFileSync(resolve(process.cwd(),'lib/lyricforge/exporter.ts'),'utf8');
    const software=readFileSync(resolve(process.cwd(),'lib/lyricforge/software-exporter.ts'),'utf8');
    expect(hardware).toContain("renderer.draw(canvas,p,time,{export:true,quality:'export'})");
    expect(software).toContain("renderer.draw(canvas,p,time,{export:true,quality:'export'})");
  });
});
