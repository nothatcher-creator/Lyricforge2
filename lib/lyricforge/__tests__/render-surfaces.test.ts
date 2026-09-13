import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {RenderSurfacePool} from '../render-surfaces';

class FakeContext2D{
  globalAlpha=1;
  globalCompositeOperation='source-over';
  filter='none';
  shadowColor='rgba(0, 0, 0, 0)';
  shadowBlur=0;
  shadowOffsetX=0;
  shadowOffsetY=0;
  clearCount=0;
  setTransform(){/* recording not needed */}
  clearRect(){this.clearCount++;}
}

class FakeOffscreenCanvas{
  width:number;
  height:number;
  context=new FakeContext2D();
  constructor(width:number,height:number){this.width=width;this.height=height;}
  getContext(kind:string){return kind==='2d'?this.context:null;}
}

beforeEach(()=>vi.stubGlobal('OffscreenCanvas',FakeOffscreenCanvas));
afterEach(()=>vi.unstubAllGlobals());

describe('RenderSurfacePool',()=>{
  it('reuses one keyed surface at stable dimensions',()=>{
    const pool=new RenderSurfacePool();
    expect(pool.acquire(640,360,1,'scene')).toBe(pool.acquire(640,360,1,'scene'));
    expect(pool.stats().count).toBe(1);
  });

  it('resizes rather than retaining an obsolete keyed surface',()=>{
    const pool=new RenderSurfacePool();
    pool.acquire(640,360,1,'fx-a');
    const next=pool.acquire(1280,720,1,'fx-a');
    expect(next.canvas.width).toBe(1280);
    expect(next.canvas.height).toBe(720);
    expect(pool.stats().count).toBe(1);
  });

  it('resets mutable drawing state every time a surface is acquired',()=>{
    const pool=new RenderSurfacePool();
    const surface=pool.acquire(320,180,1,'reset');
    const ctx=surface.ctx as unknown as FakeContext2D;
    ctx.globalAlpha=.25;ctx.globalCompositeOperation='screen';ctx.filter='blur(5px)';ctx.shadowBlur=9;ctx.shadowOffsetX=4;ctx.shadowOffsetY=3;
    const again=pool.acquire(320,180,1,'reset');
    const reset=again.ctx as unknown as FakeContext2D;
    expect(reset.globalAlpha).toBe(1);
    expect(reset.globalCompositeOperation).toBe('source-over');
    expect(reset.filter).toBe('none');
    expect(reset.shadowBlur).toBe(0);
    expect(reset.shadowOffsetX).toBe(0);
    expect(reset.shadowOffsetY).toBe(0);
    expect(reset.clearCount).toBeGreaterThan(1);
  });

  it('drops pooled references on dispose',()=>{
    const pool=new RenderSurfacePool();
    pool.acquire(10,10,1,'a');pool.acquire(10,10,1,'b');
    pool.dispose();
    expect(pool.stats().count).toBe(0);
  });
});
