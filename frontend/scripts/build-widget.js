#!/usr/bin/env node
/**
 * Bundle the embeddable widget using esbuild's JavaScript API.
 *
 * Why this approach (instead of `cd ../widget && npm run build`):
 *   - esbuild is already a devDependency of frontend/ — no second install needed
 *   - Vercel sets NODE_ENV=production, which makes nested `npm install` skip
 *     devDependencies — that's what was breaking the previous build
 *   - One process, one set of dependencies, one source of truth
 *
 * The widget source lives at widget/src/widget.ts. This script reads it
 * directly and outputs frontend/public/widget.js — which Vercel then serves
 * as a static asset at https://your-app.vercel.app/widget.js
 */
const path = require("path");
const fs = require("fs");

const ENTRY = path.resolve(__dirname, "..", "..", "widget", "src", "widget.ts");
const OUTPUT_DIR = path.resolve(__dirname, "..", "public");
const OUTPUT = path.join(OUTPUT_DIR, "widget.js");

async function main() {
  console.log("──▶ Building embeddable widget");

  if (!fs.existsSync(ENTRY)) {
    console.error("✗ Widget source not found at: " + ENTRY);
    console.error("  Make sure the repo includes the `widget/` directory.");
    process.exit(1);
  }

  // Require esbuild from frontend's own node_modules (always installed by Vercel)
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch (e) {
    console.error("✗ esbuild is not installed. It must be in frontend/devDependencies.");
    console.error("  Fix: npm install --save-dev esbuild");
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("──▶ Bundling " + path.relative(process.cwd(), ENTRY));
  const t0 = Date.now();

  try {
    await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      minify: true,
      sourcemap: false,
      platform: "browser",
      target: "es2018",
      outfile: OUTPUT,
      legalComments: "none",
      logLevel: "info",
    });
  } catch (err) {
    console.error("✗ esbuild failed:", err.message || err);
    process.exit(1);
  }

  const size = fs.statSync(OUTPUT).size;
  console.log(
    `✓ widget.js published (${(size / 1024).toFixed(1)} KB) in ${Date.now() - t0}ms`
  );
  console.log("  Will be served at: /widget.js after next build\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
