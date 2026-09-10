import { useEffect, useState } from 'react';
import { watchAuth, signIn, resetPassword, logOut, isAllowedUser, ALLOWED_DOMAIN } from './firebase';
import ReportsList from './components/ReportsList';
import ReportEditor from './components/ReportEditor';

export default function App() {
  const [user, setUser] = useState(undefined);
  const [route, setRoute] = useState(parseHash());
  const [toast, setToast] = useState(null);

  useEffect(() => watchAuth(setUser), []);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const notify = (msg, isErr = false) => {
    setToast({ msg, isErr });
    setTimeout(() => setToast(null), isErr ? 5000 : 2500);
  };

  if (user === undefined) return <div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>Loading…</div>;

  if (!user || !isAllowedUser(user)) {
    return <SignIn user={user} notify={notify} />;
  }

  return (
    <>
      {route.id ? (
        <ReportEditor id={route.id} user={user} notify={notify} onBack={() => (location.hash = '')} />
      ) : (
        <ReportsList user={user} notify={notify} onOpen={(id) => (location.hash = '#/r/' + id)} />
      )}
      {toast && <div className={`toast ${toast.isErr ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}

function parseHash() {
  const m = location.hash.match(/^#\/r\/([\w-]+)/);
  return { id: m ? m[1] : null };
}

const FRIENDLY = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email. Ask the office to add you.',
  'auth/invalid-email': 'That email address doesn\'t look right.',
  'auth/too-many-requests': 'Too many attempts — wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check your signal and try again.',
};

function SignIn({ user, notify }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      notify(FRIENDLY[err.code] || err.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) return notify('Type your email first, then tap Forgot password.', true);
    try {
      await resetPassword(email);
      notify('Reset link sent — check your email.');
    } catch (err) {
      notify(FRIENDLY[err.code] || err.message, true);
    }
  }

  return (
    <div className="signin">
      <form className="card" onSubmit={submit}>
        <img src="/icon-192.png" alt="RG & Sons" />
        <h1>Field Reports</h1>
        <p>RG &amp; Sons Plumbing, Inc.</p>
        {user && !isAllowedUser(user) && (
          <p style={{ color: '#b42318' }}>
            {user.email} isn't a @{ALLOWED_DOMAIN} account.{' '}
            <button type="button" className="btn btn-sm btn-ghost" onClick={logOut}>Sign out</button>
          </p>
        )}
        <div className="field" style={{ textAlign: 'left' }}>
          <label>Email</label>
          <input type="email" autoComplete="username" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={'you@' + ALLOWED_DOMAIN} required />
        </div>
        <div className="field" style={{ textAlign: 'left' }}>
          <label>Password</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? <span className="spinner" /> : 'Sign in'}</button>
        <button type="button" className="btn-danger-text" style={{ color: 'var(--gray)', marginTop: 10 }} onClick={forgot}>Forgot password?</button>
      </form>
    </div>
  );
}
