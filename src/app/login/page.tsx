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

      // Seed the database and write the staff document for this user (idempotent)
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

      setMessage({ type: "success", text: "Database verified! Auto-logging in..." });
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
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-brand-primary/20 bg-brand-primary/5 text-brand-primary text-xs font-semibold mb-3 uppercase tracking-wider font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PlateIQ Staff Portal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight font-display text-white uppercase">
            Authenticate Terminal
          </h1>
          <p className="mt-2 text-xs text-stone-400 font-mono">
            Sign in to access your role-based restaurant dashboard.
          </p>
        </div>

        {/* Info messages */}
        {message && (
          <div className={`p-4 rounded border flex items-start gap-3 text-xs font-mono ${
            message.type === "success" 
              ? "bg-brand-secondary/15 border-brand-secondary/35 text-brand-secondary" 
              : "bg-brand-danger/10 border-brand-danger/20 text-brand-danger"
          }`}>
            {message.type === "success" ? (
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>{message.text}</div>
          </div>
        )}

        {/* Login Card (Parchment sheet!) */}
        <div className="bg-[#fbf9f5] border border-stone-300 rounded-lg p-8 shadow-2xl relative overflow-hidden text-stone-850">
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />
          
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@restaurant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-9 pr-4 py-2.5 bg-white border border-stone-300 rounded text-stone-850 placeholder-stone-400 focus:outline-none focus:border-brand-primary transition-all text-xs"
                />
              </div>
            </div>

            {isPasswordMode && (
              <div>
                <label htmlFor="password" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required={isPasswordMode}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-9 pr-4 py-2.5 bg-white border border-stone-300 rounded text-stone-850 placeholder-stone-400 focus:outline-none focus:border-brand-primary transition-all text-xs"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || seeding}
              className="w-full bg-brand-primary hover:bg-[#a1402a] text-white py-2.5 px-4 rounded font-bold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : isPasswordMode ? (
                <>Sign In <ArrowRight className="w-3.5 h-3.5" /></>
              ) : (
                "Send Magic Link"
              )}
            </button>
          </form>

          {/* Toggle Flow */}
          <div className="mt-6 flex items-center justify-between text-[10px] border-t border-stone-200 pt-5 font-bold font-mono">
            <button
              onClick={() => {
                setIsPasswordMode(!isPasswordMode);
                setMessage(null);
              }}
              className="text-stone-600 hover:text-brand-primary transition-colors cursor-pointer"
            >
              {isPasswordMode ? "Passwordless Login" : "Password Login"}
            </button>
            <a href="/" className="text-brand-secondary hover:underline">
              Guest Portal
            </a>
          </div>
        </div>

        {/* Seeding & One-Click Demo Setup */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-[10px] text-stone-500 uppercase tracking-wider font-bold font-mono">
            <span className="h-px w-8 bg-stone-800" />
            <span>Hackathon Reviewer Tool</span>
            <span className="h-px w-8 bg-stone-800" />
          </div>

          <button
            onClick={handleQuickDemo}
            disabled={seeding || loading}
            className="w-full py-2.5 px-4 rounded border border-dashed border-brand-primary/30 hover:border-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary hover:text-[#c2593f] font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {seeding ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying Database & Logging In...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                <span>One-Click Demo Setup & Login</span>
              </>
            )}
          </button>
          <p className="text-[9px] text-stone-500 font-mono italic max-w-xs mx-auto leading-relaxed">
            Verifies menu database seeding, registers standard staff credentials, and logs in as administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
