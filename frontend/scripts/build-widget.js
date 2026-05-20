#!/usr/bin/env node
/**
 * Cross-platform widget builder.
 *
 * Runs automatically before `next build` (via the "prebuild" npm script).
 * On Vercel: produces a fresh widget.js as part of every deploy.
 * Locally: same thing, no manual copy step needed.
 *
 * Steps:
 *   1. cd ../widget
 *   2. npm install (deps: esbuild, typescript)
 *   3. npm run build (esbuild minified bundle)
 *   4. copy widget/dist/widget.js -> frontend/public/widget.js
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const widgetDir = path.resolve(__dirname, "..", "..", "widget");
const publicDir = path.resolve(__dirname, "..", "public");

function step(msg) {
  console.log("\n──▶ " + msg);
}

step("Building embeddable widget");

// Sanity: widget source exists?
if (!fs.existsSync(path.join(widgetDir, "package.json"))) {
  console.error("✗ Widget source not found at " + widgetDir);
  console.error("  Make sure the repository contains the `widget/` directory.");
  process.exit(1);
}

// 1. Install widget deps (idempotent — Vercel caches node_modules)
step("Installing widget dependencies");
try {
  execSync("npm install --no-audit --no-fund --prefer-offline", {
    cwd: widgetDir, stdio: "inherit",
  });
} catch (e) {
  console.error("✗ Failed to install widget deps");
  process.exit(1);
}

// 2. Build (esbuild minified bundle, ~19 KB)
step("Bundling widget with esbuild");
try {
  execSync("npm run build", { cwd: widgetDir, stdio: "inherit" });
} catch (e) {
  console.error("✗ Widget build failed");
  process.exit(1);
}

// 3. Copy to public/
step("Publishing widget.js to frontend/public/");
const src = path.join(widgetDir, "dist", "widget.js");
const dest = path.join(publicDir, "widget.js");

if (!fs.existsSync(src)) {
  console.error("✗ Expected build output not found: " + src);
  process.exit(1);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(src, dest);

const size = fs.statSync(dest).size;
console.log(`✓ widget.js published (${(size / 1024).toFixed(1)} KB)`);
console.log("  Available at: /widget.js after Next.js build completes\n");
