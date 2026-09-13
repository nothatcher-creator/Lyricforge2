// @vitest-environment jsdom
import React from 'react';
import {render} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {MobileSheetHandle} from '../Inspector';
describe('portrait inspector',()=>{
  it('renders the mobile bottom-sheet grab handle',()=>{
    const {container}=render(<MobileSheetHandle/>);
    expect(container.querySelector('.mobile-sheet-handle')).not.toBeNull();
  });
});
