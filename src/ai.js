import { auth } from './firebase';

async function call(body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch('/.netlify/functions/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `AI request failed (${res.status})`);
  return data;
}

/** Clean up grammar / dictation errors in one block of text. */
export async function polishText(text, kind) {
  const { text: out } = await call({ mode: 'polish', text, kind });
  return out;
}

/** Generate title, summary, and finding/recommendation for each issue. */
export async function generateReport(report, issues) {
  return call({
    mode: 'generate',
    report: {
      clientName: report.clientName,
      address: report.address,
      title: report.title,
      generalNotes: report.generalNotes,
    },
    issues: issues.map((i) => ({
      id: i.id,
      location: i.location,
      rawNotes: i.rawNotes,
      finding: i.finding,
      recommendation: i.recommendation,
    })),
  });
}
