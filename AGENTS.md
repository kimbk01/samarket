<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## SAMarket 앱 라우트 (고정)

- 메인 사용자 UI 페이지는 **`app/(main)/`** 아래 둡니다. `(…)` 는 라우트 그룹이라 **URL 에 이름이 붙지 않습니다** (`/philife` 등 유지).
- **`app/_anything`** 로 묶지 마세요. Next.js `normalizeAppPath` 는 `_` 접두를 URL 에서 빼지 않아 **`/_anything/...` 로 열리고 기존 경로는 404** 가 됩니다.
- 구조 확인: `npm run verify:routes`
- **매장 사장님 운영 UI(섹션 카드·하단 저장/취소)** 참조·동일 적용: `.cursor/rules/samarket-store-admin-ui-shell.mdc` — 사용자가 **「매장 어드민 UI 적용」** 등으로 지시하면 해당 규칙을 읽고 `OwnerStoreProfileForm` / `OwnerStoreBasicInfoForm` 과 같은 셸을 맞춘다.

## 네이티브 빌드·배포 규정 (필수 — 모든 작업)

- 단일 정의: **`docs/native-build-release-process.md`** (Cursor: `.cursor/rules/dibay-native-build-release-process.mdc`).
- **보고 첫 줄** = `npm run verify:native-version-bump` 의 `[배포 구분]` (웹만 → 배포 후 앱 재시작 / 네이티브 → 재빌드·재설치 필요 + 목표 버전).
- **네이티브 변경**(`android/**`·`ios/**`·`capacitor.config.ts`·Capacitor 의존성)은 같은 PR 에서 Android `versionCode`·iOS `CURRENT_PROJECT_VERSION`(4곳) 증가 — CI `native-version-bump` 잡이 강제.
- **Mac 빌드는 `npm run native:prepare` 성공 후에만** Run. 오래된 폴더·미커밋 변경·로컬 버전 수정으로 빌드 금지.
- **설치 확인은 작업자가 `public.user_devices.app_version`(`버전 (빌드)`)으로 직접** 한다. "폰에서 안 된다" 보고 시 코드 수정 전에 설치 버전부터 확인(구 바이너리면 코드 수정 금지).

## 거래 글쓰기(임시저장·이어쓰기)

- **분기 단일화**: `trade` 타입 카테고리 작성은 **`components/write/trade/TradeCategoryWriteForm.tsx`** 만 수정하면 `/write`·거래 시트·상품 수정이 함께 따라간다. 신규 전용 폼·저장소·`discardTradeWriteStashedDraft` 등록 절차는 `.cursor/rules/trade-write-draft-continuity.mdc` 참고.

## UI 토큰

- 전역 팔레트는 **`app/design-tokens.css`** 의 **`--sam-*`** (보라 브랜드·앱 배경·서피스·상태색·반경·그림자). 레거시 **`--ui-*`**·`bg-ui-*` 는 동일 값으로 브리지되어 기존 코드가 동작한다.
- **제품 UI 시맨틱 클래스**는 **`app/samarket-components.css`** (`@layer components`) — 버튼·입력·탭·칩·카드·시트·뱃지·말풍선 등. 문자열 상수는 **`lib/ui/sam-component-classes.ts`** 의 **`Sam`** (또는 `import { Sam } from "@/lib/ui/css-vars"`).
- 신규 화면은 **`bg-sam-app`**, **`text-sam-fg`**, **`border-sam-border`** 등 Tailwind `sam-*` 유틸 또는 **`Sam.btn.primary`** 같은 시맨틱 클래스 조합을 우선한다. 관리자 전용(`data-admin`)은 동일 토큰을 쓸 수 있으나 테이블·대시보드 레이아웃은 Admin 컴포넌트 우선.
- 사각형 카드·섹션·시트 모서리는 **`rounded-ui-rect`** (= `--ui-radius-rect` → **`--sam-radius-sm`**, 8px). 원·pill만 **`rounded-full`** 유지. 한 줄에 `rounded-full` 과 다른 라운드가 섞인 템플릿 문자열은 수동으로 분기별 클래스 확인.

## 메신저 도메인 경계

- **사용자 대면 「채팅」은 3종만** — 단일 정의: `lib/chat-domain/samarket-three-chat-pillars.ts` (`trade` 거래 채팅 · `community` 메신저 · `store_order` 배달·매장 주문 채팅). 제품 카피·탭·문서에서 네 번째 채팅으로 소개하지 않는다.
- **Philife**(`philife`): 피드·게시판 연동 DM — `lib/chats` + `app/(main)/philife`. **메신저(`/community-messenger`)와 동일 제품으로 취급하지 않는다.**
- **스토어 쇼핑 통합 채팅 스트림**(`store`): `lib/chats` store 세그먼트. **주문 채팅(`store_order`)과 이름·도메인이 다르다** — 혼동 금지.
- **음성·영상**: 통화 전용 — `lib/chat-domain/ports/call-signaling-boundary.ts`, `community_messenger_call_signals`. **채팅 3종의 확장이 아니다.**
- **거래(마켓·피드) 목표는 가볍게**: `docs/trade-lightweight-design.md` (**§9** `/market` 목록 불변조건), `lib/trade/trade-lightweight-goals.ts` (`TRADE_HOME_LIST_INVARIANT_IDS`), `.cursor/rules/trade-home-list-invariants.mdc` — 번들·단일 페이로드·**`getPostsForHome` 단일 비행·prewarm 키 일치**·캐시/세션 peek.
- **거래 채팅 구매자·판매자 프로세스(상세 CTA·예약·후기)**: `docs/trade-chat-buyer-seller-process.md`.
- **Trade / Philife / Store 스트림(통합 목록) 구현 공유**: `lib/chats`, `load-chat-room-bootstrap`, `chat-room-load-contract` — 위 3종·비3종 경계는 `samarket-three-chat-pillars` 우선.
- **Community 메신저 UI**: `lib/community-messenger`, `lib/chat-domain/use-cases/community-messenger-bootstrap`, Realtime·unread는 커뮤니티 전용 정책.
- **메신저 방 모바일 뷰포트·키보드·스크롤**(Phase2 셸·타임라인): 단일 정의 **`docs/community-messenger-mobile-room-viewport.md`** · 기기별 보정 **`lib/ui/messenger-chat-viewport-tuning.ts`** — 수정 전후 `.cursor/rules/community-messenger-room-viewport-continuity.mdc` 및 문서 §7 변경 이력.
- **Community 메신저 방 메시지 기본 계약(저지연)**: mutation 직후 **서버만** Realtime bump 발행(`publish-messenger-room-bump` → `room-bump-broadcast-server`); 페이로드 v2 + 선택 `message` 스냅샷; 수신은 `room-bump-broadcast`(구독)·`community-messenger-room-bump-message-snapshot`·`use-messenger-room-client-phase1`에서 검증·병합 후 HTTP로 정합. **클라이언트 bump 발행 금지.** 상세 표: `docs/messenger-realtime-policy.md` 의「Community 메신저 방 메시지」절.
- **매장 정산·수수료·매장 캐시**: 단일 정의 **`docs/store-commission-cash-settlement-ssot.md`** · 계약 `lib/stores/commission/store-commission-contract.ts`. 고객은 매장에 직접 결제 → **주문별 지급(정산 버튼) 없음**. 수수료 부과·검토 플래그는 **DB 트리거(주문 상태 UPDATE 트랜잭션)만** — TS 에서 수수료 금액을 쓰거나 되돌리지 않는다. 취소·환불 수수료는 `admin_decide_store_commission_adjustment` 로만 처리. Admin·Owner 는 같은 SQL 조회 함수·컴포넌트만 사용.
- **Store 주문 채팅**: `lib/order-chat`, `lib/shared-order-chat` — 주문 상태 필드와 unread 역할 분리 유지. **주문 상태 UI·채팅 단계** 신규/변경 시 `lib/stores/store-order-process-model.ts` 만 (`docs/store-order-process-single-source.md`).
- 도메인 식별·소유 경로: `lib/chat-domain/messenger-domains.ts`, 포트: `lib/chat-domain/ports/*`.
- 성능 목표·알림 env: `docs/messenger-performance-targets.md`, `docs/messenger-production-slo.md`; 참조 상수 `MESSENGER_PERF_REFERENCE_P95_MS` (`lib/community-messenger/monitoring/thresholds.ts`).
- 체감 성능 운영 헌장·트랙/미완 상태: `docs/samarket-native-feel-charter.md`, `docs/samarket-performance-track-state.md` (Cursor: `.cursor/rules/samarket-performance-continuity.mdc`). 도메인별 완료율(체감만, UI 별도): `docs/samarket-perf-domain-checksheet.md`. **당근·배민·카톡 동급 수렴 순서·라운드 게이트:** `docs/samarket-parity-execution-order.md`, `npm run verify:parity-gates` — **performance-sensitive change · hot-path change · explicit performance task** 일 때만 performance-specific verification REQUIRED. 일반 UI bug fix·scope 한정 수정만으로 broad performance audit·`verify:parity-gates` 전체 자동 실행 금지 (`dibay-master-execution-contract` REQUIRED vs OPTIONAL).
- **채팅·Realtime·성능**: 임시 조치(폴링만 증가·임계값만 완화·클라만 우회 등)로 이슈를 끝내지 않는다. **근본**은 API·DB·구독·부트스트랩 계약을 바꾼다. 상시 규칙: `.cursor/rules/fundamental-fixes-only.mdc`.
- Supabase 유지 vs 최적화 vs 분리: `docs/messenger-supabase-split-evaluation.md` (트래픽 단계별는 `messenger-service-split-criteria.md` 와 연동).
<!-- END:nextjs-agent-rules -->

## Claude 작업 효율 규정 (Owner 지시 · 예외 없음)

1. **범위 고정**: 지시받은 범위만 구현한다. 다른 화면·정책·감사·문서로 넓히지 않는다. 범위 밖 결함은 보고만 한다.
2. **검증은 1회**: 최종 트리에서 `npm run typecheck:build` + 변경 관련 `vitest` + 변경 파일 `eslint` 를 **한 번** 돌린다. 통과한 트리는 `git commit --no-verify` 로 커밋한다 (pre-commit 의 같은 tsc 재실행 금지). 전체 `npm run ci` 는 GitHub CI 에 맡기고 로컬에서 중복 실행하지 않는다.
3. **대기 금지**: 10분 이상 걸리는 작업(빌드·CI·서브에이전트)은 백그라운드로 돌리고, 그동안 다음 작업을 한다. 결과를 기다리며 설명을 늘어놓지 않는다.
4. **푸시 전 필수 확인**: `git show HEAD:<file>` 로 수정 파일이 실제 커밋에 들어갔는지 확인한다. `"use client"` 파일이 서버 전용 모듈(`next/server` after, 알림 append, web-push, service-role supabase, `lib/audit`)을 import 하지 않는지 확인한다.
5. **결과 구분 보고**: 브랜치 코드 PASS / Preview PASS / Production PASS / 실기기 PASS 를 구분한다. 측정하지 않은 것은 NOT_PROVEN. 운영 주소(samarket.vercel.app)는 main 병합 전에는 바뀌지 않는다는 점을 명시한다.
6. **데이터 먼저 확인**: 화면 숫자·지표를 고칠 때는 운영 DB 를 읽기 전용으로 조회해 실제 값이 맞는지 먼저 확인한다.
7. **보고는 짧게**: 한 일·결과·남은 일만. 같은 계획·감사를 반복하지 않는다. 선택지(A/B/C)를 Owner 에게 떠넘기지 않는다.
