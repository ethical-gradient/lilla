import { describe, it, expect } from 'vitest';
import { Lilla, flush } from './setup.js';

describe('Events System', () => {

  it('Handles events: root methods and inline lambdas with closure', async () => {
    const log = [];

    Lilla.define('event-mix', {
      shadow: false,
      state: { count: 0 },

      rootMethod() {
        log.push('root');
        this.state.count++;
      },

      template: ({ state }, html) => html`
        <button id="root" on:click="rootMethod">Root</button>
        <button id="inline" on:click="${() => log.push('inline')}">Inline</button>
        <div id="out">${state.count}</div>
      `
    });

    const el = document.createElement('event-mix');
    document.body.appendChild(el);
    await flush();

    el.querySelector('#root').click();
    await flush();
    expect(log).toEqual(['root']);
    expect(el.querySelector('#out').textContent).toBe('1');

    el.querySelector('#inline').click();
    await flush();
    expect(log).toEqual(['root', 'inline']);
  });

  it('Dispatches and catches custom events', async () => {
    let received = null;

    Lilla.define('event-sender', {
      shadow: false,

      sendEvent() {
        this.dispatchEvent(new CustomEvent('custom', {
          detail: { msg: 'hello' },
          bubbles: true
        }));
      },

      template: (ctx, html) => html`
        <button on:click="sendEvent">Send</button>
      `
    });

    Lilla.define('event-receiver', {
      shadow: false,

      onMount() {
        this.addEventListener('custom', (e) => {
          received = e.detail;
        });
      },

      template: (ctx, html) => html`
        <event-sender></event-sender>
      `
    });

    const el = document.createElement('event-receiver');
    document.body.appendChild(el);
    await flush();

    el.querySelector('button').click();
    await flush();

    expect(received).toEqual({ msg: 'hello' });
  });

});
