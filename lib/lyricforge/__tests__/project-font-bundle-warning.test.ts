import {describe,expect,it} from 'vitest';
import {createProject} from '../model';
import {assertProjectFontBundleLicenses,UnknownFontLicenseBundleError} from '../project-manager';

describe('project font bundle licensing',()=>{
 it('requires explicit confirmation before bundling user-imported fonts with unknown redistribution rights',()=>{
  const project=createProject('font warning');
  project.assets.push({id:'font-1',name:'CommercialFont.ttf',type:'font',mime:'font/ttf',size:123,fontFamily:'Commercial Font'});
  expect(()=>assertProjectFontBundleLicenses(project)).toThrow(UnknownFontLicenseBundleError);
  try{assertProjectFontBundleLicenses(project);}catch(error){
   expect(error).toBeInstanceOf(UnknownFontLicenseBundleError);
   expect((error as UnknownFontLicenseBundleError).fonts).toEqual(['CommercialFont.ttf']);
  }
  expect(()=>assertProjectFontBundleLicenses(project,{allowUnknownFontLicenses:true})).not.toThrow();
 });

 it('does not warn when a project has no user-imported font media',()=>{
  const project=createProject('no fonts');
  expect(()=>assertProjectFontBundleLicenses(project)).not.toThrow();
 });
});
