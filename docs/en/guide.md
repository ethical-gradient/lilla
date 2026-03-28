# Lilla Documentation v0.1.0

**Table of Contents:**

- [Installation](#installation)
- [Hello World](#hello-world)
- [Basic Component Structure](#basic-component-structure)
- [Props — input parameters](#props--input-parameters)
- [Templates](#templates)
- [State — reactive state](#state--reactive-state)
- [Event Handling](#event-handling)
- [Lifecycle](#lifecycle)
- [watch — observing changes](#watch--observing-changes)
- [Styles](#styles)
- [Slots — content projection](#slots--content-projection)
- [Global Store](#global-store)
- [Store Operations API](#store-operations-api)
- [Under the Hood](#under-the-hood)
- [Global Configuration (Lilla.configure)](#global-configuration-lillaconfigure)
- [Component Config Reference](#component-config-reference)

## Installation

> (Section under development)

## Hello World

The simplest component:

```js
import { Lilla } from './lilla.js'

Lilla.define('hello-world', {
  template(ctx, html) {
    return html`
      <div>Hello, world!</div>
    `
  }
})
```

Usage in HTML:

```html
<hello-world></hello-world>
```

Component registration is done via `Lilla.define('tag-name', config)`.
The configuration fields are described below and explained in detail in the corresponding sections.

## Basic Component Structure

```js
Lilla.define('my-counter', {

  // Component parameters (props)
  props: {
    start: Number,
    label: 'Count'
  },

  // Local reactive state
  state: {
    count: 0
  },

  // Template (html`` returns safe HTML)
  template({ props, state }, html) {
    return html`
      <h2>${props.label}: ${state.count}</h2>
      <button on:click="inc">+1</button>
      <button on:click="dec">–1</button>
    `
  },

  inc() {
    this.state.count++
  },

  dec() {
    this.state.count--
  },

  // Lifecycle hooks (optional)
  onMount() {
    this.state.count = this.props.start || 0
    console.log('Component mounted')
  },

  onUpdate() {
    console.log('Count: ' + this.state.count)
  }

})
```

```html
<my-counter start="5" label="Days without incidents: "></my-counter>
```

## Props — input parameters

Props are passed via HTML attributes and are available inside the template as `props`.

```js
props: {
  title: String,
  count: Number,
  active: Boolean
}
```

Usage:

```html
<user-card title="Alice" count="5" active></user-card>
```

Inside the component:

```js
props.title   // "Alice"
props.count   // 5
props.active  // true
```

The prop type is inferred from the default value in `props`.
You can also provide a default value:

```js
props: {
  role: 'Guest',
  limit: 10
}
```

### Complex values

Objects, arrays, and functions can be passed directly:

```js
const user = { name: 'Alice' }

// in the parent component template
html`<user-card user="${user}"></user-card>`
```

Inside the component: `props.user.name`.

Attribute names are automatically converted: `current-user → currentUser`


## Templates

A template is a function that returns HTML using the `html` tagged template literal.

Always use `html`, as it provides automatic value escaping and built-in XSS protection.

Templates support standard JavaScript expressions:

- Interpolation: `${expression}`
- Conditions: `${condition ? html... : ''}`
- Lists: Arrays returned from `.map()` are automatically flattened — no `join()` needed
- Safety: all values are escaped by default

Otherwise, templates behave like regular template literals.
```js
// Component methods are added to the context,
// so 'toggle' can be destructured directly
template({ props, state, toggle }, html) {
  const { name, isAdmin } = props
  const items = state.todos || []

  return html`
    <header>Hello, ${name}!</header>

    ${isAdmin ? html`<button>Admin panel</button>` : ''}

    <ul>
      ${items.map(todo => html`
        <li class="${todo.done ? 'done' : ''}">
          ${todo.text}
          <button on:click=${() => toggle(todo.id)}>✓</button>
        </li>
      `)}
    </ul>
  `
}

```
### Context (this) inside templates

Lilla uses plain JavaScript, so normal scoping rules apply.

If you need to access component methods via `this` inside event handlers, define `template` as a regular method rather than an arrow function.


## State — reactive state

State can be defined in two ways:

```js
// Option 1 — object (most common)
state: {
  count: 0,
  todos: [],
  filter: 'all'
}

// Option 2 — function (if you need access to this / props during initialization)
state() {
  return {
    count: this.props.initialCount || 0
  }
}
```

Reactivity is triggered when a new value is assigned to a top-level key in `state`.

Internally, Lilla uses a Proxy, so such assignments automatically schedule a deferred render.

```js
this.state.count++                                // works

this.state.todos = [...this.state.todos, newTodo] // works
this.state.todos.push(newTodo)                    // does NOT work

this.state.filter = { value: 'completed' }        // works
this.state.filter.value = 'completed'             // does NOT work
```

For working with arrays and nested structures, helper methods are available via .use(key):

```js
this.state.use('todos').removeById(id)
```

See also: [Store Operations API](#store-operations-api)

## Event Handling

Syntax: `on:event="method"`

```html
<button on:click="increment">+1</button>
<input on:input="handleInput">
<form on:submit="save"></form>
```

A handler can be either a component method or a function.

### Named Method

Recommended approach:

```js
Lilla.define('my-comp', {
  inc() {
    this.state.count++
  },

  template(_, html) {
    return html`
      <button on:click="inc">+1</button>
    `
  }
})
```

### Arrow Function

Useful for simple cases or when passing values from the template context:

```js
template(_, html) {
  return html`
    <button on:click="${() => this.state.count++}">+1</button>
  `
}
```

### Emitting Events (emit)

Components can emit events to their parent using `emit`.

```js
this.emit('remove', { id: 42 })
```

The parent component can handle the event:

```html
<user-card on:remove="handleRemove"></user-card>
```

```js
handleRemove(e) {
  console.log(e.detail.id)
}
```

### Passing Data with data-* and $data

If a handler needs a value from the markup, you can use `data-*` attributes.

```html
<li data-id="42">
  <button on:click="remove">Delete</button>
</li>
```

Inside the handler, the value is available via `$data`:

```js
remove() {
  const id = Number(this.$data.id)
  this.state.use('todos').removeById(id)
}
```

`$data` searches for the nearest element with the corresponding `data-*` attribute.

For example:

```
data-id → this.$data.id
data-user-name → this.$data.userName
```

## Lifecycle

Lilla uses the standard Web Components lifecycle and adds three user hooks:

- `onMount()` — called once after the first render
- `onUpdate()` — called after every component update
- `onCleanup()` — called when the component is removed from the DOM

The lifecycle looks like this:

`component connected → onMount → update → onUpdate → component disconnected → onCleanup`

---

### onMount

Called once after the component is connected to the DOM and the first render has completed.

Suitable for:

- loading data
- subscribing to external events
- initializing third-party libraries

```js
onMount() {
  fetch("/api/user")
    .then(r => r.json())
    .then(data => {
      this.state.user = data
    })
}
```

### onUpdate

Called after every component update.

Useful for synchronizing with the DOM or external libraries.

```js
onUpdate() {
  if (this.$refs.chart) {
    this.$refs.chart.update()
  }
}
```

### onCleanup

Called when the component is removed from the DOM.

Used to release resources and unsubscribe from events.

```js
onCleanup() {
  window.removeEventListener("resize", this._onResize)
}
```

## watch — observing changes

The `watch` option lets you react to changes of specific keys in state, props, or external stores.

It is a more precise mechanism than `onUpdate`.

```js
watch: {
  count(newValue) {
    console.log('count changed:', newValue)
  }
}
```

The function receives the new value and runs only when that key actually changes.

### Computed Properties

You can define computed getters inside the state object:

```js
state: {
  firstName: 'Alice',
  lastName: 'Smith',
  get fullName() {
    return `${this.firstName} ${this.lastName}`
  }
}
```

Usage in template:

```js
template({ state }, html) {
  return html`<h1>Hello, ${state.fullName}!</h1>`
}
```

Computed properties are recalculated on every render when their dependencies change.

### memo() — expensive computations

If a computed value is **expensive** to calculate, use `memo()`:

```js
import { memo } from 'lilla'

const filterItems = memo((items, query) =>
  items.filter(item => item.text.includes(query))
)
```

To avoid defining such methods outside the component, you can declare them directly inside `state`.

```js
state() {
  const calcTotal = memo(items => items.reduce((s, i) => s + i.price, 0));

  return {
    items: [],
    get total() { return calcTotal(this.items); },
  }
}
```

If the arguments haven't changed, the cached result is returned.

## Styles

Lilla supports both Shadow DOM (default) and Light DOM rendering.

### Shadow DOM (default)

```js
Lilla.define('my-card', {
  shadow: true, // default

  styles: `
    :host {
      display: block;
      padding: 1rem;
      border: 1px solid #ddd;
    }
    
    .title { font-size: 1.5rem; }
  `,

  template(_, html) {
    return html`
      <div class="title">Card Title</div>
    `
  }
})
```

Benefits:
- Style isolation (doesn't affect the rest of the page)
- `:host` selector for the component root
- Can use `adoptedStyleSheets` for performance

### Light DOM

```js
Lilla.define('my-widget', {
  shadow: false,

  // styles won't work in Light DOM, use global CSS
  template(_, html) {
    return html`
      <div class="widget">Content</div>
    `
  }
})
```

Light DOM components use global page styles.

## Slots — content projection

Slots allow content to be passed from the parent into the component.

**Parent:**
```html
<modal-window>
  <h1 slot="header">Title</h1>
  <p>Main content here</p>
  <button slot="footer">Close</button>
</modal-window>
```

**Component:**
```js
Lilla.define('modal-window', {
  template(_, html) {
    return html`
      <div class="modal">
        <header>
          <slot name="header"></slot>
        </header>
        <main>
          <slot></slot>
        </main>
        <footer>
          <slot name="footer"></slot>
        </footer>
      </div>
    `
  }
})
```

- `<slot></slot>` — default slot (unnamed content)
- `<slot name="header"></slot>` — named slot

Slots only work with Shadow DOM (`shadow: true`).

## Global Store

For sharing state between components, use `createStore()`:

```js
import { createStore } from 'lilla'

const appStore = createStore({
  user: null,
  theme: 'light'
})
```

### Subscribing to a store

```js
Lilla.define('user-profile', {
  subscribe: [appStore],  // subscribe to all changes
  
  template(_, html) {
    return html`
      <div>User: ${appStore.user?.name || 'Guest'}</div>
    `
  }
})
```

Filtering by keys:

```js
subscribe: [appStore, 'user', 'theme']  // only user and theme
```

### Multiple stores

```js
subscribe: [
  [appStore],
  [themeStore, 'mode']
]
```

### Component state is also a store

Component state is automatically created via `createStore`, so you can use:

```js
this.state.subscribe(...)
this.state.use(...)
```

## Store Operations API

`.use(key)` returns a set of helper methods for working with objects and arrays.

```js
const ops = store.use('key')

// Basic operations
ops.get()                  // current value
ops.set(value)             // full replacement
ops.update(fn)             // value = fn(value)

// Nested objects (path: 'a.b.c' or ['a','b','c'])
ops.setIn(path, value)     // set value
ops.updateIn(path, fn)     // update via function
ops.removeIn(path)         // remove key

// Array of objects
ops.updateById(id, fn, idKey = 'id')  // update item by id
ops.removeById(id, idKey = 'id')      // remove item by id
ops.move(from, to)                    // move element

// Array operations
ops.push(item)             // add to end
ops.unshift(item)          // add to start
ops.removeAt(index)        // remove by index
ops.updateAt(index, fn)    // update by index
ops.insertAt(index, item)  // insert at position
```

Example:

```js
// Add item
this.state.use('todos').push({ id: Date.now(), text: 'New task' })

// Remove by id
this.state.use('todos').removeById(42)

// Update nested value
appStore.use('user').setIn('profile.avatar', '/images/new.jpg')
```

## Under the Hood

To better understand Lilla's behavior, it's useful to know how the framework passes data and updates the DOM.

### AttrRef Tunneling

In the Web Components standard, attributes can only be strings. If you write:

```html
<my-el data="${obj}">
```

the browser converts the object to `"[object Object]"` and the data is lost.

Lilla solves this through the **AttrRef** system.

When an object, array, or function is passed in a template:

```js
const user = { name: 'Alice', id: 1 }
html`<user-card user="${user}"></user-card>`
```

Lilla does the following:

- Saves the object in an internal registry and assigns it an ID like `"🔗:7f9k"`
- Writes the attribute as `user="🔗:7f9k"`
- When creating or updating the component, Lilla sees this prefix, retrieves the original object, and passes it to `props`

**Benefits:**
- No serialization/deserialization
- Preserves object and function identity
- Unused references are automatically cleaned up
- Works in Shadow DOM
- Doesn't require global variables

In the DOM inspector you may see attributes like: `on:save="🔗:a3b9"`
This is normal behavior.

### DOM Morphing

Lilla doesn't use a Virtual DOM. Instead, it uses a lightweight DOM morphing algorithm (patching the existing tree).

**Update process:**
- `template()` is called, creating a new HTML string
- It's parsed into a DocumentFragment
- The algorithm compares old and new nodes
- Only changed parts of the DOM are updated
- When element order changes, nodes are moved rather than recreated

This avoids unnecessary DOM operations while preserving element state.

#### key

For lists, it's recommended to use the `key` attribute:

```js
${items.map(item => html`
  <li key="${item.id}">${item.text}</li>
`)}
```

`key` helps the algorithm understand that an element moved rather than being deleted and recreated.

Without `key`, matching only happens by node type, which can lead to unnecessary updates and loss of local state (e.g., input focus).

#### skip

The `skip` attribute disables morphing for an element and its descendants:

```html
<div id="google-map" skip></div>
<canvas skip></canvas>
```

Useful when a third-party library manages that DOM subtree.

You can pass a value:

```html
<div key="${row}" skip="${row}">...</div>
```

If the `skip` value remains the same between renders, Lilla will skip updating this node.

Use carefully — if there's dynamic data inside the node, it won't be updated.

### Manual Update Control

By default, Lilla uses the `auto` strategy: any state change triggers template recalculation and DOM morphing.

You can switch to manual mode: `updateStrategy: 'manual'`

In this mode:
- `template()` is called only once
- DOM is no longer automatically recreated
- Updates must be performed manually via `watch` or `onUpdate`

Useful for:
- High-frequency updates
- Animations
- Virtual lists
- Integration with external libraries

Example:

```js
Lilla.define('fast-ticker', {
  updateStrategy: 'manual',
  state: { val: 0 },

  template(_, html) {
    return html`
      <div>
        Live Value: <strong ref="output">0</strong>
      </div>
    `
  },

  onMount() {
    this.outputEl = this.$refs.output

    this._interval = setInterval(() => {
      this.state.val++
    }, 1)
  },

  watch: {
    val(v) {
      this.outputEl.textContent = v
    }
  },

  onCleanup() {
    clearInterval(this._interval)
  }
})
```

### DOM Access ($refs)

For direct DOM access, use the `ref` attribute:

```js
Lilla.define('focus-input', {
  template(_, html) {
    return html`
      <input ref="myInput">
      <button on:click="focusIt">Focus</button>
    `
  },

  focusIt() {
    this.$refs.myInput.focus()
  }
})
```

`this.$refs` contains references to all elements with the `ref` attribute.

**Features:**
- Works in both Shadow DOM and Light DOM
- Updated after each render
- If an element is removed from the DOM, it disappears from `$refs`

## Global Configuration (Lilla.configure)

Global framework settings can be configured via `Lilla.configure()`.
These settings apply to all components unless overridden in the component itself.

```js
Lilla.configure({
  shadow: true,        // Shadow DOM by default
  globalStyles: '...'  // CSS for all Shadow DOM components
})
```

### shadow (default: true)

Sets the Shadow DOM mode for all components.

Components can override this:

```js
Lilla.define('my-comp', {
  shadow: false
})
```

### globalStyles

CSS that's automatically added to all Shadow DOM components:

```js
Lilla.configure({
  globalStyles: `
    :host {
      box-sizing: border-box;
      font-family: system-ui, sans-serif;
      color: var(--text-color, #333);
    }

    button, input, select, textarea {
      font: inherit;
      color: inherit;
    }

    .hidden { display: none; }
    .flex { display: flex; }
  `
})
```

**Typical uses:**
- Base styles and fonts
- Form style resets
- CSS variables for themes
- Utility classes

`globalStyles` only applies to components with `shadow: true`.
Light DOM components use document styles.

## Component Config Reference

Complete reference of all options that can be passed to `Lilla.define(tag, config)`.

```js
Lilla.define('my-component', {
  // ──────────────────────────────────────────────
  // CORE & RENDERING
  // ──────────────────────────────────────────────

  shadow: true | false,                     // default: true

  styles: `:host { ... } .class { ... }`,   // CSS string, applied in ShadowRoot

  updateStrategy: 'auto' | 'manual',        // default: 'auto'

  template(ctx, html) {                     // required render function
    return html`<div>${ctx.props.title}</div>`
  },

  // ──────────────────────────────────────────────
  // PROPS
  // ──────────────────────────────────────────────

  props: {
    name: 'Alice',
    age: 42,
    isAdmin: true,
    title: String,
    count: Number,
    active: Boolean,                        // presence of attribute = true
    size: (v) => Number(v) || 100,          // custom parser
    user: Object,                           // via AttrRef
    onSave: Function                        // also via AttrRef
  },

  // ──────────────────────────────────────────────
  // STATE & REACTIVITY
  // ──────────────────────────────────────────────

  state: { counter: 0 },
  // or state() { return { counter: this.props.initial || 0 } },

  subscribe: [themeStore, 'theme'],
  // or multiple stores:
  // subscribe: [
  //   [globalStore],                          // all changes
  //   [themeStore, 'theme', 'darkMode']       // only selected keys
  // ],

  watch: {
    counter(newV) { /* ... */ },
  },

  // ──────────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────────

  onMount()     { /* after first render */ },
  onUpdate()    { /* after each render */ },
  onCleanup()   { /* before removal */ },

  // ──────────────────────────────────────────────
  // METHODS & CUSTOM PROPERTIES
  // ──────────────────────────────────────────────

  increment() { this.state.counter++ },     // accessible as this.increment() and via on:click="increment"

  // Any other keys except reserved ones
})
```

### Reserved Keys (cannot be overridden):

`props`, `state`, `template`, `shadow`, `styles`, `updateStrategy`,
`subscribe`, `watch`,
`onMount`, `onUpdate`, `onCleanup`
