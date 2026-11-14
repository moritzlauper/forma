import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const publisher = '6f69326f-a50c-4aa3-bb85-156c6c42183e';
const item = 'iocnmncpcjmemcbbiokjddplbpgdajfg';
const resource = `publishers/${publisher}/items/${item}`;
const base = 'https://chromewebstore.googleapis.com';
const scope = 'https://www.googleapis.com/auth/chromewebstore';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

export function releaseAction(status, version) {
  if (status.takenDown || status.warned) throw Error('Resolve the Web Store policy notice before releasing.');
  const submitted = status.submittedItemRevisionStatus;
  if (submitted?.state === 'PENDING_REVIEW' || submitted?.state === 'STAGED') return 'wait';
  const versions = status.publishedItemRevisionStatus?.distributionChannels?.map(c => c.crxVersion) || [];
  const compare = (a, b) => { const aa = a.split('.').map(Number), bb = b.split('.').map(Number); for (let i = 0; i < 4; i++) { const d = (aa[i] || 0) - (bb[i] || 0); if (d) return d; } return 0; };
  if (versions.some(v => compare(v, version) >= 0)) return 'current';
  if (submitted?.state === 'REJECTED' && submitted.distributionChannels?.some(c => c.crxVersion === version)) throw Error('This version was rejected. Fix it and release a new version.');
  return 'upload';
}

async function token() {
  if (!process.env.CWS_SERVICE_ACCOUNT_JSON) throw Error('Missing GitHub secret CWS_SERVICE_ACCOUNT_JSON. Connect a dedicated Chrome Web Store service account first (docs/releases.md).');
  const account = JSON.parse(process.env.CWS_SERVICE_ACCOUNT_JSON);
  if (!account.client_email || !account.private_key) throw Error('Invalid Chrome Web Store service account secret.');
  const now = Math.floor(Date.now() / 1000);
  const data = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(data).sign(account.private_key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${data}.${signature}` }), signal: AbortSignal.timeout(30_000) });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw Error(`Google authentication failed (HTTP ${response.status}). Check the service account secret.`);
  return result.access_token;
}

export async function publishRelease({ version, zip, accessToken, fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(version)) throw Error('Invalid extension version.');
  const request = async (url, options = {}) => {
    const response = await fetcher(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...options.headers }, signal: AbortSignal.timeout(90_000) });
    const result = await response.json();
    if (!response.ok) throw Error(`Chrome Web Store request failed (HTTP ${response.status}): ${result.error?.message || 'See the developer dashboard.'}`);
    return result;
  };
  const status = () => request(`${base}/v2/${resource}:fetchStatus`);
  const action = releaseAction(await status(), version);
  if (action !== 'upload') return { action, message: action === 'wait' ? 'An existing submission is under review or staged. It was left untouched; the next daily run will check again.' : 'This version or a newer one is already published.' };
  let upload = await request(`${base}/upload/v2/${resource}:upload`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: zip });
  for (let attempt = 0; upload.uploadState === 'IN_PROGRESS' && attempt < 12; attempt++) {
    await pause(10_000);
    upload = { uploadState: (await status()).lastAsyncUploadState };
  }
  if (upload.uploadState !== 'SUCCEEDED') throw Error(`Upload did not succeed (${upload.uploadState || 'unknown'}). Nothing was submitted.`);
  const result = await request(`${base}/v2/${resource}:publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true }) });
  if (!['PENDING_REVIEW', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(result.state)) throw Error(`Unexpected publish state: ${result.state}. Check the developer dashboard.`);
  return { action: 'submitted', state: result.state, version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [zipPath, version, mode] = process.argv.slice(2);
    const accessToken = await token();
    if (mode === '--status-only') {
      const response = await fetch(`${base}/v2/${resource}:fetchStatus`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw Error(`Status check failed (HTTP ${response.status}).`);
      const status = await response.json();
      console.log(JSON.stringify({ action: releaseAction(status, version), published: status.publishedItemRevisionStatus, submitted: status.submittedItemRevisionStatus }));
    } else console.log(JSON.stringify(await publishRelease({ version, zip: await readFile(zipPath), accessToken })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
