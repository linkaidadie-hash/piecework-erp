import type { NextConfig } from "next";

const staticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: staticExport ? "export" : "standalone",
  ...(staticExport ? {} : { turbopack: { root: __dirname } }),
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || "/api",
  },
};

export default nextConfig;
