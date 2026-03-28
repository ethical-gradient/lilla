import { describe, it, expect } from 'vitest';
import { Lilla, flush } from './setup.js';

describe('Lifecycle Hooks', () => {

  it('Triggers onMount immediately after connecting to DOM', async () => {
    let mounted = false;
    const tag = 'x-mount-basic';

    Lilla.define(tag, {
      shadow: false,
      template: () => '<div></div>',
      onMount() {
        mounted = true;
        // Verify 'this' context is the element
        expect(this.tagName.toLowerCase()).toBe(tag);
        // Verify DOM is accessible
        expect(this.isConnected).toBe(true);
      }
    });

    const el = document.createElement(tag);

    // Not mounted yet
    expect(mounted).toBe(false);

    document.body.appendChild(el);
    await flush();

    expect(mounted).toBe(true);
  });

  it('Can modify state inside onMount to trigger immediate re-render', async () => {
    const tag = 'x-mount-state';

    Lilla.define(tag, {
      shadow: false,
      state: () => ({ status: 'loading' }),
      template: ({ state }) => `<div id="out">${state.status}</div>`,

      onMount() {
        // Simulate fetching data immediately on mount
        this.state.status = 'loaded';
      }
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    // Should render 'loaded', skipping the 'loading' frame effect
    // (or updating so fast it appears synchronous in test)
    expect(el.querySelector('#out').textContent).toBe('loaded');
  });


  it('Triggers onUpdate after state changes and DOM updates', async () => {
    let updateCount = 0;
    const tag = 'x-update-state';

    Lilla.define(tag, {
      shadow: false,
      state: () => ({ count: 0 }),
      template: ({ state }) => `<span id="val">${state.count}</span>`,

      onUpdate() {
        updateCount++;
        // Verify DOM is already updated when hook runs
        const txt = this.querySelector('#val').textContent;
        expect(txt).toBe(String(this.state.count));
      }
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    // connectedCallback calls update(), which calls onUpdate.
    const initialCount = updateCount;
    expect(initialCount).toBeGreaterThan(0);

    // Trigger update
    el.state.count = 1;
    await flush();

    expect(updateCount).toBe(initialCount + 1);
  });

  it('Triggers onUpdate when Props (Attributes) change', async () => {
    let lastPropVal = null;
    const tag = 'x-update-props';

    Lilla.define(tag, {
      shadow: false,
      props: { title: 'initial' },
      template: () => `<div></div>`,

      onUpdate() {
        lastPropVal = this.props.title;
      }
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    expect(lastPropVal).toBe('initial');

    // Change attribute externally
    el.setAttribute('title', 'changed');
    await flush();

    expect(lastPropVal).toBe('changed');
  });


  it('Triggers onCleanup when component is explicitly removed (el.remove())', async () => {
    let cleaned = false;
    const tag = 'x-cleanup-manual';

    Lilla.define(tag, {
      shadow: false,
      template: () => '<div></div>',
      onCleanup() {
        cleaned = true;
      }
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    expect(cleaned).toBe(false);

    el.remove();
    await flush();

    expect(cleaned).toBe(true);
  });

  it('Is used to clean up global event listeners (Memory Leak Prevention)', async () => {
    const tag = 'x-cleanup-listener';
    let globalClicks = 0;

    Lilla.define(tag, {
      shadow: false,
      template: () => '<div></div>',

      onMount() {
        // Bind to instance to allow removal
        this._handler = () => globalClicks++;
        document.body.addEventListener('click', this._handler);
      },

      onCleanup() {
        document.body.removeEventListener('click', this._handler);
      }
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    // Click while mounted
    document.body.click();
    expect(globalClicks).toBe(1);

    // Unmount
    el.remove();
    await flush();

    // Click after unmount should 
    // not increase count
    document.body.click();
    expect(globalClicks).toBe(1);
  });

  it('Triggers onCleanup when component is removed via conditional rendering', async () => {
    let cleaned = false;

    Lilla.define('simple-child-clean', {
      template: () => `Alive`,
      onCleanup() { cleaned = true; }
    });

    Lilla.define('toggler-comp', {
      state: () => ({ show: true }),
      template: ({ state }, html) => html`
      <div id="wrapper">${state.show ? html`<simple-child-clean></simple-child-clean>` : ''}</div>`
    });

    const el = document.createElement('toggler-comp');
    document.body.appendChild(el);

    // Wait for the parent render and the child render
    await flush();
    await flush();

    const child = el.shadowRoot.querySelector('simple-child-clean');
    expect(child.shadowRoot.textContent).toContain('Alive');

    el.state.show = false;
    await flush();

    expect(el.shadowRoot.querySelector('simple-child-clean')).toBeNull();
    expect(cleaned).toBe(true);
  });

});
