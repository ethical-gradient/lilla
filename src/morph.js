// morph.js

const SKIP = 'skip';
const KEY = 'key';
let _tpl;

/**
 * Morphs the children of a parent element to match a new HTML string.
 * Implements a keyed diffing algorithm optimized for minimal DOM operations.
 * @param {HTMLElement} parent - The DOM element to update.
 * @param {string} html - The new HTML content string.
 */
export function morph(parent, html) {
  if (!_tpl) _tpl = document.createElement('template');
  _tpl.innerHTML = html;

  if (html.indexOf('<select') !== -1) {
    const selects = _tpl.content.querySelectorAll('select[value]');
    if (selects.length) {
      for (const s of selects) s.value = s.getAttribute('value')
    }
  }

  patch(parent, _tpl.content);
}

// Filters out comments and whitespace-only text nodes
const cleanNodes = parent => {
  const res = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    const type = node.nodeType
    if (type === 1 || (type === 3 && node.nodeValue.trim())) {
      res.push(node);
    }
  }
  return res;
};

// Gets the stable key for diffing (if present)
const getKey = n => n.nodeType === 1 ? n.getAttribute(KEY) : null;

// Checks if two nodes are effectively the same (same tag + same key)
const isSame = (a, b) =>
  a.nodeType === b.nodeType &&
  (a.nodeType === 3 || (a.tagName === b.tagName && getKey(a) === getKey(b)));

/**
 * The core reconciliation algorithm.
 * Syncs the parent's current children with the new structure.
 */
function patch(parent, newParent) {
  const newNodes = cleanNodes(newParent);
  const oldNodes = cleanNodes(parent);

  // 1. Fast path: clear everything
  if (newNodes.length === 0) {
    parent.textContent = '';
    return;
  }

  // 2. Fast path: initial render (no existing children)
  if (oldNodes.length === 0) {
    if (newParent.nodeType === 11) { // DocumentFragment
      parent.appendChild(newParent);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const node of newNodes) frag.appendChild(node)
    parent.appendChild(frag);
    return;
  }

  let oldStart = 0,
      oldEnd = oldNodes.length - 1,
      newStart = 0,
      newEnd = newNodes.length - 1;

  let oldHead = oldNodes[0],
      oldTail = oldNodes[oldEnd],
      newHead = newNodes[0],
      newTail = newNodes[newEnd];

  // 3. Head & tail optimistic matching + moves
  while (oldStart <= oldEnd && newStart <= newEnd) {
    if (!oldHead || oldHead.parentNode !== parent) { oldHead = oldNodes[++oldStart]; continue; }
    if (!oldTail || oldTail.parentNode !== parent) { oldTail = oldNodes[--oldEnd]; continue; }

    // A. Heads match
    if (isSame(oldHead, newHead)) {
      patchNode(oldHead, newHead);
      oldHead = oldNodes[++oldStart];
      newHead = newNodes[++newStart];
      continue;
    }

    // B. Tails match
    if (isSame(oldTail, newTail)) {
      patchNode(oldTail, newTail);
      oldTail = oldNodes[--oldEnd];
      newTail = newNodes[--newEnd];
      continue;
    }

    // C. Old head matches new tail → move to end
    if (isSame(oldHead, newTail)) {
      patchNode(oldHead, newTail);
      if (oldHead.parentNode) oldHead.remove(); // needed in some test envs (JSDOM/Happy DOM)
      parent.insertBefore(oldHead, oldTail.nextSibling);
      oldHead = oldNodes[++oldStart];
      newTail = newNodes[--newEnd];
      continue;
    }

    // D. Old tail matches new head → move to start
    if (isSame(oldTail, newHead)) {
      patchNode(oldTail, newHead);
      if (oldTail.parentNode) oldTail.remove(); // needed in some test envs
      parent.insertBefore(oldTail, oldHead);
      oldTail = oldNodes[--oldEnd];
      newHead = newNodes[++newStart];
      continue;
    }

    // No quick match → fall back to full keyed diff
    break;
  }

  // 4. Insert remaining new nodes
  if (oldStart > oldEnd) {
    const anchor = oldNodes[oldEnd + 1] || null;
    const fragment = document.createDocumentFragment();
    while (newStart <= newEnd) fragment.appendChild(newNodes[newStart++]);
    parent.insertBefore(fragment, anchor);
    return;
  }

  // 5. Remove remaining old nodes
  if (newStart > newEnd) {
    while (oldStart <= oldEnd) {
      const node = oldNodes[oldStart++];
      if (node && node.parentNode === parent) node.remove();
    }
    return;
  }

  // 6. Map phase: keyed + unkeyed fallback
  const keyed = new Map(),
        free = [];
  // Index old nodes
  for (let i = oldStart; i <= oldEnd; i++) {
    const node = oldNodes[i];
    if (!node || node.parentNode !== parent) continue;
    const key = getKey(node);
    if (key) keyed.set(key, node);
    else free.push(node);
  }

  const anchor = oldNodes[oldStart]; // insertion point
  // Process each remaining new node
  while (newStart <= newEnd) {
    const newNode = newNodes[newStart++];
    const key = getKey(newNode);
    let oldNode = null;

    // Prefer exact key match
    if (key) {
      oldNode = keyed.get(key);
      if (oldNode) keyed.delete(key);
    }
    // Fallback: find compatible unkeyed node (same tag)
    else if (free.length > 0) {
      const idx = free.findIndex(n => isSame(n, newNode));
      if (idx !== -1) oldNode = free.splice(idx, 1)[0];
    }

    if (oldNode) {
      patchNode(oldNode, newNode);
      // Move to correct position if needed
      if (oldNode.nextSibling !== anchor) {
        parent.insertBefore(oldNode, anchor);
      }
    } else {
      // Insert brand new node
      parent.insertBefore(newNode, anchor);
    }
  }

  // Clean up unused old nodes
  keyed.forEach(n => n?.parentNode && n.remove());
  free.forEach(n => n?.parentNode && n.remove());
}

// Updates a single node (attributes + content)
function patchNode(oldNode, newNode) {

  if (oldNode.nodeType !== newNode.nodeType) return;

  if (oldNode.nodeType === 3) {
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue;
    }
    return;
  }

  // Skip entire subtree if requested
  const skip = newNode.getAttribute(SKIP);
  if (skip && oldNode.getAttribute(SKIP) === skip) return;

  // IMPORTANT: Order matters for <select> elements.
  // 1. Update children first (create/remove <option> elements)
  // Do not recurse into nodes that preserve internal state
  if (!keepContent(oldNode)) {
    patch(oldNode, newNode);
  }

  // 2. Update attributes (apply select.value safely after options exist)
  patchAttrs(oldNode, newNode);
}

// Sync attributes & special form properties
function patchAttrs(oldNode, newNode) {
  const oldAttrs = oldNode.attributes;
  const newAttrs = newNode.attributes;
  const tag = oldNode.tagName;

  // 1. Remove attributes that no longer exist + reset special properties
  for (let i = oldAttrs.length; i--;) {
    const name = oldAttrs[i].name;
    if (!newNode.hasAttribute(name)) {
      oldNode.removeAttribute(name);
      // Prevent stale values in inputs/select/option
      if (name in oldNode) {
        if (name === 'value') {
           // Do not clear value for SELECT if attribute is removed (transition to uncontrolled)
           if (tag !== 'SELECT') oldNode.value = '';
        } else if (name === 'checked' || name === 'selected') {
           oldNode[name] = false;
        }
      }
    }
  }

  // 2. Set / update attributes & form properties
  for (let i = 0; i < newAttrs.length; i++) {
    const { name, value } = newAttrs[i];

    // Sync JS Properties
    switch (name) {
      case 'value':
        // 'value' in oldNode covers Input, Textarea, Select AND Custom Elements
        if (tag === 'SELECT') {
          // controlled only
          if (newNode.hasAttribute('value') && oldNode.value !== value) {
            oldNode.value = value;
          }
        } else if ('value' in oldNode && oldNode.value !== value) {
          oldNode.value = value;
        }
        break;
      case 'checked':
        if (tag === 'INPUT') oldNode.checked = value !== 'false';
        break;
      case 'selected':
        // Guard: update prop only if attribute actually changed
        // Don't override user selection on unrelated re-renders
        if (tag === 'OPTION' && oldNode.getAttribute(name) !== value) {
          oldNode.selected = (value !== 'false' && value !== null);
        }
        break;
    }

    // Sync DOM Attribute
    if (oldNode.getAttribute(name) !== value) {
      oldNode.setAttribute(name, value);
    }
  }

}

// Nodes that should NOT have their content recursively patched
// (to preserve user input, focus, scroll position, etc.)
const keepContent = (node) => {
  const t = node.tagName;
  if (t.includes('-')) return (!node.shadowRoot);
  if (t === 'INPUT') return node.type !== 'checkbox' && node.type !== 'radio';
  if (node.isContentEditable || node.getAttribute('contenteditable') === 'true')
    return node.contains(document.activeElement);
  return t === 'TEXTAREA';
};
