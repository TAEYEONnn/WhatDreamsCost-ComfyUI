import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ltx-studio/shared-types",
    "@ltx-studio/generation-core",
  ],
  // ws is a Node.js native package — don't bundle it for the server bundle.
  serverExternalPackages: ["ws"],
  allowedDevOrigins: ["192.168.1.17"],
};

export default nextConfig;