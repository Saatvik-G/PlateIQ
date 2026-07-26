"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completePasswordlessSignIn, getStaffRecord } from "@/services/authService";
import { RefreshCw, AlertCircle, CheckCircle } from "lucide-react";

export default function VerifyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    async function verifyLink() {
      try {
        const user = await completePasswordlessSignIn();
        if (user) {
          const staff = await getStaffRecord(user.uid);
          if (staff) {
            setStatus("success");
            setTimeout(() => {
              router.push("/dashboard");
            }, 1500);
          } else {
            setStatus("error");
            setError("Authentication succeeded, but you are not registered as restaurant staff.");
          }
        } else {
          setStatus("error");
          setError("Invalid or expired login link.");
        }
      } catch (err: any) {
        console.error("Link verification error:", err);
        setStatus("error");
        setError(err.message || "Failed to sign in with email link.");
      }
    }

    verifyLink();
  }, [router]);

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 bg-brand-deep">
      <div className="w-full max-w-md text-center space-y-6 animate-slide-up">
        {status === "verifying" && (
          <div className="glass-panel rounded-2xl p-10 shadow-2xl flex flex-col items-center gap-5">
            <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
            <h1 className="text-xl font-bold font-display text-white">Verifying Magic Link...</h1>
            <p className="text-sm text-gray-400">Please wait while we secure your session.</p>
          </div>
        )}

        {status === "success" && (
          <div className="glass-panel rounded-2xl p-10 shadow-2xl flex flex-col items-center gap-5 border-emerald-500/10">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-6 h-6 animate-bounce" />
            </div>
            <h1 className="text-xl font-bold font-display text-white">Sign In Successful!</h1>
            <p className="text-sm text-gray-400">Authentication verified. Loading dashboard...</p>
          </div>
        )}

        {status === "error" && (
          <div className="glass-panel rounded-2xl p-10 shadow-2xl flex flex-col items-center gap-5 border-rose-500/10">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold font-display text-white">Sign In Failed</h1>
            <p className="text-sm text-rose-400 font-medium">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-2 glow-btn bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-5 py-2.5 rounded-xl cursor-pointer"
            >
              Return to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
