/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  },

  // Belt-and-suspenders: explicitly force the right Content-Type + CORS for
  // the embeddable widget. Without this, some Vercel edge configurations
  // serve unknown MIME types as HTML, which breaks the <script> tag.
  async headers() {
    return [
      {
        source: "/widget.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=60, must-revalidate" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
