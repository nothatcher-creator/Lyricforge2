import type {AnimationRole} from './creative-assets';
import type {CreativeDefinition,CreativeTarget,EffectCategory,ParamDefinition,QualityBehavior} from './creative-registry';

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

type EffectSpec={runtime:string;params:Record<string,ParamDefinition>;category:EffectCategory;description:string;master?:boolean;low?:QualityBehavior;bypassWhenNeutral?:readonly string[]};
const effectSpecs:Record<string,EffectSpec>={
  glow:{runtime:'effect.glow',category:'stylize',description:'Soft luminous halo around the rendered layer.',params:{radius:num(18,0,80,1,true),intensity:num(.6,0,1,.01,true,0)},master:true,bypassWhenNeutral:['intensity']},
  bloom:{runtime:'effect.bloom',category:'light',description:'Bright highlight bloom with a soft cinematic spread.',params:{radius:num(22,0,80,1,true),intensity:num(.45,0,1,.01,true,0)},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
  'drop-shadow':{runtime:'effect.drop-shadow',category:'stylize',description:'Configurable shadow behind text and visual layers.',params:{blur:num(14,0,60,1,true),offsetX:num(0,-80,80,1,true,0),offsetY:num(8,-80,80,1,true),opacity:num(.55,0,1,.01,true,0),color:color('#000000')},bypassWhenNeutral:['opacity']},
  outline:{runtime:'effect.outline',category:'stylize',description:'Adds a crisp colored outline around visible content.',params:{width:num(3,0,20,.5,true,0),opacity:num(1,0,1,.01,true),color:color('#ffffff')},bypassWhenNeutral:['width']},
  blur:{runtime:'effect.blur',category:'blur-sharpen',description:'Standard Gaussian-style blur for layers or the master.',params:{radius:num(8,0,60,.5,true,0)},master:true,bypassWhenNeutral:['radius']},
  sharpen:{runtime:'effect.sharpen',category:'blur-sharpen',description:'Fast lightweight sharpening for previews and exports.',params:{amount:num(.4,0,1,.01,true,0)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  grain:{runtime:'effect.grain',category:'stylize',description:'Animated film-style grain for texture and movement.',params:{amount:num(.2,0,1,.01,true,0),size:num(1,1,8,1,false)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  vignette:{runtime:'effect.vignette',category:'light',description:'Darkens the frame edges to focus attention inward.',params:{amount:num(.35,0,1,.01,true,0),softness:num(.55,.05,1,.01,true)},master:true,bypassWhenNeutral:['amount']},
  brightness:{runtime:'effect.brightness',category:'adjust',description:'Quick overall brightness adjustment for any layer.',params:{amount:num(1,0,3,.01,true,1)},master:true,bypassWhenNeutral:['amount']},
  contrast:{runtime:'effect.contrast',category:'adjust',description:'Quick overall contrast adjustment for any layer.',params:{amount:num(1,0,3,.01,true,1)},master:true,bypassWhenNeutral:['amount']},
  saturation:{runtime:'effect.saturation',category:'adjust',description:'Quick overall color saturation adjustment.',params:{amount:num(1,0,3,.01,true,1)},master:true,bypassWhenNeutral:['amount']},
  'hue-shift':{runtime:'effect.hue-shift',category:'adjust',description:'Rotates colors around the hue wheel.',params:{degrees:num(0,-180,180,1,true,0)},master:true,bypassWhenNeutral:['degrees']},
  duotone:{runtime:'effect.duotone',category:'stylize',description:'Maps the image toward two stylized colors.',params:{shadow:color('#182030'),highlight:color('#f2b66d'),amount:num(1,0,1,.01,true,0)},master:true,bypassWhenNeutral:['amount']},
  posterize:{runtime:'effect.posterize',category:'stylize',description:'Reduces color levels for a graphic posterized look.',params:{levels:num(6,2,32,1,true)},master:true},
  pixelate:{runtime:'effect.pixelate',category:'stylize',description:'Reduces image resolution into visible pixel blocks.',params:{size:num(8,1,80,1,true)},master:true,low:'simplified'},
  'rgb-split':{runtime:'effect.rgb-split',category:'distort',description:'Offsets color channels for a digital split look.',params:{amount:num(6,0,40,.5,true,0)},master:true,bypassWhenNeutral:['amount']},
  vhs:{runtime:'effect.vhs',category:'stylize',description:'Adds scanlines, jitter, and analog tape noise.',params:{scanlines:num(.45,0,1,.01,true,0),noise:num(.2,0,1,.01,true,0),jitter:num(.15,0,1,.01,true,0)},master:true,low:'simplified',bypassWhenNeutral:['scanlines','noise','jitter']},
  'noise-displacement':{runtime:'effect.noise-displacement',category:'distort',description:'Slices and displaces the frame using animated noise.',params:{amount:num(8,0,60,.5,true,0),scale:num(24,2,128,1,false)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  shake:{runtime:'effect.shake',category:'distort',description:'Animated camera shake with adjustable amount and speed.',params:{amount:num(8,0,80,.5,true,0),speed:num(8,.1,40,.1,true)},master:true,bypassWhenNeutral:['amount']},
  'zoom-pulse':{runtime:'effect.zoom-pulse',category:'stylize',description:'Pulses the frame scale rhythmically over time.',params:{amount:num(.08,0,.5,.01,true,0),periodMs:num(800,100,5000,10,true)},master:true,bypassWhenNeutral:['amount']},
  'light-streak':{runtime:'effect.light-streak',category:'light',description:'Adds an angled luminous streak over the image.',params:{intensity:num(.4,0,1,.01,true,0),angle:num(25,-180,180,1,true)},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
  glitch:{runtime:'effect.glitch',category:'stylize',description:'Animated digital slice glitches for music-video cuts.',params:{intensity:num(.35,0,1,.01,true,0),rate:num(.25,0,1,.01,true)},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
  'beat-reactive':{runtime:'effect.beat-reactive',category:'audio-reactive',description:'Scales the image using the current audio energy.',params:{intensity:num(.5,0,2,.01,true,0),sensitivity:num(1,.1,5,.05,true)},master:true,bypassWhenNeutral:['intensity']},
  'color-adjust':{runtime:'effect.color-adjust',category:'adjust',description:'Professional tonal and color controls in one efficient pass.',params:{exposure:num(0,-5,5,.05,true,0),temperature:num(0,-100,100,1,true,0),tint:num(0,-100,100,1,true,0),highlights:num(0,-100,100,1,true,0),shadows:num(0,-100,100,1,true,0),whites:num(0,-100,100,1,true,0),blacks:num(0,-100,100,1,true,0),gamma:num(1,.1,3,.01,true,1),saturation:num(1,0,3,.01,true,1),fade:num(0,0,1,.01,true,0)},master:true,low:'simplified',bypassWhenNeutral:['exposure','temperature','tint','highlights','shadows','whites','blacks','gamma','saturation','fade']},
  'transform-crop':{runtime:'effect.transform-crop',category:'transform',description:'Premiere-style position, scale, rotation, anchor, crop, and opacity.',params:{x:num(0,-1,1,.005,true,0),y:num(0,-1,1,.005,true,0),scale:num(1,.05,8,.01,true,1),scaleX:num(1,.05,8,.01,true,1),scaleY:num(1,.05,8,.01,true,1),rotation:num(0,-360,360,.1,true,0),anchorX:num(.5,0,1,.005,true,.5),anchorY:num(.5,0,1,.005,true,.5),cropLeft:num(0,0,.49,.005,true,0),cropRight:num(0,0,.49,.005,true,0),cropTop:num(0,0,.49,.005,true,0),cropBottom:num(0,0,.49,.005,true,0),opacity:num(1,0,1,.01,true,1)},master:true,bypassWhenNeutral:['x','y','scale','scaleX','scaleY','rotation','anchorX','anchorY','cropLeft','cropRight','cropTop','cropBottom','opacity']},
  'directional-blur':{runtime:'effect.directional-blur',category:'blur-sharpen',description:'Motion-like blur along a configurable angle.',params:{amount:num(0,0,80,.5,true,0),angle:num(0,-180,180,1,true),samples:num(10,2,24,1,false)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  'lens-distortion':{runtime:'effect.lens-distortion',category:'distort',description:'Barrel or pincushion lens distortion around a chosen center.',params:{amount:num(0,-1,1,.01,true,0),centerX:num(.5,0,1,.005,true),centerY:num(.5,0,1,.005,true)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  'chromatic-aberration':{runtime:'effect.chromatic-aberration',category:'distort',description:'Offsets color channels along an adjustable direction.',params:{amount:num(0,0,40,.5,true,0),angle:num(0,-180,180,1,true)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  strobe:{runtime:'effect.strobe',category:'stylize',description:'Timed color strobe with adjustable rate, duty cycle, and intensity.',params:{rateHz:num(8,.1,30,.1,true),duty:num(.5,.05,1,.01,true),intensity:num(.5,0,1,.01,true,0),color:color('#ffffff')},master:true,bypassWhenNeutral:['intensity']},
  'light-leak':{runtime:'effect.light-leak',category:'light',description:'Screen-blended colored light leak for cinematic overlays.',params:{intensity:num(.5,0,1,.01,true,0),position:num(.5,0,1,.005,true),width:num(.35,.05,1,.01,true),angle:num(0,-180,180,1,true),color:color('#ff9a55')},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
  'zoom-blur':{runtime:'effect.zoom-blur',category:'blur-sharpen',description:'Radial zoom blur centered anywhere in the frame.',params:{amount:num(0,0,1,.01,true,0),centerX:num(.5,0,1,.005,true),centerY:num(.5,0,1,.005,true),samples:num(10,2,24,1,false)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  'unsharp-mask':{runtime:'effect.unsharp-mask',category:'blur-sharpen',description:'Professional edge sharpening with radius and threshold control.',params:{amount:num(.5,0,2,.01,true,0),radius:num(2,.5,12,.1,true),threshold:num(.05,0,1,.005,true)},master:true,low:'simplified',bypassWhenNeutral:['amount']},
  'film-burn':{runtime:'effect.film-burn',category:'light',description:'Animated deterministic film burn with hot highlights and flicker.',params:{intensity:num(.6,0,1,.01,true,0),position:num(.5,0,1,.005,true),spread:num(.35,.05,1,.01,true),flicker:num(.2,0,1,.01,true),color:color('#ff6a20')},master:true,low:'simplified',bypassWhenNeutral:['intensity']},
};

const effectDefinitions:CreativeDefinition[]=Object.entries(effectSpecs).map(([slug,spec])=>({
  id:`builtin.effect.${slug}`,type:'effect',version:'1.0.0',name:title(slug),targets:spec.master?MASTER_TARGETS:VISUAL_TARGETS,runtime:spec.runtime,params:spec.params,quality:quality(spec.low??'full'),category:spec.category,description:spec.description,bypassWhenNeutral:spec.bypassWhenNeutral,
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
