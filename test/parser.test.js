// parser.test.js
import { describe, it, expect } from 'vitest';
import { Lilla, flush } from './setup.js';

describe('HTML Tagged Template Parser (Security & Robustness)', () => {

  // Helper to render a component and return its DOM element
  const render = async (templateFn) => {
    const tag = `x-parser-${Math.random().toString(36).slice(2)}`;
    Lilla.define(tag, { shadow: false, template: templateFn });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await flush();
    return el;
  };

  it('Correctly distinguishes Attributes vs Text Content', async () => {
    const obj = { id: 1 };
    const el = await render((_, html) => html`
      <div data-attr="${obj}">${obj}</div>
    `);

    // Inside attribute -> should be a Reference ID (tunnel)
    const attr = el.querySelector('div').getAttribute('data-attr');
    expect(attr).toMatch(/^🔗:/);

    // Inside content -> should be JSON stringified (or toString)
    const text = el.querySelector('div').textContent;
    expect(text).toContain('{'); // JSON representation
    expect(text).not.toContain('🔗:'); // Should not leak internal ID
  });

  it('Handles single quotes in attributes correctly', async () => {
    const obj = { id: 2 };
    const el = await render((_, html) => html`
      <div data-val='${obj}'></div>
    `);

    expect(el.querySelector('div').getAttribute('data-val')).toMatch(/^🔗:/);
  });

  it('Handles multiline attributes', async () => {
    const obj = { id: 3 };
    // Parsers often break on newlines before interpolation
    const el = await render((_, html) => html`
      <div
        class="foo"
        data-multiline="
          ${obj}
        "></div>
    `);

    const attr = el.querySelector('div').getAttribute('data-multiline');
    // Should recognize that we are still inside attribute quotes
    expect(attr.trim()).toMatch(/^🔗:/);
  });

  it('Handles quotes inside other attributes confusing the parser', async () => {
    const obj = { id: 4 };
    // Parser might think 'title' closed, incorrectly treating ${obj} as text
    const el = await render((_, html) => html`
      <div title="Don't stop" data-target="${obj}"></div>
    `);

    const attr = el.querySelector('div').getAttribute('data-target');
    expect(attr).toMatch(/^🔗:/);
  });

  it('Escapes XSS attempts in text content', async () => {
    const malicious = `<img src=x onerror=alert(1)>`;
    const el = await render((_, html) => html`
      <div id="target">${malicious}</div>
    `);

    const n = el.querySelector('#target').firstChild;
    expect(n.nodeType).toBe(Node.TEXT_NODE);
    expect(el.querySelector('img')).toBeNull();
  });

  it('Does NOT tunnel functions if they are outside attributes', async () => {
    // Function in text must not turn into "🔗:..." and must not execute
    const fn = () => console.log('oops');
    const el = await render((_, html) => html`
      <div>${fn}</div>
    `);

    expect(el.textContent).not.toMatch(/^🔗:/);
    // Usually expect stringified function body or empty string, but main goal is NO ID
  });

  it('Handles "Fake" attribute lookalikes in text content', async () => {
    // Scenario: text looks like the start of an attribute
    // Parser should not think ${val} is the value of a 'class' attribute
    const val = { i: 99 };
    const el = await render((_, html) => html`
      <div>
        See: class="${val}" is distinct.
      </div>
    `);

    // Here ${val} must render as text (JSON), NOT as a reference
    // If `inAttr` works incorrectly (just looking for ="), it would return true
    const text = el.textContent;
    expect(text).not.toContain('🔗:');
    expect(text).toContain('{');
  });
});
