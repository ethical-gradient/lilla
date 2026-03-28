// attr-ref.js

/**
 * Global registry for "Reference Tunneling".
 * Stores objects and functions that need to be passed via HTML attributes.
 */
const REGISTRY = new Map();
const PREFIX = '🔗:';
let counter = 0;

/**
 * Attribute Reference System.
 * Manages short string tokens (IDs) that act as pointers to JS objects/functions.
 */
export const AttrRef = {

  /**
   * Checks if a string is a valid reference ID.
   * @param {string} id - The string to check.
   * @returns {boolean} True if it starts with the reference prefix.
   */
  isRef: (id) => typeof id === 'string' && id.startsWith(PREFIX),

  /**
   * Retrieves the value associated with a reference ID.
   * @param {string} id - The reference ID.
   * @returns {*} The stored value (object, function, etc.) or undefined.
   */
  get: (id) => REGISTRY.get(id),

  /**
   * Allocates a new ID for a value and stores it in the registry.
   * @param {*} val - The value to store.
   * @returns {string} The generated reference ID (e.g., "🔗:1z").
   */
  alloc: (val) => {
    const id = PREFIX + (counter++).toString(36);
    REGISTRY.set(id, val);
    return id;
  },

  /**
   * Frees (garbage collects) a list of IDs.
   * @param {Iterable<string>} ids - List of IDs to remove.
   */
  free: (ids) => {
    for (const id of ids) {
      REGISTRY.delete(id);
    }
  },

  /**
   * Returns debug information about the registry.
   * @returns {Object} Stats: size, counter, and a snapshot of entries.
   */
  debug: () => ({
    counter,
    size: REGISTRY.size,
    data: Object.fromEntries(REGISTRY)
  })
};
