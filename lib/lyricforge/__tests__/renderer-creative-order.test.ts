import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
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

type TraceEntry=[string,...unknown[]];
const canvasTrace:TraceEntry[]=[];
let nextCanvasId=0;
class TestGradient{addColorStop(){}}
class TestContext{
  globalAlpha=1;globalCompositeOperation='source-over';filter='none';fillStyle='#000';strokeStyle='#000';lineWidth=1;
  shadowColor='transparent';shadowBlur=0;shadowOffsetX=0;shadowOffsetY=0;imageSmoothingEnabled=true;
  constructor(readonly canvas:TestCanvas){}
  save(){canvasTrace.push(['save',this.canvas.id]);}
  restore(){canvasTrace.push(['restore',this.canvas.id]);}
  setTransform(...args:number[]){canvasTrace.push(['setTransform',this.canvas.id,...args]);}
  clearRect(...args:number[]){canvasTrace.push(['clearRect',this.canvas.id,...args]);}
  scale(...args:number[]){canvasTrace.push(['scale',this.canvas.id,...args]);}
  translate(...args:number[]){canvasTrace.push(['translate',this.canvas.id,...args]);}
  rotate(...args:number[]){canvasTrace.push(['rotate',this.canvas.id,...args]);}
  beginPath(){canvasTrace.push(['beginPath',this.canvas.id]);}
  rect(...args:number[]){canvasTrace.push(['rect',this.canvas.id,...args]);}
  clip(){canvasTrace.push(['clip',this.canvas.id]);}
  fillRect(...args:number[]){canvasTrace.push(['fillRect',this.canvas.id,...args]);}
  strokeRect(...args:number[]){canvasTrace.push(['strokeRect',this.canvas.id,...args]);}
  createLinearGradient(){return new TestGradient();}
  createRadialGradient(){return new TestGradient();}
  drawImage(source:unknown,...args:unknown[]){canvasTrace.push(['drawImage',this.canvas.id,source instanceof TestCanvas?source.id:'source',this.filter,this.globalAlpha,...args]);}
  getImageData(){return {data:new Uint8ClampedArray(this.canvas.width*this.canvas.height*4),width:this.canvas.width,height:this.canvas.height};}
  putImageData(){canvasTrace.push(['putImageData',this.canvas.id]);}
}
class TestCanvas{
  readonly id=`canvas-${nextCanvasId++}`;
  private readonly context=new TestContext(this);
  constructor(public width:number,public height:number){}
  getContext(){return this.context;}
}

const previousOffscreen=globalThis.OffscreenCanvas;
beforeEach(()=>{canvasTrace.length=0;nextCanvasId=0;(globalThis as unknown as {OffscreenCanvas:typeof TestCanvas}).OffscreenCanvas=TestCanvas;});
afterEach(()=>{if(previousOffscreen)(globalThis as unknown as {OffscreenCanvas:typeof OffscreenCanvas}).OffscreenCanvas=previousOffscreen;else delete (globalThis as unknown as {OffscreenCanvas?:unknown}).OffscreenCanvas;});

function temporalProject(){
  const p=createProject('temporal');
  p.width=100;p.height=50;p.duration=3000;p.fps=30;p.tracks=[];p.clips=[];p.transitions=[];
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

  it('posterize time redraws the earlier stack prefix at the quantized timeline time',()=>{
    const p=temporalProject();
    p.masterEffects=[
      {id:'brightness',assetId:'builtin.effect.brightness',version:'1.0.0',enabled:true,params:{amount:1.2},keyframes:{}},
      {id:'posterize',assetId:'builtin.effect.posterize-time',version:'1.0.0',enabled:true,params:{fps:10},keyframes:{}},
      {id:'contrast',assetId:'builtin.effect.contrast',version:'1.0.0',enabled:true,params:{amount:1.1},keyframes:{}},
    ];
    const renderer=new Renderer();
    const sampled:number[]=[];
    renderer.background=(ctx,project,time)=>{sampled.push(time);ctx.fillRect(0,0,project.width,project.height);};
    renderer.draw(new TestCanvas(100,50) as unknown as OffscreenCanvas,p,150,{export:true,quality:'export'});
    expect(sampled).toContain(150);
    expect(sampled).toContain(100);
    expect(renderer.creativeDiagnostics.find(item=>item.instanceId==='posterize'&&item.kind==='runtime')).toBeUndefined();
  });

  it('echo redraws historical samples with the earlier transform prefix applied to each trail',()=>{
    const p=temporalProject();
    p.masterEffects=[
      {id:'transform',assetId:'builtin.effect.transform-crop',version:'1.0.0',enabled:true,params:{x:.1},keyframes:{}},
      {id:'echo',assetId:'builtin.effect.echo',version:'1.0.0',enabled:true,params:{delayMs:100,trails:2,decay:.5},keyframes:{}},
    ];
    const renderer=new Renderer();
    const sampled:number[]=[];
    renderer.background=(ctx,project,time)=>{sampled.push(time);ctx.fillRect(0,0,project.width,project.height);};
    renderer.draw(new TestCanvas(100,50) as unknown as OffscreenCanvas,p,500,{export:true,quality:'export'});
    expect(sampled).toEqual(expect.arrayContaining([500,400,300]));
    const translated=canvasTrace.filter(entry=>entry[0]==='translate');
    expect(translated.length).toBeGreaterThanOrEqual(3);
    expect(renderer.creativeDiagnostics.find(item=>item.instanceId==='echo'&&item.kind==='runtime')).toBeUndefined();
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
