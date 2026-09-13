import {describe,expect,it} from 'vitest';
import {pickTextBound} from '../preview-interaction';
const clips=[{id:'back',kind:'text'},{id:'image',kind:'image'},{id:'front',kind:'lyrics'}] as any[];
const bounds=[{id:'back',x:0,y:0,width:100,height:100},{id:'image',x:0,y:0,width:100,height:100},{id:'front',x:0,y:0,width:100,height:100}];
describe('pickTextBound',()=>{
  it('picks the topmost text-capable bound',()=>expect(pickTextBound(bounds,clips,50,50)?.id).toBe('front'));
  it('cycles overlapping text bounds after the previous selection',()=>expect(pickTextBound(bounds,clips,50,50,'front')?.id).toBe('back'));
  it('ignores non-text bounds',()=>expect(pickTextBound([{id:'image',x:0,y:0,width:100,height:100}],clips,10,10)).toBeNull());
});
