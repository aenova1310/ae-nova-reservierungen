import type { NextConfig } from "next";

/**
 * Sicherheits-Header.
 * - Nur /embed/* darf in fremde Seiten eingebettet werden (Gäste-Widget im iframe).
 * - Alles andere (Admin, Verwaltungsseiten) verbietet Framing (Clickjacking-Schutz).
 */
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Native Module nicht bündeln
  serverExternalPackages: ["@node-rs/argon2"],
  // forbidden()/unauthorized() für Rollen-/Rechteprüfungen
  experimental: { authInterrupts: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/((?!embed/).*)",
        headers: [
          ...baseSecurityHeaders,
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          ...baseSecurityHeaders,
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        // Das Einbettungs-Skript wird von fremden Seiten geladen
        source: "/embed.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
