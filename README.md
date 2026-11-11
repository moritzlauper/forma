# FORMA · Your fit

A Chrome extension for explainable clothing-fit assessments. English interface; simple English and German profile descriptions are recognised locally. Version 1.3.1.

## Install

Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`. After rebuilding, reload FORMA there and refresh connected shop tabs. Alternatively, extract the release ZIP and load its folder.

New installations start with an empty profile. Existing profiles and saved API keys stay in the browser when updating the same installation. Missing body dimensions receive broad, unvalidated starting estimates after height and weight are provided. Manual and locked values take precedence. Automatic numeric body estimates are excluded from AI input and cannot produce a local size recommendation.

## Everyday use

Describe your fit preferences in **Your profile**. The first-start card already selects Claude Haiku 5.5: enter your API key and choose **Enable AI & automatic detection**. Chrome asks for website access once. The all-shops button also works while Chrome settings or an extension page is active, requests access directly from the click, and shows activation/denial beside the button. The key stays on this device; existing keys and explicit provider preferences are preserved. You can also enable automatic detection from Settings.

Clothing product pages are recognised locally from product metadata, clothing names/categories, prices, sizes and purchase controls. This classification uses no AI or tokens. Catalogues, articles and unrelated products are skipped. On recognised pages, FORMA automatically assesses fit with the selected provider, even when its local parser already recognises the chart.

If a page is missed, choose **Analyse this page**. This requests access to that shop if needed and bypasses classification for the current page. It uses the same chart discovery, AI, cache and budget as automatic analysis. Refresh retains manual activation; navigation clears it. It does not guarantee that missing measurements can be recovered.

FORMA reads charts already present in closed sizing tabs. If a chart is loaded on demand, it opens a recognised in-page Sizing/Size guide control and waits briefly for the table before asking AI. German controls such as “Grössenberater öffnen” and “Größentabelle anzeigen”, nested disclosures and dialog tables (including consistent CSS grids) are supported. Size-conversion tables such as EU / INT / UK / JEANS are passed to the assessment as label mappings, never centimetres. FORMA never selects sizes or modifies the cart.

Opening the panel reconnects to the active, already-permitted shop and starts a missing reader, including in tabs left open across extension updates. Missing website access, scan failures and interrupted assessments have explicit statuses instead of an indefinite “Waiting for AI”. **Refresh** reconnects, rereads sizing and requests a fresh AI assessment, bypassing a completed cached answer. Repeated clicks during an active request share that request; automatic scans still use the cache.

When a measurement table cannot be parsed, the same AI request also receives up to 12,000 characters of sanitised product HTML and whitelisted Product JSON-LD fields. Scripts, input values and arbitrary attributes are excluded. Listed sizes, model height/worn size and fit descriptions are collected separately. Similar model height is a tentative length clue, not evidence of equal waist or body shape. Missing chart units prevent exact cm comparisons, but no longer veto every size estimate. A JEANS-to-INT mapping can connect the usual waist label to a published size without inventing body measurements.

The assessment combines available size measurements, garment description, profile preferences and matching recorded fit experience. With Anthropic, up to two product photos from Product structured data, social preview metadata or the product gallery are included. Photos help assess silhouette, dropped shoulders and visible hem construction; they do not supply exact centimetres or prove fit on the wearer. Hoodie and T-shirt length preferences are considered separately. A broad body with a narrowing ribbed hem can wear differently from a straight-hem shirt.

The shop card has a close button. Closing it keeps it hidden for that product until explicit analysis/Refresh or navigation. Unchanged product evidence does not reset the card or start another request; DOM announcements and unrelated tab updates no longer cause repeated refreshes.

The panel shows the model, completion/cache status, image inclusion, reasons and limitations. Missing credentials, permission, exhausted request limits and API errors are shown explicitly. AI failures do not silently fall back to a local size suggestion. The AI can return no reliable size when evidence is insufficient.

Fit assessments request schema-constrained JSON. Token-limit stops, refusals and malformed responses are checked before accepting a result; partial answers are never repaired into recommendations. Refresh can retry failures or replace an earlier completed answer.

FORMA can make a tentative size estimate from height, weight, fit preferences and the chart without requiring personal measurements. These results are labelled **Estimated size**. Every selected size must include separate width, length and sleeve checks; unknown sleeve measurements remain a limitation rather than a blanket veto. Known/reference measurements improve comparisons. Automatically generated numeric body dimensions remain excluded to avoid false precision. Recorded negative fit feedback removes contradicted sizes, without proving that a larger size will fit. Chat conversations outside the extension are not automatically imported as profile feedback.

## Relative fit scores

One AI request evaluates all chart sizes together, with relative 0–100 ratings for width, length, style and sleeves. These are heuristic judgements, not calibrated probabilities. FORMA computes the overall weighted average locally: width ×3, length ×3 (×4 for hoodies, ×5 for stated length concerns), style ×2, sleeves ×2 (×4 for a stated sleeve concern; omitted for categories without applicable sleeves). Missing garment dimensions force the corresponding score to unknown, and are omitted from the average. Assessed-factor counts show incomplete coverage. A high score with unverified sleeves is still uncertain.

The panel shows every size's total and component scores plus a short explanation. The compact shop card shows the top three totals. Sizes excluded by recorded fit feedback cannot win. If the AI's selected size disagrees with the calculated ranking, FORMA uses the highest eligible score and replaces the inconsistent explanation. Existing assessment caching applies to the whole comparison, not one paid call per size.

Use **Record actual fit** to record the size you tried. That experience takes priority for the same product. No specific product, brand, user measurement or size outcome is baked into the defaults.

## Save clothes that fit

**Save as a good fit** bookmarks the current product in one click. Optionally expand its details to record the size you actually wear and what you like, in your own words. The extension does not assume that a shop's currently selected size is your worn size. **Your profile → Your good fits** lets you edit or remove saved items.

Future assessments receive up to six relevant saved examples, including product descriptions and your reasons. Confirmed sizes with garment charts also provide comparable dimensions, with their original units and flat-width convention. An unsized bookmark teaches preferences without inventing a measurement anchor. Examples are selected by clothing category, prioritising the same type; the AI is instructed to distinguish T-shirt/hoodie lengths and trouser length methods. This is personalisation from saved examples, not model retraining or guaranteed cross-brand fit. Up to 50 items are stored locally; existing profile-only exports do not include this collection.

For the exact same saved product, an uncontradicted worn size is labelled **Your recorded fit**, even without chart measurements. This acknowledges your experience; it does not fabricate dimensions or a score and does not transfer that label to other products. The saved-item editor distinguishes recorded sizes from saved chart measurements.

Optional measurements and manual charts remain available. Use semicolon/tab-separated columns such as `Size;Chest;Sleeve;Length`. Explicitly specify body/garment measurements, units and full/half circumferences. Reference garments need compatible measurement protocols.

## Saved scan evidence

Scans store the product URL, capture time, product description, image URLs, original chart text, model/size/fit evidence, the sanitised HTML fallback and parsed values in a local library of up to 50 products. Every parsed measurement retains its original unit, half-width convention, body/garment subject, source and normalised cm value. AI prose is not imported as a measurement. User-confirmed manual charts have a separate source label. Temporarily closed or unloaded guides do not erase previously captured evidence.

Saving a good fit copies available scan evidence locally and makes **no AI request**. It does not refresh all open tabs or include an unsized bookmark in that same product's assessment input. Relevant saved examples are used on future products; their actual worn size is still needed for measurement comparison. The editor shows stored values, their normalisation and the source page. Saved good fits retain their copied evidence if an ordinary scan is later evicted. Existing profile-only exports do not include this scan library.

## Cost and privacy

Anthropic defaults to **Claude Haiku 5.5**, model ID `claude-haiku-5-5`. AI fit assessment is enabled by default but requires your key and browser connection permission. Product text/charts, the bounded sanitised source fallback when parsing fails, model/size/fit details, up to two product photo URLs, the saved fit description, relevant saved good fits and notes, known profile measurements/preferences and matching fit feedback are sent to Anthropic. The API fetches attached photo URLs to analyse them. Profile names are excluded from assessment input. Avoid including private information in free-text preferences.

Keys are remembered in trusted extension-local storage on this device and excluded from profile exports. Browser storage is not an encrypted password vault. Settings includes **Forget API key**. No key is embedded in page scripts or source.

Detection and parsing are local. Identical assessment inputs are cached locally, retaining 40 results. Concurrent identical assessments share a request. Profile, feedback or product changes may require a new paid assessment. The request limit counts attempts, including failures; it is not a monetary budget. Failed automatic requests are not retried on every page mutation during the worker session. Press Refresh to retry a failed assessment within the request limit. Reloading the worker or changing settings can also allow another attempt.

The default allowance is **100 total requests**, with the consumed count saved between sessions. Existing unversioned limits of 10 migrate to 100 without resetting usage; other custom limits and zero remain unchanged. Settings shows used/remaining requests and applies edits only when **Save limit** is clicked. Choose **No request cap** to keep assessing beyond the allowance; usage is still counted and API charges still apply. **Allow 100 more requests** is available in Settings and directly beside the exhausted-budget message. Automatic assessments and manual chart extraction share one serialised counter. Increasing or removing the limit releases blocked work without duplicating an assessment already in progress. Cached results remain usable at the limit.

Choose **No AI** for free local comparison using reliable measurements. Ollama uses a locally installed text model at `http://localhost:11434`; product photos are not attached in this mode. Configure `OLLAMA_ORIGINS` for your exact `chrome-extension://ID` origin and restart Ollama. Local inference needs suitable hardware and electricity.

The tabs permission lets the panel identify the active shop URL. Page content requires host permission. Chrome local/session storage is restricted to trusted extension contexts. Profile export/import excludes API keys. Automatic AI assessment runs in the background worker, independently of whether the panel is open.

## Supported detection and limitations

Local detection covers visible and closed-tab HTML/ARIA size tables with explicit units and clear measurement conventions, including common English/German names and transposed layouts. “Waist across front” is recognised as a flat garment width. Generic trouser LENGTH remains garment length, never an invented inseam; it can support a relative coverage score with uncertain measurement endpoints. Conflicting charts are rejected; unknown sleeve protocols are excluded. Product photos require discoverable metadata or a qualifying gallery image, and publicly accessible image URLs. If the provider explicitly rejects an image with HTTP 400, FORMA makes one budgeted retry without photos. The panel states that no photos were assessed. Other API errors display the provider reason with credentials and URLs removed.

Size-guide discovery supports recognised in-page tabs, buttons and disclosures; it does not navigate to separate guide pages. A no-effect sizing click gets one bounded retry to handle delayed shop hydration; open dialogs are not toggled closed on parse failure. A size-guide preview shows the rows actually read. Shoe conversion guides may include a separately labelled foot-length column: only explicit centimetres are parsed as foot dimensions. **Usual shoe size · EU** is stored separately from measured foot length and can identify a tentative label in a conversion guide. General screenshot/OCR capture and calibrated 3D try-on are not implemented. AI reasoning is not a physical garment simulation. Estimated body dimensions remain uncertain; actual drape, hem tension and sleeve fit cannot be guaranteed. Bras, children's sizes and specialist garments need additional support.

## Verification

The guide reader also collects lower body-measurement tables, including repeated international sizes as ranges. Published body references remain distinct from garment dimensions. Newly discovered tables enrich saved good fits without an extra AI request. After analysis, the main button becomes a disabled “✓ Analysed”; Refresh starts a new assessment.

114 automated tests cover reconnection, status deadlines, numeric jeans sizing, fresh/cached requests, deduplication, saved good-fit examples, local recognition, budgets, measurement semantics and fit evidence. TypeScript and production build checks pass.

The Chromium extension smoke test starts with an already-open product and no reader, verifies automatic reconnection and a lazy Sizing click, checks parsed measurements, fresh Refresh versus automatic cache reuse, and saves a good fit with size/reason which is used on another product. It also checks all-shop activation from an extension page, saving an EU shoe size, zero AI calls when bookmarking and persistent normalised scan evidence. It opens a German size-guide modal with CSS conversion rows, preserves a saved L fit without measurements, and recovers from a rejected image with accurate image status and request counting. It also verifies unitless-guide estimates, model-size/source fallbacks, close-button persistence and zero requests or card removals during repeated live-region mutations. It uses a synthetic shop fixture, a stub AI response and pre-granted permissions in an isolated test manifest. It does not validate physical fit or the live Chrome permission prompt. Run `npx playwright install chromium`, `npm run build`, then `npm run test:browser`; CI also runs it. A text assessment was previously tested against the live Anthropic API.

## References

- [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Ollama Chat](https://docs.ollama.com/api/chat)
- [Claude vision input](https://platform.claude.com/docs/en/build-with-claude/vision)
