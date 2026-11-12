/** Small page-level progress chip. No artificial percentage; it ends with a result, a note or a timeout. */
export function createLoadingIndicator(onClose: () => void) {
  const host = document.createElement('div'); host.id = 'forma-loading';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
 :host{position:fixed;right:18px;bottom:18px;z-index:2147483647}
 .chip{display:flex;align-items:center;gap:9px;max-width:300px;padding:10px 12px;background:#ece7f3;color:#251e32;border:1px solid #aaa0ba;border-radius:7px;box-shadow:0 2px 8px #251e3214;font:13px/1.4 system-ui}
 .spinner{flex:none;width:12px;height:12px;border:1.5px solid #6d3fd133;border-top-color:#6d3fd1;border-radius:50%;animation:turn 1s linear infinite}
 .chip.failed .spinner{animation:none;border-color:#a94e37}
 button{border:0;background:none;color:#625970;font:18px/1 system-ui;cursor:pointer;padding:2px;margin-left:4px}button:focus-visible{outline:2px solid #6d3fd1}
 @keyframes turn{to{transform:rotate(360deg)}}
 @media(prefers-reduced-motion:reduce){.spinner{animation:none}}`;
  const chip = document.createElement('div'); chip.className = 'chip';
  const spinner = document.createElement('span'); spinner.className = 'spinner'; spinner.setAttribute('aria-hidden', 'true');
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Hide FORMA');
  close.onclick = () => { stop(); onClose(); };
  chip.append(spinner, status, close); root.append(style, chip);
  let generation = 0; let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() { generation++; clearTimeout(timer); host.remove(); }
  function start(text = 'FORMA · Checking your fit…') {
    if (host.isConnected) { update(text); return; }
    stop(); chip.classList.remove('failed'); status.textContent = text;
    const own = generation;
    // Avoid a flash for instant (cached) answers.
    timer = setTimeout(() => { if (own === generation) document.documentElement.append(host); }, 250);
  }
  function update(text: string) { status.textContent = text; }
  function fail(text: string) { clearTimeout(timer); chip.classList.add('failed'); status.textContent = text; if (!host.isConnected) document.documentElement.append(host); }
  return { host, start, update, fail, stop };
}
