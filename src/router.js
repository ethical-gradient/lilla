import { createStore } from './store.js';

/**
 * Creates and returns a reactive SPA router.
 * @param {Object} initialRoutes - Initial route map (path -> view).
 * @param {Object} options - Router configuration.
 * @param {string} [options.base=''] - Base path (e.g., '/app').
 */
export function createRouter(initialRoutes = {}, { base = '' } = {}) {
  // Normalize base path by removing trailing slash
  if (base) {
    base = (base.startsWith('/') ? base : '/' + base).replace(/\/$/, '');
  }

  if (!globalThis.URLPattern) {
    console.error('[Router] URLPattern API is not supported. Please include a polyfill.');
  }

  // Disable browser's native scroll restoration to handle it manually
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // Internal reactive state
  const store = createStore({
    path: '/',       // The current clean path without base (e.g., '/users/123')
    params: {},      // Dynamic route parameters from URLPattern (e.g., { id: '123' })
    query: {},       // Parsed query string parameters (e.g., { sort: 'asc' })
    hash: '',        // The URL hash/fragment (e.g., '#details')
    view: null,      // The resolved view component or render function
    data: null,      // Data passed during navigation
    previous: null,  // Snapshot of the previous router state for transitions/history
    route: null,     // The matched route pattern string (e.g., '/user/:id')
  });

  const routes = [];
  const beforeHooks = [];
  const afterHooks = [];
  let fallbackView = null;

  const addRoute = (path, view) => {
    if (path === '*' || path === '404') {
      fallbackView = view;
      return;
    }
    routes.push({ path, pattern: new URLPattern({ pathname: path }), view });
  };

  const resolve = (url) => {
    const u = new URL(url, location.origin);

    // Strip base prefix to get a clean path for route matching
    const startsWithBase = base && (u.pathname === base || u.pathname.startsWith(base + '/'));
    const cleanPath = startsWithBase ? u.pathname.slice(base.length) || '/' : u.pathname;

    // Construct a full URL string specifically for safe URLPattern execution
    const virtualUrl = new URL(cleanPath + u.search + u.hash, location.origin);

    let matchedRoute = null;
    let match = null;

    for (const route of routes) {
      match = route.pattern.exec(virtualUrl.href);
      if (match) {
        matchedRoute = route;
        break;
      }
    }

    return {
      path: cleanPath, // Store always holds the clean path (without base)
      params: match?.pathname.groups || {},
      query: Object.fromEntries(u.searchParams),
      hash: u.hash,
      view: matchedRoute ? matchedRoute.view : fallbackView,
      route: matchedRoute?.path || (fallbackView ? '*' : null),
      withinBase: !base || startsWithBase,
    };
  };

  const navigate = async (url, { replace = false, isPop = false, data = null } = {}) => {
    try {
      const to = { ...resolve(url), data };

      // Snapshot current state to pass as 'from' context
      const current = {
        path: store.path,
        params: store.params,
        query: store.query,
        hash: store.hash,
        data: store.data,
        route: store.route,
      };

      const previous = replace ? store.previous : current;

      // Execute global beforeEach hooks sequentially
      for (const hook of beforeHooks) {
        try {
          const hookResult = await hook(to, current, { replace, isPop });

          if (hookResult === false) return; // Cancel navigation
          if (typeof hookResult === 'string') {
            return navigate(hookResult, { replace: true, isPop }); // Redirect
          }
        } catch (err) {
          console.error('[Router] Error in beforeEach hook:', err);
          return; // Abort transition to prevent app crash
        }
      }

      // Resolve async components or render functions (Lazy loading)
      let viewResult = to.view;

      // Execute view function here to keep resolve() pure
      if (typeof viewResult === 'function') {
        viewResult = viewResult({ ...to, router: store });
      }

      try {
        if (viewResult instanceof Promise) {
          viewResult = await viewResult;
        }
      } catch (err) {
        console.error('[Router] Error loading route:', err);
        viewResult = fallbackView || null; // Fallback on load failure
      }

      if (!viewResult) {
        console.warn(`[Router] No route matched for: ${to.path}`);
      }

      // Update History API
      if (!isPop) {
        const targetUrl = (to.withinBase ? base : '') + to.path +
          (Object.keys(to.query).length ? '?' + new URLSearchParams(to.query).toString() : '') +
          to.hash;

        history[replace ? 'replaceState' : 'pushState'](data, '', targetUrl);
      }

      // Update reactive store
      Object.assign(store, {
        path: to.path,
        params: to.params,
        query: to.query,
        hash: to.hash,
        view: viewResult,
        data,
        previous,
        route: to.route,
      });

      afterHooks.forEach(fn => fn(to, current));

      // Handle scrolling after DOM update
      requestAnimationFrame(() => {
        if (to.hash) {
          document.querySelector(to.hash)?.scrollIntoView({ behavior: 'smooth' });
        } else if (!isPop) {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
      });

    } catch (err) {
      console.error('[Router] Crash during navigation:', err);
    }
  };

  const onPopState = (e) => navigate(location.href, { isPop: true, data: e.state });

  const onClick = (e) => {
    // Ignore clicks with modifiers (open in new tab/window), right/middle clicks, and prevented defaults
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.composedPath().find(el => el.tagName?.toUpperCase() === 'A');
    if (!link || link.target || link.hasAttribute('download') ||
        link.hasAttribute('data-no-router') || link.origin !== location.origin) return;

    const url = new URL(link.href);

    // Ignore links pointing outside the base path
    if (base && url.pathname !== base && !url.pathname.startsWith(base + '/')) {
      return;
    }

    e.preventDefault();

    // Handle anchor links on the same page
    if (url.pathname === location.pathname && url.hash) {
      history.pushState(null, '', url.href);
      store.hash = url.hash;
      store.query = Object.fromEntries(url.searchParams);

      const target = document.querySelector(url.hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      } else {
        console.warn(`[Router] Anchor element not found: ${url.hash}`);
      }
      return;
    }

    navigate(link.href);
  };

  window.addEventListener('popstate', onPopState);
  window.addEventListener('click', onClick);

  const router = Object.assign(store, {
    /**
     * Navigates to a new URL and adds a record to the history stack.
     * @param {string} url - The target URL.
     * @param {any} [data=null] - Optional state data to pass to the route.
     * @returns {Promise<void>}
     */
    push: (url, data = null) => navigate(url, { data }),

    /**
     * Navigates to a new URL, replacing the current history entry.
     * @param {string} url - The target URL.
     * @param {any} [data=null] - Optional state data to pass to the route.
     * @returns {Promise<void>}
     */
    replace: (url, data = null) => navigate(url, { replace: true, data }),

    /**
     * Parses a URL and returns the matched route state without navigating.
     * @param {string} url - The URL to resolve.
     * @returns {Object} The resolved route state.
     */
    resolve,

    /**
     * Registers a global navigation guard.
     * @param {Function} fn - The hook function (can be async). Return false to cancel, or a string URL to redirect.
     * @returns {Object} The router instance (chainable).
     */
    beforeEach(fn) {
      beforeHooks.push(fn);
      return this;
    },

    afterEach(fn) {
      afterHooks.push(fn);
      return this;
    },

    /**
     * Dynamically registers one or multiple routes.
     * @param {string|Object} pathOrObj - A path string or a dictionary of routes.
     * @param {Function|any} [view] - The view constructor (if pathOrObj is a string).
     * @returns {Object} The router instance (chainable).
     */
    add(pathOrObj, view) {
      if (typeof pathOrObj === 'string') {
        addRoute(pathOrObj, view);
        return this;
      }
      Object.entries(pathOrObj || {}).forEach(([p, v]) => addRoute(p, v));
      return this;
    },

    /**
     * Removes global event listeners and clears registered routes and hooks.
     */
    destroy() {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('click', onClick);
      beforeHooks.length = 0;
      afterHooks.length = 0;
      routes.length = 0;
    }
  });

  router.add(initialRoutes);

  // Defined via defineProperty to bypass the store Proxy's set trap
  Object.defineProperty(router, 'ready', {
    value: Promise.resolve()
      .then(() => router.replace(location.href, history.state))
      .catch(err => console.error('[Router] Fatal initial error:', err)),
    writable: true,
    configurable: true,
  });

  return router;
}
