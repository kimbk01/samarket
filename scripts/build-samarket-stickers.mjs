/**
 * Twemoji 72x72 PNG → public/stickers/packs/** 128px WebP
 * 실행: npm run stickers:build  (sharp devDependency 필요)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";

const PACKS = {
  basic: ["1f600", "1f622", "1f620", "2764", "1f923", "1f632"],
  reaction: ["1f44d", "1f44f", "1f525", "2b50", "1f389"],
};

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("sharp 가 없습니다. npm install --save-dev sharp 후 다시 실행하세요.");
    process.exit(1);
  }

  for (const [pack, codes] of Object.entries(PACKS)) {
    const dir = join(root, "public", "stickers", "packs", pack);
    await mkdir(dir, { recursive: true });
    for (const code of codes) {
      const pngUrl = `${TWEMOJI_BASE}/${code}.png`;
      const res = await fetch(pngUrl);
      if (!res.ok) {
        console.warn("skip", code, res.status);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const webp = await sharp(buf).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82 }).toBuffer();
      const out = join(dir, `${code}.webp`);
      await writeFile(out, webp);
      console.log("wrote", out, webp.length, "bytes");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
