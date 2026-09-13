import {describe,expect,it} from 'vitest';
import {classifyWorkspace} from '../workspace-layout';
describe('classifyWorkspace',()=>{
  it('uses phone portrait for a narrow portrait coarse viewport',()=>expect(classifyWorkspace(390,844,true)).toBe('phone-portrait'));
  it('uses compact for a landscape phone',()=>expect(classifyWorkspace(844,390,true)).toBe('compact'));
  it('keeps wide desktop as desktop',()=>expect(classifyWorkspace(1440,900,false)).toBe('desktop'));
});
