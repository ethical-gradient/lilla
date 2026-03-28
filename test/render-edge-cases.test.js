import { describe, it, expect } from 'vitest';
import { Lilla, flush } from './setup.js';

describe('Rendering Edge Cases (falsy values, arrays, conditionals)', () => {
it('Renders empty string, null, undefined correctly', async () => {
  Lilla.define('empty-values', {
    shadow: false,
    state: () => ({ a: '', b: null, c: undefined }),
    template: ({ state }, html) => html`
      <div id="a">${state.a}</div>
      <div id="b">${state.b}</div>
      <div id="c">${state.c}</div>
    `
  });

  const el = document.createElement('empty-values');
  document.body.appendChild(el);
  await flush();

  // Empty string → empty text node (not 'undefined' string)
  expect(el.querySelector('#a').textContent).toBe('');
  // null → should not render as "null" string
  expect(el.querySelector('#b').textContent).toBe('');
  // undefined → should not render as "undefined" string
  expect(el.querySelector('#c').textContent).toBe('');
});

it('Handles 0 and false without rendering them as empty', async () => {
  Lilla.define('falsy-numbers', {
    shadow: false,
    state: () => ({ zero: 0, bool: false }),
    template: ({ state }, html) => html`
      <div id="zero">${state.zero}</div>
      <div id="bool">${state.bool}</div>
    `
  });

  const el = document.createElement('falsy-numbers');
  document.body.appendChild(el);
  await flush();

  // 0 should render as "0", not disappear
  expect(el.querySelector('#zero').textContent).toBe('0');
  // false should render as "false" (or empty depending on contract)
  expect(el.querySelector('#bool').textContent).toBe('false');
});

it('Handles empty arrays in template', async () => {
  Lilla.define('empty-array', {
    shadow: false,
    state: () => ({ items: [] }),
    template: ({ state }, html) => html`
      <ul id="list">
        ${state.items.map(x => html`<li>${x}</li>`)}
      </ul>
    `
  });

  const el = document.createElement('empty-array');
  document.body.appendChild(el);
  await flush();

  const list = el.querySelector('#list');
  // Should render <ul> with no children
  expect(list.children.length).toBe(0);

  // Add items
  el.state.items = ['A', 'B'];
  await flush();
  expect(list.children.length).toBe(2);

  // Clear again
  el.state.items = [];
  await flush();
  expect(list.children.length).toBe(0);
});

it('Handles single-item arrays correctly', async () => {
  Lilla.define('single-item', {
    shadow: false,
    state: () => ({ items: ['Only One'] }),
    template: ({ state }, html) => html`
      <ul>
        ${state.items.map(x => html`<li>${x}</li>`)}
      </ul>
    `
  });

  const el = document.createElement('single-item');
  document.body.appendChild(el);
  await flush();

  const lis = el.querySelectorAll('li');
  expect(lis.length).toBe(1);
  expect(lis[0].textContent).toBe('Only One');
});

it('Handles arrays with duplicate values', async () => {
  Lilla.define('x-duplicates', {
    shadow: false,
    state: () => ({ items: ['A', 'A', 'B', 'A'] }),
    template: ({ state }, html) => html`
      <ul>
        ${state.items.map((x, i) => html`<li key="${i}">${x}</li>`)}
      </ul>
    `
  });

  const el = document.createElement('x-duplicates');
  document.body.appendChild(el);
  await flush();

  const lis = el.querySelectorAll('li');
  expect(lis.length).toBe(4);
  expect(lis[0].textContent).toBe('A');
  expect(lis[1].textContent).toBe('A');
  expect(lis[2].textContent).toBe('B');
});

it('Correctly sets boolean attributes (disabled, checked, etc.)', async () => {
  Lilla.define('bool-attrs', {
    shadow: false,
    state: () => ({ dis: true, chk: false }),
    template: ({ state }, html) => html`
      <input id="inp" type="checkbox"
             ${state.dis ? 'disabled' : ''}
             ${state.chk ? 'checked' : ''} />
    `
  });

  const el = document.createElement('bool-attrs');
  document.body.appendChild(el);
  await flush();

  const inp = el.querySelector('#inp');

  // disabled=true → attribute present + property true
  expect(inp.hasAttribute('disabled')).toBe(true);
  expect(inp.disabled).toBe(true);

  // checked=false → attribute absent
  expect(inp.hasAttribute('checked')).toBe(false);
  expect(inp.checked).toBe(false);

  // Toggle
  el.state.dis = false;
  el.state.chk = true;
  await flush();

  expect(inp.hasAttribute('disabled')).toBe(false);
  expect(inp.disabled).toBe(false);
  expect(inp.hasAttribute('checked')).toBe(true);
  expect(inp.checked).toBe(true);
});

it('Handles deeply nested conditional rendering', async () => {
  Lilla.define('deep-conditional', {
    shadow: false,
    state: () => ({ a: true, b: true, c: true }),
    template: ({ state }, html) => html`
      <div id="root">
        ${state.a ? html`
          <div id="level-a">
            ${state.b ? html`
              <div id="level-b">
                ${state.c ? html`<span id="level-c">Deep</span>` : ''}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `
  });

  const el = document.createElement('deep-conditional');
  document.body.appendChild(el);
  await flush();

  expect(el.querySelector('#level-c')).not.toBeNull();
  expect(el.querySelector('#level-c').textContent).toBe('Deep');

  // Toggle middle level
  el.state.b = false;
  await flush();
  expect(el.querySelector('#level-b')).toBeNull();
  expect(el.querySelector('#level-c')).toBeNull();

  // Re-enable
  el.state.b = true;
  await flush();
  expect(el.querySelector('#level-c')).not.toBeNull();
});

it('Handles props with default value undefined', async () => {
  Lilla.define('undefined-default', {
    shadow: false,
    props: { name: undefined },
    template: ({ props }) => `<div>${props.name ?? 'fallback'}</div>`
  });

  const el = document.createElement('undefined-default');
  document.body.appendChild(el);
  await flush();

  expect(el.textContent).toBe('fallback');

  el.setAttribute('name', 'Alice');
  await flush();
  expect(el.textContent).toBe('Alice');
});

it('Handles quotes in attribute values', async () => {
  Lilla.define('attr-quotes', {
    shadow: false,
    template: (_, html) => html`
      <div id="test"
           title="Hello World"
           data-text="It works">
      </div>
    `
  });

  const el = document.createElement('attr-quotes');
  document.body.appendChild(el);
  await flush();

  const div = el.querySelector('#test');
  expect(div.getAttribute('title')).toBe('Hello World');
  expect(div.getAttribute('data-text')).toBe("It works");
});

it('Handles Unicode and emoji correctly', async () => {
  Lilla.define('unicode-test', {
    shadow: false,
    state: () => ({
      emoji: '🚀✨',
      cyrillic: 'Привет',
      chinese: '你好',
      arabic: 'مرحبا'
    }),
    template: ({ state }, html) => html`
      <div id="emoji">${state.emoji}</div>
      <div id="cyrillic">${state.cyrillic}</div>
      <div id="chinese">${state.chinese}</div>
      <div id="arabic">${state.arabic}</div>
    `
  });

  const el = document.createElement('unicode-test');
  document.body.appendChild(el);
  await flush();

  expect(el.querySelector('#emoji').textContent).toBe('🚀✨');
  expect(el.querySelector('#cyrillic').textContent).toBe('Привет');
  expect(el.querySelector('#chinese').textContent).toBe('你好');
  expect(el.querySelector('#arabic').textContent).toBe('مرحبا');
});
});
