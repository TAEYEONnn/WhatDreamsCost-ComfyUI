import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ltx-studio/shared-types", "@ltx-studio/generation-core"],
};

export default nextConfig;
