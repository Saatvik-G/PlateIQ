import { getAuth, getDb } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendSignInLinkToEmail as fbSendLink,
  isSignInWithEmailLink as fbIsLink,
  signInWithEmailLink as fbSignInLink,
  onAuthStateChanged,
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

// 4. Register Staff
export async function registerStaff(
  email: string,
  password: string,
  name: string,
  role: "admin" | "kitchen" | "waiter"
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(getAuth(), email, password);
  const user = credential.user;
  
  const idToken = await user.getIdToken();
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

// 5. Fetch Staff Role from Firestore
export async function getStaffRecord(uid: string): Promise<StaffMember | null> {
  const docRef = doc(getDb(), "staff", uid);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { uid, ...docSnap.data() } as StaffMember;
  }
  return null;
}

// 6. Sign Out
export async function logout(): Promise<void> {
  await fbSignOut(getAuth());
}

// 7. Subscribe to Auth changes
export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(getAuth(), callback);
}
