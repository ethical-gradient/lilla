import { describe, it, expect } from 'vitest';
import { Lilla, flush } from './setup.js';

describe('Form Elements (inputs, textarea, radio, checkbox, select)', () => {

  it('Preserves input focus and value during updates', async () => {
    Lilla.define('input-preservation', {
      shadow: false,
      state: () => ({ count: 0 }),
      template: ({ state }, html) => html`
      <div>
        <span>Updates: ${state.count}</span>
        <input type="text" id="my-input" />
      </div>
      `
    });

    const el = document.createElement('input-preservation');
    document.body.appendChild(el);
    await flush();
    const input = el.querySelector('#my-input');
    input.value = 'User Text';
    input.focus();
    el.state.count++;
    await flush();

    const inputAfter = el.querySelector('#my-input');
    expect(inputAfter).toBe(input);
    expect(inputAfter.value).toBe('User Text');
    expect(document.activeElement).toBe(inputAfter);
  });
    
  it('Preserves <textarea> value during updates', async () => {
      Lilla.define('textarea-test', {
        shadow: false,
        state: () => ({ count: 0 }),
        template: ({ state }, html) => html`
          <div>
            <span>Updates: ${state.count}</span>
            <textarea id="area">Initial</textarea>
          </div>
        `
      });

      const el = document.createElement('textarea-test');
      document.body.appendChild(el);
      await flush();

      const area = el.querySelector('#area');

      area.value = 'User edited text';
      area.focus();

      // Trigger re-render
      el.state.count++;
      await flush();

      // Value should be preserved
      expect(area.value).toBe('User edited text');
      // Focus should be maintained
      expect(document.activeElement).toBe(area);
    });

    it('Handles radio button groups correctly', async () => {
      Lilla.define('radio-test', {
        shadow: false,
        state: () => ({
          options: ['red', 'green', 'blue'],
          selected: 'green'
        }),
        template: ({ state }, html) => html`
          <div>
            ${state.options.map(opt => html`
              <label>
                <input
                  type="radio"
                  name="color"
                  value="${opt}"
                  ${opt === state.selected ? 'checked' : ''}
                />
                ${opt}
              </label>
            `)}
          </div>
        `
      });

      const el = document.createElement('radio-test');
      document.body.appendChild(el);
      await flush();

      const radios = el.querySelectorAll('input[type="radio"]');

      // Check initial state
      expect(radios[0].checked).toBe(false); // red
      expect(radios[1].checked).toBe(true);  // green
      expect(radios[2].checked).toBe(false); // blue

      // User selects different option
      radios[2].checked = true;
      radios[2].click(); // Trigger change event

      // Simulating controlled component
      el.state.selected = 'blue';
      await flush();

      const radiosAfter = el.querySelectorAll('input[type="radio"]');
      expect(radiosAfter[0].checked).toBe(false);
      expect(radiosAfter[1].checked).toBe(false);
      expect(radiosAfter[2].checked).toBe(true);
    });

    it('Handles checkbox indeterminate state', async () => {
      Lilla.define('checkbox-indeterminate', {
        shadow: false,
        state: () => ({
          items: [
            { id: 1, checked: true },
            { id: 2, checked: false },
            { id: 3, checked: true }
          ]
        }),

        template: ({ state }, html) => {
          const checkedCount = state.items.filter(i => i.checked).length;
          const allChecked = checkedCount === state.items.length;
          const someChecked = checkedCount > 0 && !allChecked;

          return html`
            <div>
              <input
                ref="master"
                type="checkbox"
                ${allChecked ? 'checked' : ''}
              />
              Select All
            </div>
          `;
        },

        onUpdate() {
          const master = this.$refs.master;
          if (!master) return;

          const checkedCount = this.state.items.filter(i => i.checked).length;
          const total = this.state.items.length;

          // Set indeterminate via property (can't be done via attribute)
          master.indeterminate = (checkedCount > 0 && checkedCount < total);
        }
      });

      const el = document.createElement('checkbox-indeterminate');
      document.body.appendChild(el);
      await flush();

      const master = el.$refs.master;

      // Initial: 2 of 3 checked → indeterminate
      expect(master.indeterminate).toBe(true);
      expect(master.checked).toBe(false);

      // Check all
      el.state.items = el.state.items.map(i => ({ ...i, checked: true }));
      await flush();

      expect(master.indeterminate).toBe(false);
      expect(master.checked).toBe(true);

      // Uncheck all
      el.state.items = el.state.items.map(i => ({ ...i, checked: false }));
      await flush();

      expect(master.indeterminate).toBe(false);
      expect(master.checked).toBe(false);
    });

    it('Handles <select> with dynamic options (uncontrolled)', async () => {
      Lilla.define('select-uncontrolled', {
        shadow: false,
        state: () => ({
          options: ['A', 'B', 'C']
        }),

        template: ({ state }, html) => html`
          <select id="sel">
            ${state.options.map(opt => html`
              <option value="${opt}">${opt}</option>
            `)}
          </select>
        `
      });

      const el = document.createElement('select-uncontrolled');
      document.body.appendChild(el);
      await flush();

      const select = el.querySelector('#sel');
      expect(select.options.length).toBe(3);

      // User manually selects 'C'
      select.value = 'C';
      expect(select.value).toBe('C');

      // Add new option 'D' - user selection should be preserved
      el.state.options = [...el.state.options, 'D'];
      await flush();

      expect(select.options.length).toBe(4);
      expect(select.value).toBe('C'); // Preserved!
    });

    it('Handles <select> in controlled mode (via value attribute)', async () => {
      Lilla.define('select-controlled', {
        shadow: false,
        state: () => ({
          options: ['A', 'B', 'C'],
          selected: 'B'
        }),

        template: ({ state }, html) => html`
          <select id="sel" value="${state.selected}">
            ${state.options.map(opt => html`
              <option value="${opt}">${opt}</option>
            `)}
          </select>
        `
      });

      const el = document.createElement('select-controlled');
      document.body.appendChild(el);
      await flush();

      const select = el.querySelector('#sel');
      expect(select.value).toBe('B');

      // Change state - should update DOM
      el.state.selected = 'C';
      await flush();

      expect(select.value).toBe('C');

      // Add new option and change selection
      el.state.options = [...el.state.options, 'D'];
      el.state.selected = 'D';
      await flush();

      expect(select.options.length).toBe(4);
      expect(select.value).toBe('D');
    });

    it('Handles <select> when selected option is removed', async () => {
      Lilla.define('select-remove-option', {
        shadow: false,
        state: () => ({
          options: ['A', 'B', 'C'],
          selected: 'B'
        }),

        template: ({ state }, html) => html`
          <select id="sel">
            ${state.options.map(opt => html`
              <option value="${opt}" ${opt === state.selected ? 'selected' : ''}>
                ${opt}
              </option>
            `)}
          </select>
        `
      });

      const el = document.createElement('select-remove-option');
      document.body.appendChild(el);
      await flush();

      const select = el.querySelector('#sel');
      expect(select.value).toBe('B');

      // Remove selected option 'B'
      el.state.options = ['A', 'C'];
      await flush();

      // Browser should reset to first available option
      expect(select.options.length).toBe(2);
      expect(select.value).toBe('A');
    });

it('Preserves <select> value when options update', async () => {
  Lilla.define('select-bug-test', {
    state: () => ({
      value: 'b',
      options: ['a', 'b', 'c']
    }),
    template: ({ state }, html) => html`
      <select id="sel">
        ${state.options.map(o => html`
          <option value="${o}" ${o === state.value ? 'selected' : ''}>${o}</option>
        `)}
      </select>
    `
  });

  const el = document.createElement('select-bug-test');
  document.body.appendChild(el);
  await flush();

  const select = el.shadowRoot.querySelector('#sel');
  expect(select.value).toBe('b');

  // User changes selection to 'c'
  select.value = 'c';

  // Update options (triggers morph)
  el.state.options = ['a', 'b', 'c', 'd'];
  await flush();

  // Ensure value doesn't reset to first option
  expect(select.value).toBe('c');
});

it('Preserves contenteditable state and focus during updates', async () => {
    Lilla.define('content-editable-test', {
      shadow: false,
      state: () => ({ 
        count: 0, 
        text: 'Initial' 
      }),
      template: ({ state }, html) => html`
        <div>
          <span id="counter">Renders: ${state.count}</span>
          <div id="editor" contenteditable="true">${state.text}</div>
        </div>
      `
    });

    const el = document.createElement('content-editable-test');
    document.body.appendChild(el);
    await flush();

    const editor = el.querySelector('#editor');
    
    expect(editor.textContent).toBe('Initial');

    editor.focus();
    editor.textContent = 'User typed this text';
    
    el.state.count++;
    await flush();

    expect(document.activeElement).toBe(editor);
    expect(editor.textContent).toBe('User typed this text');
    expect(el.querySelector('#counter').textContent).toBe('Renders: 1');

    editor.blur();
    
    el.state.text = 'Updated from state';
    el.state.count++;
    await flush();

    expect(editor.textContent).toBe('Updated from state');
  });
});
