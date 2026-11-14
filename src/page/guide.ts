import { readTables, productRoot } from './listing';

/**
 * Opens an in-page size guide (tab, accordion or dialog) when the chart is
 * loaded on demand. Never navigates, never touches size selectors or the cart.
 */
const GUIDE = /^(?:(?:view|open|show|zur|zum)\s+)?(?:sizing|size\s*(?:guide|chart|&\s*fit|and fit|info)|fit\s*guide|fit\s*(?:&|and)\s*size|measurements|masse|maße|passform|gr(?:ö|oe)(?:ss|ß)en(?:tabelle|berater|beratung|ratgeber|guide|info)|gr(?:ö|oe)(?:ss|ß)e\s*(?:&|und)\s*passform|ma(?:ss|ß)tabelle|guide des tailles|tabella taglie)(?:\s+(?:öffnen|anzeigen|ansehen))?$/i;
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
  // An open guide's own tabs come first (Carhartt opens on product
  // measurements; the chart sits behind a second tab).
  const roots = [...Array.from(doc.querySelectorAll('dialog[open],[role="dialog"]')), productRoot(doc)];
  for (const root of roots) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(CONTROLS))) {
      if (tried.has(el) || el.closest('footer,header,#forma-fit-card')) continue;
      // Site menus live in <nav>, but some shops (COS) also wrap the product's
      // own accordion links in one. A <nav> inside the main content is allowed.
      const nav = el.closest('nav');
      if (nav && !nav.closest('main,[role="main"],dialog,[role="dialog"]')) continue;
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

/**
 * Opens the guide and resolves once new tables appeared, with a function that
 * closes a dialog FORMA opened. Read the page before calling it: some shops
 * remove the chart from the DOM when the dialog closes. Null when nothing
 * appeared. Tries at most three controls, so a guide that opens on another
 * tab can still be switched to its chart.
 */
export async function openSizeGuide(doc: Document, wait = pause): Promise<(() => void) | null> {
  const before = readTables(doc).length;
  const hadDialog = !!openDialog(doc);
  const close = () => { if (!hadDialog) closeDialog(doc); };
  const tried = new Set<Element>();
  for (let attempt = 0; attempt < 3; attempt++) {
    const control = findGuideControl(doc, tried);
    if (!control) break;
    tried.add(control);
    if (control.tagName === 'SUMMARY' && control.parentElement?.tagName === 'DETAILS') (control.parentElement as HTMLDetailsElement).open = true;
    else control.click();
    for (let i = 0; i < 10; i++) {
      await wait(250);
      if (readTables(doc).length > before) return close;
    }
  }
  close();
  return null;
}

function openDialog(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('dialog[open],[role="dialog"]:not([hidden])');
}

/** Close a guide dialog FORMA opened, so the shopper is not left with a modal. */
function closeDialog(doc: Document) {
  const dialog = openDialog(doc);
  if (!dialog) return;
  if (dialog.tagName === 'DIALOG' && typeof (dialog as HTMLDialogElement).close === 'function') { (dialog as HTMLDialogElement).close(); return; }
  // React Aria listens inside the dialog, Headless UI on the document; an
  // Escape from within the dialog bubbles to both.
  const active = doc.activeElement;
  const target = active && active !== doc.body && dialog.contains(active) ? active : dialog;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
}
