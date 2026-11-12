import { makePopupMovable } from '../popup-position';
import { checkPhrase, LEVEL_LABELS } from '../assess/decide';
import type { Check, Kind, PageState } from '../core/types';

type Actions = { open: (kind: 'details' | 'good' | 'bad') => Promise<boolean>; close: () => void };

const CSS = `
:host{position:fixed;bottom:18px;right:18px;z-index:2147483647;font:14px/1.45 system-ui,-apple-system,sans-serif;color:#251e32}
article{position:relative;box-sizing:border-box;width:330px;max-width:calc(100vw - 16px);max-height:calc(100vh - 60px);overflow:auto;background:#f3effa;border:1px solid #8d859e;border-radius:8px;box-shadow:0 6px 24px #251e3226;padding:14px 16px}
.top{display:flex;align-items:center;gap:8px;padding-right:30px}
.brand{font:800 13px/1 Arial,sans-serif;letter-spacing:2px;color:#6d3fd1;cursor:grab;touch-action:none;user-select:none}
.brand:focus-visible{outline:2px solid #6d3fd1}
.close{position:absolute;right:8px;top:6px;width:30px;height:30px;border:0;background:transparent;color:#251e32;font:22px system-ui;cursor:pointer}
.verdict{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:10px}
.size{font:700 26px/1.1 system-ui;color:#251e32}
.level{font-size:12px;font-weight:650;padding:3px 8px;border-radius:20px;background:#e3dcef;white-space:nowrap}
.level.good,.level.confirmed{background:#d1ed69}.level.ok{background:#e6f2b8}.level.risky{background:#f6dfae}.level.poor{background:#f3c4b6}
.headline{margin:6px 0 0;font-weight:600}
.score{color:#625970;font-size:12px;margin-top:2px}
.checks{display:grid;gap:4px;margin:10px 0 0;padding:0;list-style:none}
.checks li{display:flex;justify-content:space-between;gap:10px;font-size:13px;border-top:1px solid #8d859e33;padding-top:4px}
.checks span:last-child{text-align:right;color:#4a4158}
.minus{color:#a94e37!important}.plus{color:#7a5b00!important}
small{display:block;color:#625970;font-size:12px;margin-top:8px}
details{margin-top:10px;font-size:13px}summary{cursor:pointer;font-weight:600}
.row{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #8d859e33}
.row em{font-style:normal;color:#625970}
nav{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
nav button{flex:1;padding:7px 8px;border:1px solid #8d859e;border-radius:5px;background:#fff8;color:inherit;cursor:pointer;font:inherit;font-size:12px}
nav button.primary{background:#d1ed69;border-color:#778e37;font-weight:650}
button:focus-visible{outline:2px solid #6d3fd1}`;

const BASIS_SHORT: Record<string, string> = { 'your feedback': 'your feedback', 'your garments': 'vs your clothes', 'your measurements': 'your measurements', 'size chart': 'size chart', estimate: 'estimate' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function createCard(actions: Actions) {
  const host = document.createElement('div'); host.id = 'forma-fit-card';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.append(el('style', { textContent: CSS }));
  const card = el('article'); shadow.append(card);
  let cleanup = () => {};
  let shown = '';

  function frame(): HTMLElement {
    cleanup(); card.replaceChildren();
    const brand = el('div', { className: 'brand', textContent: 'FORMA' });
    const close = el('button', { className: 'close', type: 'button', textContent: '×', title: 'Close' });
    close.setAttribute('aria-label', 'Close FORMA');
    close.onclick = () => { hide(); actions.close(); };
    card.append(el('div', { className: 'top' }, brand), close);
    cleanup = makePopupMovable(host, brand);
    return card;
  }

  function button(label: string, kind: 'details' | 'good' | 'bad', primary = false) {
    const b = el('button', { type: 'button', textContent: label, className: primary ? 'primary' : '' });
    b.onclick = async () => {
      b.disabled = true;
      const ok = await actions.open(kind).catch(() => false);
      b.disabled = false;
      if (!ok) b.textContent = 'Open FORMA from the toolbar';
    };
    return b;
  }

  function checkRow(c: Check, kind: Kind) {
    const name = c.key === 'width' ? 'Width' : c.key === 'length' ? 'Length' : 'Sleeves';
    const phrase = checkPhrase(c, kind).replace(/^sleeves /, '');
    const value = el('span', { textContent: `${phrase} · ${BASIS_SHORT[c.basis]}`, className: c.step === null || c.step === 0 ? '' : c.step < 0 ? 'minus' : 'plus' });
    return el('li', {}, el('span', { textContent: name }), value);
  }

  function render(state: PageState) {
    const key = JSON.stringify([state.status, state.decision, state.message, state.cached]);
    if (key === shown && host.isConnected) return;
    shown = key;
    const root = frame();
    const d = state.decision;
    if (state.status === 'ready' && d) {
      const label = d.size || d.closest;
      const level = el('span', { className: `level ${d.level}`, textContent: LEVEL_LABELS[d.level] });
      root.append(el('div', { className: 'verdict' }, el('span', { className: 'size', textContent: label ? (d.size ? label : `${label}?`) : '–' }), level));
      root.append(el('p', { className: 'headline', textContent: d.headline }));
      const parts = [d.score !== null ? `Fit ${d.score.toFixed(1)}/10` : '', `${d.confidence} confidence`, d.cut.score !== null ? `cut & style ${d.cut.score}/10` : ''].filter(Boolean);
      root.append(el('div', { className: 'score', textContent: parts.join(' · ') }));
      const best = d.sizes.find(s => s.label === label);
      if (best) root.append(el('ul', { className: 'checks' }, ...best.checks.map(c => checkRow(c, d.kind))));
      if (d.sizes.length > 1) {
        const compare = el('details', {}, el('summary', { textContent: `Compare ${d.sizes.length} sizes` }));
        for (const s of d.sizes) {
          const note = s.excluded ? 'excluded' : s.available === false ? 'sold out' : s.score !== null ? `${s.score.toFixed(1)}/10` : 'n/a';
          compare.append(el('div', { className: 'row' }, el('span', { textContent: s.label + (s.confirmed ? ' ✓' : '') }), el('em', { textContent: note })));
        }
        root.append(compare);
      }
      if (d.summary || d.evidence.length) {
        const why = el('details', {}, el('summary', { textContent: 'Why?' }));
        if (d.summary) why.append(el('p', { textContent: d.summary }));
        for (const e of d.evidence.slice(0, 5)) why.append(el('small', { textContent: e }));
        for (const u of d.unknowns.slice(0, 2)) why.append(el('small', { textContent: 'Unknown: ' + u }));
        root.append(why);
      }
      root.append(el('small', { textContent: state.cached ? 'Saved assessment · no new AI request' : state.reading?.reader === 'local' ? 'Local comparison · no AI' : 'AI-assisted estimate' }));
      root.append(el('nav', {}, button('Details', 'details'), button('Fits me', 'good', true), button("Doesn't fit", 'bad')));
    } else {
      root.append(el('p', { className: 'headline', textContent: state.status === 'error' ? 'Assessment failed' : 'FORMA needs attention' }));
      root.append(el('small', { textContent: state.message || 'Open FORMA for details.' }));
      root.append(el('nav', {}, button('Open FORMA', 'details', true)));
    }
    if (!host.isConnected) document.documentElement.append(host);
  }

  function hide() { cleanup(); cleanup = () => {}; host.remove(); shown = ''; }
  return { host, render, hide };
}
