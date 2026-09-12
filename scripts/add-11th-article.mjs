import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import sharp from "sharp";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[k] == null) process.env[k] = v;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const basePrefix = "positive-source";
const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-images/${basePrefix}`;

console.log("1. Generating distinct images for 11th article...");
const coverBuf = await sharp({
  create: {
    width: 320,
    height: 210,
    channels: 4,
    background: { r: 180, g: 45, b: 90, alpha: 1 },
  },
})
  .png()
  .toBuffer();

const bodyBuf = await sharp({
  create: {
    width: 290,
    height: 195,
    channels: 4,
    background: { r: 40, g: 175, b: 120, alpha: 1 },
  },
})
  .png()
  .toBuffer();

await sb.storage.from("post-images").upload(`${basePrefix}/img-cover-11.png`, coverBuf, { contentType: "image/png", upsert: true });
await sb.storage.from("post-images").upload(`${basePrefix}/img-body-11.png`, bodyBuf, { contentType: "image/png", upsert: true });
console.log("11th article images uploaded.");

const a11 = {
  slug: "article-11",
  title: "필리핀 은퇴 비자(SRRV) 신청 자격과 최신 혜택 총정리",
  author: "비자 컨설팅 전문위원",
  body: [
    "필리핀 은퇴청(PRA)에서 발급하는 은퇴 비자(SRRV)는 만 50세 이상 외국인이 일정 금액을 현지 은행에 예치하면 취득할 수 있는 영구 거주 비자입니다.",
    "은퇴 비자 소지자는 필리핀 내 출입국이 자유로우며, 개인 이삿짐 면세 통관 및 외국인 취업 허가증(AEP) 발급 우대 등 다양한 혜택을 누릴 수 있습니다.",
    "신청 시 필요한 범죄경력증명서와 건강검진 서류는 아포스티유(Apostille) 인증을 필수로 거쳐야 하므로 사전 서류 준비 기간을 여유 있게 계획하세요.",
  ],
};

const coverUrl = `${baseUrl}/img-cover-11.png`;
const bodyUrl = `${baseUrl}/img-body-11.png`;

const html11 = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${a11.title}</title>
  <meta property="og:title" content="${a11.title}" />
  <meta property="og:image" content="${coverUrl}" />
</head>
<body>
  <article>
    <h1>${a11.title}</h1>
    <p class="author">작성자: ${a11.author}</p>
    <p class="date">게시일: 2026-09-12</p>
    <div class="cover-image">
      <img src="${coverUrl}" alt="${a11.title} 대표 이미지" class="cover" />
    </div>
    <div class="article-content">
      <p>${a11.body[0]}</p>
      <p>${a11.body[1]}</p>
      <div class="body-image">
        <img src="${bodyUrl}" alt="${a11.title} 본문 이미지" />
      </div>
      <p>${a11.body[2]}</p>
    </div>
  </article>
</body>
</html>`;

await sb.storage.from("post-images").upload(`${basePrefix}/${a11.slug}.html`, Buffer.from(html11, "utf8"), {
  contentType: "text/html; charset=utf-8",
  upsert: true,
});
console.log("11th article HTML uploaded.");

// Update index.html to include 11 articles!
const articles = [
  { slug: "article-1", title: "필리핀 마닐라 정착 가이드 1편 - 입국 전 필수 준비 서류" },
  { slug: "article-2", title: "마닐라 대중교통 완벽 정복 - MRT, LRT와 그랩(Grab) 활용법" },
  { slug: "article-3", title: "필리핀 현지 통신사 비교 - 글로브(Globe) vs 스마트(Smart)" },
  { slug: "article-4", title: "필리핀 페소 환전 팁 - 한국 원화 vs 미국 달러 환전 비교" },
  { slug: "article-5", title: "마닐라 BGC 안전 가이드 - 밤에도 안전한 도심 산책로" },
  { slug: "article-6", title: "필리핀 병원 이용 및 응급 의료비 청구 방법" },
  { slug: "article-7", title: "필리핀 로컬 마켓 장보기 - 신선한 열대과일 고르는 법" },
  { slug: "article-8", title: "필리핀 국제학교 진학 가이드 - 학제와 입학 준비물" },
  { slug: "article-9", title: "주말 힐링 여행지 추천 - 마닐라 근교 따가이따이 화산 투어" },
  { slug: "article-10", title: "필리핀 콘도 임대 계약 시 필수 체크리스트 5가지" },
  { slug: "article-11", title: a11.title },
];

const listHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>DIBAY 필리핀 생활 가이드 매거진</title>
</head>
<body>
  <h1>DIBAY 필리핀 생활 가이드 매거진 - 전체 글 목록</h1>
  <ul class="article-list">
    ${articles.map((a) => `<li><a href="${baseUrl}/${a.slug}.html">${a.title}</a></li>`).join("\n    ")}
  </ul>
</body>
</html>`;

await sb.storage.from("post-images").upload(`${basePrefix}/index.html`, Buffer.from(listHtml, "utf8"), {
  contentType: "text/html; charset=utf-8",
  upsert: true,
});
console.log("Index list updated with 11th article!");
