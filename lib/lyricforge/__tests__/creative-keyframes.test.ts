import {describe,expect,it} from 'vitest';
import {evaluateParamKeyframes} from '../creative-keyframes';
import type {ParamDefinition} from '../creative-registry';

const numberDef:ParamDefinition={kind:'number',default:0,min:0,max:10,step:.1,keyframeable:true};

describe('creative parameter keyframes',()=>{
  it('interpolates numeric parameters with easing',()=>{
    expect(evaluateParamKeyframes(0,[
      {id:'a',timeMs:0,value:0,easing:'linear'},
      {id:'b',timeMs:1000,value:10,easing:'linear'},
    ],500,numberDef)).toBe(5);
  });

  it('uses stepped values for selects and the last entry at duplicate times',()=>{
    const selectDef:ParamDefinition={kind:'select',default:'left',options:['left','right'],keyframeable:false};
    expect(evaluateParamKeyframes('left',[
      {id:'a',timeMs:0,value:'left',easing:'linear'},
      {id:'b',timeMs:1000,value:'right',easing:'linear'},
    ],500,selectDef)).toBe('left');
    expect(evaluateParamKeyframes(0,[
      {id:'a',timeMs:100,value:1,easing:'linear'},
      {id:'b',timeMs:100,value:2,easing:'linear'},
    ],100,numberDef)).toBe(2);
  });

  it('interpolates trusted colors only when the schema requests color interpolation',()=>{
    const frames=[
      {id:'a',timeMs:0,value:'#000000',easing:'linear' as const},
      {id:'b',timeMs:1000,value:'#ffffff',easing:'linear' as const},
    ];
    const smooth:ParamDefinition={kind:'color',default:'#000000',keyframeable:true,interpolation:'color'};
    const stepped:ParamDefinition={kind:'color',default:'#000000',keyframeable:true,interpolation:'step'};
    expect(evaluateParamKeyframes('#000000',frames,500,smooth)).toBe('#808080');
    expect(evaluateParamKeyframes('#000000',frames,500,stepped)).toBe('#000000');
  });

  it('clamps numeric keyframe values to trusted parameter bounds',()=>{
    expect(evaluateParamKeyframes(0,[{id:'a',timeMs:0,value:99,easing:'linear'}],0,numberDef)).toBe(10);
  });
});
