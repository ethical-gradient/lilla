// import { Lilla, createStore, morph, AttrRef } from '../dist/lilla.es.js';
import { Lilla } from '../src/lilla.js';
import { createStore } from '../src/store.js';
import { morph } from '../src/morph.js';
import { AttrRef } from '../src/attr-ref.js';

const flush = async (n = 2) => {
  while (n--) await new Promise(r => queueMicrotask(r));
};

export { Lilla, createStore, morph, AttrRef, flush }
