import { createHtml, html, unsafe } from './html.js';
import { morph } from './morph.js';
import { AttrRef } from './attr-ref.js';
import { createStore } from './store.js';
import { memo, camelToKebab } from './utils.js';

const RESERVED_KEYS = new Set([
  'state', 'props', 'template', 'styles', 'shadow',
  'subscribe', 'watch', 'onMount', 'onUpdate', 'onCleanup',
  'updateStrategy'
]);


// Normalize config upfront for cleaner internal logic
const normalize = (cfg) => {

  // normalize to [[]]
  let sub = cfg.subscribe || [];
  if (!Array.isArray(sub)) sub = [sub];
  if (sub.length > 0 && !Array.isArray(sub[0])) {
    sub = [sub];
  }

  return  {
    props: {},
    watch: {},
    ...cfg,
    subscribe: sub,
    shadow: cfg.shadow ?? Lilla._config.shadow ?? true,
    template: cfg.template || (() => '')
  }
};

export { html, unsafe, memo, createStore };

export const Lilla = {

  _config: {
    shadow: true,
  },

  /**
   * Configures global settings for the framework.
   * @param {Object} opts - Configuration options.
   * @param {boolean} [opts.shadow=true] - Sets the default shadow DOM mode for all components.
   * @param {string} [opts.globalStyles] - CSS string applied to all components.
   */
  configure(opts) {
    if (opts.globalStyles) {
      const s = new CSSStyleSheet();
      s.replaceSync(opts.globalStyles);
      this._config.globalSheet = s;
    }
    if ('shadow' in opts) {
      this._config.shadow = !!opts.shadow;
    }
  },

  /**
   * Defines a new Web Component.
   * @param {string} tag - The custom element tag name.
   * @param {Object} cfg - Component configuration.
   * @returns {HTMLElement} The constructed custom element class.
   */
  define(tag, cfg) {
    // Normalize Configuration
    const api = normalize(cfg);

    // Prepare Styles (Once)
    let localSheet;
    if (api.styles) {
      localSheet = new CSSStyleSheet();
      localSheet.replaceSync(api.styles);
    }

    // Prepare Props Map
    const attrToProp = Object.fromEntries(
      Object.keys(api.props).map(k => [camelToKebab(k), k])
    );

    const Component = class extends HTMLElement {
      static get observedAttributes() {
        return Object.keys(attrToProp);
      }

      constructor() {
        super();
        // Store normalized config reference
        this._api = api;

        this._unsubs = [];
        this._events = new Set();

        this._onEvent = this._handleEvent.bind(this);

        // Initialization Pipeline
        this._initRoot();
        this._initAttrRefSystem();
        this._initProps();
        this._initAccessors(); // $data, $refs

        // Initialize state store if defined
        if (api.state) {
          const s = api.state;
          const initial = typeof s === 'function'
            ? s.call(this)
            : (s && typeof s === 'object') ? structuredClone(s) : s;
          this.state = createStore(initial);
        }

        this._initExternalSubs();
        this._initMethods();
      }

      // Lifecycle Callbacks

      connectedCallback() {
        this._isConnected = true;

        // Hydrate props from tunnel references
        for (const attr of this.attributes) {
          const v = attr.value;
          const tunneled = this._attrRefGet(v);
          if (tunneled === undefined) continue;
          const propName = attrToProp[attr.name] || attr.name;
          this.props[propName] = tunneled;
        }

        // Attach event listeners
        this._events.forEach(e => this._root.addEventListener(e, this._onEvent));

        // Subscribe to local state changes
        this._subscribe(this.state, null);

        // Initial Render
        this.update();
        this._api.onMount?.call(this);
      }

      disconnectedCallback() {
        this._isConnected = false;
        this._events.forEach(e => this._root.removeEventListener(e, this._onEvent));

        this._unsubs.forEach(u => u());
        this._unsubs.length = 0;

        this._refCache = new WeakMap();
        if (this._oldRefs) {
          AttrRef.free(this._oldRefs);
          this._oldRefs = null;
        }

        this._api.onCleanup?.call(this);
      }

      attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;
        const prop = attrToProp[name] || name;

        // Handle object reference tunneling
        const refValue = this._attrRefGet(newVal);
        if (refValue !== undefined) {
          this.props[prop] = refValue;
          return;
        }

        // Handle type inference
        const def = this._api.props[prop];
        this.props[prop] =
          // Boolean: Handle HTML flags (presence = true, 'false' string = false)
          (def === Boolean || typeof def === 'boolean') ? (newVal !== null && newVal !== 'false')
          // Number: Default to 0 if attribute is missing/null
          : (def === Number || typeof def === 'number') ? (newVal == null ? 0 : Number(newVal))
          // String: Prevent 'null' string result from String(null)
          : (def === String && newVal == null) ? ''
          // Custom Parsers
          : (typeof def === 'function') ? def(newVal)
          // Default: Assign raw value
          : newVal;
      }

      // Public API

      /**
       * Forces a re-render of the component.
       */
      update() {
        // Manual update strategy override
        if (this._api.updateStrategy === 'manual' && this._lastTpl) {
          return this._api.onUpdate?.call(this);
        }

        this._newRefs = new Set();

        try {
          const ctx = {
            props: this.props,
            state: this.state,
            ...this._methods
          };

          // Render Template (api.template is guaranteed to be a function)
          const res = this._api.template.call(this, ctx, this._html);
          let tpl = res?.__safe ?? String(res ?? '');

          if (tpl !== this._lastTpl) {
            // Template Changed
            morph(this._root, tpl);
            this._lastTpl = tpl;
            this._registerEvents(tpl);

            // Cleanup refs that existed in old render but not in new
            this._cleanStaleRefs(this._oldRefs, this._newRefs);
            this._oldRefs = this._newRefs;
          }

          // Lifecycle hook
          this._api.onUpdate?.call(this);

        } catch (e) {
          console.error(`Render error in <${this.localName}>:`, e);
        } finally {
          this._newRefs = null;
        }
      }

      /**
       * Dispatches a custom event from the component.
       */
      emit(name, detail = null, opts = {}) {
        this.dispatchEvent(
          new CustomEvent(name, {
            bubbles: true,
            composed: true,
            detail,
            ...opts
          })
        );
      }

      // Core Internals

      _batchUpdate() {
        // Guard prevents duplicate microtasks during reconnect.
        // If component detaches and re-attaches before microtask runs,
        // connectedCallback will sync render, and this pending task will
        // render again when it finally executes—no updates are lost.
        if (this._dirty) return;
        this._dirty = true;
        queueMicrotask(() => {
          if (this._isConnected) this.update();
          this._dirty = false;
        });
      }

      _handleEvent(e) {
        const attr = `on:${e.type}`;
        const root = this._root;

        for (const el of e.composedPath()) {
          if (el === root) break;
          if (!(el instanceof Element) || !el.hasAttribute(attr)) continue;

          this._curEl = el;
          const handler = this._resolveHandler(el.getAttribute(attr), e);
          if (handler) handler(e);
          break;
        }
        this._curEl = null;
      }

      _resolveHandler(val, e) {
        if (e.type === 'submit') e.preventDefault();
        const fn = this._methods[val] || this._attrRefGet(val);
        return typeof fn === 'function' ? fn : null;
      }

      _registerEvents(tpl) {
        if (!tpl || tpl.indexOf('on:') === -1) return;
        const re = /\bon:([a-z0-9_-]+)\s*=/gi;

        for (const m of tpl.matchAll(re)) {
          const ev = m[1].toLowerCase();
          if (!this._events.has(ev)) {
            this._events.add(ev);
            this._root.addEventListener(ev, this._onEvent);
          }
        }

      }

      // Ref System Helpers

      _attrRefStore(val) {

        let id = this._refCache.get(val);
        if (id && AttrRef.get(id) === undefined) id = null;
        if (!id) {
          id = AttrRef.alloc(val);
          this._refCache.set(val, id);
        }
        if (this._newRefs) this._newRefs.add(id);
        return id;
      }

      _attrRefGet(id) {
        if (AttrRef.isRef(id)) return AttrRef.get(id);
        return undefined;
      }

      _cleanStaleRefs(source, exclude) {
        const toRemove = [];
        for (const id of source) {
          if (!exclude.has(id)) {
            toRemove.push(id);
            const val = this._attrRefGet(id);
            if (val) this._refCache.delete(val);
          }
        }
        if (toRemove.length) AttrRef.free(toRemove);
      }

      _subscribe(store, filterSet = null) {
        if (!store) return;
        this._unsubs.push(
          store.subscribe(keys => {
            // Use normalized watch object
            keys.forEach(k => {
              this._api.watch[k]?.call(this, store[k]);
            });

            const shouldUpdate = !filterSet || keys.some(k => filterSet.has(k));
            if (shouldUpdate) this._batchUpdate();
          })
        );
      }

      // Initialization Helpers

      _initRoot() {
        // Use normalized shadow config
        if (this._api.shadow === false) {
          this._root = this;
          return;
        }
        this.attachShadow({ mode: 'open' });
        this._root = this.shadowRoot;
        const sheets = [Lilla._config.globalSheet, localSheet].filter(Boolean);
        if (sheets.length > 0) this._root.adoptedStyleSheets = sheets;
      }

      _initAttrRefSystem() {
        this._refCache = new WeakMap();
        this._oldRefs = new Set();
        this._newRefs = null;
        this._html = createHtml((v) => this._attrRefStore(v));
      }

      _initProps() {
        const init = {};
        for (const [key, def] of Object.entries(this._api.props)) {
          if (typeof def === 'function') continue;
          init[key] = (def && typeof def === 'object')
            ? structuredClone(def)
            : def;
        }

        this.props = new Proxy(init, {
          set: (target, key, value) => {
            if (target[key] === value) return true;
            target[key] = value;
            // Use normalized watch object
            this._api.watch[key]?.call(this, value);
            this._batchUpdate();
            return true;
          }
        });
      }

      _initExternalSubs() {
        for (const entry of this._api.subscribe) {
          const [store, ...keys] = entry;
          const filters = keys.length > 0
            ? new Set(keys.map(k => String(k).trim()))
            : null;
          this._subscribe(store, filters);
        }
      }

      _initAccessors() {
        this.$data = new Proxy({}, {
          get: (_, p) => {
            if (!this._curEl) return;
            const attr = `data-${camelToKebab(p)}`;
            const host = this._curEl.closest(`[${attr}]`);
            if (!host) return undefined;

            // tunneled value
            const v = host.getAttribute(attr);
            const ref = this._attrRefGet(v);
            if (ref !== undefined) return ref;

            return v === 'true' ? true :
                   v === 'false' ? false :
                   v;
          }
        });
        this.$refs = new Proxy({}, {
          get: (c, k) => {
            const cached = c[k];
            if (cached?.isConnected && cached.getAttribute('ref') === k) {
              return cached;
            }
            const el = this._root.querySelector(`[ref="${k}"]`);
            if (el) {
              c[k] = el;
              return el;
            }
            delete c[k];
            return undefined;
          }
        });

      }

      _initMethods() {
        this._methods = Object.create(null);
        for (const key in this._api) {
          if (RESERVED_KEYS.has(key)) continue;
          const value = this._api[key];
          if (typeof value !== 'function') continue;
          if (key in this) {
            console.warn(`Key "${key}" is reserved`);
            continue;
          }
          const bound = value.bind(this);
          this._methods[key] = bound;
          this[key] = bound;
        }
      }

    };

    customElements.define(tag, Component);
    return Component;
  },
};

