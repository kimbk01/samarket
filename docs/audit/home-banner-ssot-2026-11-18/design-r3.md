# /home 시안 R3 — 메인 배너 = 어드민 교체형 SSOT (2026-11-18 PHT)

- 배너 그림: `banners/home-banner-{info|ring|dlv}-{16x9|1x1}.jpg` (16:9 판 = `public/images/home-banners/hero-*.jpg` 기본값)
- 로컬 확인 캡처(기본 16:9 배너 · 비로그인): `hero-phone.png` 390 · `hero-ipad-p.png` 820 · `hero-mac.png` 1440
- 구현: 브랜치 `feat/home-banner-ssot` (아래 2절). 운영 어드민 배너 저장값은 바꾸지 않았다 — 16:9 그림 교체는 어드민에서.

## 1. 배너 3종 (강조 순서 = Owner 지시 2026-11-18)
| # | 그림 | 서비스 표시 | 제목 (ko / en) | 설명 (ko / en) | CTA (ko / en) | 이동 |
|---|---|---|---|---|---|---|
| 1 | 필리핀 바다 실사 + 교민 정보 글 카드(운영 실제 글 사진) | 정보 공유 / Community | 필리핀 사는 한국인,⏎정보는 여기서 / Koreans in the PH,⏎start here | 비자·병원·맛집까지 교민이 직접 나눠요 / Visas, clinics, food — tips from neighbors | 정보 보러 가기 / Read tips | /philife |
| 2 | telRING 채팅 화면 + 영상통화 화면 + 보안(방패)·채팅·통화·영상 아이콘 | telRING | 안심 메신저 telRING,⏎통화는 무료 / Secure messenger,⏎free calls | 보안 채팅부터 영상통화까지 무료로 연결해요 / Secure chat and video calls, free | 무료 통화 시작 / Call free | /community-messenger?section=chats |
| 3 | 치킨 실사 + DIPICK 배달 진행 화면(지도·도착 시간·주문 내역) | DIPICK 배달 / DIPICK Delivery | 오늘 저녁, 동네 맛집이⏎집 앞까지 / Tonight's dinner,⏎at your door | 치킨·한식·피자, 주문부터 도착까지 앱에서 확인 / Chicken, Korean, pizza — track it in the app | 지금 주문하기 / Order now | /stores |

그림 만드는 방식: 실사 사진(Unsplash, 무료 상업 이용)과 앱 화면 모형을 합성해 1280×720(16:9)·720×720(1:1) JPG 로 뽑았다. 그림 안 앱 화면의 인물·대화는 연출용이다. 그림 왼쪽 45~50% 는 비워 두고(글 자리), 문구는 그림에 넣지 않는다 → 어드민 문구 칸(한/영)이 그 위에 얹힌다.
**1:1 판은 지금 운영 어드민(홈 구성 → 배너, 1:1 비율)에 바로 올려 교체할 수 있다**(코드 변경 없이). 16:9 판은 아래 2절 구현 뒤 사용.

## 2. 배너 SSOT (구현 설계)
단일 정의: `lib/home/home-layout-contract.ts` 의 `HomeBannerConfig` + 단일 부품 `HomeHeroBanner` (앱 홈·어드민 미리보기 공용 — 현행 `HomeBannerView`/`HomeBannerPreviewFrame` 구조와 같은 방식).

| 칸 | 규칙 | 현행 대비 |
|---|---|---|
| imageUrl | 16:9 · 권장 1280×720 · 최소 854×480 · 2MB · JPG/PNG/WebP (업로드 검사 = 현행 `HOME_BANNER_IMAGE_PX["16:9"]`) | 비율 고정 16:9 |
| chip (ko/en) | 12자 · 비우면 이동 주소의 메뉴 이름 자동 | **신규** |
| title (ko/en) | 30자 · 줄바꿈 1번 | 그대로 |
| body (ko/en) | 40자 | 그대로 |
| ctaLabel (ko/en) | 12자 · 비우면 메뉴 기본 CTA(카탈로그 키) | **신규** |
| href · audience · visible · adLabel | 현행 그대로 | 그대로 |
| ratio · size · side · titleSize | 읽기만 하고 화면에서 안 씀 · 어드민 칸 숨김 | 사용 중지 |

- 저장 위치: `admin_settings`(key = 홈 구성) JSON 그대로 → **DB 마이그레이션 없음**. 저장 → 서버 캐시 무효화 → 앱 홈 반영(현행 경로).
- 화면 규칙(`app/home-hub.css` `.home-hero*`, 배너 칸 폭 기준 컨테이너 쿼리): 휴대폰 16:10·다음 장 28px / 태블릿 78% 폭 16:8 / PC 높이 320 16:9 줄 · 마우스 기기 ‹ › · `현재 / 전체` · 「광고」 = adLabel · 모서리 = `--ui-radius-rect`(4px, 디자인 시스템).
- 처음 보이는 배너 = 기존 교체 규칙(새로고침·재접속 때 다음 배너) · 자동 넘김 없음.
- 예전 비율(1:1 등) 저장 배너 = 왼쪽 초록 글·오른쪽 그림(45%)으로 나온다 — 운영 현재 3장이 이 모양. 어드민에서 16:9 그림으로 바꾸면 꽉 찬 배너.
- 언어: 칸마다 ko·en (현행 HomeText) — 화면 문구 SSOT(`docs/i18n-ssot.md`)와 같은 방식.

바뀌는 파일 (웹만, 네이티브·DB 없음): `lib/home/home-layout-contract.ts`(chip·ctaLabel 정규화) · `components/home-hub/HomeBanner.tsx`(→ HomeHeroBanner) · `components/admin/home/AdminHomeLayoutPage.tsx`(배너 편집 칸·미리보기 3기기) · `app/api/admin/home-layout/upload/route.ts`(16:9 고정) · `lib/home/home-above-fold-preload.ts`(첫 배너 그림) · `lib/i18n/catalog/*`(CTA 기본 키).

## 3. Owner 결정 필요 (충돌)
1. 카드 모서리 16px — 디자인 시스템 기준(카드 4px)과 다름.
2. 홈 시안 v4 「섞인 피드」 → R2/R3 서비스별 줄.
3. 광고 자리 B(상품 줄 광고 카드)·C(띠 광고)는 유료 광고 위치에 홈 자리가 없어 신설 필요.

## 4. 확인 상태
| 항목 | 판정 | 근거 |
|---|---|---|
| 6개 기기 렌더 · 가로 넘침 없음 | PASS (시안 파일) | `shots/*` · 문서 폭 = 화면 폭 |
| 어드민 편집 → 미리보기 연동 | PASS (시안 파일) | admin-banner.html 입력 즉시 반영 |
| 운영 어드민 저장 → 앱 반영 | NOT_PROVEN | 구현 전 |
| 회원 화면 · 실기기 | NOT_PROVEN | 비로그인 브라우저 렌더 |
