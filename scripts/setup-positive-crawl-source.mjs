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

console.log("1. Generating and uploading 20 distinct images...");
for (let i = 1; i <= 10; i++) {
  const coverBuf = await sharp({
    create: {
      width: 200 + i * 10,
      height: 150 + i * 5,
      channels: 4,
      background: { r: (35 * i) % 255, g: (75 * i) % 255, b: (115 * i) % 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const bodyBuf = await sharp({
    create: {
      width: 180 + i * 5,
      height: 140 + i * 10,
      channels: 4,
      background: { r: (85 * i) % 255, g: (135 * i) % 255, b: (55 * i) % 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const coverPath = `${basePrefix}/img-cover-${i}.png`;
  const bodyPath = `${basePrefix}/img-body-${i}.png`;
  await sb.storage.from("post-images").upload(coverPath, coverBuf, { contentType: "image/png", upsert: true });
  await sb.storage.from("post-images").upload(bodyPath, bodyBuf, { contentType: "image/png", upsert: true });
}
console.log("Distinct images uploaded.");

const articles = [
  {
    slug: "article-1",
    title: "필리핀 마닐라 정착 가이드 1편 - 입국 전 필수 준비 서류",
    topic: "이민/비자",
    author: "디바이 매거진 에디터",
    body: [
      "필리핀 입국을 준비할 때 가장 먼저 챙겨야 할 것은 여권의 유효기간입니다. 최소 6개월 이상 유효기간이 남아 있어야 정상 입국이 가능합니다.",
      "또한 e-Travel 전자 입국 신고서는 출발 72시간 이내에 반드시 온라인으로 등록해야 공항 입국 심사를 지체 없이 통과할 수 있습니다.",
      "마지막으로 30일 이내에 제3국으로 출국하는 왕복 또는 출국 항공권을 지참해야 무비자 입국이 허용되므로 사전 예약을 철저히 확인하세요.",
    ],
  },
  {
    slug: "article-2",
    title: "마닐라 대중교통 완벽 정복 - MRT, LRT와 그랩(Grab) 활용법",
    topic: "교통정보",
    author: "마닐라 현지 가이드",
    body: [
      "마닐라 시내를 이동할 때 교통체증을 피하는 가장 효율적인 수단은 MRT와 LRT 지상철입니다. 출퇴근 시간대를 피하면 편리하게 이동할 수 있습니다.",
      "비피크 시간대나 짐이 많을 때는 동남아 대표 호출 앱인 그랩(Grab)을 이용하는 것이 안전하며, 미터기 분쟁 없이 정찰제로 운행됩니다.",
      "일반 택시를 탈 경우에는 탑승 전 반드시 미터기 사용을 요청하고 잔돈을 미리 준비하는 것이 현지 생활의 중요한 요령입니다.",
    ],
  },
  {
    slug: "article-3",
    title: "필리핀 현지 통신사 비교 - 글로브(Globe) vs 스마트(Smart)",
    topic: "통신/생활",
    author: "IT 리포터",
    body: [
      "필리핀의 양대 통신사는 글로브(Globe)와 스마트(Smart)입니다. 거주하시는 지역에 따라 중계기 신호 세기가 다를 수 있으니 이웃의 사용 현황을 확인하세요.",
      "최근에는 SIM 카드 실명 등록제가 시행되고 있으므로 공항이나 편의점에서 유심을 구입한 후 온라인으로 신분증을 등록해야 데이터가 활성화됩니다.",
      "단기 체류라면 무제한 데이터 패키지(예: Go59, GigaPower)를 앱에서 손쉽게 충전하여 사용하는 것이 가장 경제적입니다.",
    ],
  },
  {
    slug: "article-4",
    title: "필리핀 페소 환전 팁 - 한국 원화 vs 미국 달러 환전 비교",
    topic: "금융/환전",
    author: "금융 전문 블로거",
    body: [
      "필리핀 페소를 가장 유리하게 환전하는 방법은 한국에서 미국 달러 100달러 신권을 준비하여 현지 공인 환전소에서 페소로 바꾸는 것입니다.",
      "공항 환전소는 시내 대형 쇼핑몰(SM, 아얄라 등) 환전소에 비해 환율이 낮으므로, 첫날 사용할 최소 금액만 공항에서 바꾸는 것이 좋습니다.",
      "또한 최근에는 트래블로그, 트래블월렛 카드를 통해 현지 BPI나 BDO ATM에서 직접 페소를 인출하는 것도 수수료를 절감하는 좋은 방법입니다.",
    ],
  },
  {
    slug: "article-5",
    title: "마닐라 BGC 안전 가이드 - 밤에도 안전한 도심 산책로",
    topic: "현지생활",
    author: "BGC 거주 5년차",
    body: [
      "보니파시오 글로벌 시티(BGC)는 마닐라에서 가장 치안이 뛰어나고 계획적으로 조성된 현대적인 상업 및 주거 지구입니다.",
      "하이스트리트와 버고스 서클 주변은 24시간 보안 인력이 순찰하며 보행자 전용 도로가 잘 갖추어져 있어 쾌적한 산책이 가능합니다.",
      "다만 심야 시간에는 인적이 드문 외곽 골목은 피하고 주요 대로변을 이용하는 것이 언제나 안전을 지키는 기본 수칙입니다.",
    ],
  },
  {
    slug: "article-6",
    title: "필리핀 병원 이용 및 응급 의료비 청구 방법",
    topic: "건강/의료",
    author: "디바이 헬스케어팀",
    body: [
      "필리핀에서 갑작스러운 질병이나 사고가 발생했을 때는 세인트루크스나 마카티 메디컬 센터 등 국제 수준의 종합병원을 방문하는 것이 권장됩니다.",
      "외국인 진료 시 보증금이나 진료비를 먼저 결제해야 하는 경우가 많으므로 신용카드 한도를 미리 확인해 두세요.",
      "한국 해외여행자보험이나 유학생보험에 가입했다면 진단서(Medical Certificate)와 상세 영수증(Official Receipt)을 반드시 원본으로 발급받아야 합니다.",
    ],
  },
  {
    slug: "article-7",
    title: "필리핀 로컬 마켓 장보기 - 신선한 열대과일 고르는 법",
    topic: "쇼핑/시장",
    author: "푸드 에디터",
    body: [
      "필리핀의 망고, 파인애플, 파파야 등 열대과일은 로컬 재래시장이나 슈퍼마켓에서 저렴하게 구매할 수 있습니다.",
      "망고는 카라바오 망고가 가장 달콤하며 껍질에 검은 반점이 살짝 올라왔을 때가 당도가 가장 높고 부드럽습니다.",
      "시장 상인들과 흥정할 때는 친절한 미소와 함께 간단한 따갈로그어 인사를 건네면 더 좋은 상품을 덤으로 받을 수 있습니다.",
    ],
  },
  {
    slug: "article-8",
    title: "필리핀 국제학교 진학 가이드 - 학제와 입학 준비물",
    topic: "교육/육아",
    author: "교육 상담 컨설턴트",
    body: [
      "필리핀에는 영국식, 미국식, IB 디프로마를 제공하는 다양한 우수 국제학교들이 마닐라와 세부 등에 위치해 있습니다.",
      "입학을 위해서는 직전 2~3년간의 영문 성적증명서, 생활기록부 공증본, 그리고 학교장의 영문 추천서가 필요합니다.",
      "대부분의 학교에서 영어 인터뷰와 수학 기초 평가를 진행하므로 사전 어학 준비와 학교별 텀(Term) 시작 일정을 꼼꼼히 체크하세요.",
    ],
  },
  {
    slug: "article-9",
    title: "주말 힐링 여행지 추천 - 마닐라 근교 따가이따이 화산 투어",
    topic: "여행정보",
    author: "주말 여행자",
    body: [
      "마닐라에서 차로 약 1시간 반 거리에 위치한 따가이따이는 서늘한 기후와 따알 화산호의 절경을 감상할 수 있는 대표 힐링 명소입니다.",
      "전망 좋은 카페에서 현지 유명 소고기 탕 요리인 불랄로(Bulalo)를 맛보며 호수 뷰를 감상하는 코스가 매우 인기 있습니다.",
      "주말에는 귀경길 정체가 심할 수 있으므로 아침 일찍 출발하여 이른 오후에 돌아오는 일정을 추천합니다.",
    ],
  },
  {
    slug: "article-10",
    title: "필리핀 콘도 임대 계약 시 필수 체크리스트 5가지",
    topic: "부동산/주거",
    author: "마닐라 부동산 에이전트",
    body: [
      "콘도를 계약할 때는 보증금(Security Deposit)과 선불 월세(Advance Rent)의 반환 조건 및 공과금 정산 방식을 명문화해야 합니다.",
      "입주 전 유닛 내 가전제품과 가구의 작동 상태를 사진 및 영상으로 촬영하여 입주 확인서(Move-in Checklist)에 서명하세요.",
      "관리비(Association Dues)가 월세에 포함되어 있는지 집주인과 명확히 확인하는 것이 추후 분쟁을 예방하는 지름길입니다.",
    ],
  },
];

console.log("2. Uploading 10 article HTMLs...");
for (let i = 0; i < articles.length; i++) {
  const a = articles[i];
  const num = i + 1;
  const coverUrl = `${baseUrl}/img-cover-${num}.png`;
  const bodyUrl = `${baseUrl}/img-body-${num}.png`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${a.title}</title>
  <meta property="og:title" content="${a.title}" />
  <meta property="og:image" content="${coverUrl}" />
</head>
<body>
  <article>
    <h1>${a.title}</h1>
    <p class="author">작성자: ${a.author}</p>
    <p class="date">게시일: 2026-09-12</p>
    <div class="cover-image">
      <img src="${coverUrl}" alt="${a.title} 대표 이미지" class="cover" />
    </div>
    <div class="article-content">
      <p>${a.body[0]}</p>
      <p>${a.body[1]}</p>
      <div class="body-image">
        <img src="${bodyUrl}" alt="${a.title} 본문 이미지" />
      </div>
      <p>${a.body[2]}</p>
    </div>
  </article>
</body>
</html>`;

  await sb.storage.from("post-images").upload(`${basePrefix}/${a.slug}.html`, Buffer.from(html, "utf8"), {
    contentType: "text/html; charset=utf-8",
    upsert: true,
  });
}
console.log("Article HTMLs upload completed.");

console.log("3. Uploading index.html list page...");
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

console.log("List page uploaded successfully.");
console.log("PUBLIC LIST URL:", `${baseUrl}/index.html`);
