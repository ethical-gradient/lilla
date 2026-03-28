import { describe, it, expect } from 'vitest';
import { Lilla, flush } from './setup.js';

describe('Stress Tests & Memory Management', () => {
it('Clears event listeners on unmount (no memory leak)', async () => {
  let clickCount = 0;

  Lilla.define('leak-prevention', {
    shadow: false,
    template: () => '<div id="target">Click</div>',
    onMount() {
      this._handler = () => clickCount++;
      this.querySelector('#target').addEventListener('click', this._handler);
    },
    onCleanup() {
      this.querySelector('#target')?.removeEventListener('click', this._handler);
    }
  });

  const el = document.createElement('leak-prevention');
  document.body.appendChild(el);
  await flush();

  const target = el.querySelector('#target');
  target.click();
  expect(clickCount).toBe(1);

  // Unmount
  el.remove();
  await flush();

  // Click after unmount — should NOT increase count
  target.click();
  expect(clickCount).toBe(1);
});

it('Renders 1000 items without crashing (performance check)', async () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ id: i, text: `Item ${i}` }));

  Lilla.define('large-list', {
    shadow: false,
    state: () => ({ items }),
    template: ({ state }, html) => html`
      <ul id="list">
        ${state.items.map(item => html`
          <li key="${item.id}">${item.text}</li>
        `)}
      </ul>
    `
  });

  const el = document.createElement('large-list');
  document.body.appendChild(el);
  await flush();

  const lis = el.querySelectorAll('li');
  expect(lis.length).toBe(1000);
  expect(lis[0].textContent).toBe('Item 0');
  expect(lis[999].textContent).toBe('Item 999');
});

it('Handles rapid prop changes (race condition)', async () => {
  let renderCount = 0;

  Lilla.define('prop-race', {
    shadow: false,
    props: { val: 0 },
    template: ({ props }) => {
      renderCount++;
      return `<div>${props.val}</div>`;
    }
  });

  const el = document.createElement('prop-race');
  document.body.appendChild(el);
  await flush();

  const initial = renderCount;

  // Rapid changes (batched)
  el.setAttribute('val', '1');
  el.setAttribute('val', '2');
  el.setAttribute('val', '3');

  await flush();

  // Should batch into single render
  expect(renderCount).toBeLessThanOrEqual(initial + 2);
  expect(el.textContent).toBe('3');
});

it('Handles re-mounting same component instance', async () => {
  let mountCount = 0;
  let cleanupCount = 0;

  Lilla.define('remount-test', {
    template: () => '<div>Hello</div>',
    onMount() { mountCount++; },
    onCleanup() { cleanupCount++; }
  });

  const el = document.createElement('remount-test');

  // Mount
  document.body.appendChild(el);
  await flush();
  expect(mountCount).toBe(1);

  // Unmount
  el.remove();
  await flush();
  expect(cleanupCount).toBe(1);

  // Re-mount same instance
  document.body.appendChild(el);
  await flush();
  expect(mountCount).toBe(2);

  // Final cleanup
  el.remove();
  await flush();
  expect(cleanupCount).toBe(2);
});

it('Handles circular references in state without infinite loop', async () => {
  const circular = { name: 'Circle' };
  circular.self = circular;

  Lilla.define('circular-state', {
    shadow: false,
    state: () => ({ obj: circular }),
    template: ({ state }) => `<div>${state.obj.name}</div>`
  });

  const el = document.createElement('circular-state');

  // Should not crash
  document.body.appendChild(el);
  await flush();

  expect(el.textContent).toBe('Circle');
});

});
