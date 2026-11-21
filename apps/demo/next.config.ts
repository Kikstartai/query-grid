import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  reactCompiler: true,
  typedRoutes: false,
  serverExternalPackages: ["pg"],
};

export default nextConfig;
