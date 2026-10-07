import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  devIndicators: false,
  // Allow phone/tablet testing on a private LAN during development.
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*', '10.*.*.*', ...Array.from({ length: 16 }, (_, i) => `172.${i + 16}.*.*`)],
};
export default nextConfig;
