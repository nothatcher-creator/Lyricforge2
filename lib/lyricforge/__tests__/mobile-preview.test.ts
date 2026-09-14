import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const editor=readFileSync(resolve(process.cwd(),'components/editor/Editor.tsx'),'utf8');
const preview=readFileSync(resolve(process.cwd(),'components/editor/Preview.tsx'),'utf8');
const portraitCss=readFileSync(resolve(process.cwd(),'app/mobile-portrait.css'),'utf8');

describe('portrait preview controls',()=>{
  it('renders a dedicated portrait Preview button that collapses editor sheets',()=>{
    expect(editor).toContain('portrait-preview-button');
    expect(editor).toMatch(/Preview/);
    expect(editor).toMatch(/preview/);
  });

  it('routes long press to properties instead of opening the inspector on a normal text tap',()=>{
    expect(preview).toContain('onOpenProperties');
    expect(editor).toContain('onOpenProperties');
    expect(editor).not.toContain('onTextSelected={()=>{if(workspaceMode===\'phone-portrait\')setPanel(\'inspector\',true);}}');
  });

  it('styles the portrait Preview button as a visible bottom action',()=>{
    expect(portraitCss).toContain('.portrait-preview-button');
  });
});
