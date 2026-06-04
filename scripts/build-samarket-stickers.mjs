/**
 * Twemoji 72x72 PNG → public/stickers/packs/** 128px WebP
 * 실행: npm run stickers:build  (sharp devDependency 필요)
 * 이미 생성된 WebP 가 있으면 CDN fetch 를 건너뜀 (prebuild·CI 병목 완화).
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";

const PACKS = {
  basic: ["1f600", "1f622", "1f620", "2764", "1f923", "1f632"],
  reaction: ["1f44d", "1f44f", "1f525", "2b50", "1f389"],
};

async function fileReady(path) {
  try {
    await access(path);
    const { statSync } = await import("node:fs");
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("sharp 가 없습니다. npm install --save-dev sharp 후 다시 실행하세요.");
    process.exit(1);
  }

  let wrote = 0;
  let skipped = 0;
  let failed = 0;

  for (const [pack, codes] of Object.entries(PACKS)) {
    const dir = join(root, "public", "stickers", "packs", pack);
    await mkdir(dir, { recursive: true });
    for (const code of codes) {
      const out = join(dir, `${code}.webp`);
      if (await fileReady(out)) {
        skipped += 1;
        continue;
      }
      const pngUrl = `${TWEMOJI_BASE}/${code}.png`;
      const res = await fetch(pngUrl);
      if (!res.ok) {
        console.warn("skip", code, res.status);
        failed += 1;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const webp = await sharp(buf)
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 82 })
        .toBuffer();
      await writeFile(out, webp);
      wrote += 1;
      console.log("wrote", out, webp.length, "bytes");
    }
  }

  if (failed > 0) {
    console.error(`[stickers:build] ${failed} asset(s) failed — run again or check network`);
    process.exit(1);
  }
  console.log(`[stickers:build] done (wrote=${wrote}, skipped=${skipped})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
