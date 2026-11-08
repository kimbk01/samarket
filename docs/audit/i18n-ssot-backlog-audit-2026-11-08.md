# 언어 SSOT — 발견 목록 감사 (2026-11-08 · Owner 「발견 목록 감사」) · Owner 「권장대로 승인」(B1~B6 순서·권장 결정) → 진행 중 (§4)

> 대상: `docs/audit/i18n-ssot-backlog-2026-11-08.md` L1~L21. 기준 = main `15c3a1c9c`, 재측정 19:10 PHT 전후(코드 검색·검사 스크립트·운영 DB 읽기 전용). 테스트 DB 조회 없음.

## 0. 먼저 보고 — 작업자 잘못 (새 발견 L22)

**S0 검사·S6 결과의 「언어 삼항 513 → 0」은 일부만 센 숫자였다.** 검사 규칙 `non-catalog-lang-ternary` 는 `lang === "en" ? "…" : "…"` 형태만 센다. 불리언 변수 형태 `ko ? "한국어" : "English"`(`const ko = lang !== "en"`)를 세지 않았다.

| 형태 (재측정) | 곳 | 비고 |
|---|---|---|
| `ko ? "한글…" : "…"` (큰따옴표) | **2,329** · 224파일 | 어드민 2,197 · **고객·사장님 132 (19파일)** · 통화 파일 0 |
| `ko ? '…'` / 템플릿 | 150 | 형태만 다름 |
| `en ? "English" : "한국어"` | 92 | 반대 방향 |

- 고객·사장님 상위: `lib/notifications/notification-destination-hint.ts` 23 · `components/business/owner/OwnerWalletHistory.tsx` 22 · `components/finance/FinanceTransactionDetail.tsx` 16 · `OrderMoneyChainView.tsx` 10 · `lib/support/support-status-label.ts` 9 · `OwnerStoreOrdersMobileBody.tsx` 9.
- 화면 영향: 이 형태는 ko/en 둘 다 들어 있어 **지금 화면 언어가 틀리지는 않는다**. 결함은 「문구 원본이 카탈로그 하나」(SSOT §3-1·§3-2) 위반과, 검사가 이 형태를 막지 못해 늘어날 수 있다는 것.
- 처리안: ① 검사 규칙을 불리언 형태까지 세도록 보강 + 현재 수로 기준선(늘면 실패) ② 고객·사장님 132 → 키 이관(S6 방식) ③ 어드민 2,197 → 도메인별 이관(양이 커서 화면 묶음 단위).

## 1. 항목별 감사

| # | 지금 상태 (재측정) | 판정 | 처리안 | Owner 결정 |
|---|---|---|---|---|
| L1 | S1 처리 | **완료** | — | — |
| L2 | `DEFAULT_APP_LANGUAGE = "ko"` 78줄·33파일, 그중 함수 매개변수 기본값 31 | 남음 — 언어를 안 넘긴 서버 호출은 한국어(SSOT 기본은 en) | 31개 호출부 전수 확인 → 언어를 넘기게 하거나, 받는 사람 언어 함수로 교체. **기본값만 en 으로 바꾸면 지금 한국어로 나가는 곳이 영어로 바뀜** → 호출부별 확인 후 | 필요 없음(계약대로) — 단 호출부 목록은 계획 보고 |
| L3 | S8-6 에서 처리(`7b9a409cf`) | **완료** | — | — |
| L4 | S1 처리 | **완료** | — | — |
| L5 | `media-errors.ts` Agora 설정 안내 문구 키는 남아 있음(개발자 안내가 화면 문구 자리) | 남음 · **통화 코드** | 통화 규정 단독 계획(증거·영향·승인) | 통화 계획 승인 |
| L6 | 「상품권」인데 영어가 「Gift」만인 고객·사장님 키 **52**(S4 때 100) | 남음 | 짧은 자리(탭·칩·배지 18자)는 「Gift」 허용 목록, 나머지는 「Gift certificate」 | **필요** — 짧은 자리 「Gift」 허용 여부 (권장: 허용 목록으로 허용) |
| L7 | 용어집 「정본 영어 필수」 검사 미도입(오탐) | 설계 결정으로 종료 | 금지어 검사 유지 — 추가 작업 없음 | — |
| L8 | 하단 탭 「배달」 en 은 이제 **Delivery**(해결). 한국어 「마이페이지」 고객 키 8 남음 | 일부 남음 | 8키 「내정보」로(용어집) | **필요** — 「마이페이지」→「내정보」 (권장: 바꿈) |
| L9 | 어드민 메뉴 4키 = 화면 값(「신고 처리함」「포인트 정책」「포인트·충전」「카테고리」) 유지 중 | 결정 대기 | 그대로 둠(화면에 보이는 값) 또는 이전 설계 문구로 | **필요** — 권장: 지금 화면 값 유지 |
| L10 | S5 처리 | **완료** | — | — |
| L11 | 통화 파일 `fallbackEn` 24곳 + 언어 삼항 남음(S6 에서 되돌림) | 남음 · **통화 코드** | L5 와 같은 통화 단독 계획 | 통화 계획 승인 |
| L12 | 어드민 UI 래칫 `mutatingQuietCta` 숨은 위반 10건(7파일) — S6 기록값, **이번에 재측정 안 함**(NOT_PROVEN) | 남음 | 어드민 UI 표준 범위 — 버튼 종류 수정 | 필요 없음(표준대로) |
| L13 | 한국어 전용 수량 「건」 — `{ko ? "건" : ""}` 형태 5곳(어드민 주문·상품권·고객센터) + 카탈로그 `admin_more_items_suffix` | 남음 | `{n}건` / `{n}` 수량 키로(치환값 포함) — L22 어드민 이관과 함께 | — |
| L14 | `admin_advertising`·`admin_promotion` 「광고·홍보」, `admin_delivery_store_list_promote` 「상위홍보」 | 결정 대기 | D-15(「홍보」 표기 정리)를 어드민에도 적용할지 | **필요** — 권장: 어드민도 적용 |
| L15 | 카탈로그 밖 `fallbackEn` **162곳·52파일**(기준선) — 변수 키 | 남음 | 키 후보 열거해 카탈로그에 넣고 대체 문구 삭제, 키 타입 좁히기. 통화 파일 제외 | — |
| L16 | `TRADE_ERROR_KO`(`TradeAdminKit.tsx:134`)·`EXTRA_ERROR_KO`(`TradePostDetailPage.tsx:183`)·`MEMBER_LIST_ERROR_KO` 한국어 고정 오류 표 | 남음 (S9 범위 밖이었음) | 오류 코드 → 카탈로그 키 | — |
| L17 | `check:i18n-hardcoded` **483** (영어 짝 없는 한국어 화면 문구, 어드민 비중 큼) | 남음 | 기준선화 후 도메인별 키 이관 — 고객·사장님 먼저 | — |
| L18 | iOS `ko.lproj` 「설정 > **DiBaY**」 2줄 — 앱 이름은 DIBAY | 남음 · **통화 권한 안내 문구(네이티브)** | 「DIBAY」로 2줄 수정 — 글자만, 통화 단독 커밋, 다음 일괄 빌드에 포함 | 필요 없음(사실 정정) — 통화 규정상 단독 커밋 |
| L19 | 통화 검사 6종 **여전히 실패**(19:10 PHT 재실행, 예 `call-authority-contract`: service.ts 표식 문장 없음) + Android 단위 3건 | 남음 · **통화** | 검사가 낡은 것인지 코드 결함인지 증거부터 — 통화 규정 계획 | 통화 계획 승인 |
| L20 | 운영 알림음 이름 70개 중 9개: 「오너 …」 5(`delivery_*_owner`), 「옛 관리자 공지」/「Legacy admin notice」, 「관리자 신고」/「Admin report」, 「모임 가입·승인·내보내기」→「Meeting」, 「게시글 조치·제재」→「Post action」 | 남음 · **운영 DB** | 제안 문구: 「사장님 신규 주문」/「New order (Owner)」 등 5, 「이전 관리자 공지」/「Admin notice (old)」, 「신고 접수」/「Report received」, 「Meeting join and approval」, 「Post actions and sanctions」 → 어드민 정식 경로로 저장 | **필요** — 문구 승인 + 운영 저장 승인 |
| L21 | 거래 채팅 이미지 저장값 「사진」「사진 n장」 그대로 | 남음 | 저장 미리보기를 종류 코드로 그리는 설계(목록·방 화면 표시 지점 전수) — 별도 계획 | 계획 승인 |
| **L22** | §0 | 남음 | §0 처리안 | — |

## 2. 권장 처리 순서 (승인 단위)

1. **B1 검사 보강** — L22 규칙(불리언 삼항) + L17 기준선. 화면 변화 0. (먼저 해야 이후 숫자를 증명)
2. **B2 고객·사장님 문구** — L22 고객·사장님 132 · L6 · L8 · L16(거래 어드민 오류 표는 B4) · L2 호출부.
3. **B3 저장 미리보기** — L21 (별도 설계 보고 후).
4. **B4 어드민** — L22 어드민 2,197 · L13 · L15 · L16 · L12 · L14 · L9 (도메인별 묶음).
5. **B5 통화 (통화 규정)** — L18(문구 2줄) · L5 · L11 · L19 — 단독 계획·승인·단독 커밋, 실기기 행렬.
6. **B6 운영 데이터** — L20 (문구 승인 후 어드민 저장).

## 3. NOT_PROVEN

- L22·L17 화면 영향은 코드 검색 기준 — 실제 화면 캡처 없음.
- L2 31곳이 실제로 한국어를 내보내는 호출 경로 수는 호출부 전수 전에는 모름.

## 4. 처리 결과

### B1 검사 보강 (Owner 「권장대로 승인」)
- `lib/i18n/quality/i18n-quality-rules.ts` 파일 규칙 2개 추가 — 늘면 실패, 줄면 기준선 갱신:
  - `non-catalog-bool-lang-ternary` (L22): `ko ? "한국어" : …`·`en ? "English" : "한국어"`, 따옴표 3종, 테스트 파일 제외 → 기준선 **3,119곳·255파일** (어드민 2,909 · 그 밖 210). §0 의 2,329 는 큰따옴표 `ko ?` 형태만 센 숫자.
  - `hardcoded-korean` (L17): `scripts/check-hardcoded-korean.mjs` 와 같은 4패턴 → 기준선 **486곳·66파일** (어드민 459 · 그 밖 27). 스크립트 483 과의 차이 3 = 검사 폴더 범위(검사는 `hooks`·`contexts` 등 포함).
- 기존 키 규칙 기준선 변동 0. 화면 변화 0.

### B2 고객·사장님 문구 (Owner 「권장대로 승인」)

**먼저 보고**
- L6 영어를 바꾸면서 정산 라벨 1개에서 「지급 대상(payable)」 뜻을 빠뜨렸다(「Gift certificate payout (net)」). 이 값을 고정한 테스트가 실패해서 발견했고, 「Gift certificate payable (net)」·「Gift certificate payable (net, paid via gift certificate payout)」로 정정했다.
- L6 은 영어 문구를 고정해 둔 테스트 2개(`lib/stores/commission/__tests__/stage2b-money-rails.test.ts`, `lib/gift-certificate/__tests__/notify-gift-transfer-cancelled.test.ts`)와 운영 QA 스크립트 2개(`scripts/qa/admin-gift-ui-smoke-close.mjs`, `owner-o16-production-390-smoke.mjs`)도 새 값으로 바꿨다.

| 항목 | 결과 |
|---|---|
| L22 고객·사장님 | 불리언 언어 삼항 **207곳 → 0** (22파일) — 화면 글자 ko·en 그대로, 새 키 196(copy-shell 55 · copy-owner 52 · copy-store 6 · copy-lib 83), 기존 키 재사용 6. 기준선 3,119 → **2,912** (어드민 2,909 + 시작 보호 스크립트 3). |
| 남긴 3곳 | `lib/startup/pre-hydration-guard-script.ts` — React 이전 인라인 스크립트라 카탈로그를 쓸 수 없고 진입 안정화(다른 작업) 파일. 손대지 않음 |
| 남긴 1곳 | `app/(main)/mypage/ads/feed-request/page.tsx` 약 499줄 — 영어 화면만 클라이언트 문장, 한국어 화면은 서버 메시지를 그대로 표시(한국어 짝이 원래 없음). 새 한국어 문장을 만들어야 해서 보류 |
| L6 | 「상품권」+「Gift」만이던 52키 → 「Gift certificate」(탭·칩·배지 자리 해당 0). 버튼 길이(22자) 때문에 `gift_u2_wallet_detail_cta` 만 「Certificate details」 |
| L8 | 한국어 「마이페이지」 8키 → 「내정보」 (영어는 이미 My page) |
| L2 | 서버 함수 31곳의 언어 기본값 「ko」 삭제(필수). 타입 검사로 찾은 누락 호출: **장바구니 배달 예상 시간 문구(`StoreCommerceCartPageClient.tsx`)가 영어 화면에도 한국어로 나오던 결함** → 화면 언어 전달로 수정. 그 밖: 검증 하네스 2곳(화면 아님, 이전 값 명시), 사용처 없는 래퍼 2개(언어 인자 추가·이름대로 ko 명시), 테스트 호출 34곳(이전 기본값 "ko" 명시), ETA 함수 매개변수 순서 정리 |

**검증**: typecheck 2종 PASS · eslint 변경 파일 오류 0 · vitest 관련 822파일 6,669 테스트 + 상품권·주소·가입 255파일 PASS(수정한 2개 포함) · `check:i18n-quality` 20/20 PASS.
**범위 밖 발견(보고만)**: `npm run verify:three-currency-product` 실패 — `components/admin/ads/AdminAdvertisingWorkspace.tsx` 에 「Business Cash」 표현. 이번 변경과 무관(파일 미변경), 통화(화폐) 용어 규정 영역.
**NOT_PROVEN**: 화면 캡처(로컬 로그인 필요 화면) — 반영 후 앱 재시작으로 확인.

### B3·L24·B6 (반영 완료)
- B3 `cd0996f9c`(설계 문서 §7), 주문 요약 옛 방 462개 채우기 보류(Owner 「지금은 두기」).
- L24 `f0cabd3b2` — 픽업 주문 완료 줄 판정을 주문 방식 우선으로(대화방·목록 모두), B3 임시 보호 제거.
- B6 `2c613dc7a` — 알림음 이름 9개 운영 DB(20:23 PHT, 이전 값 일치할 때만) + 코드 기본값 동일.

### B4 어드민·남은 문구 (Owner 「남은 부분은 모두 완료 해라」)
| 규칙 | 전 | 후 | 남은 것 |
|---|---|---|---|
| `non-catalog-bool-lang-ternary` (L22) | 2,912 | **3** | `lib/startup/pre-hydration-guard-script.ts` — React 이전 인라인 스크립트, 진입 안정화(다른 작업) |
| `hardcoded-korean` (L17) | 486 | **18** | `components/dev/*` 개발 도구 화면 |
| `non-catalog-fallback-en` (L15) | 162 | **22** | 통화 파일 21(B5 계획) · 쓰는 화면이 없는 `CommunityMessengerFriendStatusBadge` 1 |
- 9개 묶음 병렬 이관, 새 카탈로그 9개(`copy-admin-b4-*`·`copy-lib-b4`, `messages.ts`·`message-key.ts` 등록), 새 키 약 3,000개. 화면 글자는 ko·en 그대로가 원칙.
- **화면 글자가 바뀐 곳(보고)**: 매장 배달 설정 저장 완료 영어에 매장 이름 추가 · 매장 대량 작업·샘플 삭제 영어 숫자에 천 단위 쉼표 · 배달 메뉴 4문장 영어에 메뉴 이름·개수 추가(한국어에만 있던 정보) · 어드민 메뉴 「광고·홍보」·「상위홍보」 → 「광고·상위노출」·「상위노출」(L14) · 어드민 용어 표 28개가 지금 화면 글자 그대로의 새 키로.
- L16 오류 표 3곳(`TRADE_ERROR_KO`·`EXTRA_ERROR_KO`·`MEMBER_LIST_ERROR_KO`)·커뮤니티 주제 오류 → 키(영어 포함). 영어 화면에서 운영자 오류 설명도 영어로(전에는 한국어 고정 `true`).
- L13 「건」 단위 → 수량 키. L12 래칫이 `t("키")` 버튼 글자도 판정 → 숨은 위반 10건(7파일) 실제 수정(변경 동작 버튼 ghost/quiet → secondary/danger). L9 지금 화면 값 유지.
- 검사기: `components/finance/Admin*` 를 어드민 화면으로 판정(운영 용어 허용 규칙 적용).
- 같이 고친 충돌: 묶음끼리 겹친 import 2·빠진 변수 1(타입 검사로 발견).

### L25 새 발견 (보고 — 계획 밖, 승인 후)
- 검사 규칙이 세지 않는 형태의 한국어 문자열이 어드민 코드에 **4,728개**(303파일 · `components/admin` 3,473 · `lib/admin` 1,188 · `app/admin` 67): `{ko, en}` 짝 표 947(영어 있음) · 속성·필드(`label:`·`description=`·`<option>` 등) 950 · 그 밖 문자열 2,831(로그·데이터 값 포함). 영어 어드민 화면에 한국어가 섞여 보이는 원인. 상위: `lib/admin/metrics/registry.ts` 207 · `AdminSentNotificationPanels.tsx` 173 · `ads-history/project-history-timeline.ts` 136 · 거래 회원·글·신고 상세 각 100+.
- 처리안: ① 「어드민 한국어 문자열」 검사 규칙 + 현재 수 기준선(늘면 실패) ② 화면 문구만 골라(로그·데이터 값 제외) 묶음별 키 이관 — B4 와 같은 방식. 감사·승인 후.
- 같이 보고된 기존 결함: `AdminPointAdjustPanel` 이 서버 `messageKo` 를 영어 화면에도 표시 · `admin_ad_applications_community_desc` 한국어 값이 테이블 이름(「point_promotion_orders 중 domain=community」)을 보여 줌 · `AdminMemberBenefitDetailPage` 확인 버튼 「비활성화/활성화」 한국어 고정 · 매장·광고·주문 화면의 `{ko,en}` 짝 표는 규칙 밖이라 그대로(영어 있음).

### B5 통화 (Owner 「B5·L25 모두 승인」) — 반영 `21ca6c967`·`4e368bcdb`·`adbda9fc9` (21:13 PHT, 통화만 단독)
- B5-1 iOS 「설정 > DiBaY」→「DIBAY」 2줄(새 빌드 필요). B5-2 변경 없음(화면 문구는 이미 사용자 문장).
- B5-3 통화 웹 대체 문구 23곳 삭제 — 49개 키 모두 카탈로그에 같은 문구(죽은 대체 문구), 화면 글자 변화 0, 통화 검사 14종 전후 동일. 남은 1곳 = 쓰는 곳 없는 `CommunityMessengerCallStatusBadge`.
- B5-4 이전부터 실패하는 통화 검사 7건 원인 판정(`docs/audit/i18n-b5-4-call-check-causes-2026-11-08.md`): **코드 결함 0**, 모두 의도된 코드 변경을 따라가지 못한 낡은 검사. 검사 갱신은 통화 승인 후. 6개 검사는 CI 에 연결돼 있지 않음.
- 실기기 통화 행렬: NOT_PROVEN(일괄 빌드 후).

### L25 어드민·남은 한국어 (Owner 「B5·L25 모두 승인」)
| 규칙(새로 추가) | 전 | 후 | 남은 것 |
|---|---|---|---|
| `admin-hangul-literal` (어드민 한국어 문자열, 짝 표·주석·로그 제외) | 4,026 | **138** | 서버로 보내는 값·DB 저장 값·상태 판정 문자열·금지어 목록·모의 데이터(화면 문구 아님) |
| `jsx-text-korean` (여러 줄 JSX 글자, 고객·어드민 전체) | 548 | **12** | `components/dev/*` 개발 도구 화면 |
- 7+3+1개 작업자, 새 카탈로그 10개(`copy-admin-l25-*`·`copy-ui-l25-jsx`), 새 키 약 4,500개. 공용 함수에 언어 인자 추가 + 호출처 30여 곳 화면 언어 전달, 한국어 상수는 키 짝을 만들어 화면에서 키로.
- 어드민 서버 문구: `lib/i18n/admin-server-language.ts` — 화면 언어 쿠키 → Accept-Language → ko(이전 동작). 어드민 API 오류·메시지가 요청 언어를 따름.
- **화면 글자가 바뀐 곳(보고)**: 영어 화면에 원시 코드 대신 라벨(배달 메뉴 링크 대상·피드 광고 목적지 유형 등) · 영어 확인 문구에 대상·이름·개수 추가(샘플 매장 삭제·다시 보내기·알림음 창) · 영어 확인어 「{n} items」(가져오기 일괄) · `global-error` 화면이 저장된 화면 언어로(첫 그림은 ko).
- **남긴 결정 1건**: 광고 이력 금액 라벨(`lib/admin/ads-history/project-history-timeline.ts`)은 한 칸만 있어 영어 화면에도 「{n} 포인트」 — 두 언어 칸을 만들려면 타입·화면 변경 필요.
- **범위 밖 기존 결함(보고만)**: `app/(main)/products/[id]/not-found.tsx` 가 서버 컴포넌트에서 `useI18n()` 사용(05-18부터) · 사장님 주문 패널에 앱 경로 「/stores/owner」 노출 · 고객 「제안」 빈 상태 안내에 「모달」 같은 시험용 표현.
