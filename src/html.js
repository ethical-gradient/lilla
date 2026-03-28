/**
 * Escapes special characters to prevent XSS.
 * @param {string} s - The raw string.
 * @returns {string} Escaped string.
 */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
const esc = s => typeof s === 'string' ? s.replace(/[&<>"']/g, c => ESC_MAP[c]) : s;

/**
 * Wrapper for trusted HTML content.
 */
export const safe = (str) => ({ __safe: str });

/**
 * Marks a string as safe HTML, bypassing escaping.
 * @param {string} str - The trusted HTML string.
 * @returns {object} wrapped safe HTML.
 */
export const unsafe = (str) => safe(str);

/**
 * Detects whether the current interpolation is inside an HTML attribute.
 * Used to determine if values should be tunneled (ref) or stringified.
 * @param {string} s - The string segment preceding the interpolation.
 * @returns {boolean} True if inside an attribute value (e.g. `id="..."`).
 * @private
 */
function inAttr(s) {
  let i = s.length - 1;
  while (i >= 0 && s[i] !== '"' && s[i] !== "'") {
    if (s[i] === '>' || s[i] === '<') return false;
    i--;
  }
  if (i < 0) return false;
  i--;
  while (i >= 0 && /\s/.test(s[i])) i--;
  if (s[i] !== '=') return false;
  const beforeEq = s.slice(0, i);
  const lastGt = beforeEq.lastIndexOf('>');
  const lastLt = beforeEq.lastIndexOf('<');
  return lastGt < lastLt || lastGt === -1;
}
 /**
 * Processes a value for interpolation.
 * Handles escaping, array joining, and object tunneling via the store.
 * @param {*} v - The value to process.
 * @param {string} prev - The preceding string part (context).
 * @param {Function} refStore - The reference storage function.
 * @returns {string} The processed HTML string or token.
 * @private
 */
const processVal = (v, prev = '', refStore) => {
  if (v && v.__safe !== undefined) return v.__safe;
  if (v == null) return '';

  const attr = inAttr(prev);
  const type = typeof v;

  // Primitives: escaped and returned as string
  if (type !== 'object' && type !== 'function') return esc(String(v));

  // Functions:
  // - Inside attribute: tunnel via store() (for event handlers)
  // - Outside attribute: stringify (no tunneling, prevents [native code])
  if (type === 'function') {
    return attr ? refStore(v) : esc(String(v));
  }

  // Objects inside attribute: tunnel via store() (for props)
  if (attr) return refStore(v);

  // Static arrays: inline as HTML/string
  if (Array.isArray(v)) {
    const isStatic = v.every(x =>
      (x && x.__safe !== undefined) ||
      x == null ||
      typeof x === 'string' ||
      typeof x === 'number'
    );
    if (isStatic) return v.map(x => processVal(x, '', refStore)).join('');
  }

  // Fallback:
  // - Objects outside attributes: stringify for debug
  // - Nested templates etc.: handled via __safe check at start
  try {
    return esc(JSON.stringify(v, null, 2));
  } catch (e) {
    return esc(String(v)); // Fallback for circular references
  }
};

/**
 * Creates a context-bound HTML tag function.
 * @param {Function} [store] - Callback to process objects/functions (returns ref ID).
 * @returns {Function} The tagged template function `html`.
 */
export function createHtml(refStore) {
  // Use provided store or fallback to simple escaping
  const store = refStore || (v => esc(String(v)));

  return function html(parts, ...vals) {
    let res = parts[0];
    for (let i = 0; i < vals.length; i++) {
      // Pass the processor directly
      res += processVal(vals[i], parts[i], store) + parts[i + 1];
    }
    return safe(res);
  };
}

/**
 * Standard `html` tag for static templates or shared helpers.
 * @note This instance DOES NOT support event/object tunneling (refs).
 * For component rendering, use the `html` passed to the template function.
 */
export const html = createHtml(null);
