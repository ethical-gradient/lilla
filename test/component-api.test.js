import { describe, it, expect } from 'vitest';
import { Lilla, flush } from './setup.js';

describe('Component API (props, state, refs, shadow)', () => {

  it('Rerenders when local state changes', async () => {
    Lilla.define('x-counter', {
      shadow: false,
      state: { count: 0 },
      template: ({ state }, html) => html`
        <div id="output">${state.count}</div>
        <button on:click="${() => state.count++}">+</button>
      `
    });

    const el = document.createElement('x-counter');
    document.body.appendChild(el);
    await flush();

    expect(el.querySelector('#output').textContent).toBe('0');

    el.state.count = 42;
    await flush();
    expect(el.querySelector('#output').textContent).toBe('42');
  });

  it('Supports props: defaults, type coercion, and external updates', async () => {
    Lilla.define('prop-test', {
      shadow: false,
      props: {
        label: 'Default',
        count: Number
      },
      template: ({ props }, html) => html`
        <div id="label">${props.label}</div>
        <div id="count">${props.count}</div>
      `
    });

    const el = document.createElement('prop-test');
    el.setAttribute('count', '10');
    document.body.appendChild(el);
    await flush();

    expect(el.querySelector('#label').textContent).toBe('Default');
    expect(el.querySelector('#count').textContent).toBe('10');

    // External update
    el.setAttribute('label', 'Updated');
    await flush();
    expect(el.querySelector('#label').textContent).toBe('Updated');
  });

  it('Supports inline functions with complex context usage (state + props)', async () => {
    Lilla.define('inline-complex', {
      shadow: false,
      props: { multiplier: Number },
      state: { base: 5 },
      template: ({ state, props }, html) => html`
        <div id="result">${state.base * (props.multiplier || 1)}</div>
        <button on:click="${() => state.base++}">Inc</button>
      `
    });

    const el = document.createElement('inline-complex');
    el.setAttribute('multiplier', '3');
    document.body.appendChild(el);
    await flush();

    expect(el.querySelector('#result').textContent).toBe('15');

    el.querySelector('button').click();
    await flush();
    expect(el.querySelector('#result').textContent).toBe('18');
  });

  it('Provides access to DOM elements via $refs', async () => {
    Lilla.define('refs-test', {
      shadow: false,
      template: (ctx, html) => html`
        <input ref="myInput" value="Hello" />
        <button ref="myBtn">Click</button>
      `
    });

    const el = document.createElement('refs-test');
    document.body.appendChild(el);
    await flush();

    expect(el.$refs.myInput).toBeDefined();
    expect(el.$refs.myInput.value).toBe('Hello');
    expect(el.$refs.myBtn.textContent).toBe('Click');
  });

  it('Provides access to data-* attributes from event target', async () => {
    const log = [];

    Lilla.define('data-access', {
      shadow: false,
      state: () => ({ items: [
        { id: 1, text: 'First' },
        { id: 2, text: 'Second' }
      ]}),

      handleClick() {
        log.push({
          id: this.$data.id,
          type: this.$data.type
        });
      },

      template: ({ state }, html) => html`
        <ul>
          ${state.items.map(item => html`
            <li data-id="${item.id}" data-type="todo">
              ${item.text}
              <button on:click="handleClick">Delete</button>
            </li>
          `)}
        </ul>
      `
    });

    const el = document.createElement('data-access');
    document.body.appendChild(el);
    await flush();

    // Click first button
    el.querySelectorAll('button')[0].click();
    expect(log[0]).toEqual({ id: '1', type: 'todo' });

    // Click second button
    el.querySelectorAll('button')[1].click();
    expect(log[1]).toEqual({ id: '2', type: 'todo' });
  });

  it('Searches up the DOM tree for closest data-* attribute', async () => {
    let captured = null;

    Lilla.define('data-bubbling', {
      shadow: false,

      capture() {
        captured = this.$data.itemId;
      },

      template: (_, html) => html`
        <div data-item-id="outer">
          <div data-item-id="inner">
            <button on:click="capture">Click</button>
          </div>
        </div>
      `
    });

    const el = document.createElement('data-bubbling');
    document.body.appendChild(el);
    await flush();

    el.querySelector('button').click();

    // Should find the closest ancestor with data-item-id
    expect(captured).toBe('inner');
  });

  it('Returns undefined if data attribute not found', async () => {
    let captured = null;

    Lilla.define('data-missing', {
      shadow: false,
      template: (ctx, html) => html`
        <button on:click="${(e) => captured = e.$data}">No Data</button>
      `,
    });

    const el = document.createElement('data-missing');
    document.body.appendChild(el);
    await flush();

    el.querySelector('button').click();

    expect(captured).toBeUndefined();
  });

  it('Converts kebab-case to camelCase', async () => {
    let captured = null;

    Lilla.define('data-camel', {
      shadow: false,

      grab() {
        // data-user-role → this.$data.userRole
        captured = this.$data.userRole;
      },

      template: (_, html) => html`
        <div data-user-role="admin">
          <button on:click="grab">Grab</button>
        </div>
      `
    });

    const el = document.createElement('data-camel');
    document.body.appendChild(el);
    await flush();

    el.querySelector('button').click();
    expect(captured).toBe('admin');
  });

  it('state as object creates isolated instances via structuredClone', async () => {
    // Define component with state as OBJECT (should clone per instance)
    Lilla.define('state-as-object', {
      shadow: false,
      state: { count: 0, nested: { value: 'initial' } },
      template: ({ state }, html) => html`
        <div id="val">${state.count}</div>
        <div id="nested">${state.nested.value}</div>
      `
    });

    const el1 = document.createElement('state-as-object');
    const el2 = document.createElement('state-as-object');

    document.body.appendChild(el1);
    document.body.appendChild(el2);
    await flush();

    // Initial state
    expect(el1.querySelector('#val').textContent).toBe('0');
    expect(el2.querySelector('#val').textContent).toBe('0');

    // Modify el1
    el1.state.count = 42;
    el1.state.nested.value = 'changed';
    await flush();

    // el2 should remain unchanged (isolated)
    expect(el1.state.count).toBe(42);
    expect(el2.state.count).toBe(0);  // ← Isolated!

    expect(el1.state.nested.value).toBe('changed');
    expect(el2.state.nested.value).toBe('initial');  // ← Deep clone works!
  });

  it('state as function creates isolated state', async () => {
    Lilla.define('state-as-function', {
      shadow: false,
      state: () => ({ count: 0 }),
      template: ({ state }, html) => html`
        <div id="val">${state.count}</div>
      `
    });

    const el1 = document.createElement('state-as-function');
    const el2 = document.createElement('state-as-function');

    document.body.appendChild(el1);
    document.body.appendChild(el2);
    await flush();

    el1.state.count = 100;
    await flush();

    expect(el1.state.count).toBe(100);
    expect(el2.state.count).toBe(0);  // ← Isolated!
  });

  it('state as function can access this.props defaults', async () => {
    Lilla.define('state-with-context', {
      shadow: false,
      props: { initial: 99 },  // Default value
      state() {
        // Can access this.props during initialization (defaults only)
        // Note: HTML attributes are hydrated later in connectedCallback
        return { count: this.props.initial };
      },
      template: ({ state }, html) => html`
        <div id="val">${state.count}</div>
      `
    });

    const el = document.createElement('state-with-context');
    document.body.appendChild(el);
    await flush();

    expect(el.state.count).toBe(99);
  });

  it('Component without template (edge case)', async () => {
    Lilla.define('no-template', {
      shadow: false,
      state: { mounted: false },
      onMount() {
        this.state.mounted = true;
      }
    });

    const el = document.createElement('no-template');
    document.body.appendChild(el);
    await flush();

    // Should not crash
    expect(el.state.mounted).toBe(true);
  });

  it('Component with shadow:false can access parent DOM', async () => {
    Lilla.define('light-dom', {
      shadow: false,
      template: () => '<div id="light">Light</div>'
    });

    const el = document.createElement('light-dom');
    document.body.appendChild(el);
    await flush();

    // Can query directly
    expect(el.querySelector('#light')).toBeDefined();
    expect(el.querySelector('#light').textContent).toBe('Light');
  });

  it('Component with shadow:true isolates styles', async () => {
    Lilla.define('shadow-dom', {
      shadow: true,
      styles: ':host { color: red; }',
      template: () => '<div id="shadowed">Shadow</div>'
    });

    const el = document.createElement('shadow-dom');
    document.body.appendChild(el);
    await flush();

    // Cannot query from outside (shadowRoot required)
    expect(el.querySelector('#shadowed')).toBeNull();
    expect(el.shadowRoot.querySelector('#shadowed')).toBeDefined();
  });

});
