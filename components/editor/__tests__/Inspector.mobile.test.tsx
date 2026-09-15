// @vitest-environment jsdom
import React from 'react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {render} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {MobileSheetHandle} from '../Inspector';

describe('portrait inspector',()=>{
  it('renders the mobile bottom-sheet grab handle',()=>{
    const {container}=render(<MobileSheetHandle/>);
    expect(container.querySelector('.mobile-sheet-handle')).not.toBeNull();
  });

  it('stacks the effect browser search/cards and keeps category chips horizontally scrollable',()=>{
    const css=readFileSync(resolve(process.cwd(),'app/mobile-portrait.css'),'utf8');
    expect(css).toContain('.effect-browser-search');
    expect(css).toContain('.effect-browser-categories');
    expect(css).toContain('overflow-x:auto');
    expect(css).toContain('.effect-browser-card');
  });
});
