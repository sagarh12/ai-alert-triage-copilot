/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is only used in local pipeline scripts, never bundled into
  // the app (the app reads the committed JSON), but mark it external as a guard.
  webpack: (config) => {
    config.externals = [...(config.externals || []), "better-sqlite3"];
    return config;
  },
};

export default nextConfig;
