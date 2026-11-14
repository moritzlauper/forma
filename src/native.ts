/** Chrome starts only the installed, allowlisted companion. No listening web server. */
export function nativeRequest(message: unknown, signal?: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Error('Cancelled.')); return; }
    const port = chrome.runtime.connectNative('ch.angebunden.forma');
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      port.disconnect();
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(Error('Cancelled.'));
    const timer = setTimeout(() => finish(Error('The local assistant timed out. Check its login and try Refresh.')), 240_000);
    signal?.addEventListener('abort', abort, { once: true });
    port.onMessage.addListener(response => response?.ok ? finish(undefined, response.result) : finish(Error(response?.error || 'The local assistant failed.')));
    port.onDisconnect.addListener(() => {
      const detail = chrome.runtime.lastError?.message;
      finish(Error(detail ? `FORMA companion unavailable. Install it from the latest release. ${detail}` : 'The local assistant disconnected.'));
    });
    port.postMessage(message);
  });
}
