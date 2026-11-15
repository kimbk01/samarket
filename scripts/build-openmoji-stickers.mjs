/**
 * OpenMoji 스티커 묶음 생성 (Owner 2026-11-16 「OpenMoji 로 진행」).
 * 출처: OpenMoji 17.0.0 — https://openmoji.org · 라이선스 CC BY-SA 4.0 (앱 안 출처 표기: cm_ui_sticker_credit_openmoji).
 * prebuild 에 넣지 않는다(네트워크·시간). 생성 결과(WebP·목록 TS)를 커밋한다.
 *
 * 실행:
 *   npm pack openmoji@17.0.0 && tar xzf openmoji-17.0.0.tgz   # → ./package
 *   node scripts/build-openmoji-stickers.mjs ./package
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const pkgDir = resolve(process.argv[2] ?? "./package");
const pkg = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));
const data = JSON.parse(await readFile(join(pkgDir, "data/openmoji.json"), "utf8"));
const SIZE = 160;

const HAND_SUBGROUPS = new Set(["hand-fingers-open", "hand-fingers-partial", "hand-single-finger", "hand-fingers-closed", "hands"]);
const ORIGINAL_SUBGROUPS = new Set(["people", "smileys-emotion", "animals-nature", "food-drink"]);
/** 실존 인물 얼굴·음주 묘사는 스티커로 쓰지 않는다 */
const ORIGINAL_EXCLUDE = new Set(["trump", "Greta Thunberg", "drunk person"]);

/** 묶음 7개 — 피부색 변형 제외 · 고유 그림은 표정·동물·음식·사람만(상표·화면 조작·응급·공구 등 제외) */
const PACKS = [
  { slug: "om-faces", nameKey: "cm_ui_sticker_pack_faces", pick: (e) => e.group === "smileys-emotion" && /^(face-|cat-face|monkey-face)/.test(e.subgroups) },
  { slug: "om-hearts", nameKey: "cm_ui_sticker_pack_hearts", pick: (e) => e.group === "smileys-emotion" && (e.subgroups === "heart" || e.subgroups === "emotion") },
  { slug: "om-hands", nameKey: "cm_ui_sticker_pack_hands", pick: (e) => e.group === "people-body" && HAND_SUBGROUPS.has(e.subgroups) },
  { slug: "om-animals", nameKey: "cm_ui_sticker_pack_animals", pick: (e) => e.group === "animals-nature" && e.subgroups.startsWith("animal-") },
  { slug: "om-food", nameKey: "cm_ui_sticker_pack_food", pick: (e) => e.group === "food-drink" },
  { slug: "om-activities", nameKey: "cm_ui_sticker_pack_activities", pick: (e) => e.group === "activities" },
  { slug: "om-originals", nameKey: "cm_ui_sticker_pack_originals", pick: (e) => e.group === "extras-openmoji" && ORIGINAL_SUBGROUPS.has(e.subgroups) && !ORIGINAL_EXCLUDE.has(e.annotation) },
];

const packsOut = [];
const itemsOut = [];
let order = 10;
for (const pack of PACKS) {
  const rows = data.filter((e) => !e.skintone && pack.pick(e));
  const dir = join("public/stickers/packs", pack.slug);
  await mkdir(dir, { recursive: true });
  const packId = `fallback-${pack.slug}`;
  let i = 0;
  for (const e of rows) {
    const svg = await readFile(join(pkgDir, "color/svg", `${e.hexcode}.svg`));
    const file = `${e.hexcode.toLowerCase()}.webp`;
    const out = await sharp(svg, { density: 300 })
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82, effort: 6 })
      .toBuffer();
    await writeFile(join(dir, file), out);
    itemsOut.push({ id: `om-${pack.slug.slice(3)}-${i}`, packId, fileUrl: `/stickers/packs/${pack.slug}/${file}`, keyword: e.annotation, sortOrder: i });
    i++;
  }
  packsOut.push({
    id: packId,
    slug: pack.slug,
    name: pack.slug,
    nameKey: pack.nameKey,
    creditKey: "cm_ui_sticker_credit_openmoji",
    iconUrl: itemsOut.find((x) => x.packId === packId).fileUrl,
    sortOrder: order++,
  });
  console.log(pack.slug, i);
}

const ts = `/* 자동 생성 — scripts/build-openmoji-stickers.mjs · ${pkg.name}@${pkg.version} (CC BY-SA 4.0, https://openmoji.org). 손으로 고치지 않는다. */
import type { FallbackStickerItem, FallbackStickerPack } from "@/lib/stickers/fallback-sticker-catalog";

export const OPENMOJI_STICKER_PACKS: FallbackStickerPack[] = ${JSON.stringify(packsOut, null, 1)};

export const OPENMOJI_STICKER_ITEMS: FallbackStickerItem[] = ${JSON.stringify(itemsOut)};
`;
await writeFile("lib/stickers/openmoji-sticker-packs.generated.ts", ts);
console.log("total", itemsOut.length);
