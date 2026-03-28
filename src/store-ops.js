// store-ops.js

/**
 * Parses a path string into an array of keys.
 * @param {string|string[]} path - Dot-notation string ('a.b') or array keys.
 * @returns {string[]} Array of keys.
 */
function parsePath(path) {
  if (Array.isArray(path)) return path;
  if (typeof path !== 'string') return [];
  return path.split('.').filter(Boolean);
}

/**
 * Internal Helper: Removes a property or array item immutably.
 * Performs real deletion (splice for arrays, delete for objects).
 * @param {Array|Object} container - Parent structure.
 * @param {string|number} key - Key or Index to remove.
 */
const removeProp = (container, key) => {
  if (Array.isArray(container)) {
    const idx = Number(key);
    if (idx < 0 || idx >= container.length) return container;
    const copy = container.slice();
    copy.splice(idx, 1); // Real removal, no undefined holes
    return copy;
  }
  if (!(key in Object(container))) return container;
  const { [key]: deleted, ...rest } = container; // Real key removal
  return rest;
};

/**
 * Immutably updates an item in an array.
 * Returns the original array if the index is invalid or value hasn't changed.
 * @param {Array} arr - Source array.
 * @param {number} index - Index to update.
 * @param {Function} fn - Updater function (item => newItem).
 */
function updateArrayItem(arr, index, fn) {
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) return arr;
  const item = arr[index];
  const newItem = fn(item);
  if (item === newItem) return arr;

  const copy = arr.slice();
  copy[index] = newItem;
  return copy;
}

/**
 * Recursively updates a nested structure.
 * Creates copies only for the changed path (Structural Sharing).
 * @param {Object} obj - The root object.
 * @param {string|string[]} path - Path to the value.
 * @param {Function} fn - Updater function.
 */
function updateDeep(obj, path, fn) {
  const keys = parsePath(path);
  if (keys.length === 0) return fn(obj);

  const [head, ...tail] = keys;
  const base = obj && typeof obj === 'object' ? obj : {};
  const nextVal = updateDeep(base[head], tail, fn);

  if (base[head] === nextVal) return base;

  // Preserve array structure if container is array
  if (Array.isArray(base)) {
      const copy = base.slice();
      copy[head] = nextVal;
      return copy;
  }
  return { ...base, [head]: nextVal };
}

/**
 * Creates a functional operations API for a specific store key.
 * Operations replace the entire property value, triggering reactivity.
 * @param {Object} store - The reactive store proxy.
 * @param {string} key - The top-level state key (e.g., 'users').
 */
export function createOps(store, key) {
  const get = () => store[key];

  const set = (nextVal) => {
    if (store[key] === nextVal) return false;
    store[key] = nextVal;
    return true;
  };

  const update = (fn) => set(fn(store[key]));

  const listUpdate = (fn) => update(arr => Array.isArray(arr) ? fn(arr) : arr);
  const findIndex = (arr, id, idKey) => arr?.findIndex?.(x => x?.[idKey] === id) ?? -1;

  return {
    get,
    set,

    /**
     * Update value using a function.
     * @param {Function} fn - (current) => next.
     * @returns {boolean} True if value changed.
     */
    update,

    /**
     * Set a value deep inside the object structure.
     * @param {string|string[]} path - Path (e.g. 'settings.theme').
     * @param {*} value - The value to set.
     */
    setIn: (path, value) => update(obj => updateDeep(obj, path, () => value)),

    /**
     * Update a value deep inside using a function.
     * @param {string|string[]} path - Path to update.
     * @param {Function} fn - (oldVal) => newVal.
     */
    updateIn: (path, fn) => update(obj => updateDeep(obj, path, fn)),

    /**
     * Remove a property deep inside the object (or item from array).
     * @param {string|string[]} path - Path to remove.
     */
    removeIn: (path) => update(obj => {
       const keys = Array.isArray(path) ? [...path] : String(path).split('.').filter(Boolean);
       if (keys.length === 0) return obj;
       const targetKey = keys.pop(); // Remove last key
       return updateDeep(obj, keys, (parent) => removeProp(parent, targetKey));
    }),

    /**
     * Find an item by ID and update it.
     * @param {*} id - The ID to search for.
     * @param {Function} fn - (item) => newItem.
     * @param {string} [idKey='id'] - The property name of the ID.
     */
    updateById: (id, fn, idKey = 'id') =>
      listUpdate(arr => updateArrayItem(arr, findIndex(arr, id, idKey), fn)),

    /**
     * Find an item by ID and remove it.
     * @param {*} id - The ID to search for.
     * @param {string} [idKey='id'] - The property name of the ID.
     */
    removeById: (id, idKey = 'id') =>
      listUpdate(arr => removeProp(arr, findIndex(arr, id, idKey))),

    /**
     * Move item from one index to another (for Drag & Drop reordering).
     * @param {number} from - Old index.
     * @param {number} to - New index.
     */
    move: (from, to) =>
      listUpdate(arr => {
        if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
        const copy = arr.slice();
        const [item] = copy.splice(from, 1);
        copy.splice(to, 0, item);
        return copy;
    }),

    /**
     * Add item to the end of array.
     * @param {*} item - Item to add.
     */
    push: (item) => listUpdate(arr => [...arr, item]),

    /**
     * Add item to the start of array.
     * @param {*} item - Item to add.
     */
    unshift: (item) => listUpdate(arr => [item, ...arr]),

    /**
     * Remove item at specific index.
     * @param {number} index - Index to remove.
     */
    removeAt: (index) => listUpdate(arr => removeProp(arr, index)),

    /**
     * Update item at specific index.
     * @param {number} index - Index to update.
     * @param {Function} fn - Updater function (item => newItem).
     */
    updateAt: (index, fn) => listUpdate(arr => updateArrayItem(arr, index, fn)),

    /**
     * Insert item at specific index.
     * @param {number} index - Position to insert.
     * @param {*} item - Item to insert.
     */
    insertAt: (index, item) => listUpdate(arr => {
      if (index < 0 || index > arr.length) return arr;
      const copy = arr.slice();
      copy.splice(index, 0, item);
      return copy;
    })
  };
}

