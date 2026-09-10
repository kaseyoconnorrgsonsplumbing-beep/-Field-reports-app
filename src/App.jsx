import { useEffect, useState } from 'react';
import { watchAuth, signIn, logOut, isAllowedUser, ALLOWED_DOMAIN } from './firebase';
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
    return (
      <div className="signin">
        <div className="card">
          <img src="/icon-192.png" alt="RG & Sons" />
          <h1>Field Reports</h1>
          <p>RG &amp; Sons Plumbing, Inc.</p>
          {user && !isAllowedUser(user) && (
            <p style={{ color: '#b42318' }}>
              {user.email} isn't a @{ALLOWED_DOMAIN} account.{' '}
              <button className="btn btn-sm btn-ghost" onClick={logOut}>Sign out</button>
            </p>
          )}
          <button className="btn btn-primary btn-block" onClick={() => signIn().catch((e) => notify(e.message, true))}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
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
