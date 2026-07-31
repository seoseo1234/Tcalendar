import { getApp, getApps, initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
let firestore: Firestore | undefined;

export function getFirebaseServices() {
  if (!isFirebaseConfigured) throw new Error("Firebase 환경변수를 먼저 설정해 주세요.");
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firestore ||= initializeFirestore(app, {
    experimentalForceLongPolling: true,
    experimentalLongPollingOptions: {
      timeoutSeconds: 30,
    },
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  return { db: firestore, auth: getAuth(app) };
}
