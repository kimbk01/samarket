# D2 · D3 · D9 — 구조 결함 영향 분석 (2026-11-19)

- 상위: `structural-defects-vs-legacy-2026-11-19.md` (D2 배지 재집계 · D3 실행/복귀 fan-out · D9 이미지 반복 다운로드)
- 상태: D9 **수정 PR 포함**(웹만, 기능 영향 없음). D2·D3 **설계 · Owner 결정 필요 항목 있음.**
- 증거: CODE(file:line, origin/main) · PROD(운영 DB 읽기 전용 · Supabase edge 로그 · 운영 API 응답 헤더 2회) · NOT_PROVEN

---

## D9 — 같은 사진을 1시간마다 다시 받음 (확정 · 이번 PR 에서 수정)

| 항목 | 증거 |
|---|---|
| 사진 1장(`post-images/78d2…/1793366497700-9e8710c5`)이 하루 **4가지 형태**로 요청됨: 변환 `render/image …?width=360` 275 · `.feed.webp` 187 · 원본 22 · `.detail` 4 | PROD edge 로그 11-18 |
| 기기 8~14대에서 1장당 하루 수십 회 | 같은 로그(ip·UA 수) |
| 응답 `cache-control: public, max-age=3600` (1시간) | PROD GET 2회 |
| 저장 메타 `post-images` **9,063개 = max-age=3600**, 431개 = 1년 | PROD `storage.objects` |
| 원인: `uploadPostImageWithDerivatives` 호출처 5곳 중 거래 글·매장 후기·운영자 가져오기가 `cacheControl` 을 넘기지 않아 Storage 기본 3600 저장(커뮤니티 2곳만 1년) | CODE `lib/media/canonical-image-upload.server.ts:123-150`, `app/api/posts/upload-image/route.ts:82` |

**수정(이번 PR):** `uploadPostImageWithDerivatives` 기본값 = 1년(`31536000`). 5곳 모두 경로가 매번 새 `randomUUID`·`upsert:false` → 같은 주소 내용 불변 → 1년 캐시가 안전. 새 업로드부터 적용.

**남은 것(별도 결정):**
1. 기존 9,063개는 1시간 그대로 — 메타만 바꾸려면 Storage 객체 재업로드(복사)가 필요. 운영 저장소 일괄 작업 → Owner 승인 사안.
2. 한 사진을 변환 URL(`render/image`, 이미지 변환 요금 대상)과 저장 파생본(`.feed.webp`) 두 경로로 그림 → 화면별 1형태로 통일(설계 필요, 거래 목록 화면 계약 확인).

---

## D3 — 실행·복귀마다 같은 설정을 매번 서버·DB 에서 받음

### 운영 실측으로 확정한 전제
- **Vercel 에서는 라우트가 지정한 Cache-Control 이 적용되고 CDN 이 캐시한다.** `/api/philife/neighborhood-topic-options`(라우트가 `public, s-maxage=20` 지정) 1회차 `x-vercel-cache: MISS` → 2회차 `HIT, age 6`. `next.config.js` 의 `/api/:path*` no-store 규칙은 Vercel 에서 라우트 헤더를 덮지 않는다(자체 `next start` 에서는 덮는다 — CODE `resolve-routes.js:510-528`, 운영과 무관). → **config 수정 불필요.**

### 대상 (CODE · 하위 조사)
| 경로 | 회원별? | SB/회 | 지금 캐시 | 어드민 저장 시 무효화 |
|---|---|---|---|---|
| `/api/app/startup-config` | 아님 | 1 | 없음(no-store) | 없음 |
| `/api/app-settings` | 아님 | 1 | 없음 | 없음 |
| `/api/app/main-bottom-nav` | 아님 | ~0(서버 300s) | HTTP no-store | revalidateTag 있음 |
| `/api/app/notification-sound-ssot` | 로그인 필요·내용 공통 | 1+3 | 인스턴스 60s | 인스턴스만 |
| `/api/launch-intro/live` | 아님 | 3~4 | **계약상 no-store**(일시정지·게시중단 지연 금지) | RPC·revision |
| `/api/support/category-settings` | 아님 | 1 | 60s(지정) | 없음 |
| `/api/philife/neighborhood-topic-options` | 아님 | 1~3 | CDN 20s(지정·동작 확인) | 메모리·path |
| 클라이언트 `categories` 직접 조회 | 아님 | REST 1 + **CORS 사전 1** | 없음(화면 붙을 때마다) | 없음 |
| `/api/platform-popup/resolve` · `/api/moim` · `/api/home/store-menus` | 회원별/인증 | 2~10 | 일부 | — |

PROD: startup-config·app-settings·main-bottom-nav 하루 각 약 830건(= 실행 수), `categories` GET 2,287 + OPTIONS 1,559.

### 설계 (레거시 L4·L7)
1. **공통 설정 1개, 버전 URL, CDN 영구 캐시**: `GET /api/public/boot-config?v=<cfgVersion>` = startup-config + app-settings + main-bottom-nav + 소리 자산 + 고객센터 분류 + 동네 주제 + 거래 categories. `Cache-Control: public, s-maxage=31536000`(버전마다 새 URL). 언어 무관 응답(ko·en 함께 담음 → CDN 언어 섞임 없음). 클라이언트 `credentials:"omit"` + proxy 회원 확인 제외 경로 → 서버·DB 비용 0.
2. **버전**: `admin_settings.public_config_version` 1행. 위 설정을 저장하는 어드민 경로 전부에서 같은 함수로 +1 — **누락 경로가 있으면 영구히 옛 값**이 남으므로 저장 경로 전수를 정적 테스트로 고정.
3. **복귀 확인**: 이미 DB 를 쓰지 않는 `/api/app/web-version` 응답에 `cfgVersion` 을 실어, 다를 때만 1을 다시 받음.
4. **회원별 시작 데이터**: 기존 프로필 부팅(`lib/app-boot/run-app-boot.ts`)을 넓혀 팝업 첫 결과 등 회원별 값만 1회(인증 1회).
5. 옛 경로 10개는 유지하되 같은 서버 캐시를 공유(옛 번들·네이티브 셸 `local-runtime-markup` 호환). 제거는 요청 수 확인 뒤.

### Owner 결정 필요 (규정 7번 — 기존 계약과 충돌)
1. **launch-intro**: 승인된 계약이 `no-store`(일시정지·게시중단 즉시 반영). 공통 설정 묶음에 넣으면 「버전 올림 → 다음 복귀 확인」까지 지연이 생긴다. 권장: launch-intro 는 묶음에 넣지 않고 `revision` 만 복귀 확인에 실어, 바뀌었을 때만 `/live` 호출(지연 0 유지, 매 복귀 호출만 제거).
2. **알림 소리 설정의 로그인 요구 해제**: 내용은 공개 자산 URL 이지만 로그인 필요로 둔 근거를 찾지 못했다(UNVERIFIED). 권장: 공개로 전환(회원별 값 없음).

예상(산술·NOT_PROVEN): 실행당 공통 설정 6~8회 + categories 약 2.7회(+CORS) → CDN 1회(서버·DB 0) + 회원별 1회.

---

## D2 — 배지 숫자를 읽을 때마다 원본 6~10곳에서 다시 집계

### 지금 (CODE)
- `badge-count` = `buildDomainBadgeAuthorityHttpPayload`(`build-domain-badge-authority-http.ts:176-194`) — participants·rooms·store_orders·stores·notification_events(부재중·벨 2,000행)·RPC `count_notification_events_badge`·매장별 오너 RPC → 보통 **7~10회**(운영 7.6과 일치). 서버 캐시 0(2026-08-01 LOCK).
- 쓰기 시점 카운터 **없음**: `participants.unread_count` 는 있지만 「안 읽은 방 수」·벨 A 는 매번 재집계. `hub_badge_user_unread_counters` 는 5초 TTL 읽기 캐시(쓰기 카운터 아님), 데이터 초기화가 DELETE.
- 호출: 실행 · 45초(dirty) · **복귀마다 fresh** · `notification_events` Realtime · participants Realtime · 홈/읽음 약 20곳 → **메시지 1건 수신에 fresh 재집계가 여러 번** 나갈 수 있다(횟수 UNVERIFIED).
- 숫자를 Realtime 으로 밀어 주는 경로 없음 — Realtime 은 「다시 물어보라」 신호만.
- 이미 어긋날 수 있는 곳: `community_messenger_unread_room_count` 원본 RPC 가 `left_at`·`deleted_at`·phantom 을 빼지 않아 badge-count 의 B 와 정의가 다르다.

### 설계 (레거시 L3 — 쓸 때 계산, 읽을 때 1행)
- 새 표 `member_badge_counters(user_id PK, b_general_rooms, b_group_rooms, b_trade_rooms, b_customer_order_rooms, b_owner_order_rooms, a_member_unread, orphan_missed_unread, version, updated_at)`. (`hub_badge_user_unread_counters` 는 TTL upsert·초기화 DELETE 경로가 있어 섞지 않음 — 상위 문서의 「확장」 문구와 다른 선택, 이유 명시)
- **트리거(원래 쓰기와 같은 트랜잭션)**: participants `unread_count·left_at` 0↔>0 전환 ±1 · rooms `deleted_at·last_message` 변화 시 참가자 재계산 · notification_events `unread·read_at` 전환 ±1(A 자격은 INSERT 때 판정해 저장).
  - `unread_count` 를 쓰는 곳이 SQL RPC 약 10개 + TS 직접 UPDATE 여러 곳 → **RPC 안이 아니라 표 트리거여야** 어긋나지 않는다.
- 읽기: RPC 1개 PK 1행. 응답 JSON 필드·공식(A+B, B 합)은 그대로 → 클라이언트 호환.
- 전달: 서버 broadcast(메신저 Realtime 정책 「서버만 발행」과 일치)로 숫자+version → 복귀·Realtime 신호 때 재집계 제거.
- 순서: ①표·백필 ②트리거+전체 재계산(한 트랜잭션) ③**그림자 비교**(기존 계산과 카운터를 함께 기록, 불일치 0 확인) ④읽기 전환 ⑤읽음 ACK 교체(room-read 19 · PATCH 15.4 감소) ⑥Realtime 전달 ⑦초기화를 재계산으로 ⑧예산 7.7 낮춤.

### Owner 결정 필요
1. **LOCK 재개봉**: `domain-badge-read-ack.ts:1-9`(P3-a 「Builder/Projection/Boot/Poll 변경 금지」), `build-domain-badge-authority-http.ts:15-18`(P2 「RoomUnread writer 재개봉 금지」)를 연다. 근거 = 이 문서 + 규모 결함.
2. 클라이언트가 쓰는 `missedCallByRoom`·`unresolvedMissedCallIds` 는 카운터로 줄 수 없음 → 가벼운 조회 유지 vs 계약 변경.
3. 운영 DB 적용 ①②(트리거 설치·백필, 쓰기 잠깐 잠금 — 시간 UNVERIFIED).

---

## 진행 순서 제안
1. **D9 (이번 PR)** — 새 업로드 1년 캐시. 기능 영향 없음.
2. **D3** — 위 결정 2건 후 공통 설정 1개 + 버전 확인. 웹만, DB 1행.
3. **D2** — LOCK 재개봉 승인 → 그림자 비교까지 먼저(동작 변화 없음) → 일치 확인 후 전환.

---

## D9 후속 — 내정보 「임시 데이터 삭제」 (Owner 「권장안대로」 2026-11-19)

### 확인 결과 (CODE)
- 화면: 내정보 → 설정 → 임시 데이터 삭제 (`/mypage/section/settings/cache`, `lib/mypage/mypage-ia.ts:250`) — 연결·동작함.
- 실제 삭제: `client-cache-key-registry.ts` 에 등록된 목록·화면 저장 키 + 브라우저 Cache Storage(`clearBrowserCacheStorageBestEffort`). Cache Storage 는 **앱 시작 화면 인트로 미디어만** 사용(`lib/launch-intro/cache.ts`).
- **FAIL(문구)**: 「이미지 임시 데이터」를 지운다고 안내했지만 게시글·채팅 사진(WebView HTTP 디스크 캐시)은 지우지 않음. 웹 코드로는 지울 수 없고, Android·iOS 네이티브에도 지우는 코드 없음.
- 레거시(카카오톡·텔레그램류, 공개 동작 기준): 저장공간 용량 표시 + 사진·미디어 캐시 실제 삭제.

### 1단계 (이번 PR · 웹만)
- 문구를 실제 동작에 맞춤: 지우는 항목 「시작 화면 이미지·영상」, 설명 「목록·화면 임시 데이터와 시작 화면 이미지」, 지우지 않는 항목에 「게시글·채팅 사진(휴대폰이 자동으로 정리해요)」 추가(WebView 디스크 캐시는 시스템이 용량 한도로 오래된 것부터 정리).

### 2단계 (다음 네이티브 빌드 · 설계)
| 항목 | 내용 |
|---|---|
| Android | Capacitor 플러그인 메서드 `clearWebMediaCache()` → 메인 스레드에서 `bridge.getWebView().clearCache(true)` (디스크 포함). `getWebCacheSize()` = `context.cacheDir` 아래 WebView 캐시 디렉터리 용량 합 |
| iOS | `WKWebsiteDataStore.default().removeData(ofTypes: [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache], modifiedSince: .distantPast)` — 쿠키·로컬 저장소는 제외(로그인 유지) |
| 웹 | 플러그인이 있으면(앱 버전 판정) 「사진 캐시 n MB」 표시 + 삭제 실행, 없으면(구 바이너리·웹) 지금 1단계 화면 그대로 |
| 지키는 것 | 로그인 쿠키·로컬 저장소·작성 중 초안 유지(레지스트리 규칙 그대로) |
| 빌드 | Android `versionCode`·iOS 빌드 번호 1회 증가(`npm run native:prepare`), 실기기 확인 후 배포 |
