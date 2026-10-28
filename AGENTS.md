<!-- BEGIN:nextjs-agent-rules -->
# 절대 금지 (Owner 규정 · 최우선 · 예외 없음)

1. **테스트 DB 사용 금지** — `dibay-test`·`dibay-reset-qa` 는 지시 없이 조회·변경하지 않는다. 새 Supabase 프로젝트·테스트 환경 생성 금지. (`.claude/hooks/guard.sh` 가 차단)
2. **CI·배포 반복 확인 금지** — 기다리며 폴링·예약 확인·중간 보고 하지 않는다. 결과는 GitHub 알림으로만 받고, 실패할 때만 보고한다. (훅이 차단)
3. **지시 범위 밖 작업 금지** — 지시받은 것만 한다. 범위 밖 결함은 보고만 한다.
4. **중간 보고 금지** — 완료 시 1회 짧게 보고한다 (원인·수정·검증·배포 SHA·남은 위험).
5. **선택지 떠넘기기 금지** — 규정·설계로 정할 수 있는 것은 묻지 않고 정한다.

# 통화 변경 규정 (Owner 2026-10-22 · 최우선 · 예외 없음)

통화는 **수정 금지 대상이 아니다.** 그러나 근거·계획 없이 바꾸면 반드시 터진다 (2026-10-22: 웹·서버 통화 변경 배포 후 Samsung→iPhone 수신 실패·종료 뒤 수신벨 — 네이티브 파일 무변경이었음에도 발생). 이 실수를 반복하지 않는다.

1. **적용 범위 = 통화에 닿는 모든 코드** — 네이티브(`android/**`·`ios/**` 통화·CallKit·PushKit·FCM·Agora)뿐 아니라 **웹 통화 코드**(`lib/community-messenger/call*`·`call-v4/**`·`components/**/call*`·수신 배너·통화 화면)와 **서버 통화·푸시 코드**(통화 세션 API·`service.ts` 통화 함수·`lib/push/**` 통화 발송·VoIP/FCM dispatch). 네이티브 파일을 안 건드려도 웹·서버 변경은 네이티브 통화 동작을 바꾼다.
2. **수정 전 — 「왜」를 증거로**: 실기기 로그·운영 DB(callId 단위 세션·이벤트·`notification_deliveries` 발송 시각)로 결함을 재현·특정한다. 증거 없이 기존 코드 탓으로 단정하거나 개선 목적으로 통화 경로를 바꾸지 않는다.
3. **수정 전 — 영향 분석·계획을 문서로**: 바꾸는 파일·함수, 바뀌는 동작, 영향받는 경로(발신 시작·세션 생성·VoIP/FCM 발송·iOS CallKit/Android 수신 화면·취소/거절/종료/부재중·상태 폴링·CallKit 종료 신호·통화 기록·팝업), **설치된 구 바이너리 호환**(현재 설치 `user_devices.app_version`), 회귀 위험, 롤백 방법, 실기기 검증 항목을 먼저 적고 **Owner 승인 후** 구현한다.
4. **분리 반영**: 통화 변경은 **통화만** 단독 커밋·단독 main 반영. 메신저·친구·DB·네이티브 기능 추가와 묶지 않는다. 한 번에 한 원인만 고친다.
5. **검증 = 코드 PASS + 실기기 PASS 둘 다**: 로컬 테스트 통과만으로 완료가 아니다. Production SHA 를 **매 테스트마다** 확인하고, 다른 배포 버전 결과를 섞지 않는다. 최소 행렬: Android↔iPhone 음성·영상 발신·수신, 거절, 벨 중 취소, 취소 후 지연 푸시(재울림 없음), 통화 중(busy), 무응답 타임아웃, 정상 종료 후 즉시 재발신. 각 테스트는 발신 시점·세션 생성·VoIP/FCM 발송·수신 화면 표시·연결·종료 시각을 기록한다(서버 시각은 운영 DB 로 대조).
6. **실기기 FAIL 시 즉시 중단**: 다른 작업(메신저 개선·DB 적용·네이티브 ④⑤)을 멈추고 통화 정상화가 최우선. 수정 후 같은 행렬로 재검증해 PASS 전에는 다음 단계로 가지 않는다.
7. **보고 형식**: ① 정확히 무엇을 변경했는가 ② 확인된 원인 ③ 어떤 수정으로 복구했는가 ④ 실기기 PASS/FAIL (코드 PASS·Production 반영·실기기 PASS 구분, 측정 안 한 것은 NOT_PROVEN).

# 설계·구현 작업 규정 (Owner 2026-10-28 · 최우선 · 예외 없음)

거래 작업에서 반복된 실패(계약 미확인 설계·임의 값·승인 밖 작업·중간에 깨진 화면·틀린 보고)를 막는다. 모든 도메인에 적용한다.

1. **계약·대화 먼저** — 설계·수정 전에 해당 계약 문서와 Owner 지시 원문을 읽고 인용한다. 계약에 없고 Owner 지시도 없는 값·기능은 넣지 않는다(「Owner 결정 필요」로 비워 둔다).
2. **Owner 말 그대로 확인** — Owner 가 지목한 화면·버튼을 **그 화면에서** 재현한 뒤에만 판단한다. 다른 화면을 보고 「문제 없음」이라 말하지 않는다.
3. **승인 범위 고정** — 승인된 단계·항목만 한다. 단계 밖 결함은 고치지 않고 기록·보고만 한다. Owner 의 불만·지적을 승인으로 해석하지 않는다(고칠지는 묻거나 계획에 넣어 승인받는다).
4. **설계 = 전후 영향까지** — 각 항목에 바뀌는 파일·경로, **영향받는 화면·호출처 전부**, 바꾼 뒤 깨질 수 있는 것, 그것을 같은 단계에서 함께 처리하는 방법을 적는다. 한 단계가 끝난 상태에서 화면이 깨져 있으면 안 된다(예: API 를 닫으면 그 API 를 쓰는 화면도 같은 단계에서 정리).
5. **사실만 보고** — 직접 확인한 것만 PASS. 측정 안 한 것은 NOT_PROVEN. 숫자는 쿼리·코드로 확인한 값만 쓴다. 틀린 보고는 발견 즉시 정정한다.
6. **보고는 단계 끝 1회** — 작업 중 중간 보고를 하지 않는다.

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
- **네이티브 변경**(`android/**`·`ios/**`·`capacitor.config.ts`·Capacitor 의존성)이 있으면 Android `versionCode`·iOS `CURRENT_PROJECT_VERSION`(4곳)을 **설치·배포용 빌드를 만들 때 1회** 증가 — `npm run native:prepare`(`verify:native-version-bump --release`)가 강제. 커밋마다 올리지 않는다. 빌드 시점·종류는 아래 「개발 프로세스」 6번.
- **Mac 빌드는 `npm run native:prepare` 성공 후에만** Run. 오래된 폴더·미커밋 변경·로컬 버전 수정으로 빌드 금지.
- **설치 확인은 작업자가 `public.user_devices.app_version`(`버전 (빌드)`)으로 직접** 한다. "폰에서 안 된다" 보고 시 코드 수정 전에 설치 버전부터 확인(구 바이너리면 코드 수정 금지).

## 거래 글쓰기(임시저장·이어쓰기)

- **분기 단일화**: `trade` 타입 카테고리 작성은 **`components/write/trade/TradeCategoryWriteForm.tsx`** 만 수정하면 `/write`·거래 시트·상품 수정이 함께 따라간다. 신규 전용 폼·저장소·`discardTradeWriteStashedDraft` 등록 절차는 `.cursor/rules/trade-write-draft-continuity.mdc` 참고.

## UI 토큰

- 전역 팔레트는 **`app/design-tokens.css`** 의 **`--sam-*`** (DIBAY 그린 브랜드 `--sam-primary` `#0B421A`·앱 배경·서피스·상태색·반경·그림자). 레거시 **`--ui-*`**·`bg-ui-*` 는 동일 값으로 브리지되어 기존 코드가 동작한다.
- **제품 UI 시맨틱 클래스**는 **`app/samarket-components.css`** (`@layer components`) — 버튼·입력·탭·칩·카드·시트·뱃지·말풍선 등. 문자열 상수는 **`lib/ui/sam-component-classes.ts`** 의 **`Sam`** (또는 `import { Sam } from "@/lib/ui/css-vars"`).
- 신규 화면은 **`bg-sam-app`**, **`text-sam-fg`**, **`border-sam-border`** 등 Tailwind `sam-*` 유틸 또는 **`Sam.btn.primary`** 같은 시맨틱 클래스 조합을 우선한다. 관리자 전용(`data-admin`)은 동일 토큰을 쓸 수 있으나 테이블·대시보드 레이아웃은 Admin 컴포넌트 우선.
- 모서리 반경은 **컴포넌트별 기준** (`docs/customer-platform/04-DESIGN-SYSTEM.md` Radius): 화면에 붙은 카드·섹션·목록·버튼·입력·칩은 **`rounded-ui-rect`** (= `--ui-radius-rect` → **`--sam-radius-sm`**, **4px**), 떠 있는 바텀시트·다이얼로그는 오버레이 계약(`--overlay-radius-*` 12~24px). 원·pill만 **`rounded-full`** 유지. 한 줄에 `rounded-full` 과 다른 라운드가 섞인 템플릿 문자열은 수동으로 분기별 클래스 확인.

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

## 개발 프로세스 (Claude Code·Cursor 공통 · 단일 정의 · Owner 2026-10-20)

브랜치·커밋·검증·CI·배포·앱 빌드 절차는 **이 절 하나만** 정의한다. `.cursor/rules/*.mdc`·`docs/*` 는 이 절을 참조하고, 절차가 충돌하면 이 절이 우선한다. 위 「절대 금지」·운영 DB 보호·배포 권한(`docs/dibay-build-deploy-hard-lock.md`)·네이티브 안전장치(`docs/native-build-release-process.md`)·통화·메신저·알림 hard-lock 은 약화하지 않는다.

1. **작업 브랜치에서 개발 → 완료 후 main 에 한 번 (Owner 2026-10-29 · Vercel 비용)** — 최신 `origin/main` 에서 작업 브랜치(`fix/**`·`feat/**`·`chore/**`·`claude/**`·`cursor/**` — `vercel.json` 이 배포를 꺼 둬 빌드 비용 0)를 만들어 수정·보완·검증한다. 같은 작업이 끝나면 그 브랜치를 `git push origin HEAD:main` 으로 **fast-forward 한 번**에 반영한다. 수정마다 main 에 푸시하지 않는다 (`main` 푸시 1회 = Production 빌드 1회). PR 은 Owner 가 요청할 때만 만든다 (`main` 은 2026-10-20 기준 브랜치 보호 없음).
   - 네이티브 빌드 번호 증가는 기능 커밋과 **같은 푸시**에 넣는다. CI 재수정 푸시를 막기 위해 main 반영 전 `npm run typecheck:test` 도 로컬에서 1회 돌린다 (`typecheck:build` 는 테스트 파일을 보지 않는다).
   - Cloud·Cursor 가 같은 시간대에 main 에 연속 푸시하지 않는다 — 한 작업의 반영은 한 세션이 한 번에 한다. 긴급 장애·보안 수정은 즉시 반영할 수 있다.
   - 클라우드 Claude 세션이 `claude/*` 지정 브랜치를 받아도 그 브랜치는 작업 공간일 뿐이다. 검증 PASS 커밋을 지정 브랜치에 푸시한 뒤 **같은 커밋을 `main` 에 fast-forward 푸시**한다 — 이 절이 Owner 의 상시 허가다.
   - `main` 이 앞서 있으면 `git fetch origin main` → 자기 커밋만 `git rebase origin/main`. 겹치는 파일이 없으면 재검증 없이 푸시, 겹치면 관련 검증만 1회 재실행. force-push 금지. 다른 세션의 커밋·미커밋 변경을 삭제·덮어쓰지 않는다.
   - 브랜치 보호·필수 상태 검사가 생겨 직접 푸시가 거부되면 우회하지 않고 Owner 에게 보고한다 (그때만 PR 경로).
2. **main 반영 = 웹 Production 배포** — `main` 푸시는 Vercel Git Integration 이 Production 으로 배포한다 (`*.md`·`docs/`·`.cursor/`·`android/`·`ios/`·테스트 파일(`__tests__/`·`*.test.*`)만 바뀌면 `scripts/vercel-ignored-build-step.mjs` 가 빌드 생략). Owner 가 **구현을 지시한 작업**은 검증 PASS 후 main 반영까지가 승인 범위다. 다음은 각각 Owner 별도 승인: 「보고만·감사만·배포 보류」 지시 작업의 반영 · 운영 DB 적용(마이그레이션·함수·RLS·트리거·데이터 변경) · 스토어 업로드·출시 · GitHub·Vercel·Supabase 설정 변경.
3. **검증은 로컬 1회** — 최종 트리에서 `npm run typecheck:build` + 변경 관련 `vitest` + 변경 파일 `eslint` (+ 해당 도메인 `verify:*`) 를 **한 번** 돌리고, 통과하면 `git commit --no-verify` (pre-commit 의 같은 tsc 재실행 금지). 같은 트리에서 PASS 한 검사는 다시 돌리지 않는다. 전체 `npm run ci` 는 로컬에서 돌리지 않고, `npm run build` 는 빌드 설정·라우트 구조 변경 때만 1회. 문서·규칙만 바뀐 커밋은 코드 검증을 생략한다.
4. **GitHub CI 는 기다리지 않는다** — main 푸시 때 CI 가 자동 실행되는 것은 유지하되, 결과를 기다리거나 조회하지 않는다 (절대 금지 2번·훅 차단). 완료 보고는 로컬 검증 결과 + 푸시 SHA 로 한다. CI 실패가 알려지면 (GitHub 알림·Owner 전달) 이 변경과 관련된 오류인지 판단해 관련 오류만 새 커밋으로 고친다. 무관한 기존 실패는 보고만 한다.
5. **변경 분류는 작업자가 자동 판정** (Owner 에게 묻지 않는다) — 실제 변경 파일과 기능 의존성으로 정하고, 보고 첫 줄에 `npm run verify:native-version-bump` 의 `[배포 구분]` 을 쓴다.
   - **웹** (`app/`·`components/`·`lib/`·API·관리자 UI 등): main 반영 후 앱 재시작만. APK·AAB·iOS 빌드·버전 변경 없음.
   - **DB** (`supabase/` 마이그레이션·함수·RLS·트리거): 파일 커밋은 웹과 같다. 운영 DB 적용은 Owner 승인 후 적용 결과를 확인한다. DB 변경만으로 앱을 재빌드하지 않는다.
   - **네이티브** (`android/**`·`ios/**`·`capacitor.config.ts`·Capacitor 플러그인·앱 설정·네이티브 브리지 계약, 또는 새 네이티브 기능을 요구하는 웹 코드): 6번.
6. **앱 빌드는 필요할 때만** — Android APK 는 실기기 직접 설치 검증이 필요할 때, AAB 는 Google Play 에 새 버전을 등록할 때, iOS 는 실기기 검증·TestFlight·App Store 배포가 필요할 때만 만든다. 웹·DB 수정마다 빌드하지 않는다. 빌드 번호는 커밋마다가 아니라 **설치·배포용 빌드를 만들 때 1회** 올린다 (마지막 증가 이후 네이티브 변경이 있는 플랫폼만 · main 커밋 후 빌드 · `native:prepare` 가 미증가 시 중단). Mac 빌드는 `npm run native:prepare` 성공 후에만 (`docs/native-build-release-process.md` §4). 스토어 업로드와 출시 승인은 별개 — Owner 승인 없이 출시하지 않는다.

## Claude 작업 효율 규정 (Owner 지시 · 예외 없음)

1. **범위 고정**: 지시받은 범위만 구현한다. 다른 화면·정책·감사·문서로 넓히지 않는다. 범위 밖 결함은 보고만 한다.
2. **검증·커밋·푸시·CI**: 위 「개발 프로세스」 1~4번.
3. **대기 금지**: 10분 이상 걸리는 작업(빌드·서브에이전트)은 백그라운드로 돌리고, 그동안 다음 작업을 한다. 결과를 기다리며 설명을 늘어놓지 않는다. CI·배포 결과는 기다리지 않는다 (절대 금지 2번).
4. **푸시 전 필수 확인**: `git show HEAD:<file>` 로 수정 파일이 실제 커밋에 들어갔는지 확인한다. `"use client"` 파일이 서버 전용 모듈(`next/server` after, 알림 append, web-push, service-role supabase, `lib/audit`)을 import 하지 않는지 확인한다.
5. **결과 구분 보고**: 로컬 검증 PASS / Preview PASS / Production PASS / 실기기 PASS 를 구분한다. Preview 는 선택 — 확인 불가 시 NOT_PROVEN 1회 표기. 측정하지 않은 것은 NOT_PROVEN. 운영 주소(samarket.vercel.app)는 main 반영 전에는 바뀌지 않는다는 점을 명시한다.
6. **데이터 먼저 확인**: 화면 숫자·지표를 고칠 때는 운영 DB 를 읽기 전용으로 조회해 실제 값이 맞는지 먼저 확인한다.
7. **보고는 짧게**: 한 일·결과·남은 일만. 같은 계획·감사를 반복하지 않는다. 선택지(A/B/C)를 Owner 에게 떠넘기지 않는다.
8. **Owner 고정 작업 방식 (2026-10-19)**: 기존 감사·설계 재사용(같은 분석 반복 금지) · 한 작업 = main 에 한 번 반영(불필요한 분할 커밋·보고 금지) · 다른 도메인 수정 혼합 금지 · 검사는 최종 HEAD 에서 1회 · Preview 는 필수 단계 아님(접근 불가 시 반복 확인 금지) · 승인 변경은 충돌·회귀 확인 후 main 반영 + Production 반영 1회 확인 (작업 환경에서 Vercel·운영 주소 접근 불가면 로컬 검증 PASS + 배포 SHA 로 보고하고 Production 은 NOT_PROVEN 1회 표기 후 Owner 확인 — 반복 확인 금지) · 웹 변경은 기존 앱 재시작으로 확인, 네이티브 변경 시에만 새 빌드 · 승인된 완료 기준 외 조건 추가 금지 · 실제 결함만 수정(개선 과제 무한 추가 금지) · 완료 보고 = 원인·수정·검증·배포 SHA·남은 위험.
9. **시간 기준 = 필리핀 현지 시간 (2026-10-19)**: Owner 보고·일정·예약 작업의 시간은 **필리핀 시간(PHT, `Asia/Manila`, UTC+8)** 으로 표기한다 (예: `17:27 PHT`). 예약 작업 cron 은 `CRON_TZ=Asia/Manila` 로 등록한다. 서버(GitHub·Vercel·Supabase) 시계와 **DB 저장값은 UTC 그대로 두고 변경하지 않는다** — 필리핀 시간 변환은 표시 단계에서만 한다.
