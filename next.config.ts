import type { NextConfig } from "next";

/**
 * basePath is fixed at BUILD time in Next.js.
 *  - Preview deployment (own domain / *.vercel.app):  NEXT_PUBLIC_BASE_PATH unset  -> served at "/"
 *  - Company integration (tierraautomation.in/academy): NEXT_PUBLIC_BASE_PATH=/academy -> served at "/academy"
 * See docs/DEPLOYMENT.md for the reverse-proxy setup.
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const csp = [
  "default-src 'self'",
  // Next.js inline bootstrap + Razorpay checkout + Zoom Meeting SDK
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://source.zoom.us",
  "style-src 'self' 'unsafe-inline' https://source.zoom.us",
  "img-src 'self' data: blob: https://*.cloudflarestream.com https://videodelivery.net https://*.supabase.co https://*.zoom.us",
  "font-src 'self' data: https://source.zoom.us",
  "media-src 'self' blob: https://*.cloudflarestream.com https://videodelivery.net",
  "connect-src 'self' https://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com https://*.zoom.us wss://*.zoom.us https://upload.cloudflarestream.com https://*.cloudflarestream.com https://videodelivery.net",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.cloudflarestream.com https://iframe.videodelivery.net https://*.zoom.us",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self)" },
  // Required by the Zoom Meeting SDK for SharedArrayBuffer-based features (gallery view / HD).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  poweredByHeader: false,
  // Lint runs in CI (npm run lint); a lint warning must not block a production deploy.
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  images: { formats: ["image/avif", "image/webp"] },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  // Small, synthetic demo videos + certificate logo are read from disk by API routes.
  outputFileTracingIncludes: {
    "/api/media/**": ["./storage/sample/**"],
    "/api/certificates/**": ["./public/brand/tierra-automation-logo.jpg"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
