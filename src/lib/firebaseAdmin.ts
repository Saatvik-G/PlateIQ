import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

// Manually decode the Firebase ID Token payload (JWT) to read the user's UID server-side.
// This allows role-gating without loading the broken firebase-admin/auth dependency.
export function decodeFirebaseToken(token: string): { uid: string; email?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1]!, "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);
    return {
      uid: payload.user_id || payload.sub,
      email: payload.email,
    };
  } catch (e) {
    console.error("Failed to decode token manually:", e);
    return null;
  }
}
