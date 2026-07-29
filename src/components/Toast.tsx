"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success", title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Render Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-2xl backdrop-blur-md transition-all duration-300 animate-slide-up text-xs font-mono ${
                isSuccess
                  ? "bg-brand-dark/95 border-brand-secondary/40 text-stone-100 shadow-brand-secondary/10"
                  : isError
                  ? "bg-brand-dark/95 border-brand-danger/40 text-stone-100 shadow-brand-danger/10"
                  : "bg-brand-dark/95 border-stone-700 text-stone-100"
              }`}
            >
              {isSuccess && <CheckCircle className="w-4 h-4 text-brand-secondary shrink-0 mt-0.5" />}
              {isError && <AlertCircle className="w-4 h-4 text-brand-danger shrink-0 mt-0.5" />}
              {!isSuccess && !isError && <Info className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" />}

              <div className="flex-1 min-w-0">
                {toast.title && <p className="font-bold font-display uppercase tracking-wider text-[11px] mb-0.5 text-white">{toast.title}</p>}
                <p className="leading-snug text-stone-300">{toast.message}</p>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-stone-500 hover:text-stone-300 transition-colors p-0.5 rounded cursor-pointer"
                aria-label="Close notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
