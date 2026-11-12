import React, { useEffect, useState } from 'react';
import { DEFAULT_PROFILE } from '../assess/person';
import type { Profile } from '../core/types';

const MEASURES: { key: string; label: string; hint: string }[] = [
  { key: 'chest', label: 'Chest', hint: 'around, under the arms' },
  { key: 'waist', label: 'Waist', hint: 'around, where trousers sit' },
  { key: 'hip', label: 'Hips', hint: 'around, widest point' },
  { key: 'arm', label: 'Arm length', hint: 'shoulder point to wrist' },
  { key: 'inseam', label: 'Inseam', hint: 'crotch to floor, barefoot' },
  { key: 'foot', label: 'Foot length', hint: 'heel to longest toe' },
];

/** Body, usual sizes, preferences and optional measurements. Saved explicitly. */
export function ProfileEditor({ profile, save }: { profile: Profile; save: (profile: Profile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => setDraft(profile), [profile]);
  const context = { ...DEFAULT_PROFILE.context!, ...draft.context };
  const field = (key: keyof typeof context, value: unknown) => { setDraft({ ...draft, context: { ...context, [key]: value } }); setMessage(''); };
  const measureValue = (key: string) => {
    const m = draft.measures[key] || (key === 'arm' ? draft.measures.sleeve : undefined);
    return m && !m.estimated ? String(m.value) : '';
  };
  const setMeasure = (key: string, raw: string) => {
    const measures = { ...draft.measures };
    if (key === 'arm') delete measures.sleeve;
    const value = Number(raw.replace(',', '.'));
    if (raw.trim() && value > 0 && value < 300) measures[key] = { value, uncertainty: 1 };
    else delete measures[key];
    setDraft({ ...draft, measures }); setMessage('');
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(profile);
  return <div className="card">
    <h2>Body &amp; usual sizes</h2>
    <p className="small">Use what you know. Everything is optional and stays on this device.</p>
    <div className="grid">
      <label>Height · cm<input type="number" min="100" max="250" value={context.height || ''} onChange={e => field('height', Number(e.target.value))} /></label>
      <label>Weight · kg<input type="number" min="20" max="300" value={context.weight || ''} onChange={e => field('weight', Number(e.target.value))} /></label>
      <label>Usual top size<input value={context.topSize || ''} onChange={e => field('topSize', e.target.value)} placeholder="e.g. L" /></label>
      <label>Usual jeans size<input value={context.waistLabel} onChange={e => field('waistLabel', e.target.value)} placeholder="e.g. W33 L34" /></label>
      <label>Usual shoe size · EU<input value={context.shoeSizeEU || ''} onChange={e => field('shoeSizeEU', e.target.value)} placeholder="e.g. 45" /></label>
      <label>Preferred fit<select value={draft.fit} onChange={e => { setDraft({ ...draft, fit: e.target.value as Profile['fit'] }); setMessage(''); }}>
        <option value="close">Close</option><option value="regular">Regular</option><option value="relaxed">Loose</option><option value="oversized">Oversized</option>
      </select></label>
    </div>
    <label>Build &amp; proportions<textarea rows={2} maxLength={600} value={context.bodyShape || ''} onChange={e => field('bodyShape', e.target.value)} placeholder="e.g. broad shoulders, long arms, short torso" /></label>
    <label>Style<input value={context.style} maxLength={200} onChange={e => field('style', e.target.value)} placeholder="e.g. streetwear, minimal" /></label>
    <details><summary>Body measurements · optional, most precise</summary>
      <p className="small">Measured with a tape, in centimetres. Chest, waist and hips are the full circumference. FORMA compares them with garment measurements and your preferred fit.</p>
      <div className="grid">{MEASURES.map(m => <label key={m.key}>{m.label} · cm<input type="number" min="1" max="300" step=".5" value={measureValue(m.key)} onChange={e => setMeasure(m.key, e.target.value)} placeholder={m.hint} /></label>)}</div>
    </details>
    <div className="actions">
      <button className="primary" disabled={busy || !changed} onClick={async () => {
        setBusy(true);
        try { await save(draft); setMessage('Profile saved. Open pages are updated without a new AI request.'); }
        catch { setMessage('Could not save. Please try again.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Saving…' : 'Save profile'}</button>
      {message && <span className="small" role="status">{message}</span>}
    </div>
  </div>;
}
