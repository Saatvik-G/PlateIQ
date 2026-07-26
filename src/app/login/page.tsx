"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginWithPassword, sendPasswordlessLink, getStaffRecord, subscribeToAuth } from "@/services/authService";
import { Mail, Lock, Sparkles, RefreshCw, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordMode, setIsPasswordMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user) => {
      if (user) {
        const staff = await getStaffRecord(user.uid);
        if (staff) {
          router.push("/dashboard");
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setMessage(null);

    try {
      if (isPasswordMode) {
        if (!password) {
          setMessage({ type: "error", text: "Password is required." });
          setLoading(false);
          return;
        }
        const user = await loginWithPassword(email, password);
        const staff = await getStaffRecord(user.uid);
        if (staff) {
          setMessage({ type: "success", text: `Welcome back, ${staff.name}! Redirecting...` });
          router.push("/dashboard");
        } else {
          setMessage({ type: "error", text: "Authentication successful, but you are not registered as staff." });
        }
      } else {
        await sendPasswordlessLink(email);
        setMessage({
          type: "success",
          text: `Magic sign-in link sent to ${email}! Please check your inbox.`,
        });
      }
    } catch (error: any) {
      console.error(error);
      setMessage({ type: "error", text: error.message || "Authentication failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setSeeding(true);
    setMessage(null);
    try {
      // 1. Create a Firebase Auth user if it doesn't exist, or just try to sign in.
      // Wait, since we are client-side, we can try to register or sign in.
      // We will first register the user admin@plateiq.com / password123 via our api
      // Wait, let's call the seeding API with a specific staff UID and credentials.
      // First, we sign in or sign up. Let's register staff!
      // In order to get a valid firebase user, we can sign up on Firebase Auth client-side first.
      // Let's create the auth user admin@plateiq.com with password123.
      // If it already exists, createUser will throw auth/email-already-in-use.
      // If so, we just log in with it!
      const demoEmail = "admin@plateiq.com";
      const demoPassword = "password123";
      const demoName = "Demo Manager";
      const demoRole = "admin";
      
      let user;
      try {
        const { createUserWithEmailAndPassword } = await import("firebase/auth");
        const { getAuth } = await import("@/lib/firebase");
        const cred = await createUserWithEmailAndPassword(getAuth(), demoEmail, demoPassword);
        user = cred.user;
      } catch (err: any) {
        if (err.code === "auth/email-already-in-use") {
          user = await loginWithPassword(demoEmail, demoPassword);
        } else {
          throw err;
        }
      }

      // 2. Seed the database and write the staff document for this user
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUid: user.uid,
          staffEmail: demoEmail,
          staffName: demoName,
          staffRole: demoRole,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to seed demo data.");
      }

      setMessage({ type: "success", text: "Database seeded! Auto-logging in..." });
      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      setMessage({ type: "error", text: err.message || "Failed to seed demo database." });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8 bg-brand-deep relative">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 animate-slide-up">
        {/* Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>PlateIQ Staff Portal</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight font-display bg-gradient-to-r from-white via-indigo-200 to-cyan-200 bg-clip-text text-transparent">
            Authenticate
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Sign in to access your role-based restaurant dashboard.
          </p>
        </div>

        {/* Info messages */}
        {message && (
          <div className={`p-4 rounded-xl flex items-start gap-3 border ${
            message.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}>
            {message.type === "success" ? (
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div className="text-sm font-medium">{message.text}</div>
          </div>
        )}

        {/* Login Card */}
        <div className="glass-panel rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500" />
          
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@restaurant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 bg-brand-deep/50 border border-white/5 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                />
              </div>
            </div>

            {isPasswordMode && (
              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required={isPasswordMode}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 bg-brand-deep/50 border border-white/5 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || seeding}
              className="w-full glow-btn bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isPasswordMode ? (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              ) : (
                "Send Magic Link"
              )}
            </button>
          </form>

          {/* Toggle Flow */}
          <div className="mt-6 flex items-center justify-between text-xs text-gray-400 border-t border-white/5 pt-5">
            <button
              onClick={() => {
                setIsPasswordMode(!isPasswordMode);
                setMessage(null);
              }}
              className="hover:text-indigo-400 transition-colors cursor-pointer"
            >
              {isPasswordMode ? "Use Passwordless Magic Link" : "Use Password Authentication"}
            </button>
            <a href="/" className="hover:text-cyan-400 transition-colors">
              Customer Portal
            </a>
          </div>
        </div>

        {/* Seeding & One-Click Demo Setup */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <span className="h-px w-8 bg-white/5" />
            <span>Hackathon Reviewer Tool</span>
            <span className="h-px w-8 bg-white/5" />
          </div>

          <button
            onClick={handleQuickDemo}
            disabled={seeding || loading}
            className="w-full py-3 px-4 rounded-xl border border-dashed border-indigo-500/30 hover:border-indigo-500/80 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 hover:text-indigo-300 font-semibold text-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
          >
            {seeding ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Seeding Database & Logging In...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>One-Click Demo Setup & Login</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-gray-500 italic max-w-xs mx-auto">
            Seeds Tomato Soup, Pizza, Burgers, stock levels, table occupancy grid, and grants admin access.
          </p>
        </div>
      </div>
    </div>
  );
}
