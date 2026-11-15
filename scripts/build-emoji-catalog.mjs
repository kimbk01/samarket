/**
 * 이모지 피커 데이터 생성 (Owner 2026-11-16 「1번」 — 119개 → 유니코드 공식 전체 목록).
 * 출처: emojibase-data (MIT, Unicode CLDR 이름·태그). 의존성으로 넣지 않고 생성 결과(JSON)만 커밋한다.
 *
 * 실행:
 *   npm pack emojibase-data@18.0.0 && tar xzf emojibase-data-18.0.0.tgz   # → ./package
 *   node scripts/build-emoji-catalog.mjs ./package
 *
 * 결과(public/emoji/ — 피커를 열 때만 받아 온다):
 *   catalog.v1.json   — items: [emoji, category(0~7), emojiVersion, skins?] · sentinels(버전별 판정용 글자)
 *   search.ko.v1.json — items 와 같은 순서의 한국어 이름·태그(소문자, 공백 구분)
 *   search.en.v1.json — 영어 이름·태그
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const pkgDir = resolve(process.argv[2] ?? "./package");
const outDir = resolve("public/emoji");
const pkg = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));
const en = JSON.parse(await readFile(join(pkgDir, "en/data.json"), "utf8"));
const ko = JSON.parse(await readFile(join(pkgDir, "ko/data.json"), "utf8"));

/** emojibase group → 피커 분류 8개(텔레그램 EmojiData 8분류: 표정·사람을 한 칸) */
const CATEGORY_OF_GROUP = { 0: 0, 1: 0, 3: 1, 4: 2, 6: 3, 5: 4, 7: 5, 8: 6, 9: 7 };

const koByHex = new Map(ko.map((e) => [e.hexcode, e]));
const base = en
  .filter((e) => e.group in CATEGORY_OF_GROUP)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const items = [];
const searchKo = [];
const searchEn = [];
const firstByVersion = new Map();
for (const e of base) {
  const skins = Array.isArray(e.skins) ? e.skins.filter((s) => typeof s.tone === "number").map((s) => s.emoji) : [];
  items.push(skins.length === 5 ? [e.emoji, CATEGORY_OF_GROUP[e.group], e.version, skins] : [e.emoji, CATEGORY_OF_GROUP[e.group], e.version]);
  const k = koByHex.get(e.hexcode);
  searchKo.push([k?.label ?? "", ...(k?.tags ?? [])].join(" ").toLowerCase().trim());
  searchEn.push([e.label ?? "", ...(e.tags ?? [])].join(" ").toLowerCase().trim());
  const single = [...e.emoji.replace(/️/g, "")].length === 1;
  const prev = firstByVersion.get(e.version);
  if (!prev || (single && !prev.single)) firstByVersion.set(e.version, { emoji: e.emoji, single });
}

const sentinels = [...firstByVersion.entries()]
  .sort((a, b) => b[0] - a[0])
  .map(([v, s]) => [v, s.emoji, s.single ? 0 : 1]);

const meta = { source: `emojibase-data@${pkg.version} (MIT) · Unicode CLDR`, count: items.length };
await writeFile(join(outDir, "catalog.v1.json"), JSON.stringify({ ...meta, items, sentinels }));
await writeFile(join(outDir, "search.ko.v1.json"), JSON.stringify(searchKo));
await writeFile(join(outDir, "search.en.v1.json"), JSON.stringify(searchEn));
console.log(meta, "sentinels", sentinels.length);
