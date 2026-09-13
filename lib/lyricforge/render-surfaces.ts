export type RenderCanvas=HTMLCanvasElement|OffscreenCanvas;
export type RenderContext=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;

export interface RenderSurface{
  canvas:RenderCanvas;
  ctx:RenderContext;
  width:number;
  height:number;
  dpr:number;
  key:string;
}

function makeCanvas(width:number,height:number):RenderCanvas{
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
  if(typeof document==='undefined')throw new Error('Canvas rendering is not available in this environment.');
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  return canvas;
}

function context2d(canvas:RenderCanvas):RenderContext{
  const ctx=canvas.getContext('2d') as RenderContext|null;
  if(!ctx)throw new Error('A 2D canvas context is required for creative rendering.');
  return ctx;
}

function resetSurface(surface:RenderSurface){
  const {canvas,ctx,dpr}=surface;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation='source-over';
  ctx.filter='none';
  ctx.shadowColor='rgba(0, 0, 0, 0)';
  ctx.shadowBlur=0;
  ctx.shadowOffsetX=0;
  ctx.shadowOffsetY=0;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

export class RenderSurfacePool{
  private readonly surfaces=new Map<string,RenderSurface>();

  acquire(width:number,height:number,dpr=1,key='default'):RenderSurface{
    const logicalWidth=Math.max(1,Math.round(width));
    const logicalHeight=Math.max(1,Math.round(height));
    const ratio=Math.max(.25,Math.min(4,Number.isFinite(dpr)?dpr:1));
    const pixelWidth=Math.max(1,Math.round(logicalWidth*ratio));
    const pixelHeight=Math.max(1,Math.round(logicalHeight*ratio));
    let surface=this.surfaces.get(key);
    if(!surface){
      const canvas=makeCanvas(pixelWidth,pixelHeight);
      surface={canvas,ctx:context2d(canvas),width:logicalWidth,height:logicalHeight,dpr:ratio,key};
      this.surfaces.set(key,surface);
    }else{
      if(surface.canvas.width!==pixelWidth)surface.canvas.width=pixelWidth;
      if(surface.canvas.height!==pixelHeight)surface.canvas.height=pixelHeight;
      surface.width=logicalWidth;surface.height=logicalHeight;surface.dpr=ratio;
    }
    resetSurface(surface);
    return surface;
  }

  stats(){
    return {count:this.surfaces.size,keys:[...this.surfaces.keys()]};
  }

  dispose(){
    for(const surface of this.surfaces.values()){
      if(typeof HTMLCanvasElement!=='undefined'&&surface.canvas instanceof HTMLCanvasElement){
        surface.canvas.width=0;surface.canvas.height=0;
      }
    }
    this.surfaces.clear();
  }
}
