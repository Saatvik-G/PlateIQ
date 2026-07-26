import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export function getAdminApp() {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0]!;
  }

  const pKey = process.env.FIREBASE_PRIVATE_KEY;
  const cEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const pId = process.env.FIREBASE_PROJECT_ID;

  if (!pId || !cEmail || !pKey) {
    throw new Error(
      "CRITICAL: Missing server-side Firebase Admin SDK environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)."
    );
  }

  return initializeApp({
    credential: cert({
      projectId: pId,
      clientEmail: cEmail,
      privateKey: pKey.replace(/\\n/g, "\n"),
    }),
  });
}

export function getAdminDb() {
  getAdminApp();
  return getFirestore();
}

export function getAdminAuth() {
  getAdminApp();
  return getAuth();
}
