# FORMA · Your fit

A Chrome extension for explainable clothing-fit assessments. English interface; simple English and German profile descriptions are recognised locally. Version 0.2.1 preview.

## Install

Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`. After rebuilding, reload FORMA there and refresh connected shop tabs. Alternatively, extract the release ZIP and load its folder.

New installations start with an empty profile. Existing profiles and saved API keys stay in the browser when updating the same installation. Missing body dimensions receive broad, unvalidated starting estimates after height and weight are provided. Manual and locked values take precedence. Estimates alone no longer produce a local size recommendation.

## Everyday use

Describe your fit preferences, add your API key and allow the AI connection in Settings. Connect a shop once, or explicitly enable all-site access. On supported product pages, FORMA automatically assesses fit with the selected provider, even when its local parser already recognises the chart. Open the shop's size guide if it is hidden in a dialog. FORMA never selects sizes or modifies the cart.

The assessment combines available size measurements, garment description, profile preferences and matching recorded fit experience. With Anthropic, up to two product photos from Product structured data or the social preview image are included. Photos help assess silhouette, dropped shoulders and visible hem construction; they do not supply exact centimetres or prove fit on the wearer. Hoodie and T-shirt length preferences are considered separately. A broad body with a narrowing ribbed hem can wear differently from a straight-hem shirt.

The panel shows the model, completion/cache status, image inclusion, reasons and limitations. Missing credentials, permission, exhausted request limits and API errors are shown explicitly. AI failures do not silently fall back to a local size suggestion. The AI can return no reliable size when evidence is insufficient.

Fit assessments request schema-constrained JSON. Token-limit stops, refusals and malformed responses are checked before accepting a result; partial answers are never repaired into recommendations. Refresh retries failed assessments, while successful results continue to use the cache.

Use **Record actual fit** to record the size you tried. That experience takes priority for the same product. No specific product, brand, user measurement or size outcome is baked into the defaults. Cross-brand learning is not implemented.

Optional measurements and manual charts remain available. Use semicolon/tab-separated columns such as `Size;Chest;Sleeve;Length`. Explicitly specify body/garment measurements, units and full/half circumferences. Reference garments need compatible measurement protocols.

## Cost and privacy

Anthropic defaults to **Claude Haiku 5.5**, model ID `claude-haiku-5-5`. AI fit assessment is enabled by default but requires your key and browser connection permission. Product text/charts, up to two product photo URLs, profile measurements/preferences and matching fit feedback are sent to Anthropic. The API fetches attached photo URLs to analyse them. Profile names are excluded from assessment input. Avoid including private information in free-text preferences.

Keys are remembered in trusted extension-local storage on this device and excluded from profile exports. Browser storage is not an encrypted password vault. Settings includes **Forget API key**. No key is embedded in page scripts or source.

Detection and parsing are local. Identical assessment inputs are cached locally, retaining 40 results. Concurrent identical assessments share a request. Profile, feedback or product changes may require a new paid assessment. The request limit counts attempts, including failures; it is not a monetary budget. Failed automatic requests are not retried on every page mutation during the worker session. Press Refresh to retry a failed assessment within the request limit. Reloading the worker or changing settings can also allow another attempt.

Choose **No AI** for free local comparison using reliable measurements. Ollama uses a locally installed text model at `http://localhost:11434`; product photos are not attached in this mode. Configure `OLLAMA_ORIGINS` for your exact `chrome-extension://ID` origin and restart Ollama. Local inference needs suitable hardware and electricity.

The tabs permission lets the panel identify the active shop URL. Page content requires host permission. Chrome local/session storage is restricted to trusted extension contexts. Profile export/import excludes API keys. Automatic AI assessment runs in the background worker, independently of whether the panel is open.

## Supported detection and limitations

Local detection covers visible HTML/ARIA size tables with explicit units and clear measurement conventions, including common English/German names and transposed layouts. Conflicting charts are rejected; unknown sleeve protocols are excluded. Product photos require discoverable metadata and publicly accessible image URLs. Images blocked by the shop can cause the provider request to fail.

Automatic size-guide clicking, general screenshot/OCR capture and calibrated 3D try-on are not implemented. AI reasoning is not a physical garment simulation. Estimated body dimensions remain uncertain; actual drape, hem tension and sleeve fit cannot be guaranteed. Bras, children's sizes and specialist garments need additional support.

## Verification

37 automated tests cover unit conversion, table detection, estimated-measurement limitations, feedback contradictions, AI transport with parsed charts, image blocks, error handling and cached background assessment. TypeScript and production build checks pass. A text assessment was tested against the live Anthropic API. Product-image transport is covered with mocked API tests; the updated Chrome shop flow still needs live end-to-end verification.

## References

- [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Ollama Chat](https://docs.ollama.com/api/chat)
- [Claude vision input](https://platform.claude.com/docs/en/build-with-claude/vision)
