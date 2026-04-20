/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-parse", "pdf-lib"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb"
    },
    proxyClientMaxBodySize: 52428800
  }
};

export default nextConfig;

