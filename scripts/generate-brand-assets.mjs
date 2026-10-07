/**
 * PHASE-01 — Amira Store brand asset generator.
 * Produces the default replaceable brand assets committed to the repo.
 * Usage: bun scripts/generate-brand-assets.mjs
 * Reference: docs/DESIGN_SYSTEM.md — original mark: crown + gem above a stylized
 * Arabic alef (أميرة) on a soft blush tile with a muted-gold inner frame.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const brandDir = path.join(root, "public", "brand");
const appDir = path.join(root, "src", "app");

const BURGUNDY = "#803049";
const GOLD = "#C9A25E";
const BLUSH_TILE = "#F8ECEA";
const IVORY = "#FBF7F1";

const MARK_SHAPES = `
  <rect x="24" y="24" width="464" height="464" rx="116" fill="${BLUSH_TILE}"/>
  <rect x="38" y="38" width="436" height="436" rx="104" fill="none" stroke="${GOLD}" stroke-opacity="0.55" stroke-width="5"/>
  <path d="M158 222 C158 170 186 154 210 180 C230 138 246 130 256 126 C266 130 282 138 302 180 C326 154 354 170 354 222" fill="none" stroke="${BURGUNDY}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="86" r="16" fill="${GOLD}"/>
  <rect x="238" y="234" width="36" height="206" rx="18" fill="${BURGUNDY}"/>`;

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="شعار أميرة استور">${MARK_SHAPES}
</svg>
`;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="أميرة استور">
  <rect width="512" height="512" rx="128" fill="${BLUSH_TILE}"/>
  <path d="M128 268 C128 196 166 176 198 210 C224 156 244 146 256 140 C268 146 288 156 314 210 C346 176 384 196 384 268" fill="none" stroke="${BURGUNDY}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="92" r="26" fill="${GOLD}"/>
</svg>
`;

const FONT_STACK = "Cairo, 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif";

const LOCKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 160" role="img" aria-label="أميرة استور">
  <g transform="translate(420,20) scale(0.2344)">${MARK_SHAPES}
  </g>
  <text x="210" y="86" text-anchor="middle" font-family="${FONT_STACK}" font-size="52" font-weight="700" fill="#3B2A2E">أميرة استور</text>
  <text x="210" y="126" text-anchor="middle" font-family="${FONT_STACK}" font-size="20" font-weight="500" fill="${BURGUNDY}">تشكيلة عائلية مختارة بعناية</text>
</svg>
`;

const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${IVORY}"/>
  <circle cx="140" cy="110" r="230" fill="${BLUSH_TILE}"/>
  <circle cx="1090" cy="545" r="270" fill="${BLUSH_TILE}"/>
  <circle cx="1075" cy="105" r="9" fill="${GOLD}" fill-opacity="0.7"/>
  <circle cx="150" cy="535" r="7" fill="${GOLD}" fill-opacity="0.7"/>
  <g transform="translate(400,115) scale(0.78125)">${MARK_SHAPES}
  </g>
</svg>
`;

async function main() {
  await mkdir(brandDir, { recursive: true });
  await mkdir(appDir, { recursive: true });

  await writeFile(path.join(brandDir, "logo-mark.svg"), MARK_SVG, "utf8");
  await writeFile(path.join(brandDir, "logo-lockup.svg"), LOCKUP_SVG, "utf8");
  await writeFile(path.join(appDir, "icon.svg"), ICON_SVG, "utf8");

  await sharp(Buffer.from(MARK_SVG), { density: 288 }).resize(512, 512).png().toFile(path.join(brandDir, "logo-mark-512.png"));
  await sharp(Buffer.from(MARK_SVG), { density: 288 }).resize(512, 512).webp({ quality: 90 }).toFile(path.join(brandDir, "logo-mark-512.webp"));
  await sharp(Buffer.from(ICON_SVG), { density: 288 }).resize(180, 180).png().toFile(path.join(appDir, "apple-icon.png"));
  await sharp(Buffer.from(OG_SVG)).png().toFile(path.join(brandDir, "og-default.png"));

  console.log("Brand assets generated:");
  for (const f of [
    "public/brand/logo-mark.svg",
    "public/brand/logo-lockup.svg",
    "public/brand/logo-mark-512.png",
    "public/brand/logo-mark-512.webp",
    "public/brand/og-default.png",
    "src/app/icon.svg",
    "src/app/apple-icon.png",
  ]) {
    console.log(" -", f);
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
