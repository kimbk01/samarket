# 레거시 용어 정리 — 재감사·설계안 (2026-11-13 · 보고만)

- 기준 main: `748845308` (#233 `a072e6f89`·#235 `ec184335c` 병합 후). 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 조회.
- 이 문서는 **보고만** — 코드·DB·PR 변경 없음. 되돌리기 브랜치 `fix/legacy-terms-scope-revert` 는 미커밋 그대로 멈춤.

## 0. 지시 원문과 승인 흐름

| 순서 | Owner 지시 | 승인 범위 |
|---|---|---|
| 1 | 「배민·배달의 민족·당근·텔레그램·페이스북·마켓플레이스·스타벅스 등 레거시 용어 … 기능을 건드리는 부분이 아닌 정확히 레거시 용어 참조 등이 남아 있는 부분을 전체 감사해서 삭제 가능과 삭제 불가 등을 구분해서 보고」 | **감사·보고만** |
| 2 | 「1번 진행」 | 보고서 권장 묶음 PR1 = B·C·D·E·F + G(통화 밖 이름) |
| 3 | 「2번 묶음 Facebook 로그인 제거도 진행」·「DB 적용하고 바로 PR」 | PR2 = H·I (운영 DB 적용 포함) |
| 4 | 「지랄한 건 되돌리고 처음부터 다시」 | 내가 보고한 범위 밖 항목 되돌리기 |
| 5 | 「계획대로 진행」 | 계획 1~4 (되돌리기 마무리·DB 파일 동기화·검사·PR·정리) |
| 6 | 지금 | 재감사·설계안 보고만 |

## 1. 작업자 잘못 (사실)

1. **설계 단계 위반** — 지시는 「용어 참조 삭제」인데, 내 감사 보고서가 용어가 아닌 삭제를 권장: 배터리 패널 절 통째 삭제, 안 쓰는 코드 삭제(D), 샘플 SQL 삭제(L).
2. **계획 밖 구현 병합 (#233)** — 샘플 SQL 3개·npm 스크립트 삭제(PR1 계획에 L 없음), 문서·규칙 이름 변경 8 + 경로 수정 11(PR1 계획에 O 없음, 통화 문서 1개 포함), 테스트 단언 1개 삭제, 색 검사 정규식 축소, **지시 목록 밖 용어 삭제**(카카오·Kakao 17줄, LINE 1줄, ATTRIBUTION 의 카카오·LINE).
3. **계획 밖 운영 DB 변경 (#235)** — 주석에서 Discord·Kakao 까지 삭제.
4. **땜빵 치환** — 지시 용어를 지우는 대신 뜻 없는 대체어(「참고 앱」「메신저 표준」「배달 표준」「reference messenger」 등)를 기계적으로 넣음: **200줄** (§4).
5. **미이행** — `lib/auth/`·`lib/admin-users/` 를 Facebook 줄 회피용으로 검색에서 통째 제외해 지시 용어 주석 6개 파일을 놓침 (§3).
6. **틀린 보고** — 범위 밖 목록에서 카카오 17줄·문서 수정을 빠뜨렸고, 계획(H) 안 항목인 `graph.facebook.com` 을 범위 밖이라 잘못 보고 → 되돌리기 브랜치에서 계획 안 항목까지 되돌림.
7. **승인 없는 운영 DB 변경** — 「계획대로 진행」 범위(계획 1~4)에 없던 `20271114220000`(Kakao 주석 복구)를 운영에 적용.
8. 구현 오류(병합 전 수정): 이름 충돌 `blockUser`, 한글 치환 조용히 실패, 잘못된 문구 「피드형 업데이트」. 영어 응답·긴 중간 보고·병합 결과 보고 지연.

## 2. 현재 main 에 남은 지시 용어 (배민·배달의 민족·당근·텔레그램·페이스북·마켓플레이스·스타벅스)

| 영역 | 줄 | 판정 |
|---|---|---|
| 일반 코드 | 15 | 미이행 6줄(§3) · 유지 9줄(아래) |
| 통화 웹 코드 (파일 69개, 모두 실제 통화 경로) | 214 | 보류 — 통화 규정·Owner 11-12 「통화 손대지 않음」 |
| 네이티브 | 70 | 보류 — 통화 lane 키·설치 앱 호환, Manifest 주석은 네이티브 빌드 때 |
| 마이그레이션 | 49 | 주석 24줄 정리 가능(S5) · 실행문 25줄 수정 불가(§8) |
| 문서 `docs/` | 996 | 앱 미포함 — 계획 밖(지시 없으면 그대로) |
| 규칙 `.cursor/` | 13 | 앱 미포함 — 계획 밖 |

유지 9줄(근거): `iosFacebookInApp`(인앱 브라우저 감지 기능·테스트 2), `forbiddenBrandNotes`·`verify-design-system-hard-lock`(금지 색 검사 4), `NEXT_PUBLIC_TELEGRAM_LIST_AUTHORITY_LOG`(Vercel 환경변수 이름 1), `package.json` 의 마이그레이션 파일 경로 2(파일명 변경 불가), `scripts/_encoding_convert_result.json`(과거 실행 결과 1). `AGENTS.md:100`(Owner 규정 원문) 은 수정 대상 아님.

## 3. 지시 미이행 (main, 지시 용어 그대로 남음)

| 위치 | 현재 |
|---|---|
| `lib/admin-users/admin-permissions.ts:2` | 당근 운영 분석 기준 관리자 권한 라벨·그룹 |
| `lib/auth/dibay-public-id-ssot.ts:2` | 카톡·텔레그램식 단일 정의 |
| `lib/auth/dibay-session-policy.ts:40` | Telegram/Kakao-style persistence |
| `lib/auth/logout.ts:4` | (카카오·배민·당근형 모바일 정책) |
| `lib/auth/oauth/use-oauth-login.ts:4` | (배민·당근 스타일 인라인) |
| `lib/auth/pc-qr-login/pc-qr-login-contract.ts:6` | 텔레그램·왓츠앱처럼 앱 안 스캔 |

모두 주석. 원인: 검색에서 폴더 통째 제외.

## 4. 땜빵 치환 (main, #233 이 넣은 대체어 200줄)

| 대체어 | 줄 |
|---|---|
| 배달 표준 | 34 |
| 참고 앱 | 27 |
| 메신저 표준 | 23 |
| Domain list authority / domain list authority | 21 |
| messenger-standard / Messenger-standard | 18 |
| reference messenger | 14 |
| 참고 메신저 | 11 |
| 단계형 | 10 |
| delivery reference | 9 |
| 피드형 | 6 |
| one-way contact | 4 |
| brand green / 브랜드 그린 | 6 |
| 그 외(허브 동기 이동형·표준형·기본형·배달 앱 수준·거래 앱 수준·거래 표준형·PC 메신저형·한쪽만 정리·간편결제) | 17 |

문제 유형:
- **없는 개념을 만들어 넣음** — 「배달 표준」「메신저 표준」「messenger-standard」: 그런 기준 문서가 없음. 관리자 화면 노출 1건: `copy-admin-b4-stores.ts:358` 「배달 표준 구조로 구성합니다」.
- **뜻이 바뀜** — 「당근페이」→「간편결제」(`features/[slug]/page.tsx` TODO), 「텔레그램식 한쪽 연락처만 삭제」→「한쪽만 정리 방식 한쪽 연락처만 삭제」(중복 문장, `service.ts`).
- **빈 자리 채우기** — 「참고 앱 실측」「reference messenger:」「delivery reference #1」: 용어만 지우면 되는데 대체어를 넣음.
- 정상으로 보는 것: 「Domain list authority」(검사 스크립트 표식과 함께 일관 변경), 「단계형 전화 인증」, 「피드형 배치」, 관리자 「기본형 · …」 라벨.

전체 200줄 목록: 부록 A.

## 5. 운영 DB 상태

| 마이그레이션 | 내용 | 운영 | main 파일 | 승인 |
|---|---|---|---|---|
| `20271114200000` | Facebook 행 2·CHECK 6·주석 5 | 적용 | 있음 | 승인(지시 3) — 단 주석 Discord·Kakao 삭제는 범위 밖 |
| `20271114210000` | Discord 주석 복구 | 적용 | **없음** | 지시 4(되돌리기) |
| `20271114220000` | Kakao 주석 복구 | 적용 | **없음** | **미승인** (지시 5 범위 밖) |

현재 운영 주석: `pinned_message_id` = 「P1: single pinned group message (Kakao pin).」, `community_messenger_message_requests` = 「DEPRECATED — Discord-style message request archive. …」. 지시 용어 포함 주석 0.

## 6. 되돌리기 브랜치 (`fix/legacy-terms-scope-revert`, 미커밋)

| 내용 | 판정 |
|---|---|
| 배터리 절·번호·상수 복구(지시 용어만 뺌) | 되돌리기 지시 대상 |
| `COMMUNITY_FEED_LIST_SKIN_LABELS` 복구(「기본형」) | 되돌리기 지시 대상 |
| 샘플 SQL 3개·npm 스크립트 복구(파일·스크립트 이름의 dangnae 만 바꿈) | 되돌리기 지시 대상 |
| 테스트 단언·색 검사 정규식 원복 | 되돌리기 지시 대상 |
| 카카오·Kakao·LINE 18줄 원문 복구 | 되돌리기 지시 대상 |
| `docs/community-dangnae.md` 경로 1곳 | 계획 1 |
| 마이그레이션 파일 `210000`·`220000` | DB 와 파일 동기화 |
| **`graph.facebook.com` 원복** | **잘못** — 계획(H) 안 항목, 틀린 보고로 되돌림 |
| i18n 기준선 | 복구 문구 수에 맞춤 |

로컬 검사(이 트리): eslint·typecheck:build·typecheck:test PASS, test:ci 1,560 파일 PASS.

## 7. 위험 실측 (2026-11-13)

| 위험 | 실측 방법 | 결과 | 처리 |
|---|---|---|---|
| 다른 세션 브랜치와 충돌 | 최근 3일 브랜치 16개를 `git merge-tree` 로 main 과 병합 시험, #233 이전 main(`283a1cd28`)과 비교 | 충돌 브랜치 6개 모두 **#233 이전부터 있던 충돌**, #233·#235 로 새로 생긴 충돌 **0** | S7 에서 새 PR 도 같은 시험 |
| 다른 작업 트리의 커밋 안 된 변경 | 작업 트리 7개, 겹치는 파일 3방향 병합 시험 | hub-keepalive `ConditionalAppShell.tsx` 1건 — #233 이전 main 에서도 같은 충돌(기존) | 내 변경 원인 **0** |
| 마이그레이션 주석의 옛 문서 경로 2줄 | 운영 `schema_migrations` 는 version·name 만 저장(statements 없음), `verify-prod-function-drift` 는 함수 본문(prosrc) md5 만 비교 | 함수 본문 밖 주석은 고쳐도 DB·검사 영향 **0** | S5 에서 경로 2줄 수정 |
| Supabase Auth Facebook | `/auth/v1/settings` 공개 조회 | `facebook: false` (google·kakao·apple·email true) | 위험 **0** |
| 이름 바꾼 CSS 변수·data 속성·컴포넌트를 앱 묶음·저장소 밖에서 참조 | android·ios·capacitor-www·windows·public·local-runtime HTML 검색, 운영 DB 설정 테이블 검색 | 옛 이름 참조 **0** | 위험 **0** |
| 운영 화면 회귀 | — | 측정 전 (NOT_PROVEN) | S8 실측으로 판정 |

## 8. 설계안 (Owner 승인 후에만 실행)

원칙: **지시 목록 용어 문자열만** 지운다. 대체어를 만들어 넣지 않는다 — 용어를 지워 문장이 성립하면 지우기만, 성립하지 않으면 그 비교 구절(괄호·「~처럼」)을 통째로 지운다. 구조·파일·테스트·설정·실행 SQL 은 바꾸지 않는다.

| 단계 | 내용 | 바뀌는 곳 | 영향 |
|---|---|---|---|
| S1 | 되돌리기 브랜치의 `graph.facebook.com` 원복을 취소 (계획 H 안 항목 유지). 나머지 되돌리기 그대로 | `config/image-remote-patterns.json` 1줄 | 없음 |
| S2 | 미이행 6줄(§3) 지시 용어만 삭제 | 주석 6줄 | 없음 |
| S3 | 땜빵 200줄(부록 A) 원칙대로 다시 씀. 정상 항목(Domain list authority 표식·단계형·피드형·기본형 라벨) 유지 | 주석 + 관리자 문구 1건(`copy-admin-b4-stores.ts:358` 「배달 표준 구조로」→「같은 구조로」 류) | 관리자 문구 1건 |
| S4 | 운영에 이미 적용된 마이그레이션 `210000`·`220000` 파일을 main 에 반영 | 파일 2 | DB 변경 없음 (적용 상태와 일치) |
| S5 | 마이그레이션 **주석 24줄**(함수 본문 밖)에서 지시 용어 삭제 + 옛 문서 경로 2줄을 새 경로로 | 마이그레이션 주석만 | DB·드리프트 검사 영향 없음 (§7 실측) |
| S6 | `docs/audit/legacy-brand-terms-audit-2026-11-13.md` 처리 결과 절을 실제와 맞춤(샘플 SQL 복구 등) | 문서 1 | 없음 |
| S7 | 검사: typecheck 2종 · test:ci · eslint · 관련 verify · **다른 브랜치 충돌 시험(§7 방법)** 1회 → PR 1개 → 자동 병합 | — | — |
| S8 | 병합 후 운영 실측 (Production SHA 기록, PHT): Samsung 실기기(adb, 앞 화면 확인 후) — 메신저 방 말풍선 색(`--cm-room-brand-*`), 배달 홈·메뉴 페이지 헤더, 장바구니, 거래 글쓰기 사진 영역(`variant=trade`), 주문 채팅 입력줄(`variant=dm`), 주소 목록 배지(`badgeStyle=brand`), 내 정보 관리자 행 / 관리자 화면 — 피드 스킨 라벨, 하단 탭 프리셋 라벨, 배터리 참고 패널, 로그인 설정 목록(Facebook 없음). 항목별 캡처를 증거로 PASS/FAIL | — | FAIL 이면 즉시 보고 |

수정 불가로 남김 (근거):
- 마이그레이션 **실행문 25줄**(CHECK·INSERT·COMMENT ON·DO 알림문) — 이미 실행된 SQL. 운영 DB 현재 상태엔 지시 용어 0.
- 마이그레이션 **파일 이름 5개** — 운영 기록(version·name)과 일치해야 함.
- 통화 웹 214줄·네이티브 70줄 — 통화 규정, 설치 앱 호환 키.
- 기능·검사용 9줄(§2), `AGENTS.md`(Owner 규정 원문).
- `docs/`·`.cursor/` 본문 1,009줄 — 앱 미포함, 지시 있을 때만.

남은 위험: **없음** — §7 의 각 항목 실측으로 0 확인, 운영 화면 회귀는 S8 실측으로 판정(측정 전까지 NOT_PROVEN).

## 부록 A — 땜빵 대체어 200줄 (main `748845308`)

| 위치 | 현재 줄 |
|---|---|
| `app/(main)/features/[slug]/page.tsx:15` | {/* TODO: feature 전용 페이지 - 혜택/간편결제 등 소개 구조 */} |
| `app/chat-viewport-shell.css:2` | * DIBAY CM room — messenger-standard flex shell. |
| `app/delivery-chat-room.css:5` | * 강한 초록은 전송·진행 rail 등 CTA 에만, composer 는 메신저 표준형 회색 pill. |
| `app/delivery-components.css:1448` | /** 매장 상세 메뉴 카테고리 — 배달 표준형 pill 탭 */ |
| `app/delivery-components.css:1585` | * 장바구니 비우기 — 배달 표준 가운데 확인 (전용, delivery-modal 과 분리) |
| `app/delivery-tokens.css:95` | /** 1단 헤더 아이콘 간 flex gap — 표준형 밀착 */ |
| `app/delivery-tokens.css:120` | /** 모달·시트 뒤 — blur 금지(흰 화면 뭉개짐). 배달 표준 반투명 딤만 — 1단 헤더 검색·알림: `.sam-tier1-header-overlay-backdrop` */ |
| `app/delivery-tokens.css:168` | /** PTR 힌트 — 배달 표준형 상하 여백 */ |
| `app/globals.css:1180` | * 배달 소비자 스택 안 이동(홈·메뉴 페이지·매장·메뉴 상세·장바구니·상품권)은 0.12초 (참고 앱 실측). |
| `app/messenger-presentation.css:2` | * DIBAY 메신저 presentation SSOT — 참고 메신저 반응형 밀도·전환 계약. |
| `app/messenger-presentation.css:8` | * - chat/direct ≈ 72dp (참고 메신저 landscape ~71.4dp 기준; portrait chat 재실측 N/A) |
| `app/messenger-presentation.css:36` | /* reference messenger selected row — soft light blue (not brand green soft) */ |
| `app/messenger-presentation.css:357` | * reference messenger: flat full-bleed room chrome (no inset rounded cards). |
| `app/messenger-presentation.css:393` | /** 참고 메신저 empty right — wallpaper only; pill CTA 비표시 */ |
| `app/messenger-view-transitions.css:42` | * iOS keyboard open — messenger-standard: page tracks visualViewport band. |
| `app/messenger-view-transitions.css:353` | * 제품: 참고 메신저 ~180ms · transform only (opacity fade 금지 — 1프레임 깜빡임 방지). |
| `app/samarket-components.css:2091` | /* DIBAY incoming — brand green surface (Web + native mirror reference) */ |
| `app/samarket-components.css:2138` | /* Popup — iOS-style vivid circles on brand card (banner/card stays brand green) */ |
| `components/business/apply/StorePhoneVerifySheet.tsx:22` | * 회원 전화 인증과 같은 모양(단계형): [국가번호 \| 번호] 한 줄 → [계속] → 6칸(6번째에서 자동 확인) → 완료. |
| `components/business/owner/OwnerBasicInfoBrandingHero.tsx:17` | /** 배달 표준 프로필 촬영 버튼 — 썸네일 우하단에 붙는 원형 배지 */ |
| `components/community-messenger/CommunityMessengerHome.tsx:656` | * Domain list authority: hub paint is always legacy bootstrap `data` (applyHomeListPatch). |
| `components/community-messenger/MessengerFriendProfileSheet.tsx:59` | * messenger-standard: 차단이 아니면 메시지·통화 가능. 친구 추가는 연락처 저장만. |
| `components/community-messenger/MessengerResponsiveShell.tsx:132` | * 768px+ — URL roomId 만 바꿔 우측 pane 에 route children 표시 (표준형, shell·목록 유지). |
| `components/community-messenger/MessengerSplitListPane.tsx:12` | * Domain list authority: trade/delivery MUST use Domain canary (same as mobile), |
| `components/community-messenger/MessengerSplitTopBar.tsx:19` | * 768px+ 표준형 — 좌측 목록 pane 너비에 뒤로·제목. |
| `components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx:212` | * Domain list authority: hydrated session cache → memory paint only. |
| `components/community-messenger/domain-shell-canary/__tests__/hub-pillar-domain-list-ssot-contract.test.ts:42` | expect(home).toContain("Domain list authority"); |
| `components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch.ts:105` | /** Cache miss only — never overwrite hydrated Domain list canary (Domain list authority). */ |
| `components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache.ts:13` | * Domain list authority: hydrated peek = memory paint; cold/empty/pull only fetch. |
| `components/community-messenger/friend-qr/MyFriendQrPanel.tsx:230` | * CTA 위계 (설계안 v3 §3.6 · 메신저 표준 QR 화면): 주 [공유] + 보조 [이미지 저장] 한 줄, |
| `components/community-messenger/group/GroupMentionText.tsx:44` | * Renders message body with @mention segments highlighted (brand green). |
| `components/community-messenger/group/GroupPinnedMessageBanner.tsx:12` | /** Messenger-standard single pinned notice strip above group timeline. */ |
| `components/community-messenger/home/CommunityMessengerHomeDetailEmpty.tsx:4` | * reference messenger tablet empty right: doodle wallpaper only — no CTA pill/text (recheck 2026-07-30b). |
| `components/community-messenger/room/MessengerChatImageBubble.tsx:200` | * 빈 칸(말풍선 배경색)이 번쩍이지 않게(메신저 표준과 동일하게 끊김 없이 교체). |
| `components/community-messenger/room/MessengerRoomNewMessagesBelowChip.tsx:11` | * messenger-standard jump-to-latest FAB (bottom-right). |
| `components/community-messenger/room/community-messenger-room-helpers.tsx:386` | /** 사진·스티커 단독 — 색 배경·말꼬리 없이 그린다(메신저 표준과 동일, 로드 전·전송 중 배경색이 비치지 않게). */ |
| `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx:1369` | /** 참고 메신저: measured virtualItems 만 — estimate fallback absolute paint 금지 */ |
| `components/community-messenger/room/phase2/__tests__/community-messenger-room-phase2-peer-notice-logic.test.ts:114` | it("PN-01: initiator stranger → add_contact (reference messenger Contact)", () => { |
| `components/community-messenger/room/phase2/__tests__/community-messenger-room-phase2-peer-notice-logic.test.ts:175` | it("does not hide add for initiator on general direct (reference messenger Contact)", () => { |
| `components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic.ts:81` | // reference messenger Contact: show Add\|Block for any non-friend general 1:1 (search or inbound). |
| `components/community/post-detail/PostImageGrid.tsx:9` | * 첨부 사진(본문에 넣지 않은 사진) — 피드형 배치. |
| `components/community/post-detail/__tests__/post-image-grid-render.test.tsx:26` | describe("PostImageGrid 렌더 (D1·D4 · 피드형)", () => { |
| `components/delivery/presentation/DeliveryPresentationShell.tsx:321` | * WP4 (D-3) — 배달 표준처럼 누르는 즉시 슬라이드. 데이터 전에는 매장 화면이 `StoreDetailQuickShell` |
| `components/layout/ConditionalAppShell.tsx:351` | /** PC(데스크톱 세로 레일) 메신저 — 본문 열 제한 없이 창 전체(PC 메신저형: 레일 \| 목록 \| 대화방). |
| `components/member-orders/MemberOrderTabs.tsx:25` | /** `feed`: 피드형 하단 강조선 탭 — 본문과 동일 폰트 스택 유지 */ |
| `components/moim/MoimCreateWizard.tsx:19` | /** 금지 모임 유형 안내 (설계 §2.5 · D10 — 참고 앱 27663 목록) */ |
| `components/mypage/__tests__/mypage-r4-screens.test.tsx:313` | describe("전화 인증 단계형 — 번호 → 6칸 → 자동 확인 → 완료 (Owner 2026-11-09)", () => { |
| `components/mypage/ds/MyStickyCta.tsx:35` | /** 변경이 있을 때만 주 버튼 활성 (v2.1 §3.2 · 메신저 표준 방식) */ |
| `components/mypage/profile/PhoneVerificationBox.tsx:96` | /** 단계형 단계 (Owner 2026-11-09): 번호 → (국가 목록) → 6칸 인증번호 → 완료 */ |
| `components/platform-popup/presentations/ArtworkModalPresentation.tsx:36` | * TYPE A — Artwork modal (delivery reference #1). |
| `components/platform-popup/presentations/PromotionCardModalPresentation.tsx:36` | * TYPE B — Promotion card modal (delivery reference #2). |
| `components/platform/AndroidPlayInAppUpdateHost.tsx:59` | * 단계형 전체 화면) from 「업데이트」 to install: intro → Play consent → 업데이트 준비 중… → |
| `components/platform/AndroidPlayUpdateScreen.tsx:28` | * Full-screen update screen (Owner 2026-11-03 · 단계형 전체 화면): one screen from 「업데이트」 to |
| `components/post/TradeDetailInlineChatCard.tsx:21` | /** 거래 상세 — 거래 표준형 인라인 메시지(카테고리 공통) */ |
| `components/product/detail/product-detail-bottom-constants.ts:9` | // --- 거래 상세(PostDetailView) 하단 — 거래 표준형 통일 (모바일·태블릿 동일 토큰) --- |
| `components/route-transition/route-transition-config.ts:148` | * 배달 소비자 스택(홈 ↔ 메뉴 페이지 ↔ 매장 ↔ 상품권몰) 슬라이드. 참고 앱 실측 3~4프레임 = 약 100~130ms |
| `components/stores/StoreGlobalCartEntry.tsx:17` | * 담긴 매장이 있으면 해당 매장 카트로 replace, 없으면 배달 표준 빈 장바구니(하단 5탭과 동일 레일). |
| `components/stores/StoreMenuBoardPreamble.tsx:9` | * 배달 표준 메뉴판 상단: 사장님 추천(가로) + 인기 메뉴(랭킹) — 카테고리 탭 위. |
| `components/stores/StoreMenuCategoryChips.tsx:13` | * 매장 메뉴 구역(배달 표준) — 가로 스크롤 카테고리 칩, 클릭 시 해당 섹션으로 스크롤. |
| `components/stores/StoreMenuReviewFlowLink.tsx:27` | * 배달 표준 패턴: 카테고리 탭 상단 — 리뷰 1건 카드(썸네일+별+본문) 우→좌 캐러셀 + 「사진 리뷰 더보기」. |
| `components/stores/StoreProductPublic.tsx:82` | /** WP7 — 담기 버튼 안 스피너를 보여 주는 시간(참고 앱 녹화 약 0.6초보다 짧게) */ |
| `components/stores/browse/StoresBrowseHeaderChrome.tsx:119` | {/* 참고 앱 — 스크롤하면 주소줄만 접히고 1단·3단·4단은 고정 */} |
| `components/stores/browse/StoresBrowseHeaderMenuTabs.tsx:48` | /** 참고 앱 실측: 밑줄 이동 약 150ms */ |
| `components/stores/cart/StoreCommerceCartCheckoutActionBar.tsx:49` | * 장바구니 하단 — 배달 표준 한 줄(결제금액 + 주문 CTA), 보조 안내는 최대 1줄. |
| `components/stores/cart/sections/StoreCartLineRow.tsx:134` | /* WP8 (Owner 승인 배달 표준형) — 최소 수량에서 🗑 를 누르면 확인 없이 바로 삭제 (이전 UI-15·S2-14 확인창 대체) */ |
| `components/stores/common/StoreProductThumbnail.tsx:29` | * 배달 표준 상품 썸네일 기준: |
| `components/stores/detail/PopularMenuSection.tsx:14` | * WP6 (배달 표준형 2차수 2026-10-29) — 인기 메뉴: 별도 순위 숫자 + 왼쪽 사진 레이아웃 제거. |
| `components/stores/detail/ProductMenuCard.tsx:32` | * WP6 (배달 표준형 2차수 2026-10-29) — 메뉴 행: 흰 카드 → 평면 목록 + 1px 구분선. |
| `components/stores/home/hub/StoresHomeCategoryStickyBelow.tsx:59` | /** WP3 (C2) — 홈에는 선택 상태가 없다 (참고 앱 홈과 같음). 아이콘을 누르면 바로 메뉴 페이지로 이동 */ |
| `components/stores/home/hub/StoresHomeQuickCategories.tsx:184` | * WP3 (C1·C2) — 배달 표준과 같이 홈 아이콘을 누르면 바로 해당 메뉴 페이지로 이동. |
| `components/stores/modifiers/StoreModifierPicker.tsx:11` | * WP7 (배달 표준형) — 시트·메뉴 상세 옵션: 필수 = 진한 알약(`--sam-fg` 배경·흰 글자), 선택 = 회색 알약. |
| `components/stores/modifiers/StoreModifierPicker.tsx:44` | /** 장바구니 시트: 피드형 리스트·포커스 블루 */ |
| `components/stores/product-detail/view/StoreProductDetailFooter.tsx:34` | * 상품 상세 하단 — 참고 앱 참고: 좌 최소주문·카트 소계 / 우 `{금액} 담기` |
| `eslint.config.mjs:7` | "Deleted (Domain list authority). Use Domain canary patch / applyHomeListPatch only."; |
| `eslint.config.mjs:104` | * Domain list authority — dual-write paint path deleted; forbid resurrection via import. |
| `eslint.config.mjs:114` | * (내정보 최종 설계 Part A §1.2, v2 §7.3). flat config 는 규칙 옵션을 합치지 않으므로 위 참고 메신저 제한을 함께 둔다. |
| `hooks/use-delivery-home-header-address.ts:20` | * `/stores` 홈 헤더 — 배달/대표 주소 세부 한 줄 (배달 표준형). |
| `hooks/use-is-messenger-split-viewport.ts:22` | /** 768px+ — 메신저 표준형 master-detail (모바일 full-page와 분리) */ |
| `lib/addresses/delivery-home-header-address.ts:52` | * 배달 홈 헤더 — 배달 표준 세부 주소 (동 + 사용자 상세). |
| `lib/chat-domain/list/__tests__/domain-list-authority.test.ts:3` | * Domain list authority — 12-item contract tests. |
| `lib/chat-domain/list/__tests__/domain-list-authority.test.ts:86` | describe("domain list authority mutation contract", () => { |
| `lib/chat-thread-scroll/constants.ts:7` | /** ↓ 버튼·메시지 이동 부드러운 스크롤 길이(ms) — 메신저 표준 체감과 비슷한 짧은 ease-out. */ |
| `lib/chat-thread-scroll/engine.ts:379` | * ↓ 버튼(최신으로) — 메신저 표준처럼 부드럽게 맨 아래까지. 매 프레임 하단을 다시 읽어 |
| `lib/chat-thread-scroll/engine.ts:477` | /** 멀리 떨어져 있으면 목표 한 화면 앞까지 먼저 건너뛴 뒤 부드럽게(메신저 표준 방식). */ |
| `lib/chats/trade-presence-rules.ts:9` | /** 마지막 접속 상호 숨김(메신저 표준 방식) */ |
| `lib/community-messenger/__tests__/friend-reject-block-policy-contract.test.ts:6` | * 1단계 문서 §14-5 (Owner 2026-10-25 승인, 메신저 표준 기준): |
| `lib/community-messenger/__tests__/messenger-presentation-contract.test.ts:18` | it("section transition is ~180ms transform-only (reference messenger band 150–250)", () => { |
| `lib/community-messenger/__tests__/messenger-presentation-contract.test.ts:134` | it("call slide SSOT stays in reference messenger short band", async () => { |
| `lib/community-messenger/friendship-resolver.ts:44` | /** UI·guard·group invite — viewer-local contact only (one-way contact). */ |
| `lib/community-messenger/friendship/__tests__/friend-contact-ssot-lock.test.ts:63` | * 이전의 「한쪽 연락처만 삭제(one-way contact)」 대신 친구 삭제 SSOT 로 양쪽 정리 + 대기 요청 닫기. |
| `lib/community-messenger/friendship/__tests__/friend-contact-ssot-lock.test.ts:71` | expect(body).not.toContain("one-way contact"); |
| `lib/community-messenger/friendship/list-community-messenger-friends-ssot.ts:2` | * Friend List read path — viewer-local contact only (one-way contact). |
| `lib/community-messenger/friendship/resolve-friendship-pair.ts:2` | * Friendship / Contact SSOT read resolver — messenger-standard unilateral contact. |
| `lib/community-messenger/group/group-room-mention-parser.ts:1` | /** @mention token parser — messenger-standard @nickname in group messages. */ |
| `lib/community-messenger/group/group-room-message-presenter.ts:10` | /** messenger-standard quote block for group timeline. */ |
| `lib/community-messenger/home-list-patch.ts:1084` | /** Domain list authority: hub paint is GD+group only — drop commerce domain rows. */ |
| `lib/community-messenger/home-return-timing.ts:8` | * consume 측: memory fresh 면 refresh/silent 전부 금지(Domain list authority). |
| `lib/community-messenger/home/messenger-home-room-leave-client.ts:91` | * S-2 H: 나가기 = 이 기기의 그 방 대화 사본을 모두 버린다(메신저 표준). 순서 고정: |
| `lib/community-messenger/home/refresh-messenger-home-social-client.ts:11` | *   (채팅 리스트 silent `refresh(true)` 금지 — Domain list authority). |
| `lib/community-messenger/home/use-community-messenger-home-bootstrap.ts:848` | * Domain list authority: hydrated hub chats/groups must not be rewritten by |
| `lib/community-messenger/home/use-community-messenger-home-bootstrap.ts:1676` | * Domain list authority — Room→list remount (blank-list root cause): |
| `lib/community-messenger/home/use-community-messenger-home-navigation.ts:42` | * ≥768 split list — 섹션 전환 시 `/rooms/[id]` 유지 (참고 메신저 우측 마지막 대화). |
| `lib/community-messenger/messenger-home-section-slide.ts:6` | /** 메신저 홈 2단 탭(친구·통화·대화·보관함) 본문 전환 — CSS animation 과 동기 (제품: 참고 메신저 ~180ms short slide+fade) */ |
| `lib/community-messenger/messenger-latency-config.ts:163` | * (메신저 표준: 힌트 채널 + 단일 스냅샷 동기화에 가깝게) |
| `lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts:458` | // DELETE 등 — silent full list catch-up 금지 (Domain list authority) |
| `lib/community-messenger/realtime/domain-room-state-store.ts:117` | * Domain list authority: hub tip mirror MUST go through projectRoomActivityToHomeList. |
| `lib/community-messenger/room/__tests__/messenger-room-first-unread.test.ts:284` | it("FAB action jumps to first unread once, then latest (reference messenger pagedown)", () => { |
| `lib/community-messenger/room/__tests__/messenger-room-p0-scroll-paint.test.ts:46` | it("uses direct layout for normal rooms (reference messenger contiguous flow)", () => { |
| `lib/community-messenger/room/__tests__/messenger-room-timeline-row-spacing.test.ts:5` | it("keeps call_stub stack tight and reduces gap before text (reference messenger service row)", () => { |
| `lib/community-messenger/room/messenger-composer-focus-after-send.ts:3` | /** Send·Enter 후 textarea blur 방지 — 메신저 표준: 키보드 유지 */ |
| `lib/community-messenger/room/messenger-room-entry-intent.ts:277` | * Enter = sole scroll policy decision (reference messenger benchmark contract): |
| `lib/community-messenger/room/messenger-room-first-unread.ts:2` | * First-unread entry boundary (messenger-standard). |
| `lib/community-messenger/room/messenger-room-first-unread.ts:162` | * reference messenger pagedown contract (ChatActivity.pagedownButton): |
| `lib/community-messenger/room/messenger-room-first-unread.ts:193` | /** Viewport has not reached the first-unread row yet → reference messenger createUnreadMessageAfterId jump. */ |
| `lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts:153` | * Single scroll authority for CM rooms (messenger-standard contract). |
| `lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts:405` | /** ↓ 버튼 — 메신저 표준처럼 부드럽게 맨 아래까지(매 프레임 하단 재계산). */ |
| `lib/community-messenger/room/messenger-room-timeline-paint-model.ts:18` | * messenger-standard: virtual 은 tanstack 측정 완료 + 이 임계 이상일 때만. |
| `lib/community-messenger/room/messenger-room-timeline-paint-model.ts:35` | * 타임라인 paint 단일 경로 — 참고 메신저 contiguous flow 기본(direct). |
| `lib/community-messenger/room/messenger-room-timeline-paint-model.ts:79` | * @deprecated render 금지 — estimate offset absolute 는 참고 메신저 gap 위반. |
| `lib/community-messenger/room/messenger-room-timeline-row-spacing.ts:30` | * messenger-standard timeline row spacing — platform-neutral (flex document flow only). |
| `lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts:360` | // messenger-standard Members · Online; typing wins in Header statusLine |
| `lib/community-messenger/service.ts:10602` | * (이전: 한쪽만 정리 방식 한쪽 연락처만 삭제 → 차단당한 쪽 목록에 친구로 남았다). |
| `lib/community-messenger/service.ts:10809` | * S-1 (Owner 2026-11-02) — 상대가 나간 일반 1:1 에 보낼 때 저장 직전 상대를 다시 참가시킨다(메신저 표준: |
| `lib/community-messenger/service.ts:10825` | /** messenger-standard general friend DM — sorted-pair `direct_key` only; trade/store_order 와 분리. */ |
| `lib/community-messenger/service.ts:15061` | /** instant/critical 입장 — 메신저 표준형 첫 타임라인 슬라이스(과대 페이로드 방지 상한 30) */ |
| `lib/community-messenger/service.ts:16578` | * 하한 이전 메시지를 인용한 답장 — 인용 원문을 「삭제된 메시지」로 바꿔 내려준다(메신저 표준: 지운 원문 인용은 삭제 표시). |
| `lib/community-messenger/social-relations.ts:48` | * §14-5 정책 (Owner 2026-10-25 승인, 메신저 표준 기준): 상대가 내 친구 요청을 **거절**하면 |
| `lib/community-messenger/types.ts:343` | /** messageType === "voice" 일 때 0–1 막대 높이 (메신저 표준 스타일 파형) */ |
| `lib/community-messenger/voice-playback-bus.ts:1` | /** 한 채팅방·탭에서 음성 말풍선 하나만 재생되도록 동기화 (메신저 표준류 UX) */ |
| `lib/community/__tests__/post-image-display.test.ts:33` | describe("postImageGridLayout — 피드형 배치", () => { |
| `lib/community/community-design-tokens.css:2` | * 필라이프(커뮤니티) 전용 UI — 브랜드 그린 + 피드 레이아웃 |
| `lib/community/community-hub-state.ts:4` | * Legacy hub-tab pattern (messenger-standard Tier 1): bottom-nav returns to the last |
| `lib/community/post-image-display.ts:38` | * 피드형 첨부 사진 격자 배치 — 칸 수와 각 칸 모양. |
| `lib/design/delivery-browse-chrome.ts:3` | * 근거: 참고 앱 16.28.0 샤오미 실측 (2026-10-30 15:04~15:32 PHT), 색만 DIBAY 고유색. |
| `lib/design/delivery-browse-chrome.ts:11` | /** 참고 앱 실측 회색 — 미선택 페이지 탭 #7E8082, 미선택 상단 탭 #B1B3B5, 구분선·칩 테두리 #E4E6E8, 섹션 띠 #F3F5F7 */ |
| `lib/design/delivery-browse-chrome.ts:31` | /** 2단 — 주소 「… ▾」 14px 보통 (참고 앱 실측 글자 높이 17px÷1.33 · DIBAY 15px 탭 대비 환산) */ |
| `lib/design/delivery-browse-chrome.ts:54` | /** 정렬 칩 — 테두리·글씨 녹색 굵게 + 아래 그림자 (참고 앱: 기본순 칩만 진한 테두리·그림자) */ |
| `lib/design/delivery-browse-chrome.ts:63` | * 뒤 어둡게 45% · 하단 탭(z 1200)보다 위 (참고 앱: 시트가 하단 탭을 덮음) — z 는 그대로. |
| `lib/design/delivery-chrome.ts:2` | * 배달 소비자 화면 — 상단 바·페이지 배경 단일 계약 (배달 표준 구조 + 브랜드 팔레트). |
| `lib/design/delivery-theme.ts:83` | /** 매장 상세 메뉴 — 배달 표준형 pill 탭(§ store detail category bar) */ |
| `lib/device/tests/dibay-shell-resolver.test.ts:77` | /** Owner 2026-11-07 FD4 데스크톱 조항 해제 — 좁은 창이어도 세로 레일 (PC 메신저형) */ |
| `lib/i18n/catalog/admin-member-shared.ts:550` | admin_topics_skin_compact_media: "기본형 · 제목+우측 썸네일", |
| `lib/i18n/catalog/admin-member-shared.ts:551` | admin_topics_skin_compact_media_left: "기본형 · 제목+좌측 썸네일", |
| `lib/i18n/catalog/copy-admin-b4-ops1.ts:71` | admin_app_every_6h_checks_play_production_only: "6시간마다 Play 프로덕션 트랙을 확인합니다. completed 출시만 자동으로 구버전 회원에게 인앱+푸시 1회를 보냅니다. 「지금 동기화」는  |
| `lib/i18n/catalog/copy-admin-b4-stores.ts:358` | admin_stores_build_customer_delivery_top_tabs_icons: "고객 배달 화면의 상단 탭·아이콘·매장을 배달 표준 구조로 구성합니다. 왼쪽 미리보기를 누르면 오른쪽에서 바로 수정·삭제, 파란 점선 「 |
| `lib/i18n/catalog/settings-ui.ts:363` | /** 단계형 전화 인증 (Owner 2026-11-09) */ |
| `lib/layout/use-bottom-nav-scroll-hide-behavior.ts:72` | * WP3 — 배달 홈·업종 목록은 배달 표준과 같이 하단 탭 항상 고정 (스크롤 숨김 없음). |
| `lib/legal/__tests__/consent-ux-p0-surface.test.ts:45` | it("PhoneVerificationBox: 단계형 — 국가 줄·번호 한 줄·[계속] → 6칸 인증번호 → 완료 (Owner 2026-11-09)", () => { |
| `lib/main-menu/main-bottom-nav-route-commit.ts:113` | * 허브 동기 이동형 — 하단 탭은 **허브 간 동기 replace/push** 만. |
| `lib/moim/moim-report-reasons.ts:1` | /** 모임 신고 사유 코드 (설계 §6 P13 · 참고 앱 FAQ 3730/27663/20399 기반). 화면 문구 키 = moim_report_reason_<code> */ |
| `lib/mypage/favorites-hub-segments.ts:3` | /** 찜 허브 1단 — 중고거래 \| 스토어 (참고 앱 관심목록 구조) */ |
| `lib/neighborhood/philife-post-comments.client.ts:14` | * (참고 앱: 상세 진입 시 목록 조회, 작성 후 전체 재조회) |
| `lib/platform/__tests__/android-play-update-screen-model.test.ts:10` | describe("update screen model — 단계형 전체 화면 단계", () => { |
| `lib/platform/android-play-update-screen-model.ts:2` | * Full-screen Android update screen (Owner 2026-11-03 · 단계형 전체 화면) — one screen from |
| `lib/runtime/samarket-runtime-debug.ts:41` | /** Domain list authority: skip silent home_sync tip rewrite when hub list already hydrated */ |
| `lib/stores/__tests__/browse-card-menu-strip.test.ts:11` | /** WP5 (배달 표준형 2차수 2026-10-29) — 목록 카드 가로 사진 줄 */ |
| `lib/stores/__tests__/delivery-visual-token-w3-contract.test.ts:77` | /** WP6 (배달 표준형 2차수 2026-10-29) — 메뉴 + = 흰 원 32px + 그림자 + 진한 기호, 초록 테두리 제거 (의도된 계약 변경) */ |
| `lib/stores/__tests__/store-detail-menu-presentation.test.ts:17` | /** WP6 (배달 표준형 2차수 2026-10-29) — 매장 화면 표시 규칙 */ |
| `lib/stores/__tests__/stores-browse-organic-cut3.test.ts:198` | /** WP5 (배달 표준형 2차수 2026-10-29) — 목록 카드 가로 사진 줄 최대 6장으로 계약 상한 4 → 6 */ |
| `lib/stores/__tests__/w4-delivery-sheets-overlays.test.ts:135` | * WP8 (Owner 승인 배달 표준형 3차수 2026-10-30) — 의도 변경: 장바구니 페이지 최소 수량 🗑 는 확인 없이 바로 삭제 |
| `lib/stores/browse-card-menu-strip.ts:2` | * WP5 (배달 표준형 2차수 2026-10-29) — 업종 목록 카드 메뉴 사진 가로 줄 순수 로직. |
| `lib/stores/delivery-menus/browse-menu-tab-direction.ts:19` | /** 참고 앱 실측 탭 본문 이동 약 130~200ms */ |
| `lib/stores/dibay-menu-board-tokens.ts:3` | * 참고 앱·요기요 공식 디자인 가이드의 hex/간격 값이 아님 — 캡처 기반 보정 시 이 파일만 갱신한다. |
| `lib/stores/presentation/stores-home-presentation-map.ts:2` | * PHASE 3 — DIBAY HOME composer slot → delivery reference A-VIS pattern mapping (evidence reference). |
| `lib/stores/presentation/stores-home-presentation-map.ts:89` | matchEvidence: "Product-card anatomy only — platform_popular is DIBAY authority label, not delivery reference pattern name", |
| `lib/stores/presentation/stores-home-presentation-map.ts:93` | notes: "popular_menu — Do not label as delivery reference Popular; show platform_popular badge only when menuAuthority proves it." |
| `lib/stores/presentation/stores-home-presentation-map.ts:103` | notes: "Preserve store teaser; no invented 신규 delivery reference HOME card.", |
| `lib/stores/presentation/stores-home-presentation-map.ts:119` | matchEvidence: "Strike amount is DIBAY fee authority — not delivery reference % discount badge", |
| `lib/stores/presentation/stores-home-presentation-map.ts:143` | notes: "Preserve 2-col grid food card; no delivery reference claim.", |
| `lib/stores/store-cart-page-layout.ts:2` | * `/stores/[slug]/cart` 레이아웃 (참고 앱·요기요식) |
| `lib/stores/store-cart-ui.ts:2` | * dibaY 장바구니 UI — 배달 표준 카드·여백 (흰 배경 + 섹션 테두리). |
| `lib/stores/store-commerce-bottom-action-bar.ts:2` | * 매장 소비자 하단 액션 바 — 참고 앱 **참고**(동일 복제 아님). 페이지별 높이·좌측 정보·CTA 활성/비활성. |
| `lib/stores/store-commerce-bottom-action-bar.ts:108` | * 비활성·처리 중 — 참고 앱 담기/주문하기 회색. 글자 = `--delivery-btn-disabled-fg`(짙은 갈색, ≥4.5:1). |
| `lib/stores/store-commerce-bottom-action-bar.ts:141` | /** 참고 앱 장바구니 보기 버튼 안 검은 수량 뱃지 */ |
| `lib/stores/store-detail-menu-presentation.ts:2` | * WP6 (배달 표준형 2차수 2026-10-29) — 매장 화면 표시 규칙 순수 함수. |
| `lib/stores/store-menu-detail-cart-presentation.ts:2` | * WP7·WP8 (배달 표준형 3차수 2026-10-30) — 메뉴 상세·장바구니 표시 규칙 순수 함수. |
| `lib/stores/store-menu-quick-add-button-styles.ts:2` | * 매장 메뉴 썸네일 + 버튼 — WP6 (배달 표준형 2차수 2026-10-29): |
| `lib/stores/store-review-preview-slides.ts:45` | /** 참고 앱 매장 상단 프리뷰 — 리뷰 1건당 슬라이드 1장(썸네일+별+본문) */ |
| `lib/stores/stores-browse-category-presentation-spec.ts:21` | * WP5 (2026-10-29 배달 표준형 2차수) — 4칸 고정 그리드 → 가로 스크롤 사진 줄. |
| `lib/stores/stores-browse-category-presentation-spec.ts:36` | /** PNG pixel estimate — not delivery reference brand-locked hex/radius claim */ |
| `lib/stores/use-stores-home-header-collapsed.ts:19` | * 배달 메뉴 구성 — 배달 홈을 스크롤하면 주소줄만 접히고 검색창은 남는다 (2026-10-30 참고 앱 실기). |
| `lib/trade/marketplace/__tests__/trade-listing-age.test.ts:15` | describe("trade listing age — 참고 앱 단위 경계(strict, round)", () => { |
| `lib/trade/marketplace/trade-listing-age.ts:4` | * 단위 경계·반올림은 참고 앱 웹 목록 카드와 같다(date-fns `formatDistanceToNowStrict`, roundingMethod "round"): |
| `lib/types/admin-staff.ts:3` | * 참고 앱 운영 분석 기준 권한 키로 세분화 권한 부여 |
| `lib/ui/__tests__/cm-room-visible-viewport-contract.test.ts:40` | it("iOS messenger-page band pins on keyboard open (messenger-standard); clears when closed", () => { |
| `lib/ui/biz-component-classes.ts:3` | * 전역 `--sam-*` 와 분리해 CTA/탭/헤더를 브랜드 그린·크림·탄 톤으로 통일합니다. |
| `lib/ui/cm-room-visible-viewport-contract.ts:33` | * (messenger-standard: composer sits on the keyboard). Android never uses this. |
| `lib/ui/messenger-chat-viewport-tuning.ts:44` | /** draft가 2줄 이상이면 sector를 하단 정렬(메신저 표준형). */ |
| `lib/ui/messenger-split-pane-layout.ts:4` | * 참고 메신저 샤오미 실측(~35% / 1340→469) — clamp(360px, 35vw, 470px). |
| `lib/ui/use-cm-room-visible-viewport-shell.ts:112` | * messenger-standard CM room viewport shell. |
| `scripts/measure-store-checksheet-audit.mjs:3` | * Delivery/store checksheet §3 — 3-run audit (배달 앱 수준 체크시트 증거). |
| `scripts/measure-trade-checksheet-audit.mjs:3` | * Trade+community checksheet §1 — 3-run audit (거래 앱 수준 체크시트 증거). |
| `scripts/verify-cm-hub-navigation-contract.mjs:3` | * CM 허브 동기 이동형 hub·stack·auth·call accept recovery contract. |
| `scripts/verify-cm-hub-navigation-contract.mjs:71` | if (!navCommit.includes("허브 동기 이동형")) { |
| `scripts/verify-domain-list-authority.mjs:3` | * Domain list authority — structural locks. |
| `scripts/verify-domain-list-authority.mjs:56` | if (/QUARANTINED \(Domain list authority/.test(text) && /return \{\s*byDomain:/.test(text)) { |
| `scripts/verify-domain-list-authority.mjs:66` | if (!/Domain list authority/.test(text)) fail(`${file}: missing domain list remount lock comment`); |
| `scripts/verify-messenger-hot-path-contract.cjs:2` | * Community 메신저 핫패스 계약 — 메신저 표준 구조 회귀 탐지. |
| `scripts/verify-store-perf-checksheet-contract.cjs:3` | * Delivery/store checksheet — 구조 lock (배달 앱 수준 회귀 방지). |
| `scripts/verify-trade-perf-checksheet-contract.cjs:3` | * Trade+community checksheet — 구조 lock (거래 앱 수준 회귀 방지). |
