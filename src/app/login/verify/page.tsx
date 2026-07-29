"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completePasswordlessSignIn, ensureStaffRecord, formatAuthError } from "@/services/authService";
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
          const staff = await ensureStaffRecord(user);
          if (staff) {
            setStatus("success");
            setTimeout(() => {
              router.push("/dashboard");
            }, 1200);
          } else {
            setStatus("error");
            setError("Authentication succeeded, but staff record creation failed.");
          }
        } else {
          setStatus("error");
          setError("Invalid or expired login link.");
        }
      } catch (err: any) {
        console.error("Link verification error:", err);
        setStatus("error");
        setError(formatAuthError(err));
      }
    }

    verifyLink();
  }, [router]);

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 bg-brand-deep">
      <div className="w-full max-w-md text-center space-y-6 animate-slide-up">
        {status === "verifying" && (
          <div className="bg-[#fbf9f5] border border-stone-300 rounded-lg p-10 shadow-2xl flex flex-col items-center gap-4 text-stone-850">
            <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
            <h1 className="text-xl font-bold font-display text-stone-900 uppercase">Verifying Magic Link...</h1>
            <p className="text-xs text-stone-500 font-mono">Please wait while we authenticate your terminal session.</p>
          </div>
        )}

        {status === "success" && (
          <div className="bg-[#fbf9f5] border border-brand-secondary/40 rounded-lg p-10 shadow-2xl flex flex-col items-center gap-4 text-stone-850">
            <div className="w-12 h-12 rounded-full bg-brand-secondary/10 border border-brand-secondary/30 flex items-center justify-center text-brand-secondary">
              <CheckCircle className="w-6 h-6 animate-bounce" />
            </div>
            <h1 className="text-xl font-bold font-display text-stone-900 uppercase">Sign In Successful!</h1>
            <p className="text-xs text-stone-600 font-mono">Authentication verified. Accessing restaurant control panel...</p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-[#fbf9f5] border border-brand-danger/30 rounded-lg p-10 shadow-2xl flex flex-col items-center gap-4 text-stone-850">
            <div className="w-12 h-12 rounded-full bg-brand-danger/10 border border-brand-danger/30 flex items-center justify-center text-brand-danger">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold font-display text-stone-900 uppercase">Sign In Failed</h1>
            <p className="text-xs text-brand-danger font-mono">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-2 bg-brand-primary hover:bg-[#a1402a] text-white font-bold text-xs px-5 py-2.5 rounded transition-all cursor-pointer"
            >
              Return to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
