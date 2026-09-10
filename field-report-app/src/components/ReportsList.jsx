import { useEffect, useState } from 'react';
import { watchReports, createReport, deleteReport, logOut } from '../firebase';
import { money } from '../imageUtils';

export default function ReportsList({ user, notify, onOpen }) {
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => watchReports(setReports), []);

  async function newReport() {
    setBusy(true);
    try {
      const id = await createReport(user);
      onOpen(id);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <h1>
          Field Reports
          <div className="sub">{user.email}</div>
        </h1>
        <button onClick={logOut}>Sign out</button>
      </div>
      <div className="page">
        <div className="card report-list" style={{ padding: 0 }}>
          {reports === null && <div className="item">Loading…</div>}
          {reports && reports.length === 0 && (
            <div className="item" style={{ color: 'var(--gray)' }}>No reports yet. Tap “New report” to start walking a job.</div>
          )}
          {reports?.map((r) => {
            const total = (r.issues || []).reduce((s, i) => s + (Number(i.price) || 0), 0);
            return (
              <div className="item" key={r.id} onClick={() => onOpen(r.id)}>
                <div className="grow">
                  <div className="title">{r.title || r.clientName || r.address || 'Untitled report'}</div>
                  <div className="meta">
                    {[r.clientName, r.address].filter(Boolean).join(' · ')}
                    {r.date ? ` · ${r.date}` : ''} · {(r.issues || []).length} issue{(r.issues || []).length === 1 ? '' : 's'}
                    {total ? ` · ${money(total)}` : ''}
                  </div>
                </div>
                <span className={`badge ${r.status === 'final' ? 'final' : ''}`}>{r.status || 'draft'}</span>
                {confirmId === r.id ? (
                  <button
                    className="btn btn-sm btn-red"
                    onClick={(e) => { e.stopPropagation(); deleteReport(r.id).then(() => notify('Report deleted')).catch((err) => notify(err.message, true)); setConfirmId(null); }}
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button className="btn-danger-text" onClick={(e) => { e.stopPropagation(); setConfirmId(r.id); setTimeout(() => setConfirmId(null), 4000); }}>
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="fab-bar">
        <button className="btn btn-primary" onClick={newReport} disabled={busy}>+ New report</button>
      </div>
    </>
  );
}
