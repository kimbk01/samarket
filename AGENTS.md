<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## SAMarket 앱 라우트 (고정)

- 메인 사용자 UI 페이지는 **`app/(main)/`** 아래 둡니다. `(…)` 는 라우트 그룹이라 **URL 에 이름이 붙지 않습니다** (`/home` 등 유지).
- **`app/_anything`** 로 묶지 마세요. Next.js `normalizeAppPath` 는 `_` 접두를 URL 에서 빼지 않아 **`/_anything/...` 로 열리고 기존 경로는 404** 가 됩니다.
- 구조 확인: `npm run verify:routes`

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
- **거래(마켓·피드) 목표는 가볍게**: `docs/trade-lightweight-design.md`, `lib/trade/trade-lightweight-goals.ts` (번들·단일 페이로드·클라 상태·쿼리/캐시).
- **거래 채팅 구매자·판매자 프로세스(상세 CTA·예약·후기)**: `docs/trade-chat-buyer-seller-process.md`.
- **Trade / Philife / Store 스트림(통합 목록) 구현 공유**: `lib/chats`, `load-chat-room-bootstrap`, `chat-room-load-contract` — 위 3종·비3종 경계는 `samarket-three-chat-pillars` 우선.
- **Community 메신저 UI**: `lib/community-messenger`, `lib/chat-domain/use-cases/community-messenger-bootstrap`, Realtime·unread는 커뮤니티 전용 정책.
- **Store 주문 채팅**: `lib/order-chat`, `lib/shared-order-chat` — 주문 상태 필드와 unread 역할 분리 유지.
- 도메인 식별·소유 경로: `lib/chat-domain/messenger-domains.ts`, 포트: `lib/chat-domain/ports/*`.
- 성능 목표·알림 env: `docs/messenger-performance-targets.md`, `docs/messenger-production-slo.md`; 참조 상수 `MESSENGER_PERF_REFERENCE_P95_MS` (`lib/community-messenger/monitoring/thresholds.ts`).
- Supabase 유지 vs 최적화 vs 분리: `docs/messenger-supabase-split-evaluation.md` (트래픽 단계별는 `messenger-service-split-criteria.md` 와 연동).
<!-- END:nextjs-agent-rules -->
