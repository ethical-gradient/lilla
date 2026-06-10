import { describe, it, expect } from 'vitest';
import { Lilla, createStore, flush } from './setup.js';

describe('Watch', () => {

  it('Triggers watch callbacks for Store, State, and Props (Unified API)', async () => {
    const store = createStore({ status: 'offline' });
    const tag = 'x-watch-unified-test';
    const log = [];

    Lilla.define(tag, {
      shadow: false,
      subscribe: [store, 'status'],
      props: { title: String },
      state: { count: 0 },

      watch: {
        status(val) { log.push({ src: 'store', val }); },
        count(val) { log.push({ src: 'state', val }); },
        title(val) { log.push({ src: 'props', val }); }
      },

      template: () => ''
    });

    const el = document.createElement(tag);
    el.setAttribute('title', 'A');
    document.body.appendChild(el);
    await flush();

    // 1. Props Change
    el.setAttribute('title', 'B');
    await flush();
    const propLog = log.filter(l => l.src === 'props').pop();
    expect(propLog.val).toBe('B');

    // 2. State Change
    el.state.count = 42;
    await flush();
    const stateLog = log.find(l => l.src === 'state');
    expect(stateLog.val).toBe(42);

    // 3. Store Change
    store.status = 'online';
    await flush();
    const storeLog = log.find(l => l.src === 'store');
    expect(storeLog.val).toBe('online');
  });

  it('Triggers watch even when template is not re-executed', async () => {
    const log = [];

    Lilla.define('manual-watch', {
      shadow: false,
      updateStrategy: 'manual',
      state: () => ({ count: 0, name: 'Alice' }),

      watch: {
        count(val) { log.push({ type: 'count', val }); },
        name(val) { log.push({ type: 'name', val }); }
      },

      template: ({ state }) => `
          <div id="count">${state.count}</div>
          <div id="name">${state.name}</div>
        `
    });

    const el = document.createElement('manual-watch');
    document.body.appendChild(el);
    await flush();

    const initialLogLen = log.length;

    // Change state
    el.state.count = 10;
    await flush();

    // Watch should fire
    expect(log.length).toBeGreaterThan(initialLogLen);
    const countLog = log.find(entry => entry.type === 'count' && entry.val === 10);
    expect(countLog).toBeDefined();

    // But template was NOT re-executed (manual mode)
    expect(el.querySelector('#count').textContent).toBe('0');
  });

  it('Allows manual DOM updates via watch in manual mode', async () => {
    Lilla.define('manual-dom-update', {
      shadow: false,
      updateStrategy: 'manual',
      state: () => ({ value: 0 }),

      template: (_, html) => html`
          <div>
            Value: <span ref="output">0</span>
          </div>
        `,

      watch: {
        value(newVal) {
          // Manually update cached DOM reference
          this.$refs.output.textContent = newVal;
        }
      },

      onMount() {
        // Start incrementing every tick (fast)
        this._interval = setInterval(() => {
          this.state.value++;
        }, 10);

        // Stop after 50ms
        setTimeout(() => {
          clearInterval(this._interval);
        }, 50);
      },

      onCleanup() {
        if (this._interval) clearInterval(this._interval);
      }
    });

    const el = document.createElement('manual-dom-update');
    document.body.appendChild(el);
    await flush();

    const output = el.$refs.output;

    // Wait for updates
    await new Promise(resolve => setTimeout(resolve, 60));

    // Value should have incremented (watch updated DOM directly)
    const finalValue = parseInt(output.textContent, 10);
    expect(finalValue).toBeGreaterThan(0);
    expect(finalValue).toBeLessThan(10); // Sanity check
  });

  it('Watch handles transition from undefined to value', async () => {
    const log = [];

    Lilla.define('watch-undefined', {
      state: () => ({ val: undefined }),
      watch: {
        val(newVal) { log.push(newVal); }
      },
      template: () => ''
    });

    const el = document.createElement('watch-undefined');
    document.body.appendChild(el);
    await flush();

    // Change from undefined to value
    el.state.val = 42;
    await flush();

    expect(log[log.length - 1]).toBe(42);

    // Change to null
    el.state.val = null;
    await flush();
    expect(log[log.length - 1]).toBe(null);
  });

  it('Store: Nested object reactivity (deep watch)', async () => {

    const store = createStore({
      user: { profile: { name: 'Alice' } }
    });

    let triggered = false;

    Lilla.define('deep-watch', {
      subscribe: [store, 'user'],
      watch: {
        user(val) {
          triggered = true;
          expect(val.profile.name).toBe('Bob');
        }
      },
      template: () => ''
    });

    const el = document.createElement('deep-watch');
    document.body.appendChild(el);
    await flush();

    triggered = false;

    // Deep mutation — should trigger if store is reactive
    store.user = { profile: { name: 'Bob' } };
    await flush();

    expect(triggered).toBe(true);
  });

  it('Handles 100 synchronous state changes (batching stress test)', async () => {
    let renderCount = 0;

    Lilla.define('batch-stress', {
      shadow: false,
      state: () => ({ count: 0 }),
      template: ({ state }) => {
        renderCount++;
        return `<div>${state.count}</div>`;
      }
    });

    const el = document.createElement('batch-stress');
    document.body.appendChild(el);
    await flush();

    const initial = renderCount;

    // 100 synchronous mutations
    for (let i = 1; i <= 100; i++) {
      el.state.count = i;
    }

    await flush();

    // Should batch into very few renders (ideally 1-2)
    expect(renderCount).toBeLessThan(initial + 5);
    expect(el.textContent).toBe('100');
  });

});
