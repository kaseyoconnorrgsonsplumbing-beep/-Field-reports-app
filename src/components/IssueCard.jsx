import { useState } from 'react';
import Dictate from './Dictate';
import { polishText } from '../ai';
import { PRIORITIES } from '../imageUtils';

/**
 * One issue: location, voice/typed notes, photos, AI-written finding +
 * recommendation, and a price.
 */
export default function IssueCard({ index, issue, photos, onChange, onRemove, onTakePhoto, onEditPhoto, onRemovePhoto, notify }) {
  const [busy, setBusy] = useState(null);
  const set = (patch) => onChange({ ...issue, ...patch });
  const append = (key) => (t) => set({ [key]: (issue[key] ? issue[key].trimEnd() + ' ' : '') + t });

  async function polish(key, kind) {
    if (!issue[key]?.trim()) return;
    setBusy(key);
    try {
      set({ [key]: await polishText(issue[key], kind) });
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  const Polish = ({ k, kind }) => (
    <button type="button" className="btn btn-sm btn-ghost" disabled={busy === k || !issue[k]?.trim()} onClick={() => polish(k, kind)}>
      {busy === k ? <span className="spinner" /> : '✨ Clean up'}
    </button>
  );

  return (
    <div className="card issue" id={`issue-${issue.id}`}>
      <div className="issue-head">
        <span className="issue-num">#{index + 1}</span>
        <input
          placeholder="Issue title (AI can fill this in)"
          value={issue.title || ''}
          onChange={(e) => set({ title: e.target.value })}
        />
        <button className="btn-danger-text" onClick={onRemove}>Remove</button>
      </div>

      <div className="field">
        <label>Priority</label>
        <div className="prio-row">
          {PRIORITIES.map((p) => (
            <button
              type="button"
              key={p.key}
              className={`prio ${issue.priority === p.key ? 'on' : ''}`}
              style={issue.priority === p.key ? { background: p.color, borderColor: p.color, color: '#fff' } : { color: p.color, borderColor: p.color }}
              onClick={() => set({ priority: issue.priority === p.key ? '' : p.key })}
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 6 }}>Urgent = leak, safety or code issue. Recommended = fix soon. Monitor = watch it / plan for it. AI can suggest one.</p>
      </div>

      <div className="field">
        <label>
          Location <Dictate onText={append('location')} />
        </label>
        <input placeholder="e.g. Master bathroom, under vanity" value={issue.location || ''} onChange={(e) => set({ location: e.target.value })} />
      </div>

      <div className="field">
        <label>
          What you found (notes)
          <span className="row" style={{ gap: 6 }}>
            <Polish k="rawNotes" kind="jobsite field note" />
            <Dictate onText={append('rawNotes')} />
          </span>
        </label>
        <textarea
          rows={3}
          placeholder='Talk it out: "P-trap under the master bath sink is leaking at the slip joint, cabinet floor is swollen…"'
          value={issue.rawNotes || ''}
          onChange={(e) => set({ rawNotes: e.target.value })}
        />
      </div>

      <div className="field" style={{ marginBottom: 4 }}>
        <label>Photos</label>
      </div>
      <div className="photos">
        {(issue.photoIds || []).map((pid) => {
          const p = photos[pid];
          if (!p) return null;
          return (
            <div className="photo" key={pid} onClick={() => onEditPhoto(pid)}>
              <img src={p.annotated || p.original} alt="" />
              <span className="edit">✎ Mark up</span>
              <button className="x" onClick={(e) => { e.stopPropagation(); onRemovePhoto(pid); }} aria-label="Remove photo">×</button>
            </div>
          );
        })}
        <div className="photo add" onClick={() => onTakePhoto('camera')}>
          <span>📷</span>
          <span>Take photo</span>
        </div>
        <div className="photo add" onClick={() => onTakePhoto('library')}>
          <span>🖼️</span>
          <span>From library</span>
        </div>
      </div>

      <div className="field">
        <label>
          Finding (client-facing)
          <span className="row" style={{ gap: 6 }}>
            <Polish k="finding" kind="report finding paragraph" />
            <Dictate onText={append('finding')} />
          </span>
        </label>
        <textarea rows={3} placeholder="Generated from your notes, or write your own" value={issue.finding || ''} onChange={(e) => set({ finding: e.target.value })} />
      </div>

      <div className="field">
        <label>
          Recommended solution
          <span className="row" style={{ gap: 6 }}>
            <Polish k="recommendation" kind="report recommendation paragraph" />
            <Dictate onText={append('recommendation')} />
          </span>
        </label>
        <textarea rows={3} placeholder="What you recommend doing about it" value={issue.recommendation || ''} onChange={(e) => set({ recommendation: e.target.value })} />
      </div>

      <div className="field">
        <label>Price</label>
        <div className="price-row">
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--gray)' }}>$</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={issue.price ?? ''}
            onChange={(e) => set({ price: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
