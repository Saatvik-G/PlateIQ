import type { Metadata, Viewport } from "next";
import { Arvo, Cabin } from "next/font/google";
import { ensureSeeded } from "@/lib/startupSeed";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const arvo = Arvo({
  weight: ["400", "700"],
  variable: "--font-arvo",
  subsets: ["latin"],
  display: "swap",
});

const cabin = Cabin({
  variable: "--font-cabin",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlateIQ | Smart Restaurant Management System",
  description: "A real-time, ledger-driven restaurant operations and ordering platform powered by Gemini Flash.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Trigger idempotent database seed check once on app start (layout load)
  await ensureSeeded().catch((err) => {
    console.error("Startup seeding failed:", err);
  });

  return (
    <html
      lang="en"
      className={`${arvo.variable} ${cabin.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-brand-deep text-parchment-dark flex flex-col font-sans selection:bg-rust selection:text-white">
        <ToastProvider>
          <main className="flex-1 flex flex-col">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
