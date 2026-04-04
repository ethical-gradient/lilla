# Lilla

Lilla (Swedish for "little") is a UI library for the web. It provides a compact reactive layer over native Web Components.

## Status

>⚠️ Early Preview — Lilla is fully functional and works well, but the API may still change before a stable v1.0 release.

## Key Features

- **~4.5 kB gzipped** — zero dependencies.
- **No build step** — runs directly in the browser.
- **Native Web Components** — build standard custom elements.
- **Template literals** — templates are plain JavaScript, no DSL.
- **Explicit reactivity** — predictable updates without hidden dependency tracking.
- **Reference tunneling** — pass objects & functions via attributes (no serialization)
- **Fast DOM morphing** — keyed diffing with minimal DOM operations.
- **Global store** — reactive state powered by Proxy.
- **Shadow DOM by default** — optional light DOM rendering.

## Installation

### CDN

```html
<script type="module">
  import { Lilla } from 'https://esm.sh/lilla'
  // or https://unpkg.com/lilla
</script>
````

### Npm

```bash
npm install lilla
```

## Quick Start

```html
<script type="module">
import { Lilla } from 'lilla'

Lilla.define('task-list', {
  state: {
    tasks: [
      { id: 1, text: 'Learn Lilla' },
      { id: 2, text: 'Build something' }
    ],
    input: ''
  },

  template({ state }, html) {
    return html`
      <input
        value="${state.input}"
        on:input="${e => state.input = e.target.value}"
        on:keydown="add"
        placeholder="New task..."
      >
      ${state.tasks.map(task => html`
        <div key="${task.id}">
          ${task.text}
          <button on:click="${() => this.del(task.id)}">×</button>
        </div>
      `)}
    `
  },

  add(e) {
    if (e.key !== 'Enter') return
    const text = this.state.input.trim()
    if (!text) return

    this.state.tasks = [
      { id: Date.now(), text },
      ...this.state.tasks
    ]

    this.state.input = ''
  },

  del(id) {
    this.state.tasks = this.state.tasks.filter(t => t.id !== id)
  }
})
</script>

<task-list></task-list>

```

## Examples

Check out the [interactive examples](https://ethical-gradient.github.io/lilla/examples/).

Or browse the source:

- [Counter](examples/counter.html) — Basic state and events
- [Todo App](examples/todo.html) — List rendering and form inputs
- [Kanban Board](examples/kanban.html) — Drag & drop, using stores
- [SVG Charts](examples/charts.html) — Dynamic data visualization
- [Tree View](examples/tree.html) — Recursive components
- [Hacker News](examples/hacker-news.html) — Async API fetching
- [Bubbles Animation](examples/bubbles.html) — Multiple elements, manual update
- [Memoization](examples/memo.html) — Render optimization
- [Modal & Slots](examples/modal.html) — Shadow DOM and slots

## Documentation

- [English](docs/en/guide.md)
- [Russian](docs/ru/guide.md)


## Browser Support

Chrome 54+ · Firefox 63+ · Safari 10.1+ · Edge 79+

## Contributing

Lilla is currently in an early stage of development. I am not accepting Pull Requests at this time, but if you spot a critical bug, please open an Issue.


## License

MIT

