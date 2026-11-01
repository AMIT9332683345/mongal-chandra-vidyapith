import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Dev-only: the browser is often pointed at 127.0.0.1 rather than localhost,
  // and Next refuses the cross-origin HMR handshake without this.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Both carry a native or dynamically-loaded binary that a bundler cannot fold
  // into a chunk: sharp needs its libvips, the driver its SDAM/topology code.
  serverExternalPackages: ["mongodb", "sharp"],
  images: {
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60 * 60 * 24,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
