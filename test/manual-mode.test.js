import { describe, it, expect } from 'vitest';
import { Lilla, AttrRef, flush } from './setup.js';

const getRefSize = () => AttrRef.debug?.().size ?? -1;

describe('updateStrategy: "manual"', () => {
  it('Renders on first mount, skips re-render on state change', async () => {
    let renderCount = 0;

    Lilla.define('manual-no-rerender', {
      shadow: false,
      updateStrategy: 'manual',
      state: () => ({ count: 0 }),
      template: ({ state }) => {
        renderCount++;
        return `<div id="out">${state.count}</div>`;
      }
    });

    const el = document.createElement('manual-no-rerender');
    document.body.appendChild(el);
    await flush();

    expect(renderCount).toBe(1);
    expect(el.querySelector('#out').textContent).toBe('0');

    // State changes but template should NOT re-render in manual mode
    el.state.count = 42;
    await flush();

    // Still 1 render (template not called again)
    expect(renderCount).toBe(1);
    expect(el.querySelector('#out').textContent).toBe('0');
  });

  it('Calls onUpdate hook on state change without re-rendering template', async () => {
    const log = [];

    Lilla.define('manual-onupdate', {
      shadow: false,
      updateStrategy: 'manual',
      state: () => ({ value: 'initial' }),
      template: ({ state }) => `<span>${state.value}</span>`,
      onUpdate() {
        log.push(this.state.value);
      }
    });

    const el = document.createElement('manual-onupdate');
    document.body.appendChild(el);
    await flush();

    const initialLogLen = log.length;

    el.state.value = 'changed';
    await flush();

    // onUpdate fired
    expect(log.length).toBeGreaterThan(initialLogLen);
    expect(log[log.length - 1]).toBe('changed');

    // DOM didn't update
    expect(el.querySelector('span').textContent).toBe('initial');
  });

  it('Cleans up AttrRefs on unmount (no leak)', async () => {
    const startSize = getRefSize();
    const obj = { id: 1 };

    Lilla.define('manual-ref-cleanup', {
      shadow: false,
      updateStrategy: 'manual',
      state: () => ({ obj }),
      template: ({ state }, html) => html`
        <div data-ref="${state.obj}"></div>
      `
    });

    const el = document.createElement('manual-ref-cleanup');
    document.body.appendChild(el);
    await flush();

    // Ref was created on first render
    expect(getRefSize()).toBeGreaterThan(startSize);

    el.remove();
    await flush();

    // Ref must be freed on disconnect
    expect(getRefSize()).toBe(startSize);
  });

  it('Does NOT accumulate refs when state changes in manual mode', async () => {
    const startSize = getRefSize();

    Lilla.define('manual-ref-stable', {
      shadow: false,
      updateStrategy: 'manual',
      state: () => ({ obj: { id: 1 } }),
      template: ({ state }, html) => html`
        <div data-ref="${state.obj}"></div>
      `
    });

    const el = document.createElement('manual-ref-stable');
    document.body.appendChild(el);
    await flush();

    const sizeAfterMount = getRefSize();

    // Multiple state changes: template not re-rendered, no new refs should be allocated
    el.state.obj = { id: 2 };
    await flush();
    el.state.obj = { id: 3 };
    await flush();

    // Size must stay stable (no accumulation)
    expect(getRefSize()).toBe(sizeAfterMount);

    el.remove();
    await flush();

    expect(getRefSize()).toBe(startSize);
  });

});
