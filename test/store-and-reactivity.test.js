import { describe, it, expect } from 'vitest';
import { Lilla, createStore, flush } from './setup.js';

describe('Store & Reactivity (subscribe, watch, batching, immutable ops)', () => {
it('Updates component only when subscribed keys change', async () => {
  // 1. Setup Flat Store
  const store = createStore({ count: 0, unused: 'initial' });
  const tag = 'x-store-reactive';
  let renderCount = 0;

  Lilla.define(tag, {
    shadow: false,
    subscribe: [store, 'count'],
    template: () => {
      renderCount++;
      return `<div id="out">${store.count}</div>`;
    }
  });

  const el = document.createElement(tag);
  document.body.appendChild(el);
  await flush();

  // Initial render
  expect(renderCount).toBe(1);
  expect(el.querySelector('#out').textContent).toBe('0');

  // 1. Update subscribed key: trigger re-render
  store.count = 10;
  await flush();
  expect(renderCount).toBe(2);
  expect(el.querySelector('#out').textContent).toBe('10');

  // 2. Update unsubscribed key: should NOT trigger re-render
  store.unused = 'changed';
  await flush();
  expect(renderCount).toBe(2); // Still 2
});

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
      // Теперь все вотчеры принимают только (newVal)
      status(val) { log.push({ src: 'store', val }); },
      count(val)  { log.push({ src: 'state', val }); },
      title(val)  { log.push({ src: 'props', val }); }
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

it('Automatically unsubscribes when component is removed from DOM', async () => {
  const store = createStore({ value: 0 });
  let renderCount = 0;

  Lilla.define('x-store-cleanup-test', {
    shadow: false,
    subscribe: [store, 'value'],
    template: () => {
      renderCount++;
      return `<div></div>`;
    }
  });

  const el = document.createElement('x-store-cleanup-test');
  document.body.appendChild(el);
  await flush();
  expect(renderCount).toBe(1);

  // Remove element: disconnectedCallback should clear store subs
  el.remove();
  await flush();

  // Change store: should not affect the unmounted component
  store.value = 1;
  await flush();

  expect(renderCount).toBe(1); // No new renders after cleanup
});

it('Batches multiple synchronous store updates into a single render', async () => {
  const store = createStore({ a: 1, b: 1 });
  let renderCount = 0;

  Lilla.define('batch-test', {
    subscribe: [store, 'a', 'b'],
    template: () => {
      renderCount++;
      return `${store.a}, ${store.b}`;
    }
  });

  document.body.appendChild(document.createElement('batch-test'));
  await flush();
  expect(renderCount).toBe(1); // Initial render

  // Update two properties synchronously
  store.a = 2;
  store.b = 2;

  // Wait for ONE Microtask cycle
  await flush();

  // Should be 2 (Initial + 1 Update), NOT 3
  expect(renderCount).toBe(2);
});

it('Subscribes to multiple stores and rerenders on changes in either', async () => {
    // 1. Create two independent stores
    const userStore = createStore({ name: 'Alice' });
    const settingsStore = createStore({ theme: 'light' });

    let renderCount = 0;

    Lilla.define('multi-store-comp', {
      shadow: false,
      // Subscribe to array of arrays: [[store, keys...], [store, keys...]]
      subscribe: [
        [userStore, 'name'],
        [settingsStore, 'theme']
      ],

      template: () => {
        renderCount++;
        return `<div>${userStore.name} in ${settingsStore.theme}</div>`;
      }
    });

    const el = document.createElement('multi-store-comp');
    document.body.appendChild(el);
    await flush();

    // Initial render
    expect(el.textContent).toBe('Alice in light');
    expect(renderCount).toBe(1);

    // 2. Change FIRST store
    userStore.name = 'Bob';
    await flush();

    expect(el.textContent).toBe('Bob in light');
    expect(renderCount).toBe(2);

    // 3. Change SECOND store
    settingsStore.theme = 'dark';
    await flush();

    expect(el.textContent).toBe('Bob in dark');
    expect(renderCount).toBe(3);

    // 4. Change unsubscribed field
    settingsStore.other = 123;
    await flush();

    // Should NOT render
    expect(renderCount).toBe(3);
  });
});

describe('Store Ops (Immutable Operations)', () => {

// Setup helper
const setup = (initial) => {
  const store = createStore({ data: initial });
  return { store, ops: store.use('data') };
};

it('Basic: set, get, update', () => {
  const { store, ops } = setup(10);

  expect(ops.get()).toBe(10);

  ops.set(20);
  expect(store.data).toBe(20);

  ops.update(n => n + 5);
  expect(store.data).toBe(25);
});

    it('Triggers watch even when template is not re-executed', async () => {
      const log = [];

      Lilla.define('manual-watch', {
        shadow: false,
        updateStrategy: 'manual',
        state: () => ({ count: 0, name: 'Alice' }),

        watch: {
          count(val) { log.push({ type: 'count', val }); },
          name(val)  { log.push({ type: 'name', val }); }
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
  const { createStore } = await import('./setup.js');
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

describe('Store Ops (Immutable Operations)', () => {

// Setup helper
const setup = (initial) => {
  const store = createStore({ data: initial });
  return { store, ops: store.use('data') };
};

it('Basic: set, get, update', () => {
  const { store, ops } = setup(10);

  expect(ops.get()).toBe(10);

  ops.set(20);
  expect(store.data).toBe(20);

  ops.update(n => n + 5);
  expect(store.data).toBe(25);
});

it('Deep Access: setIn, updateIn, removeIn', () => {
  const { store, ops } = setup({ user: { profile: { age: 25 } } });

  // setIn
  ops.setIn(['user', 'profile', 'name'], 'Alice');
  expect(store.data.user.profile.name).toBe('Alice');
  expect(store.data.user.profile.age).toBe(25);

  // updateIn
  ops.updateIn(['user', 'profile', 'age'], age => age + 1);
  expect(store.data.user.profile.age).toBe(26);

  // removeIn
  ops.removeIn(['user', 'profile', 'name']);
  expect(store.data.user.profile.name).toBeUndefined();
  // Validate structure remains
  expect(store.data.user.profile.age).toBe(26);
});

it('Arrays: updateById, removeById', () => {
  const initial = [
    { id: 1, text: 'todo 1' },
    { id: 2, text: 'todo 2' }
  ];
  const { store, ops } = setup(initial);

  // updateById
  ops.updateById(1, item => ({ ...item, done: true }));
  expect(store.data[0].done).toBe(true);
  expect(store.data[1].done).toBeUndefined();

  // removeById
  ops.removeById(1);
  expect(store.data.length).toBe(1);
  expect(store.data[0].id).toBe(2);
});

it('Arrays: custom ID key for *ById operations', () => {
  const { store, ops } = setup([
    { key: 'a', val: 1 },
    { key: 'b', val: 2 }
  ]);

  // removeById with custom key
  ops.removeById('a', 'key');
  expect(store.data).toEqual([{ key: 'b', val: 2 }]);

  // updateById with custom key
  ops.updateById('b', item => ({ ...item, val: 99 }), 'key');
  expect(store.data[0].val).toBe(99);
});

it('Arrays: move (reorder)', () => {
  const { store, ops } = setup(['A', 'B', 'C', 'D']);

  // Move 'B' (index 1) to end (index 3)
  ops.move(1, 3);

  // Expected: A, C, D, B
  expect(store.data).toEqual(['A', 'C', 'D', 'B']);

  // Move 'A' (index 0) to index 1
  ops.move(0, 1);

  // Expected: C, A, D, B
  expect(store.data).toEqual(['C', 'A', 'D', 'B']);

  // Out of bounds check (should not change)
  const ref = store.data;
  ops.move(0, 99);
  expect(store.data).toBe(ref);
});

it('Arrays: push, unshift', () => {
  const { store, ops } = setup([1, 2, 3]);

  ops.push(4);
  expect(store.data).toEqual([1, 2, 3, 4]);

  ops.unshift(0);
  expect(store.data).toEqual([0, 1, 2, 3, 4]);
});

it('Arrays: removeAt, updateAt, insertAt', () => {
  const { store, ops } = setup(['A', 'B', 'C', 'D']);

  ops.removeAt(1);
  expect(store.data).toEqual(['A', 'C', 'D']);

  ops.updateAt(0, v => v.toLowerCase());
  expect(store.data).toEqual(['a', 'C', 'D']);

  ops.insertAt(1, 'X');
  expect(store.data).toEqual(['a', 'X', 'C', 'D']);

  const ref = store.data;
  ops.insertAt(99, 'Y');
  expect(store.data).toBe(ref);
});
});
});
