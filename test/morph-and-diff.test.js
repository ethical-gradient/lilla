import { describe, it, expect } from 'vitest';
import { Lilla, morph, flush } from './setup.js';

describe('DOM Morphing & Keyed Diff Algorithm', () => {
it('Reorders DOM nodes based on keys (Keyed Diff Integration)', async () => {
  Lilla.define('list-swap', {
    shadow: false,
    state: () => ({ items: [{id: 1, text: 'A'}, {id: 2, text: 'B'}, {id: 3, text: 'C'}] }),
    template: ({ state }, html) => html`
      <ul>
        ${state.items.map(item => html`<li key="${item.id}">${item.text}</li>`)}
      </ul>
    `
  });

  const el = document.createElement('list-swap');
  document.body.appendChild(el);
  await flush();

  const getLis = () => [...el.querySelectorAll('li')];
  const [liA, liB, liC] = getLis();

  // SWAP Operation: A, B, C -> C, B, A
  el.state.items = [{id: 3, text: 'C'}, {id: 2, text: 'B'}, {id: 1, text: 'A'}];
  await flush();

  const newLis = getLis();

  // Check DOM Identity (Crucial for performance)
  // The actual DOM elements should be the SAME objects, just moved
  expect(newLis[0]).toBe(liC); // The first element is now the original liC
  expect(newLis[1]).toBe(liB); // Middle stayed middle
  expect(newLis[2]).toBe(liA); // Last is now original liA
});

it('Unit Test: Must PRESERVE object reference during SWAP (Direct Morph)', () => {
  // 1. Manually create container
  const parent = document.createElement('div');

  // 2. Populate with initial state (A, B, C)
  // Using key is essential for the algorithm
  parent.innerHTML = `
    <div key="1" id="A">A</div>
    <div key="2" id="B">B</div>
    <div key="3" id="C">C</div>
  `;

  // 3. Save REFERENCES to initial DOM objects
  const elA = parent.querySelector('#A');
  const elC = parent.querySelector('#C');

  // 4. Run morph with NEW order (C, B, A) - Reverse
  const newHtml = `
    <div key="3" id="C">C</div>
    <div key="2" id="B">B</div>
    <div key="1" id="A">A</div>
  `;

  morph(parent, newHtml);

  // Get actual DOM children
  const children = Array.from(parent.children);

  // 5. ASSERTIONS

  // A. Order must change
  expect(children[0].getAttribute('key')).toBe("3"); // C
  expect(children[1].getAttribute('key')).toBe("2"); // B
  expect(children[2].getAttribute('key')).toBe("1"); // A

  // B. REFERENCES MUST MATCH
  // If morph deleted old A and created new A, this expects fails.
  expect(children[0]).toBe(elC);
  expect(children[2]).toBe(elA);
});

it('Handles nested keyed lists reordering', () => {
  const parent = document.createElement('div');

  // Group 1 (A), Group 2 (B). Inside A: 1, 2.
  parent.innerHTML = `
    <div key="g1" id="g1">
      <span key="1" id="i1">1</span>
      <span key="2" id="i2">2</span>
    </div>
    <div key="g2" id="g2"></div>
  `;

  const g1 = parent.querySelector('#g1');
  const i1 = parent.querySelector('#i1');

  // Swap Groups AND Swap Items inside Group 1
  const newHtml = `
    <div key="g2" id="g2"></div>
    <div key="g1" id="g1">
      <span key="2" id="i2">2</span>
      <span key="1" id="i1">1</span>
    </div>
  `;

  morph(parent, newHtml);

  const children = parent.children;
  // Groups swapped?
  expect(children[0].id).toBe('g2');
  expect(children[1].id).toBe('g1');
  expect(children[1]).toBe(g1); // Reference check

  // Inner items swapped?
  const inner = children[1].children;
  expect(inner[0].id).toBe('i2');
  expect(inner[1].id).toBe('i1');
  expect(inner[1]).toBe(i1); // Inner reference check
});

it('Handles mixed text and element nodes without replacing elements', () => {
  const parent = document.createElement('div');
  parent.innerHTML = 'Hello <b>World</b> !';
  const boldEl = parent.querySelector('b');

  // Update only the text nodes surrounding the element
  const newHtml = 'Hi <b>World</b> ?';
  morph(parent, newHtml);

  // 1. Text updated
  expect(parent.firstChild.nodeValue).toBe('Hi ');
  expect(parent.lastChild.nodeValue).toBe(' ?');

  // 2. Element preserved (Identity check)
  const newBold = parent.querySelector('b');
  expect(newBold).toBe(boldEl);
  expect(newBold.innerHTML).toBe('World');
});

it('Updates, adds, and removes attributes correctly', () => {
  const parent = document.createElement('div');

  // Initial: class="red", id="test", disabled
  parent.innerHTML = '<button class="red" id="test" disabled>Btn</button>';
  const btn = parent.firstElementChild;

  // Update: class="blue", id removed, disabled removed, data-new added
  const newHtml = '<button class="blue" data-new="value">Btn</button>';
  morph(parent, newHtml);

  // 1. Class updated
  expect(btn.className).toBe('blue');
  // 2. ID removed
  expect(btn.hasAttribute('id')).toBe(false);
  // 3. Boolean attribute removed (prop and attr)
  expect(btn.hasAttribute('disabled')).toBe(false);
  expect(btn.disabled).toBe(false); // Important for inputs!
  // 4. New attribute added
  expect(btn.getAttribute('data-new')).toBe('value');
});

    it('Prevents morphing when skip attribute has value', async () => {
      Lilla.define('skip-static', {
        shadow: false,
        state: () => ({ count: 0 }),
        template: ({ state }, html) => html`
          <div id="normal">${state.count}</div>
          <div id="skipped" skip="true">Static Content</div>
        `
      });

      const el = document.createElement('skip-static');
      document.body.appendChild(el);
      await flush();

      const skipped = el.querySelector('#skipped');

      // Mutate the skipped element manually
      skipped.textContent = 'Manually Changed';
      skipped.setAttribute('data-custom', 'value');

      // Trigger re-render
      el.state.count++;
      await flush();

      // Normal element should update
      expect(el.querySelector('#normal').textContent).toBe('1');

      // Skipped element should NOT be touched
      expect(skipped.textContent).toBe('Manually Changed');
      expect(skipped.getAttribute('data-custom')).toBe('value');
    });

    it('Supports dynamic skip based on value (skip=${ref})', async () => {
      const objA = { id: 'A', val: 100 };
      const objB = { id: 'B', val: 200 };

      let renderCount = 0;

      Lilla.define('skip-dynamic', {
        shadow: false,
        state: () => ({
          current: objA,
          counter: 0
        }),
        template: ({ state }, html) => {
          renderCount++;
          return html`
            <div id="container" skip="${state.current}">
              <span id="val">${state.current.val}</span>
            </div>
            <div id="counter">${state.counter}</div>
          `;
        }
      });

      const el = document.createElement('skip-dynamic');
      document.body.appendChild(el);
      await flush();

      const initialRenders = renderCount;
      const container = el.querySelector('#container');
      const val = el.querySelector('#val');

      expect(val.textContent).toBe('100');

      // Change counter but keep same object reference
      el.state.counter++;
      await flush();

      // Template was called (renderCount++), but #container was skipped
      expect(renderCount).toBeGreaterThan(initialRenders);
      expect(el.querySelector('#counter').textContent).toBe('1');

      // Container should still reference the same DOM node
      expect(el.querySelector('#container')).toBe(container);

      // Now swap to different object
      el.state.current = objB;
      await flush();

      // skip value changed → morphing should proceed
      expect(el.querySelector('#val').textContent).toBe('200');
    });

    it('Skip prevents morphing children (component integration)', async () => {
      Lilla.define('skip-children', {
        shadow: false,
        state: () => ({ external: 0 }),
        template: ({ state }, html) => html`
          <div id="wrapper" skip="true">
            <input id="input" value="old" />
            <span>${state.external}</span>
          </div>
        `
      });

      const el = document.createElement('skip-children');
      document.body.appendChild(el);
      await flush();

      const input = el.querySelector('#input');
      const span = el.querySelector('span');

      // User changes input
      input.value = 'user-typed';

      // Manually change span
      span.textContent = 'manual';

      // Trigger re-render
      el.state.external = 42;
      await flush();

      // Because parent has skip, children should NOT be touched
      expect(input.value).toBe('user-typed');
      expect(span.textContent).toBe('manual');
    });

it('Skip attribute works at DOM level (morph unit test)', () => {
  const parent = document.createElement('div');
  // Initial state with skip
  parent.innerHTML = '<div skip="true" id="wrapper"><span>Old Content</span></div>';

  // New HTML tries to change the content
  const newHtml = '<div skip="true" id="wrapper"><span>NEW CONTENT</span></div>';

  morph(parent, newHtml);

  const span = parent.querySelector('span');
  // Content should NOT change
  expect(span.innerHTML).toBe('Old Content');
});

it('Updates Light DOM (Slots) when Parent state changes', async () => {
  // 1. Child Component (просто рендерит слот)
  Lilla.define('slot-child', {
    template: (_, html) => html`
      <div class="shadow-wrapper">
        <slot></slot>
      </div>
    `
  });

  // 2. Parent Component (меняет данные, передаваемые в слот)
  Lilla.define('slot-parent', {
    state: () => ({ label: 'Initial' }),
    template: ({ state }, html) => html`
      <slot-child>
        <span id="slotted-content">${state.label}</span>
      </slot-child>
    `
  });

  const el = document.createElement('slot-parent');
  document.body.appendChild(el);
  await flush();

  const child = el.shadowRoot.querySelector('slot-child');
  // Light DOM узлы находятся в children самого child элемента (не в shadowRoot)
  const span = child.querySelector('#slotted-content');

  expect(span.textContent).toBe('Initial');

  // Update Parent
  el.state.label = 'Updated';
  await flush();

  // 1. Span reference should be preserved (morphing logic)
  const spanAfter = child.querySelector('#slotted-content');
  expect(spanAfter).toBe(span);

  // 2. Content should update
  expect(spanAfter.textContent).toBe('Updated');
});

it('Corrects SVG namespace and attributes', async () => {
  Lilla.define('svg-test', {
    state: () => ({ x: 50 }),
    template: ({ state }, html) => html`
      <svg>
        <circle cx="${state.x}" cy="50" r="20" fill="red" />
      </svg>
    `
  });

  const el = document.createElement('svg-test');
  document.body.appendChild(el);
  await flush();

  const circle = el.shadowRoot.querySelector('circle');
  expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(circle.getAttribute('cx')).toBe('50');
});

it('Handles mixed HTML and SVG elements', async () => {
  Lilla.define('svg-mixed', {
    shadow: false,
    template: (_, html) => html`
      <div>
        <p id="html">HTML</p>
        <svg id="svg">
          <circle cx="10" cy="10" r="5" />
        </svg>
      </div>
    `
  });

  const el = document.createElement('svg-mixed');
  document.body.appendChild(el);
  await flush();

  const p = el.querySelector('#html');
  const svg = el.querySelector('#svg');
  const circle = svg.querySelector('circle');

  expect(p.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
});

});
