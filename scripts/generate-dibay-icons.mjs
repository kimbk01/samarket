/**
 * dibaY 브랜드 로고(assets/dibay-logo.png) → 웹·앱·Capacitor 아이콘 일괄 생성.
 * 교체 후 lib/brand/brand-asset-paths.ts 의 DIBAY_BRAND_ASSET_VERSION 을 올린다.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "assets", "dibay-logo.png");
const BRAND_GREEN = "#0B421A";

const outputs = [
  { dest: path.join(ROOT, "public", "images", "brand", "dibay-auth-logo.png"), size: 1024 },
  { dest: path.join(ROOT, "public", "images", "brand", "dibay-app-icon.png"), size: 512 },
  { dest: path.join(ROOT, "public", "images", "brand", "dibay-app-icon-180.png"), size: 180 },
  { dest: path.join(ROOT, "app", "icon.png"), size: 512 },
  { dest: path.join(ROOT, "app", "apple-icon.png"), size: 180 },
  { dest: path.join(ROOT, "assets", "icon-only.png"), size: 1024 },
  { dest: path.join(ROOT, "assets", "icon-foreground.png"), size: 1024 },
  {
    dest: path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png"),
    size: 1024,
  },
];

async function writePng(source, dest, size) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(source)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9, palette: false })
    .toFile(dest);
}

async function writeSolidBackground(dest, size, color) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toFile(dest);
}

async function writeFaviconIco(source, dest) {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()),
  );

  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const parts = [Buffer.alloc(headerSize)];

  parts[0].writeUInt16LE(0, 0);
  parts[0].writeUInt16LE(1, 2);
  parts[0].writeUInt16LE(count, 4);

  pngBuffers.forEach((png, index) => {
    const size = sizes[index];
    const entryOffset = 6 + index * 16;
    parts[0].writeUInt8(size >= 256 ? 0 : size, entryOffset);
    parts[0].writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    parts[0].writeUInt8(0, entryOffset + 2);
    parts[0].writeUInt8(0, entryOffset + 3);
    parts[0].writeUInt16LE(1, entryOffset + 4);
    parts[0].writeUInt16LE(32, entryOffset + 6);
    parts[0].writeUInt32LE(png.length, entryOffset + 8);
    parts[0].writeUInt32LE(offset, entryOffset + 12);
    parts.push(png);
    offset += png.length;
  });

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.concat(parts));
}

async function writeSplash(source, dest, canvasSize, logoSize) {
  const logo = await sharp(source).resize(logoSize, logoSize, { fit: "cover" }).png().toBuffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: BRAND_GREEN,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(dest);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Master logo not found: ${SOURCE}`);
  }

  for (const { dest, size } of outputs) {
    await writePng(SOURCE, dest, size);
    console.log(`wrote ${path.relative(ROOT, dest)} (${size}x${size})`);
  }

  await writeSolidBackground(path.join(ROOT, "assets", "icon-background.png"), 1024, BRAND_GREEN);
  console.log(`wrote assets/icon-background.png (solid ${BRAND_GREEN})`);

  const splashPath = path.join(ROOT, "assets", "splash.png");
  await writeSplash(SOURCE, splashPath, 2732, 920);
  console.log("wrote assets/splash.png");

  const iosSplashDir = path.join(
    ROOT,
    "ios",
    "App",
    "App",
    "Assets.xcassets",
    "Splash.imageset",
  );
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    await writeSplash(SOURCE, path.join(iosSplashDir, name), 2732, 920);
    console.log(`wrote ios/.../Splash.imageset/${name}`);
  }

  await writeFaviconIco(SOURCE, path.join(ROOT, "public", "favicon.ico"));
  console.log("wrote public/favicon.ico");

  const version = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const faviconSvgPath = path.join(ROOT, "public", "favicon.svg");
  fs.writeFileSync(
    faviconSvgPath,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <image href="/images/brand/dibay-app-icon.png?v=${version}" width="512" height="512" />
</svg>
`,
  );
  console.log(`wrote public/favicon.svg (v=${version})`);
  console.log(`\nNext: set DIBAY_BRAND_ASSET_VERSION = "${version}" in lib/brand/brand-asset-paths.ts`);
  console.log("Then: npm run cap:assets:android  (and cap sync ios if needed)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
