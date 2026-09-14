import {describe,expect,it} from 'vitest';
import {classifyWorkspace,resolveWorkspacePanels} from '../workspace-layout';
describe('classifyWorkspace',()=>{
  it('uses phone portrait for a narrow portrait coarse viewport',()=>expect(classifyWorkspace(390,844,true)).toBe('phone-portrait'));
  it('uses compact for a landscape phone',()=>expect(classifyWorkspace(844,390,true)).toBe('compact'));
  it('keeps wide desktop as desktop',()=>expect(classifyWorkspace(1440,900,false)).toBe('desktop'));
});
describe('resolveWorkspacePanels',()=>{
  it('starts phone portrait with side panels closed',()=>expect(resolveWorkspacePanels('phone-portrait',{left:true,right:true},'initialize')).toEqual({left:false,right:false}));
  it('restores the library when compact mode initializes from a collapsed portrait workspace',()=>expect(resolveWorkspacePanels('compact',{left:false,right:false},'initialize')).toEqual({left:true,right:false}));
  it('restores both side panels when desktop initializes from a collapsed portrait workspace',()=>expect(resolveWorkspacePanels('desktop',{left:false,right:false},'initialize')).toEqual({left:true,right:true}));
  it('opening the library on phone closes the inspector',()=>expect(resolveWorkspacePanels('phone-portrait',{left:false,right:true},'library',true)).toEqual({left:true,right:false}));
  it('opening the inspector on phone closes the library',()=>expect(resolveWorkspacePanels('phone-portrait',{left:true,right:false},'inspector',true)).toEqual({left:false,right:true}));
  it('preview mode closes every portrait sheet',()=>expect(resolveWorkspacePanels('phone-portrait',{left:true,right:true},'preview' as any,true)).toEqual({left:false,right:false}));
  it('desktop inspector changes do not collapse the library',()=>expect(resolveWorkspacePanels('desktop',{left:true,right:false},'inspector',true)).toEqual({left:true,right:true}));
});
