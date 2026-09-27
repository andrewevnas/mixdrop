import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden()/unauthorized() — used for role checks (403).
    authInterrupts: true,
  },
};

export default nextConfig;
