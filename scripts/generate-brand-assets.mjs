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
  <rect x="20" y="20" width="472" height="472" rx="142" fill="${BLUSH_TILE}"/>
  <rect x="34" y="34" width="444" height="444" rx="130" fill="none" stroke="${GOLD}" stroke-opacity="0.72" stroke-width="4"/>
  <circle cx="256" cy="278" r="136" fill="${BURGUNDY}"/>
  <path d="M256 216v152" fill="none" stroke="${IVORY}" stroke-width="34" stroke-linecap="round"/>
  <path d="M150 166 126 103l78 41 52-72 52 72 78-41-24 63H150Z" fill="#D7B675" stroke="${BURGUNDY}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M150 168h212" fill="none" stroke="#D7B675" stroke-width="13" stroke-linecap="round"/>
  <circle cx="126" cy="101" r="10" fill="#D7B675"/>
  <circle cx="256" cy="70" r="10" fill="#D7B675"/>
  <circle cx="386" cy="101" r="10" fill="#D7B675"/>`;

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="شعار أميرة استور">${MARK_SHAPES}
</svg>
`;

const ICON_SVG = MARK_SVG;

const FONT_STACK = "Cairo, 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif";

const LOCKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 210" role="img" aria-label="أميرة استور">
  <g transform="translate(316,12)">
    <svg width="88" height="50" viewBox="0 0 72 40">
      <path d="M10 11 22 21 36 6l14 15 12-10-7 22H17L10 11Z" fill="#D7B675"/>
      <path d="M18 32h37" stroke="#D7B675" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="10" cy="9" r="3" fill="#D7B675"/>
      <circle cx="36" cy="5" r="3" fill="#D7B675"/>
      <circle cx="62" cy="9" r="3" fill="#D7B675"/>
    </svg>
  </g>
  <text x="360" y="108" text-anchor="middle" font-family="Cairo, 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif" font-size="66" font-weight="800" fill="#3B2A2E">أميرة استور</text>
  <path d="M295 135h130" stroke="#C9A25E" stroke-width="4" stroke-linecap="round"/>
  <text x="360" y="175" text-anchor="middle" font-family="${FONT_STACK}" font-size="25" font-weight="700" letter-spacing="3.5" fill="#803049">AMIRA STORE</text>
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
