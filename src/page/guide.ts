import { readTables, productRoot } from './listing';

/**
 * Opens an in-page size guide (tab, accordion or dialog) when the chart is
 * loaded on demand. Never navigates, never touches size selectors or the cart.
 */
const GUIDE = /^(?:(?:view|open|show|zur|zum)\s+)?(?:sizing|size\s*(?:guide|chart|&\s*fit|and fit|info)|fit\s*guide|fit\s*(?:&|and)\s*size|measurements|masse|maße|passform|gr(?:ö|oe)(?:ss|ß)en(?:tabelle|berater|beratung|guide|info)|gr(?:ö|oe)(?:ss|ß)e\s*(?:&|und)\s*passform|ma(?:ss|ß)tabelle|guide des tailles|tabella taglie)(?:\s+(?:öffnen|anzeigen|ansehen))?$/i;
const CONTROLS = 'button,a,summary,[role="tab"],[role="button"],[aria-controls],[data-toggle],[data-target]';

function isVisible(el: HTMLElement): boolean {
  for (let p: HTMLElement | null = el; p; p = p.parentElement) {
    if (p.hidden || p.getAttribute('aria-hidden') === 'true') return false;
    const style = el.ownerDocument.defaultView?.getComputedStyle?.(p);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

export function findGuideControl(doc: Document, tried: Set<Element>): HTMLElement | null {
  const roots = [productRoot(doc), ...Array.from(doc.querySelectorAll('dialog,[role="dialog"]'))];
  for (const root of roots) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(CONTROLS))) {
      if (tried.has(el) || el.closest('nav,footer,header,#forma-fit-card')) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!GUIDE.test(label) || !isVisible(el) || el.hasAttribute('disabled')) continue;
      if (el.getAttribute('aria-expanded') === 'true' || el.getAttribute('aria-selected') === 'true') continue;
      if (el.tagName === 'BUTTON' && el.closest('form') && el.getAttribute('type') !== 'button') continue;
      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        if (href && href !== '#' && !href.startsWith('#') && !/^javascript:/i.test(href)) continue;
      }
      return el;
    }
  }
  return null;
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Returns true when new tables appeared. Tries at most two controls. */
export async function openSizeGuide(doc: Document, wait = pause): Promise<boolean> {
  const before = readTables(doc).length;
  const tried = new Set<Element>();
  for (let attempt = 0; attempt < 2; attempt++) {
    const control = findGuideControl(doc, tried);
    if (!control) return false;
    tried.add(control);
    const openedDialog = !doc.querySelector('dialog[open],[role="dialog"]:not([hidden])');
    if (control.tagName === 'SUMMARY' && control.parentElement?.tagName === 'DETAILS') (control.parentElement as HTMLDetailsElement).open = true;
    else control.click();
    for (let i = 0; i < 10; i++) {
      await wait(250);
      if (readTables(doc).length > before) {
        if (openedDialog) closeDialog(doc);
        return true;
      }
    }
  }
  return false;
}

/** Close a guide dialog FORMA opened, so the shopper is not left with a modal. */
function closeDialog(doc: Document) {
  const dialog = doc.querySelector<HTMLDialogElement>('dialog[open]');
  if (dialog && typeof dialog.close === 'function') { dialog.close(); return; }
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
}
