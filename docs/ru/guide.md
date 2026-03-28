# Документация Lilla v0.1.0
- [Установка](#установка)
- [Hello World](#hello-world)
- [Базовая структура компонента](#базовая-структура-компонента)
- [Props — входящие параметры](#props--входящие-параметры)
- [Шаблоны (template)](#шаблоны-template)
- [State — реактивное состояние](#state--реактивное-состояние)
- [Обработка событий](#обработка-событий)
- [Жизненный цикл](#жизненный-цикл)
- [watch — наблюдение за изменениями](#watch--наблюдение-за-изменениями)
- [Стили (Shadow / Light DOM)](#стили)
- [Slots — проброс контента](#slots--проброс-контента)
- [Global Store](#global-store)
- [Store Operations API](#store-operations-api)
- [Under the hood (Как это работает)](#under-the-hood)
- [Глобальная конфигурация](#глобальная-конфигурация-lillaconfigure)
- [Полный справочник API (Cheat Sheet)](#component-config-reference)

## Установка

> (Раздел в разработке)

## Hello World

Самый простой компонент:

```js
import { Lilla } from './lilla.js'

Lilla.define('hello-world', {
  template(ctx, html) {
    return html`
      <div>Привет, мир!</div>
    `
  }
})
```

Использование в HTML:

```html
<hello-world></hello-world>
```

Регистрация компонента: `Lilla.define('tag-name', config)`. Поля конфига описаны ниже и подробно разобраны в соответствующих разделах.

## Базовая структура компонента

```js
Lilla.define('my-counter', {
  // Входные параметры (props)
  props: {
    start: Number,
    label: 'Count',
  },

  // Локальное реактивное состояние
  state: {
    count: 0
  },

  // Шаблон (html`` возвращает безопасный HTML)
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

  // Хуки жизненного цикла (опционально)
  onMount() {
      this.state.count = this.props.start || 0
      console.log('Компонент подключён к DOM')
  },
  onUpdate() {
    console.log('Count: ' + this.state.count)
  },
})
```

```html
<my-counter start="5" label="Дней без аварий: "></my-counter>
```

## Props — входящие параметры

Props передаются через HTML-атрибуты и доступны внутри компонента как `props`.

```js
props: {
  title: String,
  count: Number,
  active: Boolean
}
```

Использование:

```html
<user-card title="Alice" count="5" active></user-card>
```

Внутри компонента:

```js
props.title   // "Alice"
props.count   // 5
props.active  // true
```

Тип пропса определяется значением в `props`.
Можно указать значение по умолчанию:

```js
props: {
  role: 'Guest',
  limit: 10
}
```

### Сложные значения

Объекты, массивы и функции можно передавать напрямую:

```js
const user = { name: 'Alice' }

// в template родительского компонента
html`<user-card user="${user}"></user-card>`

```

В компоненте: `props.user.name`.

Имена атрибутов автоматически преобразуются: `current-user → currentUser`


## Шаблоны (template)

Шаблон — это функция, которая возвращает результат вызова тэгированного литерала `html`.

Всегда используйте `html`, так как в нём встроено автоматическое экранирование значений и защита от XSS.

Шаблоны поддерживают обычные JavaScript-выражения:

- Интерполяция: `${expression}`
- Условия: `${condition ? html... : ''}`
- Списки: `.map()` массив автоматически объединяется, join не нужен
- Безопасность: все значения по умолчанию экранируются

В остальном шаблоны работают как обычные строковые литералы.

```js

// Методы компонента добавляются в контекст,
// поэтому 'toggle' можно сразу деструктурировать или использовать this.toggle

template({ props, state, toggle }, html) {
  const { name, isAdmin } = props
  const items = state.todos || []

return html`
    <header>Привет, ${name}!</header>

    ${isAdmin ? html`<button>Админ-панель</button>` : ''}

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
### Контекст (this) внутри шаблонов

Lilla использует обычный JavaScript, поэтому работают стандартные правила области видимости.

Если внутри обработчиков событий вам нужен доступ к методам компонента через `this`, определяйте `template` как обычный метод, а не как стрелочную функцию.


## State — реактивное состояние

Можно задать двумя способами:

```js
// Вариант 1 — объект (используется чаще всего)
state: {
  count: 0,
  todos: [],
  filter: 'all'
}

// Вариант 2 — функция (если нужен доступ к this/props при инициализации)
state() {
  return {
    count: this.props.initialCount || 0
  }
}
```
Реактивность срабатывает при присвоении значения верхнему ключу `state`.

Под капотом Lilla использует `Proxy`, поэтому такое присвоение автоматически вызывает отложенный рендер.

```js
this.state.count++                                          // работает
this.state.todos = [...this.state.todos, newTodo]           // работает
this.state.todos.push(newTodo)                              // НЕ работает
this.state.filter = { value: 'completed' }                  // работает
this.state.filter.value = 'completed'                       // НЕ работает
```

Для работы с массивами и вложенными структурами есть хелперы .use(key):


```js
this.state.use('todos').removeById(id)
```

Подробнее — в разделе [Store Operations API](#store-operations-api).


## Обработка событий

Синтаксис: `on:event="method"`

```html
<button on:click="increment">+1</button>
<input on:input="handleInput">
<form on:submit="save"></form>
```

Обработчик может быть либо методом компонента, либо функцией.

### Именованный метод

Рекомендуемый способ:
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

### Стрелочная функция

Подходит для простых случаев или когда нужно передать значение из контекста:

```js
template(_, html) {
  return html`
    <button on:click="${() => this.state.count++}">+1</button>
  `
}
```

### Отправка событий (emit)

Компоненты могут отправлять события родителю через `emit`.

```js
this.emit('remove', { id: 42 })
```

Родитель может обработать событие:

```html
<user-card on:remove="handleRemove"></user-card>
```
```js
handleRemove(e) {
  console.log(e.detail.id)
}
```

### Передача данных через `data-*` и `$data`

Если обработчику нужно получить значение из разметки, можно использовать `data-*` атрибуты.

```html
<li data-id="42">
  <button on:click="remove">Удалить</button>
</li>
```

В обработчике значение доступно через $data:

```js
remove() {
  const id = Number(this.$data.id)
  this.state.use('todos').removeById(id)
}
```

`$data` ищет ближайший элемент с соответствующим `data-*` атрибутом.

Например:

```js
data-id → this.$data.id
data-user-name → this.$data.userName
```

## Жизненный цикл

Lilla использует стандартный жизненный цикл Web Components и добавляет три пользовательских хука:

- `onMount()` — вызывается один раз после первого рендера
- `onUpdate()` — вызывается после каждого обновления компонента
- `onCleanup()` — вызывается при удалении компонента из DOM

Жизненный цикл выглядит так:

`component connected → onMount → update → onUpdate → component disconnected → onCleanup`

---

### onMount

Вызывается один раз после того, как компонент подключён к DOM и выполнен первый рендер.

Подходит для:

- загрузки данных
- подписки на внешние события
- инициализации сторонних библиотек

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

Вызывается после каждого обновления компонента.

Полезно для синхронизации с DOM или внешними библиотеками.

```js
onUpdate() {
  if (this.$refs.chart) {
    this.$refs.chart.update()
  }
}
```

### onCleanup

Вызывается при удалении компонента из DOM.

Используется для очистки ресурсов и отписок от событий.

```js
onCleanup() {
  window.removeEventListener("resize", this._onResize)
}
```

## watch — наблюдение за изменениями

Опция watch позволяет реагировать на изменения конкретных ключей `state`, `props` или внешних stores.

Это более точечный механизм, чем `onUpdate`.

```js
watch: {
  count(newValue) {
    console.log('count changed:', newValue)
  }
}
```

Функция получает новое значение и вызывается только тогда, когда этот ключ действительно изменился.

### Вычисляемые свойства

В Lilla нет встроенного `computed`, но вычисляемые значения можно сделать через **геттеры** в `state` или `store`. Это можно использовать в большинстве случаев.

```js
Lilla.define('user-profile', {
  state: () => ({
    firstName: 'Alice',
    lastName: 'Smith',

    get fullName() {
      return `${this.firstName} ${this.lastName}`
    }
  })
})
```

Но геттер пересчитывается при каждом доступе. Если вычисление **ресурсоемкое** — используйте `memo()`.

### memo()

`memo()` кеширует результат функции на основе аргументов.

```js
import { memo } from 'lilla'

const filterItems = memo((items, query) =>
  items.filter(item => item.text.includes(query))
)
```

Чтобы не определять такие методы снаружи компонента, можно это делать в прямо state.

```js
state() {
    const calcTotal = memo(items => items.reduce((s, i) => s + i.price, 0));

    return {
      items: [],
      get total() { return calcTotal(this.items); },
    }
  },
```

Если аргументы не изменились, возвращается кешированный результат.

## Стили

Lilla поддерживает два режима стилизации компонентов: **Shadow DOM** (по умолчанию) и **Light DOM**.

---

### 1. Shadow DOM (по умолчанию)

По умолчанию компонент создаётся с `shadow: true`.
Стили изолированы внутри Shadow Root.

```js
Lilla.define('my-card', {
  styles: `
    :host {
      display: block;
      border: 1px solid #ddd;
      padding: 16px;
      border-radius: 8px;
    }

    .title {
      font-weight: bold;
      margin-bottom: 8px;
    }
  `,

  template({ props }, html) {
    return html`
      <div class="title">${props.title}</div>
      <slot name="content"></slot>
    `
  }
})
```

### 2. Глобальные стили

Глобальный stylesheet можно задать через Lilla.configure().
Он автоматически применяется ко всем компонентам с Shadow DOM.

Подробнее — в разделе Глобальная конфигурация.

### 3. Light DOM (shadow: false)

Если указать `shadow: false`, компонент рендерится в обычный DOM и использует глобальные стили страницы.

```js
Lilla.define('my-card', {
  shadow: false,

  template(_, html) {
    return html`
      <div class="card">
        <slot></slot>
      </div>
    `
  }
})
```

### 4. Динамические стили

Стили можно генерировать прямо внутри template.

```js
template({ props, state }, html) {
  return html`
    <style>
      :host {
        --accent: ${props.accent || '#6366f1'};
      }

      .box {
        background: var(--accent);
        padding: ${state.padding}px;
      }
    </style>

    <div class="box">
      <slot></slot>
    </div>
  `
}
```
## Slots — проброс контента

Slots позволяют передавать произвольный HTML внутрь компонента.

---

### Default slot

```js
Lilla.define('card-wrapper', {
  styles: `
    :host {
      display: block;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
    }
  `,

  template: (_, html) => html`
    <div class="card">
      <slot></slot>
    </div>
  `
})
```

Использование:

```html
<card-wrapper>
  <h3>Заголовок карточки</h3>
  <p>Произвольный контент внутри слота.</p>
</card-wrapper>
```

### Named slots

```js
Lilla.define('article-layout', {
  template: (_, html) => html`
    <article>
      <header>
        <slot name="title"></slot>
      </header>

      <section>
        <slot></slot>
      </section>

      <footer>
        <slot name="meta"></slot>
      </footer>
    </article>
  `
})
```

Использование:

```html
<article-layout>
  <h1 slot="title">Заголовок статьи</h1>
  <p>Основной текст статьи.</p>
  <div slot="meta">
    Автор: Alice
  </div>
</article-layout>
```

### Динамический контент

Контент слота находится в Light DOM родителя.
При обновлении родителя Lilla корректно обновит этот контент.

```js
Lilla.define('dynamic-slot-parent', {
  state: { count: 0 },

  template({ state }, html) {
    return html`
      <card-wrapper>
        <p>Счётчик: ${state.count}</p>
        <button on:click="${() => state.count++}">+1</button>
      </card-wrapper>
    `
  }
})
```

### Стилизация slotted контента

Внутри Shadow DOM можно стилизовать slotted элементы через `::slotted()`:

```js
styles: `
  ::slotted(h1) {
    color: #0066cc;
  }

  ::slotted(p) {
    line-height: 1.6;
  }
`
```

Ограничение: `::slotted()` работает только для прямых детей слота.

## Global Store

Lilla предоставляет встроенный observable store на основе `Proxy`.
Он может использоваться как для локального состояния компонента (`state`), так и для общего состояния между компонентами.

### Создание store

```js
import { createStore } from 'lilla'

const store = createStore({
  theme: 'light',
  user: null,
  todos: []
})
```

Любое изменение свойства автоматически уведомляет подписчиков.

### Подписка на изменения

Вне компонентов можно подписаться вручную:

```js
const unsubscribe = store.subscribe((changedKeys) => {
  console.log('Changed:', changedKeys)
})
```

В компонентах обычно используют опцию subscribe:

```js
Lilla.define('theme-switcher', {
  subscribe: [store, 'theme'],

  template(_, html) {
    return html`
      <div class="${store.theme}"> Theme: ${store.theme} </div>
    `
  }
})
```

### state компонента — это тоже store

Внутренний state компонента автоматически создаётся через `createStore`.

```js
this.state.subscribe(...)
this.state.use(...)
```

## Store Operations API

`.use(key)` возвращает набор методов для удобной работы с объектами и массивами.

```js
const ops = store.use('key')

// Базовые операции
ops.get()                  // текущее значение
ops.set(value)             // полная замена
ops.update(fn)             // value = fn(value)

// Глубокие объекты (путь: 'a.b.c' или ['a','b','c'])
ops.setIn(path, value)     // установить значение
ops.updateIn(path, fn)     // обновить через функцию
ops.removeIn(path)         // удалить ключ

// Массивы объектов
ops.updateById(id, fn, idKey = 'id')  // обновить элемент по id
ops.removeById(id, idKey = 'id')      // удалить элемент по id
ops.move(from, to)                    // переместить элемент

// Операции с массивами
ops.push(item)             // добавить в конец
ops.unshift(item)          // добавить в начало
ops.removeAt(index)        // удалить по индексу
ops.updateAt(index, fn)    // обновить по индексу
ops.insertAt(index, item)  // вставить по индексу
```

## Under the hood

Чтобы лучше понимать поведение Lilla, будет полезно знать, как фреймворк передаёт данные и обновляет DOM.

---

### AttrRef Tunneling (туннелирование ссылок)

В стандарте Web Components атрибуты могут быть только строками. Если написать:

```html
<my-el data="${obj}">
```

браузер превратит объект в строку `"[object Object]"`, и данные потеряются.

Lilla решает эту проблему через систему **AttrRef**.

Когда в шаблоне передаётся объект, массив или функция:

```js
const user = { name: 'Alice', id: 1 }
html`<user-card user="${user}"></user-card>`
```

Lilla делает следующее:

- Сохраняет объект во внутреннем реестре и присваивает ему ID например `"🔗:7f9k"`
- В HTML записывается атрибут `user="🔗:7f9k"`
- При создании или обновлении компонента Lilla видит этот префикс,
  извлекает оригинальный объект и передаёт его в `props`.

Преимущества

- нет сериализации / десериализации
- сохраняется идентичность объектов и функций
- автоматически очищаются неиспользуемые ссылки
- работает в Shadow DOM
- не требует глобальных переменных

В инспекторе DOM можно увидеть атрибуты вида: `on:save="🔗:a3b9"`
Это нормальное поведение.

### DOM Morphing

Lilla не использует Virtual DOM.
Вместо этого применяется лёгкий алгоритм DOM morphing (патчинг существующего дерева).

Процесс обновления:

- Вызывается template(),  создаётся новая HTML-строка
- Она парсится в DocumentFragment
- Алгоритм сравнивает старые и новые узлы
- Обновляет только изменившиеся части DOM
- Если порядок элементов меняется — узлы перемещаются, а не пересоздаются.
- Это позволяет избежать лишних операций и сохранять состояние DOM-элементов.

#### key

Для списков рекомендуется использовать атрибут `key`.

```js
${items.map(item => html`
  <li key="${item.id}">${item.text}</li>
`)}
```

`key` помогает алгоритму понять, что элемент переместился, а не был удалён и создан заново.
Без key сопоставление происходит только по типу узла, что может приводить к лишним обновлениям и потере локального состояния (например, фокуса в input).

#### skip

Атрибут `skip` отключает морфинг для элемента и его потомков.

```html
<div id="google-map" skip></div>
<canvas skip></canvas>
```

Это полезно, если поддеревом DOM управляет сторонняя библиотека.

Можно передать значение:

```html
<div key="${row}" skip=${row}>...</div>
```

Если значение `skip` остаётся тем же между рендерами, Lilla пропустит обновление этого узла.

Используйте осторожно — если внутри узла есть динамические данные, они не будут обновляться.

### Ручное управление обновлениями

По умолчанию Lilla использует стратегию auto:
любое изменение state вызывает пересчёт шаблона и морфинг DOM.

Можно переключиться в режим: `updateStrategy: 'manual'`

В этом режиме:

- `template()` вызывается только один раз
- DOM больше не пересоздаётся автоматически
- обновления нужно выполнять вручную через `watch` или `onUpdate`

Это полезно для:

- высокочастотных обновлений
- анимаций
- виртуальных списков
- интеграции с внешними библиотеками

Пример:

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

### Доступ к DOM ($refs)

Для прямого доступа к DOM используется атрибут ref.

```js
Lilla.define('focus-input', {
  template(_, html) {
    return html`
      <input ref="myInput">
      <button on:click="focusIt">Фокус</button>
    `
  },

  focusIt() {
    this.$refs.myInput.focus()
  }
})
```

`this.$refs` содержит ссылки на все элементы с атрибутом ref.

Особенности:

- работает и в Shadow DOM, и в Light DOM
- обновляется после каждого рендера
- если элемент удалён из DOM, он исчезает из `$refs`


## Глобальная конфигурация (Lilla.configure)

Глобальные параметры фреймворка можно задать через `Lilla.configure()`.
Эти настройки применяются ко всем компонентам, если они не переопределены в самом компоненте.

```js
Lilla.configure({
  shadow: true,        // Shadow DOM по умолчанию
  globalStyles: '...'  // CSS для всех Shadow DOM компонентов
})
```

### shadow (по умолчанию: true)

Устанавливает режим Shadow DOM для всех компонентов.

Компонент может переопределить это поведение:

```js
Lilla.define('my-comp', {
  shadow: false
})
```

### globalStyles

CSS, который автоматически добавляется во все Shadow DOM компоненты.

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

Типичные применения:

- базовые стили и шрифты
- сброс стилей форм
- CSS-переменные для тем
- утилитарные классы

globalStyles применяется только к компонентам с `shadow: true`.
Компоненты в Light DOM используют стили документа.

## Component Config Reference

Полный справочник всех опций, которые можно передать в Lilla.define(tag, config).

```js
Lilla.define('my-component', {
  // ──────────────────────────────────────────────
  // CORE & RENDERING
  // ──────────────────────────────────────────────

  shadow: true | false,                     // default: true

  styles: `:host { ... } .class { ... }`,   // строка CSS, применяется в ShadowRoot

  updateStrategy: 'auto' | 'manual',        // default: 'auto'

  template(ctx, html) {                     // обязательная функция рендера
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
    active: Boolean,                        // наличие атрибута = true
    size: (v) => Number(v) || 100,          // кастомный парсер
    user: Object,                           // через AttrRef
    onSave: Function                        // тоже через AttrRef
  },

  // ──────────────────────────────────────────────
  // STATE & REACTIVITY
  // ──────────────────────────────────────────────

  state: { counter: 0 },
  // или state() { return { counter: this.props.initial || 0 } },

  subscribe: [themeStore, 'theme'],
  // или несколько сторов:
  // subscribe: [
  //   [globalStore],                          // все изменения
  //   [themeStore, 'theme', 'darkMode']       // только выбранные ключи
  // ],

  watch: {
    counter(newV) { /* ... */ },
  },

  // ──────────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────────

  onMount()     { /* после первого рендера */ },
  onUpdate()    { /* после каждого рендера */ },
  onCleanup()   { /* перед удалением */ },

  // ──────────────────────────────────────────────
  // METHODS & CUSTOM PROPERTIES
  // ──────────────────────────────────────────────

  increment() { this.state.counter++ },     // доступен как this.increment() и через on:click="increment"

  // Любые другие ключи, кроме зарезервированных
})
```

### Зарезервированные ключи (нельзя переопределять):

props, state, template, shadow, styles, updateStrategy,
subscribe, watch,
onMount, onUpdate, onCleanup
