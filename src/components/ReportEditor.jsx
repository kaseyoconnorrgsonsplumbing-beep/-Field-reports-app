import { useEffect, useRef, useState } from 'react';
import { watchReport, saveReport, watchPhotos, addPhoto, updatePhoto, removePhoto } from '../firebase';
import { fileToDataUrl, uid, money } from '../imageUtils';
import { generateReport, polishText } from '../ai';
import { buildReportPdf, pdfFileName } from '../pdf';
import IssueCard from './IssueCard';
import PhotoEditor from './PhotoEditor';
import Dictate from './Dictate';

const DEFAULT_CLOSING =
  'Pricing is valid for 30 days and includes labor and standard materials for the work described. Any additional issues discovered once work begins will be reviewed with you before proceeding. RG & Sons Plumbing, Inc. · ROC 107477 C-37 · ROC 107467 R37R';

export default function ReportEditor({ id, user, notify, onBack }) {
  const [report, setReport] = useState(null);
  const [photos, setPhotos] = useState({});
  const [editing, setEditing] = useState(null); // { photo, issueId, photoId? }
  const [busy, setBusy] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const dirty = useRef(false);
  const timer = useRef(null);
  const latest = useRef(null);
  const cameraInput = useRef(null);
  const libraryInput = useRef(null);
  const pendingIssue = useRef(null);

  // ---- load + live updates (remote changes apply only when nothing is unsaved locally)
  useEffect(() => {
    const unsub = watchReport(id, (r) => {
      if (!r) return;
      if (!dirty.current) {
        setReport(r);
        latest.current = r;
      }
    });
    const unsubP = watchPhotos(id, setPhotos);
    return () => {
      unsub();
      unsubP();
    };
  }, [id]);

  // ---- debounced autosave
  function update(patch) {
    setReport((r) => {
      const next = { ...r, ...patch };
      latest.current = next;
      return next;
    });
    dirty.current = true;
    setSaveState('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  async function flush() {
    if (!dirty.current || !latest.current) return;
    const { id: _id, createdAt, updatedAt, ...data } = latest.current;
    dirty.current = false;
    setSaveState('saving');
    try {
      await saveReport(id, data);
      setSaveState('saved');
    } catch (e) {
      dirty.current = true;
      setSaveState('error');
      notify('Save failed: ' + e.message, true);
    }
  }
  useEffect(() => () => { clearTimeout(timer.current); flush(); }, []); // eslint-disable-line

  // ---- issues
  const issues = report?.issues || [];
  const setIssues = (list) => update({ issues: list });
  const changeIssue = (iss) => setIssues((latest.current?.issues || issues).map((i) => (i.id === iss.id ? iss : i)));

  function addIssue() {
    const iss = { id: uid(), title: '', location: '', rawNotes: '', finding: '', recommendation: '', price: '', photoIds: [] };
    setIssues([...issues, iss]);
    setTimeout(() => document.getElementById(`issue-${iss.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function removeIssue(iss) {
    (iss.photoIds || []).forEach((pid) => removePhoto(id, pid).catch(() => {}));
    setIssues(issues.filter((i) => i.id !== iss.id));
  }

  // ---- photos
  function takePhoto(issueId, source) {
    pendingIssue.current = issueId;
    (source === 'camera' ? cameraInput : libraryInput).current.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const original = await fileToDataUrl(file);
      setEditing({ photo: { original }, issueId: pendingIssue.current });
    } catch (err) {
      notify('Could not read photo: ' + err.message, true);
    }
  }

  async function savePhoto({ annotated, annotations, crop }) {
    const { photo, issueId, photoId } = editing;
    try {
      if (photoId) {
        await updatePhoto(id, photoId, { annotated, annotations, crop: crop || null });
      } else {
        const newId = await addPhoto(id, { original: photo.original, annotated, annotations, crop: crop || null });
        const iss = latest.current.issues.find((i) => i.id === issueId);
        if (iss) changeIssue({ ...iss, photoIds: [...(iss.photoIds || []), newId] });
      }
      setEditing(null);
    } catch (e) {
      notify('Photo save failed: ' + e.message, true);
    }
  }

  function editPhoto(issueId, pid) {
    const p = photos[pid];
    if (p) setEditing({ photo: p, issueId, photoId: pid });
  }

  function dropPhoto(iss, pid) {
    changeIssue({ ...iss, photoIds: iss.photoIds.filter((x) => x !== pid) });
    removePhoto(id, pid).catch(() => {});
  }

  // ---- AI
  async function generate() {
    if (!issues.length) return notify('Add at least one issue first', true);
    setBusy('generate');
    try {
      const out = await generateReport(latest.current, issues);
      const byId = Object.fromEntries((out.issues || []).map((i) => [i.id, i]));
      update({
        title: out.title || report.title,
        summary: out.summary || report.summary,
        closing: report.closing || DEFAULT_CLOSING,
        issues: issues.map((i) => {
          const g = byId[i.id];
          return g ? { ...i, title: g.title || i.title, finding: g.finding || i.finding, recommendation: g.recommendation || i.recommendation } : i;
        }),
      });
      notify('Report text generated — review and edit anything below');
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function polish(key, kind) {
    if (!report[key]?.trim()) return;
    setBusy(key);
    try {
      update({ [key]: await polishText(report[key], kind) });
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  // ---- PDF
  async function exportPdf(mode) {
    setBusy('pdf');
    try {
      await flush();
      const doc = await buildReportPdf({ ...latest.current, id }, photos);
      const name = pdfFileName(latest.current);
      if (mode === 'share' && navigator.canShare) {
        const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return;
        }
      }
      if (mode === 'view') {
        window.open(doc.output('bloburl'), '_blank');
        return;
      }
      doc.save(name);
    } catch (e) {
      if (e.name !== 'AbortError') notify('PDF failed: ' + e.message, true);
    } finally {
      setBusy(null);
    }
  }

  if (!report) return <div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>Loading report…</div>;

  const total = issues.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  const appendR = (key) => (t) => update({ [key]: (report[key] ? report[key].trimEnd() + ' ' : '') + t });

  return (
    <>
      <div className="topbar">
        <button className="back" onClick={async () => { await flush(); onBack(); }}>‹ Back</button>
        <h1>
          {report.title || report.clientName || 'New report'}
          <div className="sub">{{ saved: 'All changes saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Save failed — will retry' }[saveState]}</div>
        </h1>
        <select
          value={report.status || 'draft'}
          onChange={(e) => update({ status: e.target.value })}
          style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: 0, borderRadius: 8, padding: '8px 6px', fontWeight: 600 }}
        >
          <option value="draft" style={{ color: '#000' }}>Draft</option>
          <option value="final" style={{ color: '#000' }}>Final</option>
        </select>
      </div>

      <div className="page">
        <div className="card">
          <h2>Job info</h2>
          <div className="grid2">
            <div className="field"><label>Client / company</label><input value={report.clientName || ''} onChange={(e) => update({ clientName: e.target.value })} placeholder="Homeowner or property manager" /></div>
            <div className="field"><label>Property address</label><input value={report.address || ''} onChange={(e) => update({ address: e.target.value })} placeholder="Street, Tucson, AZ" /></div>
            <div className="field"><label>Contact name</label><input value={report.contactName || ''} onChange={(e) => update({ contactName: e.target.value })} /></div>
            <div className="field"><label>Contact phone</label><input type="tel" value={report.contactPhone || ''} onChange={(e) => update({ contactPhone: e.target.value })} /></div>
            <div className="field"><label>Contact email</label><input type="email" value={report.contactEmail || ''} onChange={(e) => update({ contactEmail: e.target.value })} /></div>
            <div className="field"><label>Date</label><input type="date" value={report.date || ''} onChange={(e) => update({ date: e.target.value })} /></div>
            <div className="field"><label>Prepared by</label><input value={report.preparedBy || ''} onChange={(e) => update({ preparedBy: e.target.value })} /></div>
            <div className="field"><label>Report # (optional)</label><input value={report.reportNumber || ''} onChange={(e) => update({ reportNumber: e.target.value })} placeholder="Job or WO number" /></div>
          </div>
          <div className="field">
            <label>General notes about the visit <Dictate onText={appendR('generalNotes')} /></label>
            <textarea rows={2} value={report.generalNotes || ''} onChange={(e) => update({ generalNotes: e.target.value })} placeholder="Why you were there, who you met with, overall condition… AI uses this for the summary" />
          </div>
        </div>

        {issues.map((iss, i) => (
          <IssueCard
            key={iss.id}
            index={i}
            issue={iss}
            photos={photos}
            notify={notify}
            onChange={changeIssue}
            onRemove={() => removeIssue(iss)}
            onTakePhoto={(src) => takePhoto(iss.id, src)}
            onEditPhoto={(pid) => editPhoto(iss.id, pid)}
            onRemovePhoto={(pid) => dropPhoto(iss, pid)}
          />
        ))}

        {issues.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--gray)' }}>
            No issues yet. Tap <strong>+ Add issue</strong>, say what you found, snap a photo and mark it up. Keep walking and keep adding.
          </div>
        )}

        <div className="card">
          <h2>Write-up</h2>
          <button className="btn btn-primary btn-block" onClick={generate} disabled={busy === 'generate' || !issues.length}>
            {busy === 'generate' ? <><span className="spinner" /> Writing…</> : '✨ Generate report text with AI'}
          </button>
          <p className="hint">Writes a title, summary, and a Finding + Recommended Solution for every issue from your notes. Re-run any time; you can edit everything after.</p>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Report title</label>
            <input value={report.title || ''} onChange={(e) => update({ title: e.target.value })} placeholder="Plumbing Inspection Report – 123 Main St" />
          </div>
          <div className="field">
            <label>
              Summary
              <span className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-ghost" disabled={busy === 'summary' || !report.summary?.trim()} onClick={() => polish('summary', 'report summary paragraph')}>{busy === 'summary' ? <span className="spinner" /> : '✨ Clean up'}</button>
                <Dictate onText={appendR('summary')} />
              </span>
            </label>
            <textarea rows={4} value={report.summary || ''} onChange={(e) => update({ summary: e.target.value })} />
          </div>
          <div className="field">
            <label>Notes & terms (bottom of report)</label>
            <textarea rows={3} value={report.closing ?? ''} onChange={(e) => update({ closing: e.target.value })} placeholder={DEFAULT_CLOSING} />
            {!report.closing && <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => update({ closing: DEFAULT_CLOSING })}>Use standard terms</button>}
          </div>
        </div>

        <div className="card">
          <h2>Pricing</h2>
          {issues.map((i, n) => (
            <div className="row" key={i.id} style={{ justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{n + 1}. {i.title || i.location || 'Issue'}</span>
              <strong>{i.price !== '' && i.price != null ? money(i.price) : '—'}</strong>
            </div>
          ))}
          <div className="total" style={{ marginTop: 8 }}><span>Total</span><span>{money(total)}</span></div>
        </div>

        <div className="card">
          <h2>Export</h2>
          <div className="row">
            <button className="btn btn-green grow" onClick={() => exportPdf('download')} disabled={busy === 'pdf'}>{busy === 'pdf' ? <span className="spinner" /> : '⬇ Download PDF'}</button>
            <button className="btn grow" onClick={() => exportPdf('view')} disabled={busy === 'pdf'}>👁 Preview</button>
            {canShare && <button className="btn grow" onClick={() => exportPdf('share')} disabled={busy === 'pdf'}>↗ Share / Email</button>}
          </div>
          <p className="hint">Generated on the RG &amp; Sons letterhead with your marked-up photos, findings, and pricing summary.</p>
        </div>
      </div>

      <div className="fab-bar">
        <button className="btn btn-red" onClick={addIssue}>+ Add issue</button>
      </div>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={libraryInput} type="file" accept="image/*" hidden onChange={onFile} />

      {editing && <PhotoEditor photo={editing.photo} onSave={savePhoto} onCancel={() => setEditing(null)} />}
    </>
  );
}
