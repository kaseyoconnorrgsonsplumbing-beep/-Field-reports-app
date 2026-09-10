# RG & Sons Field Reports

Walk a job on your phone, talk through each issue, snap a photo and mark it up, then have Claude write the report and export a PDF on the RG & Sons letterhead. Edit anything later from your desktop — it's the same app at the same URL.

**Stack:** React + Vite (front end) · Firebase Auth + Firestore (sign-in, storage, offline sync) · Netlify (hosting + a serverless function that talks to the Claude API so the key never touches the browser).

---

## How it works in the field

1. Open the app on your phone (add it to your home screen — it installs like an app).
2. **+ New report** → fill in client / address (or skip and do it later).
3. **+ Add issue** → tap 🎤 **Speak** on the notes field and say what you found ("P-trap under the master bath sink is leaking at the slip joint…").
4. **📷 Take photo** → the markup editor opens: pinch to zoom, **Crop**, draw an **Arrow** and give it a label ("Leaking P-trap" — white text on a dark shadow box), or drop a **Text** label anywhere. Save.
5. Keep walking, keep adding issues. Everything autosaves, and it works with no signal — it syncs when you're back on data.
6. At the end (or back at the desk): **✨ Generate report text with AI**. Claude writes the title, summary, and a *Finding* + *Recommended Solution* for every issue from your notes. Edit anything. Add a price to each issue.
7. **Download / Preview / Share PDF** — letterhead, photos two-up, findings, pricing summary with total, page numbers.

Every text box also has a **✨ Clean up** button that just fixes grammar and dictation errors without changing what you said.

---

## One-time setup (about 20 minutes)

You said you already have a Netlify account, a Firebase project, and an Anthropic API key. Here's how to wire them up.

### 1. Firebase

1. Firebase console → your project → **Build → Authentication → Sign-in method** → enable **Google**. Under *Authorized domains* add your Netlify site domain (e.g. `rg-field-reports.netlify.app`) once you know it.
2. **Build → Firestore Database → Create database** (production mode, `us-central1` or `us-west` is fine).
3. Firestore → **Rules** tab → paste the contents of `firestore.rules` from this folder → **Publish**. This limits every read/write to signed-in `@rgsonsplumbing.com` accounts.
4. **Project settings (gear) → General → Your apps → Add app → Web (</>)**. Name it anything. Copy the four values from the config it shows: `apiKey`, `authDomain`, `projectId`, `appId`.

### 2. Put the code on GitHub (Netlify deploys from there)

```bash
cd "Report Writer/field-report-app"
git init && git add . && git commit -m "Field reports app"
# create an empty repo on github.com, then:
git remote add origin https://github.com/YOUR-ORG/rg-field-reports.git
git push -u origin main
```

(If you'd rather skip Git: `npm install && npm run build`, then drag the `dist` folder onto Netlify's deploy page — but you'll lose the function proxy that way, so Git is the way to go.)

### 3. Netlify

1. **Add new site → Import an existing project** → pick the repo. Build settings are already in `netlify.toml` (build `npm run build`, publish `dist`, functions `netlify/functions`).
2. **Site configuration → Environment variables** → add these:

| Variable | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | from Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `your-project` |
| `VITE_FIREBASE_APP_ID` | from Firebase web config |
| `VITE_ALLOWED_DOMAIN` | `rgsonsplumbing.com` |
| `ANTHROPIC_API_KEY` | your Anthropic key (server-side only) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` (or a newer Sonnet model) |
| `FIREBASE_PROJECT_ID` | `your-project` (same as above; used to verify sign-in tokens) |
| `ALLOWED_DOMAIN` | `rgsonsplumbing.com` |

3. **Deploy**. Copy the site URL and add it to Firebase → Authentication → Authorized domains (step 1.1). Optional: set a custom domain like `reports.rgsonsplumbing.com`.

### 4. On your phone

Open the site in Safari (iPhone) or Chrome (Android) → Share → **Add to Home Screen**. Sign in with your @rgsonsplumbing.com Google account. Allow camera and microphone when asked.

---

## Running it locally (for changes)

```bash
npm install
cp .env.example .env      # fill in the VITE_ values
npm run dev               # http://localhost:5173  (AI buttons need the Netlify function: use `npx netlify dev` instead)
```

`npx netlify dev` runs the site *and* the function locally using the same env vars (`netlify link` first, or put the server-side vars in `.env`).

---

## Project layout

```
netlify/functions/ai.js     Claude proxy: verifies the Firebase sign-in, then "polish" or "generate"
src/App.jsx                 sign-in gate + routing (#/r/<reportId>)
src/components/
  ReportsList.jsx           list / new / delete
  ReportEditor.jsx          job info, issues, AI write-up, pricing, PDF export, autosave
  IssueCard.jsx             one issue: location, notes, photos, finding, recommendation, price
  PhotoEditor.jsx           canvas markup: zoom/pan, crop, arrows with labels, text boxes
  Dictate.jsx               microphone button (browser speech-to-text)
src/pdf.js                  jsPDF layout on the letterhead
src/firebase.js             auth + Firestore (offline persistence on)
public/letterhead.jpg       the 2025 letterhead, used as the page background
firestore.rules             security rules — paste into Firebase
test/                       headless-browser test of the editor + PDF (`node test/run.mjs` with `npm run dev` running; needs `npm i -D playwright`)
```

## Things worth knowing

- **Photos live in Firestore** as compressed JPEGs (about 1400 px, ~200–400 KB each, original + marked-up copy). That's what makes offline capture work with zero extra setup. A 20-photo report is roughly 10 MB — fine for Firestore's free tier for a long time. If reports get huge, the next step is moving photos to Firebase Storage.
- **Voice** uses the phone's built-in speech recognition (Safari / Chrome). No extra cost. Claude only gets involved when you tap Clean up or Generate.
- **Adding techs later:** nothing to change — anyone with an @rgsonsplumbing.com Google account can sign in and sees all reports. To lock it to specific people instead, tighten `firestore.rules`.
- **Changing the report wording style:** edit the `STYLE` block and the prompts in `netlify/functions/ai.js`.
- **Changing the PDF layout:** `src/pdf.js`. The letterhead margins are the constants at the top.
