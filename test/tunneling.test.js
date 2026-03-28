import { describe, it, expect } from 'vitest';
import { Lilla, AttrRef, flush } from './setup.js';

// Helper to access internal registry size (via public debug API or fallback)
const getRefSize = () => {
  return AttrRef.debug ? AttrRef.debug().size : -1;
};

// Helper component to verify object identity without accessing private APIs
Lilla.define('probe-child', {
  shadow: false,
  props: { val: null },
  template: () => '',
  // Public method for test assertions
  getValue() { return this.props.val; }
});

describe('Tunneling & Reference Management', () => {

  it('Maintains stable IDs for unchanged objects and functions (Optimization)', async () => {
    const tag = 'x-stability-test';
    const obj = { a: 1 };

    Lilla.define(tag, {
      shadow: false,
      state: () => ({ count: 0, ob: obj }),
      template: ({ state }, html) => html`
        <div id="target" data-ob="${state.ob}">
          ${state.count}
        </div>
      `
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    const getTarget = () => el.querySelector('#target');
    const firstId = getTarget().getAttribute('data-ob');

    // Trigger rerender by changing count, but keep 'ob' reference same
    el.state.count++;
    await flush();

    const secondId = getTarget().getAttribute('data-ob');

    // Contract: IDs must be identical across renders for same references
    expect(secondId).toBe(firstId);
    expect(firstId.startsWith('🔗:')).toBe(true);
  });

  it('Rotates IDs and clears previous generation after update', async () => {
    const tag = 'x-memory-test-gc';

    Lilla.define(tag, {
      shadow: false,
      state: () => ({ obj: { id: 1 } }),
      template: ({ state }, html) => html`
        <probe-child id="probe" val="${state.obj}"></probe-child>
      `
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    const probe = el.querySelector('#probe');
    const obj1 = el.state.obj;
    const ref1 = probe.getAttribute('val');

    // Verify object passed correctly
    expect(probe.getValue()).toBe(obj1);

    const sizeAfterFirst = getRefSize();

    // 2. Completely replace the object
    el.state.obj = { id: 2 };
    await flush();

    const obj2 = el.state.obj;
    const ref2 = probe.getAttribute('val');

    // Verify new object passed
    expect(probe.getValue()).toBe(obj2);
    expect(probe.getValue()).not.toBe(obj1);

    // Verify ID changed
    expect(ref2).not.toBe(ref1);

    // 3. GC Check: Size should remain stable (1 out, 1 in)
    // If GC failed, size would increase.
    expect(getRefSize()).toBe(sizeAfterFirst);
  });

  it('Tunnels complex objects from parent to child via attributes', async () => {
    const childTag = 'x-child';
    const parentTag = 'x-parent';
    const data = { message: 'hello from parent' };

    Lilla.define(childTag, {
      shadow: false,
      props: { info: {} },
      template: ({ props }) => `<span id="child-out">${props.info.message}</span>`
    });

    Lilla.define(parentTag, {
      shadow: false,
      state: () => ({ shared: data }),
      template: ({ state }, html) => html`
        <x-child info="${state.shared}"></x-child>
      `
    });

    const el = document.createElement(parentTag);
    document.body.appendChild(el);
    await flush();

    expect(el.querySelector('#child-out')?.textContent).toBe('hello from parent');
  });

  it('Tunnels nested arrays and renders them via map in child component', async () => {
    const childTag = 'x-list-child';
    const parentTag = 'x-list-parent';

    const complexData = {
      title: 'Shopping List',
      items: [
        { id: 101, text: 'Milk' },
        { id: 102, text: 'Bread' }
      ]
    };

    Lilla.define(childTag, {
      shadow: false,
      props: { data: { items: [] } },
      template: ({ props }, html) => html`
        <div id="child-root">
          <h3>${props.data.title}</h3>
          <ul>
            ${props.data.items.map(item => html`
              <li class="item" key="${item.id}">${item.text}</li>
            `)}
          </ul>
        </div>
      `
    });

    Lilla.define(parentTag, {
      shadow: false,
      state: () => ({ list: complexData }),
      template: ({ state }, html) => html`
        <x-list-child data="${state.list}"></x-list-child>
      `
    });

    const el = document.createElement(parentTag);
    document.body.appendChild(el);
    await flush();

    const childRoot = el.querySelector('#child-root');
    const title = childRoot.querySelector('h3').textContent;
    const items = childRoot.querySelectorAll('.item');

    // Check structure
    expect(title).toBe('Shopping List');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Milk');
    expect(items[1].textContent).toBe('Bread');

    // Verify reactivity through the tunnel
    el.state.list = {
      title: 'Updated List',
      items: [{ id: 999, text: 'Coffee' }]
    };
    await flush();

    expect(childRoot.querySelector('h3').textContent).toBe('Updated List');
    const updatedItems = childRoot.querySelectorAll('.item');
    expect(updatedItems.length).toBe(1);
    expect(updatedItems[0].textContent).toBe('Coffee');
  });

  it('Passes an object from Root -> Middle -> Leaf correctly', async () => {
    const SHARED_OBJECT = {
      id: 101,
      text: 'Hello Deep World',
      nested: { verified: true }
    };

    // 1. LEAF: Deepest component
    Lilla.define('test-leaf', {
      shadow: false,
      props: { finalData: {} },
      template: ({ props }, html) => html`
        <div id="leaf-content">
          ${props.finalData.text}
        </div>
      `
    });

    // 2. MIDDLE: Pass-through component
    Lilla.define('test-middle', {
      shadow: false,
      props: { midProp: {} },
      template: ({ props }, html) => html`
        <div class="middle-wrapper">
          <test-leaf final-data="${props.midProp}"></test-leaf>
        </div>
      `
    });

    // 3. ROOT: Owner
    Lilla.define('test-root', {
      shadow: false,
      state: () => ({ data: SHARED_OBJECT }),
      template: ({ state }, html) => html`
        <test-middle mid-prop="${state.data}"></test-middle>
      `
    });

    const root = document.createElement('test-root');
    document.body.appendChild(root);
    await flush();

    // A. Check DOM content
    const leaf = document.querySelector('test-leaf');
    const content = leaf.querySelector('#leaf-content');
    expect(content.textContent.trim()).toBe('Hello Deep World');

    // B. Verify Reference Integrity
    expect(leaf.props.finalData).toBe(SHARED_OBJECT);

    // C. Verify attribute format (should be Lilla Ref ID)
    const leafAttr = leaf.getAttribute('final-data');
    const middle = document.querySelector('test-middle');
    const midAttr = middle.getAttribute('mid-prop');

    expect(leafAttr).toMatch(/^🔗:/);
    expect(midAttr).toMatch(/^🔗:/);
    expect(leafAttr).not.toBe('[object Object]');
  });


  it('Updates inline event handlers when scope variables change', async () => {
    Lilla.define('closure-test', {
      shadow: false,
      state: () => ({ id: 1, result: null }),
      template: ({ state }, html) => html`
        <button on:click="${() => state.result = state.id}">Click</button>
      `
    });

    const el = document.createElement('closure-test');
    document.body.appendChild(el);
    await flush();

    // Click 1
    el.querySelector('button').click();
    expect(el.state.result).toBe(1);

    // Change State
    el.state.id = 2;
    await flush();

    // Click 2 (Should use NEW id from closure)
    el.querySelector('button').click();
    expect(el.state.result).toBe(2);
  });

  describe('Memory Leak & Cleanup', () => {

    it('Should cleanup duplicate refs in deep tunneling (Level 1 -> 2 -> 3)', async () => {
        const startSize = getRefSize();
        const tag = 'test-root-leak';

        // Leaf
        Lilla.define('test-leak-leaf', {
            props: { data: {} },
            template: ({ props }, html) => html`
                <div id="leaf">${props.data.txt}</div>
            `
        });

        // Middle
        Lilla.define('test-leak-middle', {
            props: { tunnel: {} },
            template: ({ props }, html) => html`
                <test-leak-leaf data="${props.tunnel}"></test-leak-leaf>
            `
        });

        // Root
        Lilla.define(tag, {
            state: () => ({
                payload: { txt: 'Secret' }
            }),
            template: ({ state }, html) => html`
                <test-leak-middle tunnel="${state.payload}"></test-leak-middle>
            `
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        await flush();

        const mountedSize = getRefSize();
        // Expect growth: Root->Mid and Mid->Leaf create references
        expect(mountedSize).toBeGreaterThan(startSize);

        // Unmount
        el.remove();
        await flush();

        // Verify cleanup
        const finalSize = getRefSize();
        expect(finalSize).toBe(startSize);
    });
  });

  it('Handles SAME reference passed to MULTIPLE attributes (Deduplication)', async () => {
    const tag = 'x-double-ref';
    const sharedObj = { id: 777 };

    Lilla.define(tag, {
      shadow: false,
      state: () => ({ data: sharedObj, showSecond: true }),
      template: ({ state }, html) => html`
        <div id="test"
             data-first="${state.data}"
             ${state.showSecond ? html`data-second="${state.data}"` : ''}>
        </div>
      `
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    const div = el.querySelector('#test');
    const id1 = div.getAttribute('data-first');
    const id2 = div.getAttribute('data-second');

    // 1. Deduplication check: IDs must be identical for same object
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^🔗:/);

    // 2. GC Check: Remove from one attribute, keep in other
    // We use state to toggle structure instead of modifying template config directly
    el.state.showSecond = false;
    await flush();

    const newDiv = el.querySelector('#test');
    const newId1 = newDiv.getAttribute('data-first');
    const newId2 = newDiv.getAttribute('data-second');

    // Second attribute should be gone
    expect(newId2).toBeNull();

    // First attribute should still be valid and point to same object
    expect(newId1).toBe(id1);
  });

  it('Safely tunnels Circular References without stack overflow', async () => {
    const tag = 'x-circular-test';

    const circle = { name: 'Ouroboros' };
    circle.self = circle;

    Lilla.define(tag, {
      shadow: false,
      state: () => ({ obj: circle }),
      template: ({ state }, html) => html`
        <probe-child id="res" val="${state.obj}"></probe-child>
      `
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    const probe = el.querySelector('#res');

    // Retrieve via public method of probe component
    const retrieved = probe.getValue();

    expect(retrieved).toBe(circle);
    expect(retrieved.self).toBe(retrieved);
  });

  it('GC handles rapid state changes skipping intermediate frames', async () => {
    const tag = 'x-flicker-leak';
    const startSize = getRefSize();

    Lilla.define(tag, {
      state: () => ({ item: { id: 1 } }),
      template: ({ state }, html) => html`<div data-v="${state.item}"></div>`
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    const sizeAfterMount = getRefSize();

    // 1. Rapid state changes (synchronous)
    // Lilla batches updates. Render runs only for the LAST state.
    el.state.item = { id: 2 };
    el.state.item = { id: 3 };
    el.state.item = { id: 4 };

    // Wait for batched render
    await flush();

    // Size should match sizeAfterMount (1 active ID),
    // it should NOT grow by +3 (id 2 and 3 should be skipped entirely)
    expect(getRefSize()).toBe(sizeAfterMount);

    // 2. Unmount
    el.remove();
    await flush();

    expect(getRefSize()).toBe(startSize);
  });

  it('Preserves Ref IDs during Keyed List Reordering (Swap)', async () => {
    const tag = 'x-list-ref-swap';

    const objA = { name: 'A' };
    const objB = { name: 'B' };

    Lilla.define(tag, {
      shadow: false,
      state: () => ({ items: [objA, objB] }),
      template: ({ state }, html) => html`
        <ul>
          ${state.items.map(item => html`
            <li key="${item.name}" data-ref="${item}"></li>
          `)}
        </ul>
      `
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();

    const lis = el.querySelectorAll('li');
    const idA_before = lis[0].getAttribute('data-ref');
    const idB_before = lis[1].getAttribute('data-ref');

    // SWAP items in state
    el.state.items = [objB, objA];
    await flush();

    const lis_new = el.querySelectorAll('li');

    // First LI should now be B
    expect(lis_new[0].getAttribute('key')).toBe('B');

    const idB_after = lis_new[0].getAttribute('data-ref');
    const idA_after = lis_new[1].getAttribute('data-ref');

    // MAIN CHECK:
    // Reference IDs must remain identical.
    // This proves Lilla reused the cache instead of creating new IDs.
    expect(idA_after).toBe(idA_before);
    expect(idB_after).toBe(idB_before);
  });

  it('Torture Test: Deep cleanup of AttrRef function tunnels', async () => {
    const rootTag = 'torture-root';
    const midTag  = 'torture-mid';
    const leafTag = 'torture-leaf';

    // 1. LEAF
    Lilla.define(leafTag, {
      shadow: false,
      props: { fn: Function },
      template: ({ props }, h) => h`
        <button id="btn" on:click="${props.fn}">Click</button>
      `
    });

    // 2. MID
    Lilla.define(midTag, {
      shadow: false,
      props: { callback: Function },
      template: ({ props }, h) => h`
        <div class="wrapper">
          <${leafTag} fn="${props.callback}"></${leafTag}>
        </div>
      `
    });

    let callCount = 0;

    // 3. ROOT
    Lilla.define(rootTag, {
      shadow: false,
      state: () => ({
        visible: true,
        handler: () => callCount++
      }),
      template: ({ state }, h) => h`
        <div id="container">
          ${state.visible
            ? h`<${midTag} callback="${() => callCount++}"></${midTag}>`
            : h`<span>empty</span>`
          }
        </div>
      `
    });

    const initialSize = getRefSize();

    const root = document.createElement(rootTag);
    document.body.appendChild(root);
    await flush();

    // Phase 1: Mount
    const sizeMounted = getRefSize();
    expect(sizeMounted).toBeGreaterThan(initialSize);

    root.querySelector('#btn')?.click();
    expect(callCount).toBe(1);

    // Phase 2: Torture Cycle (Mount/Unmount)
    for (let i = 0; i < 3; i++) {
      // Hide
      root.state.visible = false;
      await flush();

      const sizeHidden = getRefSize();
      expect(sizeHidden).toBe(initialSize); // Should be clean

      // Show
      callCount = 0;
      root.state.visible = true;
      await flush();

      const sizeRemounted = getRefSize();
      expect(sizeRemounted).toBe(sizeMounted); // Should stabilize

      root.querySelector('#btn')?.click();
      expect(callCount).toBe(1);
    }

    // Phase 3: Final Cleanup
    root.remove();
    await flush();

    const sizeFinal = getRefSize();
    expect(sizeFinal).toBe(initialSize);
  });
});
