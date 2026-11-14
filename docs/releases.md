# Releases and Chrome Web Store

Publish a stable GitHub release tagged `vMAJOR.MINOR.PATCH`, with a matching package version and the asset `forma-vMAJOR.MINOR.PATCH.zip` (the contents of `dist`, with manifest.json at the ZIP root). Attach `forma-companion-vMAJOR.MINOR.PATCH.tar.gz` separately; native code must never be placed in the extension ZIP.

`chrome-store.yml` verifies the released ZIP against a fresh build and submits the latest stable release with Chrome Web Store API V2. Google reviews it and publishes it on approval. The daily run picks up a release queued behind an existing review. A pending or staged submission is never cancelled or replaced. A current/newer published version is skipped. Rejected versions and policy warnings stop the workflow for manual attention. Prereleases are excluded. Run the workflow manually to retry after fixing account or listing configuration.

## One-time publisher connection

1. In your Google Cloud project, enable **Chrome Web Store API**.
2. Create a dedicated service account, e.g. `forma-release`, without project IAM roles.
3. Add its email in the Chrome Web Store Developer Dashboard's Account section. Google currently allows one service account per publisher; this grants access to the publisher's items, not just FORMA.
4. Create a JSON key for that account and save its contents as GitHub repository secret **CWS_SERVICE_ACCOUNT_JSON**. Never commit or attach the key to a release. Remove the downloaded local copy after saving it securely.
5. Test with `CWS_SERVICE_ACCOUNT_JSON=… node scripts/chrome-store.mjs unused.zip 2.1.0 --status-only` using a securely supplied environment value. This checks access without uploading or publishing. Then run the GitHub workflow.

The publisher and extension IDs are fixed in `scripts/chrome-store.mjs`; no user profile or product data goes through GitHub Actions. Rotate the account key in Google Cloud and update the GitHub secret together. Missing credentials fail clearly rather than reporting a successful deployment.

Sources: [Chrome publishing workflow](https://developer.chrome.com/docs/webstore/using-api), [service accounts](https://developer.chrome.com/docs/webstore/service-accounts).
