import { describe, it, expect } from 'vitest';
import { Lilla, createStore, flush } from './setup.js';

describe('Store & Reactivity (subscribe, batching, store ops)', () => {

  it('Supports different syntax for single and multiple stores', async () => {
    const storeA = createStore({ count: 0 });
    const storeB = createStore({ count: 0 });

    Lilla.define('x-store-1', {
      shadow: false,
      subscribe: storeA,
      template: () => { return `${storeA.count}` },
    });

    Lilla.define('x-store-2', {
      shadow: false,
      subscribe: [storeA],
      template: () => { return `${storeA.count}` },
    });

    Lilla.define('x-store-3', {
      shadow: false,
      subscribe: [[storeA]],
      template: () => { return `${storeA.count}` },
    });

    Lilla.define('x-store-4', {
      shadow: false,
      subscribe: [storeA, storeB],
      template: () => { return `${storeA.count + storeB.count}` },
    });

    Lilla.define('x-store-5', {
      shadow: false,
      subscribe: [[storeA, 'count'], storeB],
      template: () => { return `${storeA.count + storeB.count}` },
    });

    Lilla.define('x-store-6', {
      shadow: false,
      subscribe: [[storeA, 'count'], [storeB, 'count']],
      template: () => { return `${storeA.count + storeB.count}` },
    });

    document.body.append(
      document.createElement('x-store-1'),
      document.createElement('x-store-2'),
      document.createElement('x-store-3'),
      document.createElement('x-store-4'),
      document.createElement('x-store-5'),
      document.createElement('x-store-6'),
       );

    storeA.count++
    storeB.count++

    await flush()

    expect(document.querySelector('x-store-1').textContent).toBe('1');
    expect(document.querySelector('x-store-2').textContent).toBe('1');
    expect(document.querySelector('x-store-3').textContent).toBe('1');
    expect(document.querySelector('x-store-4').textContent).toBe('2');
    expect(document.querySelector('x-store-5').textContent).toBe('2');
    expect(document.querySelector('x-store-6').textContent).toBe('2');
  });

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

describe('Store Operations', () => {

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
