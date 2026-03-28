// utils.js

/**
 * Creates a memoized version of a function.
 * Caches the result based on arguments using shallow comparison.
 * Uses Object.is to correctly handle edge cases like NaN and -0.
 *
 * @param {Function} fn - The expensive function to memoize.
 * @returns {Function} A new function that returns the cached result if arguments haven't changed.
 */
export function memo(fn) {
  let lastArgs = null;
  let lastResult = null;

  return function (...args) {
    // 1. Check if arguments match the previous call
    if (
      lastArgs &&
      args.length === lastArgs.length &&
      args.every((v, i) => Object.is(v, lastArgs[i]))
    ) {
      return lastResult; // Hit: return cached result
    }

    // 2. Miss: Execute function and update cache
    // .slice() to store a copy of the arguments array,
    // protecting against external mutation of the args array.
    lastArgs = args.slice();
    lastResult = fn(...args);

    return lastResult;
  };
}

export const camelToKebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
