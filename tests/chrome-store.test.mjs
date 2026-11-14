import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseAction, publishRelease } from '../scripts/chrome-store.mjs';
test('never replaces an active review, staged release or newer published version', () => {
  for (const state of ['PENDING_REVIEW', 'STAGED']) assert.equal(releaseAction({ submittedItemRevisionStatus: { state } }, '2.1.0'), 'wait');
  assert.equal(releaseAction({ publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: '2.2.0' }] } }, '2.1.0'), 'current');
  assert.equal(releaseAction({ publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: '2.0.3' }] } }, '2.1.0'), 'upload');
  assert.throws(() => releaseAction({ submittedItemRevisionStatus: { state: 'REJECTED', distributionChannels: [{ crxVersion: '2.1.0' }] } }, '2.1.0'), /rejected/);
});
test('pending review makes only a status request; upload failure cannot publish', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => ({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }) }; };
  assert.equal((await publishRelease({ version: '2.1.0', zip: Buffer.from('zip'), accessToken: 'test', fetcher })).action, 'wait');
  assert.equal(calls.length, 1);
  const responses = [{}, { uploadState: 'FAILED' }];
  await assert.rejects(publishRelease({ version: '2.1.0', zip: Buffer.from('zip'), accessToken: 'test', fetcher: async () => ({ ok: true, json: async () => responses.shift() }) }), /Nothing was submitted/);
});
test('async upload completes before review submission with warnings blocked', async () => {
  const responses = [{}, { uploadState: 'IN_PROGRESS' }, { lastAsyncUploadState: 'SUCCEEDED' }, { state: 'PENDING_REVIEW' }], calls = [];
  const result = await publishRelease({ version: '2.1.0', zip: Buffer.from('zip'), accessToken: 'test', pause: async () => {}, fetcher: async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => responses.shift() }; } });
  assert.equal(result.state, 'PENDING_REVIEW');
  assert.match(calls[1][0], /\/upload\/v2\//);
  assert.deepEqual(JSON.parse(calls[3][1].body), { publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true });
});
