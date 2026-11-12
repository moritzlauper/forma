/** Query parameters that select the product itself rather than a variant or a tracker. */
const PRODUCT_PARAMS = ['id', 'p', 'pid', 'product', 'productid', 'product_id', 'item', 'itemid', 'sku', 'artikel'];

/**
 * One product, one identity: collection prefixes, tracking parameters,
 * variant selections and trailing slashes do not make a different product.
 */
export function productIdentity(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/collections\/[^/]+\/products\//, '/products/').replace(/\/+$/, '') || '/';
    const params = PRODUCT_PARAMS.filter(key => u.searchParams.has(key)).map(key => `${key}=${u.searchParams.get(key)}`);
    return u.origin + path + (params.length ? '?' + params.join('&') : '');
  } catch {
    return url;
  }
}

export async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Remove clocks and countdowns ("22 Min 53 Sek", "Noch 2 Tg. 13 Std.", "10:43") from text. */
export function stableText(text: string): string {
  return text
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:uhr|h)?\b/gi, '')
    .replace(/\b\d+\s?(?:min(?:uten|utes)?|sek(?:unden)?|sec(?:onds)?|std|stunden|hours?|hrs|tg|tage?|days?)\b\.?/gi, '')
    .replace(/\b(?:noch|ends? in|endet in|left)\b\s*(?=[|,.]|$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
