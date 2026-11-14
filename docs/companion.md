# Use FORMA with Codex and Claude Code

The optional companion supports macOS and Linux, Node.js 22+, and current official Codex CLI / Claude Code. Windows is not yet supported by the installer. The Chrome extension still works without the companion.

1. Download and extract `forma-companion-v2.1.0.tar.gz` from the release.
2. Run `node install.mjs` in the extracted directory. For an unpacked development extension, append the extension ID shown by Chrome: `node install.mjs YOUR_EXTENSION_ID`.
3. Install and sign in to the CLI you want to use (`codex login` or `claude auth login`). FORMA uses that CLI's existing login; your plan limits apply. This is not a connection to an arbitrary ChatGPT or Claude browser tab.
4. In FORMA Settings, select **Codex · ChatGPT login** or **Claude Code · Claude login**, then **Connect local assistant**. These modes send product text and fit information, without photos. API and Ollama modes remain available.
5. To ask an assistant to search for you, select **Connect my fit profile**. Start a new Codex or Claude Code conversation and say **Use FORMA to find me a jacket with a fit score over 9**.

The installer places a skill in `~/.agents/skills/forma` and `~/.claude/skills/forma`. It tells the current assistant how to inspect products and run the same FORMA decision engine; the assistant can do this without starting another model or using an API key. The companion does not search the web itself; the assistant uses its available browser/search tools. It cannot promise a matching garment or a particular score.

## Files and controls

- `~/.forma/app`: companion programs; `~/.forma/bin/forma`: command.
- `~/.forma/context.json`: explicitly synced profile, saved clothes, feedback and measurement library. No API key or profile label. Owner-only permissions, not encrypted. Assistant conversations can contain this data when you ask the assistant to use it.
- The extension's optional `nativeMessaging` permission connects only to the installed host `ch.angebunden.forma`; there is no listening localhost server. Host registration allowlists the store extension plus development IDs explicitly passed to the installer.
- **Disconnect and delete local copy** stops sync and deletes the companion profile. `~/.forma/bin/forma forget` deletes the current copy only; disable sync in Chrome to stop it being recreated.
- Uninstalling Chrome's extension does not remove companion files or assistant conversations. To uninstall the companion, disconnect first, then remove its `~/.forma` directory, its two skill directories and `ch.angebunden.forma.json` from Chrome's NativeMessagingHosts directory.

## CLI

`forma status` checks installation and snapshot time. `forma prepare product.json` supplies the canonical reader prompt/schema and relevant context. `forma assess product.json` evaluates `{ listing, reading? }` locally; without a reading it uses published measurements only. `--provider codex` or `--provider claude` explicitly starts the chosen signed-in CLI. Add `~/.forma/bin` to PATH or use the full command path.

The direct CLI has no extension request counter or browser cache. Each explicit `--provider` call uses the provider's quota. Browser calls retain FORMA's normal cache, request counter and off/cancellation controls. Local provider calls have a timeout and no automatic retry. Tool execution is disabled for the garment reader, user customizations/MCPs are excluded, and temporary request/output files are removed after completion. The assistant-led search skill runs under the assistant's own permissions.

Sources: [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive), [Claude Code headless mode](https://code.claude.com/docs/en/headless), [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
