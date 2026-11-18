# 운영 홈 배너 교체 기록 (Owner 2026-11-18 「너가 직접 해라」)

## 무엇을·언제
- 대상: 운영 `public.admin_settings` key=`home_layout` 의 `value_json.banners` **한 칸만** (나머지 칸 그대로).
- 시점: PR #463 병합·배포로 `/images/home-banners/hero-*.jpg` 가 운영에 올라간 뒤 (먼저 바꾸면 그림이 없음).
- 저장 조건: 시작 시 읽은 revision `updated_at = 2026-11-14 01:11:28.654969+00` 일 때만 UPDATE. 0행이면(다른 사람 저장) 즉시 중단.
- 반영: 앱 홈 서버 캐시 `revalidate: 300` → 저장 후 최대 5분 안에 홈에 보임 (SQL 저장은 어드민 저장처럼 캐시 태그를 즉시 만료시키지 않음 · 감사 로그 없음).

## 시작 시 운영 값 (2026-11-18 PHT 읽기 전용 조회)
- `md5(value_json - 'banners')` = `a31461ac3b5b4016162353f9ad906453` (교체 후 같아야 함)
- `md5(value_json->'banners')` = `af356a2e65978998ff30c1ec15c6cd89`

### 백업 — 교체 전 banners (되돌리기 = 이 배열로 같은 방식 UPDATE)
```json
[
  {"id":"dibay-messenger","body":{"en":"Connect with neighbors in the PH","ko":"필리핀 이웃과 메신저로 바로 연결돼요"},"href":"/community-messenger?section=chats","side":"left","size":"m","ratio":"1:1","title":{"en":"Free chat & video calls","ko":"교민끼리 무료 채팅·영상통화"},"adLabel":false,"visible":true,"audience":"all","imageUrl":"/images/home-banners/messenger.webp","titleSize":"m"},
  {"id":"dibay-trade","body":{"en":"The Korean marketplace in the PH","ko":"사고 팔고 구하는 교민 장터"},"href":"/market","side":"right","size":"m","ratio":"1:1","title":{"en":"Buy, sell & find jobs","ko":"중고거래·일자리, 한곳에서"},"adLabel":false,"visible":true,"audience":"all","imageUrl":"/images/home-banners/trade.webp","titleSize":"m"},
  {"id":"dibay-delivery","body":{"en":"Chicken, pizza, Korean food to your door","ko":"치킨·피자·한식까지 집 앞으로"},"href":"/stores","side":"left","size":"m","ratio":"1:1","title":{"en":"Food delivery with DIBAY","ko":"필리핀 맛집 배달, 디바이로"},"adLabel":false,"visible":true,"audience":"all","imageUrl":"/images/home-banners/delivery.webp","titleSize":"m"}
]
```

## 새 banners (기본값 `DEFAULT_HOME_LAYOUT.banners` 와 같은 내용)
정보 공유(`/philife`) · telRING(`/community-messenger?section=chats`) · DIPICK 배달(`/stores`) — 16:9 · 문구 ko/en = `lib/i18n/catalog/home-hub.ts` `home_banner_*`.

## 교체 SQL (배포 확인 후 1회 실행 · 0행이면 중단)
```sql
begin;
update public.admin_settings
set value_json = jsonb_set(value_json, '{banners}', $json$[
  {"id":"dibay-info","imageUrl":"/images/home-banners/hero-info.jpg","ratio":"16:9","size":"m","side":"left","titleSize":"m",
   "chip":{"ko":"정보 공유","en":"Community"},
   "title":{"ko":"필리핀 사는 한국인,\n정보는 여기서","en":"Koreans in the PH,\nstart here"},
   "body":{"ko":"비자·병원·맛집까지 교민이 직접 나눠요","en":"Visas, clinics, food — tips from neighbors"},
   "ctaLabel":{"ko":"정보 보러 가기","en":"Read tips"},
   "href":"/philife","audience":"all","visible":true,"adLabel":false},
  {"id":"dibay-messenger","imageUrl":"/images/home-banners/hero-telring.jpg","ratio":"16:9","size":"m","side":"left","titleSize":"m",
   "chip":{"ko":"telRING","en":"telRING"},
   "title":{"ko":"안심 메신저 telRING,\n통화는 무료","en":"telRING —\nsecure & free calls"},
   "body":{"ko":"보안 채팅부터 영상통화까지 무료로 연결해요","en":"Secure chat and video calls, free"},
   "ctaLabel":{"ko":"무료 통화 시작","en":"Call free"},
   "href":"/community-messenger?section=chats","audience":"all","visible":true,"adLabel":false},
  {"id":"dibay-delivery","imageUrl":"/images/home-banners/hero-delivery.jpg","ratio":"16:9","size":"m","side":"left","titleSize":"m",
   "chip":{"ko":"DIPICK 배달","en":"DIPICK Delivery"},
   "title":{"ko":"오늘 저녁, 동네 맛집이\n집 앞까지","en":"Tonight's dinner,\nat your door"},
   "body":{"ko":"치킨·한식·피자, 주문부터 도착까지 앱에서 확인","en":"Chicken, Korean, pizza — track it in the app"},
   "ctaLabel":{"ko":"지금 주문하기","en":"Order now"},
   "href":"/stores","audience":"all","visible":true,"adLabel":false}
]$json$::jsonb),
    updated_at = now()
where key = 'home_layout' and updated_at = '2026-11-14 01:11:28.654969+00';
-- 1행 확인 후 commit, 0행이면 rollback·중단
```

## 실행 결과 (2026-11-18 PHT)
| 단계 | 시각 | 결과 |
|---|---|---|
| 배포 확인 | 12:04~12:05 | PR #463 배포 `dpl_4dQ4SAsZ9DmaL464ngxDx2ZfTotd`(SHA 3c184b5) READY · `samarket.vercel.app/images/home-banners/hero-{info,telring,delivery}.jpg` 200 |
| 교체 UPDATE | 12:05:11 | 1행 · 새 revision `2026-11-18 04:05:11.642389+00` · `md5(value_json - 'banners')` = `a31461ac…` (교체 전과 같음) |
| 운영 API 확인 | 12:06:04 | `/api/home/layout` 배너 3종 16:9·문구 반영. **작업자 결함**: 영어 서비스 표시 「DIPICK Delivery」(15자)가 12자 제한에 잘려 「DIPICK Deliv」 |
| 정정 UPDATE | 12:06:27 | `banners[2].chip.en` = 「DIPICK」 · revision `04:05:11.642389` 조건 1행 · 나머지 칸 md5 같음 · 새 revision `2026-11-18 04:06:27.975101+00` |
| 코드 기본값 정정 | — | `home_banner_delivery_chip` en = 「DIPICK」 + 기본 문구 길이 검사 테스트 (PR fix/home-banner-chip-en) |
| 정정 UPDATE 2 | 12:08:51 | 영어 설명 2건 40자 초과 잘림(작업자 결함) → 「Visas, clinics, food — from neighbors」·「Chicken, Korean, pizza — track in app」 · revision `04:06:27.975101` 조건 1행 · 나머지 칸 md5 같음 · 새 revision `2026-11-18 04:08:51.025413+00` |
| WebKit FAIL | 12:10 | Owner Mac 앱(좁은 창) 배너 카드 높이 0 · iOS Safari(시뮬레이터 iPhone 17 Pro) 배너 그림 0 — 작업자 결함(Chrome 으로만 확인). 원인: `<button>` 카드 안 겹친 그림 + aspect-ratio 의존 → 카드 div(role=button)·padding-top 비율로 수정, 로컬 iPhone·iPad Safari 정상 확인 |
| 자동 넘김 | — | Owner 「계획대로 진행」(계획서 A2) — 4초 · 손가락/마우스·방금 넘김·화면 밖·앱 뒤 = 쉼 · 동작 줄이기 = 끔. 로컬 Chrome(390) 4초 간격 넘김·끝→처음, iOS 시뮬레이터 Safari 1/3→2/3 확인 |
