import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const ALLOWED_DOMAIN = (import.meta.env.VITE_ALLOWED_DOMAIN || 'rgsonsplumbing.com').toLowerCase();

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline cache: reports and photos captured with no signal are queued and
// sync automatically when the phone gets service back.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export async function signIn(email, password) {
  await setPersistence(auth, browserLocalPersistence); // stay signed in on the phone
  await signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim());
}
export const logOut = () => signOut(auth);
export const watchAuth = (cb) => onAuthStateChanged(auth, cb);

export function isAllowedUser(user) {
  return !!user && String(user.email || '').toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
}

// ---------- Reports ----------
const reportsCol = collection(db, 'reports');

export function watchReports(cb) {
  const q = query(reportsCol, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => console.error(err));
}

export async function createReport(user) {
  const now = new Date();
  const ref = await addDoc(reportsCol, {
    title: '',
    clientName: '',
    address: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    date: now.toISOString().slice(0, 10),
    preparedBy: user.displayName || user.email,
    ownerUid: user.uid,
    ownerEmail: user.email,
    generalNotes: '',
    summary: '',
    closing: '',
    status: 'draft',
    issues: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchReport(id, cb) {
  return onSnapshot(doc(db, 'reports', id), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export async function saveReport(id, data) {
  await setDoc(doc(db, 'reports', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteReport(id) {
  for (const sub of ['photos', 'renders']) {
    const snap = await getDocs(collection(db, 'reports', id, sub));
    await Promise.all(snap.docs.map((p) => deleteDoc(p.ref)));
  }
  await deleteDoc(doc(db, 'reports', id));
}

// ---------- Photos ----------
// Stored as compressed JPEG data URLs so offline capture works with no extra
// setup. Firestore caps a document at 1 MB, so the original lives in
// reports/{id}/photos/{pid} and the marked-up render in reports/{id}/renders/{pid}.
const photosCol = (reportId) => collection(db, 'reports', reportId, 'photos');
const rendersCol = (reportId) => collection(db, 'reports', reportId, 'renders');

export function watchPhotos(reportId, cb) {
  let photos = {};
  let renders = {};
  const emit = () => {
    const map = {};
    Object.values(photos).forEach((p) => (map[p.id] = { ...p, annotated: renders[p.id]?.annotated || null }));
    cb(map);
  };
  const u1 = onSnapshot(query(photosCol(reportId), orderBy('createdAt', 'asc')), (snap) => {
    photos = {};
    snap.docs.forEach((d) => (photos[d.id] = { id: d.id, ...d.data() }));
    emit();
  });
  const u2 = onSnapshot(rendersCol(reportId), (snap) => {
    renders = {};
    snap.docs.forEach((d) => (renders[d.id] = d.data()));
    emit();
  });
  return () => {
    u1();
    u2();
  };
}

export async function addPhoto(reportId, { original, annotated, annotations = [], crop = null }) {
  const ref = await addDoc(photosCol(reportId), { original, annotations, crop, createdAt: Date.now() });
  if (annotated) await setDoc(doc(rendersCol(reportId), ref.id), { annotated, updatedAt: Date.now() });
  return ref.id;
}

export async function updatePhoto(reportId, photoId, { annotated, annotations, crop }) {
  await setDoc(doc(photosCol(reportId), photoId), { annotations: annotations || [], crop: crop || null }, { merge: true });
  if (annotated) await setDoc(doc(rendersCol(reportId), photoId), { annotated, updatedAt: Date.now() });
}

export async function removePhoto(reportId, photoId) {
  await deleteDoc(doc(rendersCol(reportId), photoId)).catch(() => {});
  await deleteDoc(doc(photosCol(reportId), photoId));
}

export async function getPhotosOnce(reportId) {
  const [ps, rs] = await Promise.all([getDocs(photosCol(reportId)), getDocs(rendersCol(reportId))]);
  const renders = {};
  rs.docs.forEach((d) => (renders[d.id] = d.data()));
  const map = {};
  ps.docs.forEach((d) => (map[d.id] = { id: d.id, ...d.data(), annotated: renders[d.id]?.annotated || null }));
  return map;
}

export { where, getDoc };
