import React from 'react';
import { checkPhrase, LEVEL_LABELS } from '../assess/decide';
import { DIM_LABELS, KIND_LABELS } from '../core/garment';
import type { Check, Decision, Listing, Measure, PageState, SizeResult } from '../core/types';

const SOURCE_LABELS: Record<Measure['source'], string> = { chart: 'size chart', seller: 'seller', photo: 'from photo', typical: 'estimate' };
const CHECK_NAMES: Record<Check['key'], string> = { width: 'Width', length: 'Length', sleeves: 'Sleeves' };

function stepClass(step: Check['step']) {
  return step === null ? 'unknown' : step === 0 ? 'right' : step < 0 ? 'minus' : 'plus';
}

export function CheckRows({ checks, kind }: { checks: Check[]; kind: Decision['kind'] }) {
  return <dl className="checks">{checks.map(c => <div key={c.key}>
    <dt>{CHECK_NAMES[c.key]}</dt>
    <dd><strong className={stepClass(c.step)}>{checkPhrase(c, kind)}</strong> <span className="small">· {c.basis} · {c.confidence} confidence</span>{c.text && <p className="small">{c.text}</p>}</dd>
  </div>)}</dl>;
}

function Measures({ measures }: { measures: Measure[] }) {
  if (!measures.length) return <p className="small">No measurements for this size.</p>;
  return <table className="measures"><tbody>{measures.map(m => <tr key={m.dim}>
    <th>{DIM_LABELS[m.dim]}</th>
    <td>{m.cm} cm{m.tol >= 1.5 ? ` ±${Math.round(m.tol)}` : ''}</td>
    <td className={m.source === 'typical' || m.source === 'photo' ? 'estimate' : ''}>{SOURCE_LABELS[m.source]}</td>
  </tr>)}</tbody></table>;
}

function sizeNote(s: SizeResult) {
  if (s.excluded) return 'excluded';
  if (s.available === false) return 'sold out';
  return s.score === null ? 'n/a' : `${s.score.toFixed(1)}/10`;
}

export function Verdict({ state }: { state: PageState }) {
  const d = state.decision!;
  const shown = d.size || d.closest;
  const best = d.sizes.find(s => s.label === shown);
  const reading = state.reading;
  return <>
    <div className={`verdict level-${d.level}`}>
      <div className="verdict-top">
        <span className="pill">{LEVEL_LABELS[d.level]}</span>
        <span className="small">{KIND_LABELS[d.kind]}{reading?.garment.cut ? ` · ${reading.garment.cut}` : ''}</span>
      </div>
      <div className="verdict-size">{shown ? <><span className="size">{shown}</span>{!d.size && <span className="small"> closest size, not recommended</span>}</> : <span className="size">–</span>}</div>
      <h2>{d.headline}</h2>
      <p className="small">{[d.score !== null ? `Fit ${d.score.toFixed(1)}/10` : 'Fit not scored', `${d.confidence} confidence`].join(' · ')}</p>
      {best && <CheckRows checks={best.checks} kind={d.kind} />}
      {d.cut.score !== null && <p className="cut"><strong>Cut &amp; style {d.cut.score}/10.</strong> {d.cut.reason}</p>}
      {d.summary && <p>{d.summary}</p>}
    </div>
    {best?.excluded && <p className="notice">{best.excluded}</p>}
    {d.sizes.length > 1 && <details open={d.sizes.length <= 8}>
      <summary>All sizes</summary>
      <table className="sizes"><thead><tr><th>Size</th><th>Fit</th><th>Width</th><th>Length</th>{d.sizes[0].checks.some(c => c.key === 'sleeves') && <th>Sleeves</th>}</tr></thead>
        <tbody>{d.sizes.map(s => <tr key={s.label} className={s.label === shown ? 'leading' : s.excluded || s.available === false ? 'muted' : ''}>
          <th>{s.label}{s.confirmed ? ' ✓' : ''}</th><td>{sizeNote(s)}</td>
          {s.checks.map(c => <td key={c.key} className={stepClass(c.step)} title={c.text}>{checkPhrase(c, d.kind).replace(/^sleeves /, '').replace(/^right (width|length)$/, 'right')}</td>)}
        </tr>)}</tbody></table>
    </details>}
    {best && <details><summary>Measurements of {best.label}</summary><Measures measures={best.measures} />
      <p className="small">Widths are laid flat (half the circumference). Estimates are typical values for this kind of garment, not published numbers.</p></details>}
    {(d.evidence.length > 0 || d.unknowns.length > 0) && <details><summary>Why FORMA says this</summary>
      <ul>{d.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      {d.unknowns.length > 0 && <><p className="eyebrow">STILL UNKNOWN</p><ul>{d.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></>}
    </details>}
    <p className="small">{state.model === 'local' ? 'Local comparison, no AI.' : `${state.model}${state.cached ? ' · saved assessment, no new request' : ''} · ${reading?.imagesUsed ? `${reading.imagesUsed} photo(s) assessed` : 'no photos assessed'}`}</p>
  </>;
}

export function ListingInfo({ listing }: { listing: Listing }) {
  return <details className="card"><summary>What FORMA read on this page</summary>
    <p className="small">{[listing.site, listing.marketplace ? 'marketplace listing' : 'shop', listing.kind ? KIND_LABELS[listing.kind] : 'garment type unclear', listing.brand].filter(Boolean).join(' · ')}</p>
    {listing.sizes.length > 0 && <p><strong>Sizes:</strong> {listing.sizes.map(s => s.label + (s.available === false ? ' (sold out)' : '')).join(', ')}</p>}
    {listing.attributes.length > 0 && <p><strong>Details:</strong> {listing.attributes.map(a => `${a.name}: ${a.value}`).join(' · ')}</p>}
    {listing.facts.length > 0 && <><p className="eyebrow">FIT AND MEASUREMENT NOTES</p><ul>{listing.facts.slice(0, 10).map((f, i) => <li key={i}>{f}</li>)}</ul></>}
    {listing.tables.map((t, i) => <div key={i} style={{ overflowX: 'auto' }}><p className="small">{t.caption || 'Size table'}</p><table><tbody>{t.rows.map((r, j) => <tr key={j}>{r.map((c, k) => j === 0 ? <th key={k}>{c}</th> : <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>)}
    <p className="small">{listing.images.length} product photo(s) found. {listing.description ? `Description: ${listing.description.length} characters.` : 'No description found.'}</p>
  </details>;
}
