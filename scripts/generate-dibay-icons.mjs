import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const publicDir = path.join(ROOT, "public");
const appFaviconPath = path.join(ROOT, "app", "favicon.ico");
const publicFaviconPath = path.join(publicDir, "favicon.ico");
const publicIconPath = path.join(publicDir, "icon.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
<rect width="512" height="512" fill="#7360f2"/>
<text x="50%" y="56%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="220" font-weight="700" fill="#ffffff">dY</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(publicIconPath);
fs.copyFileSync(appFaviconPath, publicFaviconPath);

console.log(`Generated ${path.relative(ROOT, publicIconPath)} and ${path.relative(ROOT, publicFaviconPath)}`);
