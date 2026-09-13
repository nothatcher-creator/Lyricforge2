import type {AnimationRole} from './creative-assets';
import type {CreativeDefinition,CreativeTarget,ParamDefinition,QualityBehavior} from './creative-registry';

const num=(value:number,min:number,max:number,step:number,keyframeable:boolean,neutral?:number):ParamDefinition=>({kind:'number',default:value,min,max,step,keyframeable,...(neutral===undefined?{}:{neutral})});
const select=(value:string,options:readonly string[],neutral?:string):ParamDefinition=>({kind:'select',default:value,options,keyframeable:false,...(neutral===undefined?{}:{neutral})});
const color=(value:string,interpolation:'color'|'step'='color',neutral?:string):ParamDefinition=>({kind:'color',default:value,keyframeable:true,interpolation,...(neutral===undefined?{}:{neutral})});
const quality=(low:QualityBehavior='full',high:QualityBehavior='full')=>({'preview-low':low,'preview-high':high,export:'full' as const});
const title=(slug:string)=>slug.split('-').map(part=>part==='rgb'?'RGB':part==='3d'?'3D':part[0].toUpperCase()+part.slice(1)).join(' ');

const TEXT_TARGETS=['lyrics','text'] as const satisfies readonly CreativeTarget[];
const VISUAL_TARGETS=['lyrics','text','image','video','visualizer'] as const satisfies readonly CreativeTarget[];
const MASTER_TARGETS=[...VISUAL_TARGETS,'master'] as const satisfies readonly CreativeTarget[];

const animationCommon:Record<string,ParamDefinition>={
  durationMs:num(350,50,4000,10,true),
  delayMs:num(0,0,3000,10,true,0),
  intensity:num(.5,0,2,.05,true,0),
  direction:select('forward',['forward','reverse']),
};
const loopCommon:Record<string,ParamDefinition>={...animationCommon,periodMs:num(1200,100,10000,10,true)};

const animationSpecs:readonly [string,string,readonly AnimationRole[],Record<string,ParamDefinition>,QualityBehavior?][]=[
  ['fade','animation.fade',['intro','outro'],animationCommon],
  ['slide','animation.slide',['intro','outro'],animationCommon],
  ['blur','animation.blur',['intro','outro'],{...animationCommon,radius:num(24,0,80,1,true,0)}],
  ['scale-punch','animation.scale-punch',['intro','outro'],animationCommon],
  ['tracking','animation.tracking',['intro','outro'],{...animationCommon,amount:num(28,-80,120,1,true,0)}],
  ['word-pop','animation.word-pop',['intro','outro'],{...animationCommon,staggerMs:num(35,0,300,1,true)}],
  ['character-cascade','animation.character-cascade',['intro','outro'],{...animationCommon,staggerMs:num(35,0,300,1,true)}],
  ['spin','animation.spin',['intro','outro'],animationCommon],
  ['tilt-3d','animation.tilt-3d',['intro','outro'],animationCommon,'simplified'],
  ['wipe-reveal','animation.wipe-reveal',['intro','outro'],animationCommon],
  ['pixel-dissolve','animation.pixel-dissolve',['intro','outro'],{...animationCommon,cellSize:num(10,2,80,1,false)},'simplified'],
  ['glitch-reveal','animation.glitch-reveal',['intro','outro'],animationCommon,'simplified'],
  ['pulse','animation.pulse',['loop'],loopCommon],
  ['float','animation.float',['loop'],loopCommon],
  ['bounce','animation.bounce',['loop'],loopCommon],
  ['shake','animation.shake',['loop'],loopCommon],
  ['wave','animation.wave',['loop'],loopCommon],
  ['neon-flicker','animation.neon-flicker',['loop'],loopCommon],
  ['breathing-glow','animation.breathing-glow',['loop'],{...loopCommon,radius:num(24,0,80,1,true,0)}],
  ['rgb-drift','animation.rgb-drift',['loop'],{...loopCommon,amount:num(6,0,40,.5,true,0)},'simplified'],
  ['sway-3d','animation.sway-3d',['loop'],loopCommon,'simplified'],
  ['beat-pulse','animation.beat-pulse',['loop'],{...loopCommon,sensitivity:num(1,.1,5,.05,true)}],
];

const animationDefinitions:CreativeDefinition[]=animationSpecs.map(([slug,runtime,roles,params,low='full'])=>({
  id:`builtin.animation.${slug}`,type:'text-animation',version:'1.0.0',name:title(slug),targets:TEXT_TARGETS,roles,runtime,params,quality:quality(low),
}));

type EffectSpec={runtime:string;params:Record<string,ParamDefinition>;master?:boolean;low?:QualityBehavior;bypassWhenNeutral?:readonly string[]};
const effectSpecs:Record<string,EffectSpec>={
  glow:{runtime:'effect.glow',params:{radius:num(18,0,80,1,true),intensity:num(.6,0,1,.01,true,0)},master:true,bypassWhenNeutral:['intensity']},
  bloom:{runtime:'effect.bloom',params:{radius:num(22,0,80,1,true),intensity:num(.45,0,1,.01,true,0)},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
  'drop-shadow':{runtime:'effect.drop-shadow',params:{blur:num(14,0,60,1,true),offsetX:num(0,-80,80,1,true,0),offsetY:num(8,-80,80,1,true),opacity:num(.55,0,1,.01,true,0),color:color('#000000')},bypassWhenNeutral:['opacity']},
  outline:{runtime:'effect.outline',params:{width:num(3,0,20,.5,true,0),opacity:num(1,0,1,.01,true),color:color('#ffffff')},bypassWhenNeutral:['width']},
  blur:{runtime:'effect.blur',params:{radius:num(8,0,60,.5,true,0)},master:true,bypassWhenNeutral:['radius']},
  sharpen:{runtime:'effect.sharpen',params:{amount:num(.4,0,1,.01,true,0)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  grain:{runtime:'effect.grain',params:{amount:num(.2,0,1,.01,true,0),size:num(1,1,8,1,false)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  vignette:{runtime:'effect.vignette',params:{amount:num(.35,0,1,.01,true,0),softness:num(.55,.05,1,.01,true)},master:true,bypassWhenNeutral:['amount']},
  brightness:{runtime:'effect.brightness',params:{amount:num(1,0,3,.01,true,1)},master:true,bypassWhenNeutral:['amount']},
  contrast:{runtime:'effect.contrast',params:{amount:num(1,0,3,.01,true,1)},master:true,bypassWhenNeutral:['amount']},
  saturation:{runtime:'effect.saturation',params:{amount:num(1,0,3,.01,true,1)},master:true,bypassWhenNeutral:['amount']},
  'hue-shift':{runtime:'effect.hue-shift',params:{degrees:num(0,-180,180,1,true,0)},master:true,bypassWhenNeutral:['degrees']},
  duotone:{runtime:'effect.duotone',params:{shadow:color('#182030'),highlight:color('#f2b66d'),amount:num(1,0,1,.01,true,0)},master:true,bypassWhenNeutral:['amount']},
  posterize:{runtime:'effect.posterize',params:{levels:num(6,2,32,1,true)},master:true},
  pixelate:{runtime:'effect.pixelate',params:{size:num(8,1,80,1,true)},master:true,low:'simplified'},
  'rgb-split':{runtime:'effect.rgb-split',params:{amount:num(6,0,40,.5,true,0)},master:true,bypassWhenNeutral:['amount']},
  vhs:{runtime:'effect.vhs',params:{scanlines:num(.45,0,1,.01,true,0),noise:num(.2,0,1,.01,true,0),jitter:num(.15,0,1,.01,true,0)},master:true,low:'simplified',bypassWhenNeutral:['scanlines','noise','jitter']},
  'noise-displacement':{runtime:'effect.noise-displacement',params:{amount:num(8,0,60,.5,true,0),scale:num(24,2,128,1,false)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  shake:{runtime:'effect.shake',params:{amount:num(8,0,80,.5,true,0),speed:num(8,.1,40,.1,true)},master:true,bypassWhenNeutral:['amount']},
  'zoom-pulse':{runtime:'effect.zoom-pulse',params:{amount:num(.08,0,.5,.01,true,0),periodMs:num(800,100,5000,10,true)},master:true,bypassWhenNeutral:['amount']},
  'light-streak':{runtime:'effect.light-streak',params:{intensity:num(.4,0,1,.01,true,0),angle:num(25,-180,180,1,true)},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
  glitch:{runtime:'effect.glitch',params:{intensity:num(.35,0,1,.01,true,0),rate:num(.25,0,1,.01,true)},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
  'beat-reactive':{runtime:'effect.beat-reactive',params:{intensity:num(.5,0,2,.01,true,0),sensitivity:num(1,.1,5,.05,true)},master:true,bypassWhenNeutral:['intensity']},
};

const effectDefinitions:CreativeDefinition[]=Object.entries(effectSpecs).map(([slug,spec])=>({
  id:`builtin.effect.${slug}`,type:'effect',version:'1.0.0',name:title(slug),targets:spec.master?MASTER_TARGETS:VISUAL_TARGETS,runtime:spec.runtime,params:spec.params,quality:quality(spec.low??'full'),bypassWhenNeutral:spec.bypassWhenNeutral,
}));

type TransitionSpec={runtime:string;params:Record<string,ParamDefinition>;low?:QualityBehavior};
const transitionSpecs:Record<string,TransitionSpec>={
  crossfade:{runtime:'transition.crossfade',params:{}},
  'dip-black':{runtime:'transition.dip-black',params:{hold:num(.15,0,.8,.01,true)}},
  'dip-white':{runtime:'transition.dip-white',params:{hold:num(.15,0,.8,.01,true)}},
  'blur-dissolve':{runtime:'transition.blur-dissolve',params:{radius:num(24,0,80,1,true)},low:'simplified'},
  push:{runtime:'transition.push',params:{direction:select('left',['left','right','up','down'])}},
  slide:{runtime:'transition.slide',params:{direction:select('left',['left','right','up','down'])}},
  wipe:{runtime:'transition.wipe',params:{direction:select('left',['left','right','up','down']),softness:num(.05,0,.5,.01,true)}},
  zoom:{runtime:'transition.zoom',params:{amount:num(.25,0,1,.01,true)}},
  spin:{runtime:'transition.spin',params:{turns:num(.3,-2,2,.01,true)}},
  flash:{runtime:'transition.flash',params:{strength:num(.7,0,1,.01,true)}},
  glitch:{runtime:'transition.glitch',params:{intensity:num(.5,0,1,.01,true)},low:'simplified'},
  'rgb-split':{runtime:'transition.rgb-split',params:{amount:num(12,0,60,.5,true)},low:'simplified'},
  'pixel-dissolve':{runtime:'transition.pixel-dissolve',params:{cellSize:num(10,2,80,1,false)},low:'simplified'},
  'film-burn':{runtime:'transition.film-burn',params:{intensity:num(.75,0,1,.01,true)},low:'simplified'},
  'light-leak':{runtime:'transition.light-leak',params:{intensity:num(.7,0,1,.01,true)},low:'simplified'},
  'mask-reveal':{runtime:'transition.mask-reveal',params:{direction:select('left',['left','right','up','down']),softness:num(.08,0,.5,.01,true)}},
};

const transitionDefinitions:CreativeDefinition[]=Object.entries(transitionSpecs).map(([slug,spec])=>({
  id:`builtin.transition.${slug}`,type:'transition',version:'1.0.0',name:title(slug),targets:VISUAL_TARGETS,runtime:spec.runtime,params:spec.params,quality:quality(spec.low??'full'),
}));

export const BUILTIN_CREATIVE_DEFINITIONS:readonly CreativeDefinition[]=[...animationDefinitions,...effectDefinitions,...transitionDefinitions];
