---
name: forma
description: Use FORMA to find clothing that fits the user's saved measurements and preferences, compare product sizes, or search for a requested fit score. Applies when the user asks to use FORMA for clothing shopping.
---

# Find fits with FORMA

Use `FORMA_COMMAND status` to check the companion. `FORMA_COMMAND context` returns the profile and worn garments explicitly synced from Chrome. Check `at`: if the user changed their Chrome profile since that time, ask them to sync it in FORMA Settings. Do not invent a missing profile or edit its measurements to obtain a higher score.

Use the available browser or search tools to find relevant, currently offered products. FORMA does not search the web itself. Preserve the user's category, budget and location constraints; use their saved preferences when no constraints are supplied.

For each promising product, read the actual product page and size guide. Save a private JSON input file with `{ "listing": { "url": "…", "title": "…", "kind": "jacket", "sizes": [{ "label": "M", "available": true, "selected": false }], "description": "…", "facts": [], "tables": [{ "caption": "Garment measurements, cm", "rows": [["Size", "Chest", "Length"], ["M", "58", "66"]] }] }`. Other optional listing fields are brand, marketplace, attributes (name/value pairs), images, breadcrumbs, site and signals. Use null for unknown availability. Do not turn body-size charts into garment measurements or invent missing stock information.

Run `FORMA_COMMAND prepare /absolute/path/product.json`. It returns the exact FORMA reader instructions, schema and personal context. Read the garment yourself following that schema and add the resulting object as `reading` beside `listing` in the same file. Mark inferred measurements `typical`, never `chart` or `seller`. Then run `FORMA_COMMAND assess /absolute/path/product.json` to compute the score with FORMA's actual decision engine. This does not start another model or require an API key. Without a reading, assess uses published measurements only.

Alternatively, when the user requests a separate local assistant, `assess product.json --provider codex` or `--provider claude` calls the signed-in official CLI. This sends the prepared product/profile data to that provider and uses its plan limits. Prefer reading directly in the current assistant; do not recursively spawn yourself just to run FORMA.

Report the returned size, score, confidence, availability and decisive reasons with the original product URL. “Over 9” means strictly >9, not 9.0. A high score based on estimates remains uncertain; state that clearly. Do not change feedback, mark a product as worn, or repeatedly reroll the same assessment to reach a target. If no candidate meets the request after a reasonable search, report the best verified candidates and what evidence is missing.

Keep profile and product-input files out of repositories and public artifacts. Delete temporary inputs after use. `FORMA_COMMAND forget` deletes the companion profile copy; disconnect sync in Chrome Settings to stop future copies.
