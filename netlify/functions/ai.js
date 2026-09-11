// Netlify Function: secure proxy to the Claude API.
// The browser never sees the Anthropic key. Every call must carry a valid
// Firebase ID token from a company email address.

import { createRemoteJWKSet, jwtVerify } from 'jose';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
// Firebase project id: FIREBASE_PROJECT_ID, or fall back to the public VITE_ one so a
// missing/typo'd variable doesn't break sign-in verification.
const PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'rgsonsplumbing.com').toLowerCase();

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

async function verifyUser(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('Missing auth token');
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  const email = String(payload.email || '').toLowerCase();
  if (!email.endsWith('@' + ALLOWED_DOMAIN)) throw new Error('Email domain not allowed');
  return email;
}

const STYLE = `You write for RG & Sons Plumbing, Inc. in Tucson, AZ — a licensed plumbing contractor (ROC C-37 / R37R).
Voice: clear, professional, direct. Plain English a homeowner or property manager understands, but keep correct trade terminology
(P-trap, angle stop, supply line, wax ring, flapper, T&P valve, PRV, cleanout, hose bib, etc.). No fluff, no marketing language,
no exclamation points. Never invent facts, measurements, code citations or causes that are not supported by the notes.
If the notes are unclear, stay general rather than guessing.`;

async function callClaude({ system, user, maxTokens = 2000, json = false }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // Only needed for a "Personal" key; workspace-scoped keys ignore it.
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!json) return text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Model did not return JSON');
  return JSON.parse(match[0]);
}

// mode: "polish"  -> { text, kind }            returns { text }
// mode: "generate" -> { report, issues[] }      returns { title, summary, issues: [{id, title, finding, recommendation}] }
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set on the server' }, 500);
  if (!PROJECT_ID) return json({ error: 'FIREBASE_PROJECT_ID is not set on the server' }, 500);

  try {
    await verifyUser(req);
  } catch (e) {
    return json({ error: 'Not authorized: ' + e.message }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  try {
    if (body.mode === 'polish') {
      const kind = body.kind || 'field note';
      const text = await callClaude({
        system: STYLE,
        user: `Rewrite the following ${kind} so it reads cleanly with correct grammar, spelling and punctuation. It was captured by voice-to-text on a jobsite, so fix obvious dictation errors (e.g. "pee trap" -> "P-trap", "angle stopped" -> "angle stop"). Keep every fact and the original meaning. Keep it about the same length. Return ONLY the rewritten text, no preamble, no quotes.\n\n---\n${body.text}`,
        maxTokens: 800,
      });
      return json({ text: text.trim() });
    }

    if (body.mode === 'generate') {
      const { report = {}, issues = [] } = body;
      const issueBlock = issues
        .map(
          (i, n) =>
            `ISSUE ${n + 1} (id: ${i.id})\nLocation: ${i.location || '(not given)'}\nField notes: ${i.rawNotes || '(none)'}\nExisting finding text (may be empty): ${i.finding || ''}\nExisting recommendation text (may be empty): ${i.recommendation || ''}`,
        )
        .join('\n\n');

      const result = await callClaude({
        system: STYLE,
        user: `Turn these jobsite field notes into a client-facing inspection/issue report.

Client: ${report.clientName || '(not given)'}
Property / address: ${report.address || '(not given)'}
Job type or context: ${report.title || '(not given)'}
General notes: ${report.generalNotes || '(none)'}

${issueBlock}

For EACH issue write:
- "title": short label, 3-8 words, e.g. "Leaking P-Trap – Master Bathroom"
- "finding": 1-3 sentences describing what was observed and why it matters (consequence if left alone), based only on the notes.
- "recommendation": 1-3 sentences describing the recommended repair/solution in plain language. Do not mention price.
- "priority": one of "urgent" (active leak, safety or code issue, or damage that will get worse quickly), "recommended" (should be repaired soon), or "monitor" (not urgent; watch it or plan for it). Judge only from the notes.

Also write:
- "summary": a 2-4 sentence overview paragraph for the top of the report (what was inspected, how many issues, overall condition), professional and neutral.
- "title": a short report title, e.g. "Plumbing Inspection Report – 123 Main St" (use the address or client if known).

Return ONLY valid JSON in exactly this shape:
{"title": "...", "summary": "...", "issues": [{"id": "...", "title": "...", "finding": "...", "recommendation": "...", "priority": "urgent|recommended|monitor"}]}`,
        maxTokens: 3500,
        json: true,
      });
      return json(result);
    }

    return json({ error: 'Unknown mode' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
