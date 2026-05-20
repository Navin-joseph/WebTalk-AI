/**
 * Serves the embeddable widget bundle.
 *
 * Public URL after vercel.json rewrite: GET /widget.js
 * Direct URL:                            GET /api/widget
 *
 * The widget code lives in `widget-bundle.ts` (auto-generated). Embedding
 * it as a TypeScript constant means the bundle is part of the Next.js
 * compiled output — guaranteed to be present in every deploy, regardless
 * of static file handling quirks.
 */
import { NextResponse } from "next/server";
import { WIDGET_JS, WIDGET_SIZE } from "./widget-bundle";

// Edge runtime: faster cold start, served from PoPs nearest the user
export const runtime = "edge";

// Cache aggressively — bundle changes only on deploy
export async function GET() {
  return new NextResponse(WIDGET_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Length": String(WIDGET_SIZE),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
      "X-Widget-Source": "embedded-bundle",
    },
  });
}

// Allow CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
