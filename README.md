# FORMA · Your fit

A local Chrome extension for explainable clothing-fit comparisons. English interface; simple English and German profile descriptions are recognised locally. Version 0.1.1.

## Install

Run `npm install`, `npm run check`, `npm test`, and `npm run build`. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`. After rebuilding, reload FORMA there and refresh connected shop tabs.

New installations start with an empty profile. Existing profiles stay in the browser. Missing body dimensions receive broad, unvalidated starting estimates only after height and weight are provided. These are marked as estimated and produce tentative recommendations. Manual and locked values take precedence.

## Everyday use

Connect a shop once, or explicitly enable all-site access in Settings. On supported product pages, FORMA watches visible HTML size charts and automatically compares readable measurements with the saved profile. If a chart is inside a dialog, open the shop's size guide; FORMA detects it when it appears. It never selects sizes or modifies the cart.

The normal view shows a candidate and per-dimension reasons. Missing measurements and ambiguous charts produce an explanation instead of a fabricated size. Height and weight alone do not establish exact chest fit or sleeve length; automatic estimates display wide uncertainty ranges. A usual waist size is kept as a label, not treated as a measured waist.

Your profile starts with a natural-language description. Optional measurements are collapsed underneath. A favourite garment's original measurements can avoid measuring your body. Enter reference circumferences in full; use the same sleeve/length measuring protocol as the product.

Manual tables and optional AI are under **Chart not detected? Advanced fallback**. Use semicolon/tab-separated columns such as `Size;Chest;Sleeve;Length`. Explicitly specify body/garment measurements, units and full/half circumferences when entering a chart manually.

## Cost and privacy

Normal page detection, profile parsing, chart extraction and fit comparison use no AI calls. Profile edits recalculate locally.

With an AI provider enabled and its connection allowed, unreadable detected charts automatically trigger one cached analysis. Ordinary pages and profile edits do not trigger AI. A manual fallback is also available. The cache keys parser version, provider, model and input text, retaining 40 analyses. A request limit counts attempted calls, including failures; it is not a monetary budget. No automatic paid retries.

Anthropic defaults to **Claude Haiku 5.5**, model ID `claude-haiku-5-5`. Enter your own API key and allow the connection. Only product text is sent; profile measurements remain local. Keys are remembered in trusted extension-local storage on this device and excluded from profile exports. Browser storage is not an encrypted password vault. Settings includes Forget API key. No key is embedded in page scripts or source.

Ollama uses `http://localhost:11434` and a locally installed model. Configure `OLLAMA_ORIGINS` for your extension's exact `chrome-extension://ID` origin and restart Ollama. Local inference has no API fees but needs hardware and electricity. No external AI service has been live-tested as part of this build.

The tabs permission lets the panel identify the active shop URL before requesting its host permission. Page contents still require host permission.

Chrome local and session storage are restricted to trusted extension contexts. Export/import moves your profile between computers without including API keys.

## Supported detection and limitations

Detection currently covers visible HTML/ARIA tables with explicit units and clear body measurements, or explicit garment circumferences/flat widths. It handles common English/German column names and some transposed layouts. Conflicting charts and mixed units are rejected. Unknown sleeve measuring protocols are excluded. Dynamic page/chart changes clear the old card and trigger a fresh comparison.

There are no verified named-shop adapters yet. Image charts/OCR, automatic size-guide clicking and calibrated 3D try-on are not implemented. An older schematic avatar module remains available in source but is not part of the normal profile screen. It is not an anthropometric model.

Body comparisons use provisional ease allowances. Stretch, fabric drape, raglan sleeves and dropped shoulders are not simulated. Reference comparisons need the same category and measurement protocol. Shoes require manufacturer body charts with foot measurements. Bras, children's sizes and specialist garments need separate rules and are not supported.

Feedback is recorded per product/size; no automatic cross-brand sizing inference is made. A running AI call ends when the panel closes; restarting is manual.

## Verification

`npm test`: unit conversion, flat widths, missing/conflicting values, sold-out sizes, separate length/width results, profile parsing and automatic chart detection. TypeScript and production build checks also pass. Live Chrome shop flows still need end-to-end testing.

## References

- [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Ollama Chat](https://docs.ollama.com/api/chat)
- [Claude Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5)
