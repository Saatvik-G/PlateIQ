import { getDb, getAuth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendSignInLinkToEmail as fbSendLink,
  isSignInWithEmailLink as fbIsLink,
  signInWithEmailLink as fbSignInLink,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export interface StaffMember {
  uid: string;
  name: string;
  email: string;
  role: "admin" | "kitchen" | "waiter";
}

// 1. Send Passwordless Sign-In Link
export async function sendPasswordlessLink(email: string): Promise<void> {
  const actionCodeSettings = {
    url: `${window.location.origin}/login/verify`,
    handleCodeInApp: true,
  };
  
  await fbSendLink(getAuth(), email, actionCodeSettings);
  window.localStorage.setItem("emailForSignIn", email);
}

// 2. Complete Passwordless Sign-In
export async function completePasswordlessSignIn(): Promise<User | null> {
  const auth = getAuth();
  if (fbIsLink(auth, window.location.href)) {
    let email = window.localStorage.getItem("emailForSignIn");
    
    if (!email) {
      email = window.prompt("Please provide your email for confirmation");
    }
    
    if (email) {
      const result = await fbSignInLink(auth, email, window.location.href);
      window.localStorage.removeItem("emailForSignIn");
      return result.user;
    }
  }
  return null;
}

// 3. Email / Password Login
export async function loginWithPassword(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(getAuth(), email, password);
  return credential.user;
}

// 4. Google OAuth Sign-In
export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(getAuth(), provider);
  return credential.user;
}

// 5. Register Staff
export async function registerStaff(
  email: string,
  password: string,
  name: string,
  role: "admin" | "kitchen" | "waiter"
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(getAuth(), email, password);
  const user = credential.user;
  
  const res = await fetch("/api/seed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      staffUid: user.uid,
      staffEmail: email,
      staffName: name,
      staffRole: role,
    }),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || "Failed to register staff record on server.");
  }

  return user;
}

// 6. Fetch Staff Role from Firestore
export async function getStaffRecord(uid: string): Promise<StaffMember | null> {
  const docRef = doc(getDb(), "staff", uid);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { uid, ...docSnap.data() } as StaffMember;
  }
  return null;
}

// 7. Ensure Staff Record Exists (Auto-provisions for Google OAuth or new sign-ins)
export async function ensureStaffRecord(user: User, defaultRole: "admin" | "kitchen" | "waiter" = "waiter"): Promise<StaffMember> {
  let record = await getStaffRecord(user.uid);
  if (!record) {
    const name = user.displayName || user.email?.split("@")[0] || "Staff Member";
    const email = user.email || `${user.uid}@plateiq.com`;

    const res = await fetch("/api/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffUid: user.uid,
        staffEmail: email,
        staffName: name,
        staffRole: defaultRole,
      }),
    });

    if (res.ok) {
      record = await getStaffRecord(user.uid);
    }
  }

  if (!record) {
    return {
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "Staff Member",
      role: defaultRole,
    };
  }

  return record;
}

// 8. Sign Out
export async function logout(): Promise<void> {
  await fbSignOut(getAuth());
}

// 9. Subscribe to Auth changes (Real-time listener)
export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(getAuth(), callback);
}

// 10. Human-Readable Auth Error Formatter
export function formatAuthError(error: any): string {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password. Please check your credentials.";
    case "auth/popup-closed-by-user":
      return "Google sign-in popup was closed before completing.";
    case "auth/popup-blocked":
      return "Google sign-in popup was blocked by your browser. Please allow popups for this site.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This staff account has been disabled. Contact system administrator.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    case "auth/expired-action-code":
    case "auth/invalid-action-code":
      return "The sign-in link has expired or has already been used. Please request a new link.";
    default:
      return error?.message || "Authentication failed. Please try again.";
  }
}
