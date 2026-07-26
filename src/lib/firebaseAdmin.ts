import * as admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  // We check if it is running in a server context (e.g. build time vs run time API call)
  // To avoid breaking static export/build if env is not provided at build time,
  // we check if we are in an API execution.
  // But since the user wants startup check, we can throw a runtime error when these are accessed.
}

export function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const pKey = process.env.FIREBASE_PRIVATE_KEY;
  const cEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const pId = process.env.FIREBASE_PROJECT_ID;

  if (!pId || !cEmail || !pKey) {
    throw new Error(
      "CRITICAL: Missing server-side Firebase Admin SDK environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)."
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: pId,
      clientEmail: cEmail,
      privateKey: pKey.replace(/\\n/g, "\n"),
    }),
  });
}

export function getAdminDb() {
  getAdminApp();
  return admin.firestore();
}

export function getAdminAuth() {
  getAdminApp();
  return admin.auth();
}
