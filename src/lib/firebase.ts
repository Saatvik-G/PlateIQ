import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth as fbGetAuth, Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let initializedApp: any = null;
let initializedDb: Firestore | null = null;
let initializedAuth: Auth | null = null;

function ensureFirebase() {
  if (initializedApp) return;

  const missingKeys = Object.entries(firebaseConfig)
    .filter(([_, value]) => !value)
    .map(([key]) => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`);

  if (missingKeys.length > 0) {
    throw new Error(
      `CRITICAL: Missing required Firebase configuration environment variables:\n${missingKeys.join(
        "\n"
      )}\n\nPlease define these in your .env.local file.`
    );
  }

  initializedApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  initializedDb = getFirestore(initializedApp);
  initializedAuth = fbGetAuth(initializedApp);
}

export function getDb(): Firestore {
  ensureFirebase();
  return initializedDb!;
}

export function getAuth(): Auth {
  ensureFirebase();
  return initializedAuth!;
}
