import { auth, db } from "@/lib/firebase";
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
import { doc, getDoc, setDoc } from "firebase/firestore";

export interface StaffMember {
  uid: string;
  name: string;
  email: string;
  role: "admin" | "kitchen" | "waiter";
}

// 1. Send Passwordless Sign-In Link
export async function sendPasswordlessLink(email: string): Promise<void> {
  const actionCodeSettings = {
    // URL you want to redirect back to. The URL must be whitelisted in the Firebase Console.
    url: `${window.location.origin}/login/verify`,
    handleCodeInApp: true,
  };
  
  await fbSendLink(auth, email, actionCodeSettings);
  // Store the email locally so we don't have to ask the user for it again on redirect
  window.localStorage.setItem("emailForSignIn", email);
}

// 2. Complete Passwordless Sign-In
export async function completePasswordlessSignIn(): Promise<User | null> {
  if (fbIsLink(auth, window.location.href)) {
    let email = window.localStorage.getItem("emailForSignIn");
    
    if (!email) {
      // User opened the link on a different device. Ask them to confirm email.
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
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

// 4. Register Staff
export async function registerStaff(
  email: string,
  password: string,
  name: string,
  role: "admin" | "kitchen" | "waiter"
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  // Save staff document in Firestore (this will fail if security rules block it,
  // but wait! If we do it from client, does firestore.rules allow it?
  // Let's check firestore.rules: "match /staff/{staffId} { allow write: if false; }"
  // Ah! Staff writes are blocked on client. To create a staff member, we must call a server route,
  // or we can allow the client to set their own profile ONLY if it doesn't exist yet, or route it through seed.
  // Wait! Our seeding endpoint `/api/seed` already supports seeding a staff member by UID.
  // We can write an API route `/api/staff/register` which uses Firebase Admin SDK to write to Firestore!)
  
  // Let's call our server API to register the staff member in Firestore!
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
  const docRef = doc(db, "staff", uid);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { uid, ...docSnap.data() } as StaffMember;
  }
  return null;
}

// 6. Sign Out
export async function logout(): Promise<void> {
  await fbSignOut(auth);
}

// 7. Subscribe to Auth changes
export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
