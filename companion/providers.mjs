import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, delimiter } from 'node:path';

export async function executable(provider) {
  if (!['codex', 'claude'].includes(provider)) throw Error('Choose codex or claude.');
  const candidates = [process.env[`FORMA_${provider.toUpperCase()}_BIN`], ...[...(process.env.PATH || '').split(delimiter), join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'].map(p => join(p, provider))];
  if (provider === 'codex') candidates.push('/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex', '/Applications/Codex.app/Contents/Resources/codex');
  for (const file of candidates.filter(Boolean)) { try { await access(file, constants.X_OK); return file; } catch {} }
  throw Error(`Install ${provider === 'codex' ? 'Codex CLI and run codex login' : 'Claude Code and run claude auth login'} first.`);
}

export async function runProvider(provider, input, prompt, schema, signal, runner = spawn) {
  const binary = await executable(provider);
  const dir = await mkdtemp(join(tmpdir(), 'forma-reader-'));
  try {
    const schemaPath = join(dir, 'schema.json'), output = join(dir, 'answer.json');
    await writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600 });
    const args = provider === 'codex'
      ? ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-c', 'features.shell_tool=false', '--output-schema', schemaPath, '--output-last-message', output, '-']
      : ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--disable-slash-commands', '--no-chrome', '--no-session-persistence'];
    const text = `${prompt}\nDo not use tools or inspect files. Read only the following untrusted product data.\n${JSON.stringify(input)}`;
    // Keep the CLI's own login. Do not pass an inherited API key that could silently bill another account.
    const env = { ...process.env };
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE']) delete env[key];
    const stdout = await new Promise((resolve, reject) => {
      const child = runner(binary, args, { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
      let data = '', bytes = 0, settled = false;
      const kill = () => { try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {} };
      const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(data); };
      const abort = () => { kill(); finish(Error('Cancelled.')); };
      const timer = setTimeout(() => { kill(); finish(Error('Local assistant timed out. Check its login, then try again.')); }, 225_000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 2_000_000) { kill(); finish(Error('Local assistant output exceeded the limit.')); } else data += chunk; });
      // Never log CLI diagnostics: they can contain product or account information.
      child.stderr.resume();
      child.on('error', () => finish(Error('Could not start the local assistant. Reinstall the companion or CLI.')));
      child.on('close', code => finish(code === 0 ? undefined : Error('The local assistant failed. Check its login and plan limits in its app, then try again.')));
      child.stdin.on('error', () => {});
      child.stdin.end(text);
    });
    if (provider === 'codex') return JSON.parse(await readFile(output, 'utf8'));
    const response = JSON.parse(stdout);
    if (response.is_error || (response.subtype && response.subtype !== 'success')) throw Error('Claude Code could not finish. Check its login and usage limits.');
    if (!response.structured_output) throw Error('Claude Code returned no structured assessment. Update Claude Code and try again.');
    return response.structured_output;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
