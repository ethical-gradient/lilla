import { createOps } from './store-ops.js';

/**
 * Creates a reactive state store with microtask-batched notifications.
 * @param {Object} initial - The initial state object.
 * @returns {Proxy} The reactive store proxy.
 */
export function createStore(initial = {}) {
  const reserved = ['subscribe', 'use'];

  for (const key of reserved) {
    if (key in initial) throw new Error(`[Store] Key "${key}" is reserved.`)
  }

  const listeners = new Set();
  const changed = new Set();
  let pending = false;

  const notify = keys => listeners.forEach(fn => fn(keys));

  const subscribe = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const proxy = new Proxy(initial, {
    get(target, prop) {
      if (prop === 'subscribe') return subscribe;

      // Delegation to immutable helpers
      if (prop === 'use') return key => createOps(proxy, key)

      return target[prop];
    },

    set(target, prop, value) {
      if (reserved.includes(prop)) return false;
      if (Object.is(target[prop], value)) return true;

      target[prop] = value;
      changed.add(prop);

      // Batch updates via microtask
      if (!pending) {
        pending = true;
        queueMicrotask(() => {
          const keys = [...changed];
          changed.clear();
          pending = false;
          notify(keys);
        });
      }

      return true;
    },

    ownKeys(target) {
      return Reflect.ownKeys(target);
    }
  });

  return proxy;
}
