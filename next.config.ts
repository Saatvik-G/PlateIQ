import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"],
  experimental: {
    turbo: false,
  },
};

export default nextConfig;
