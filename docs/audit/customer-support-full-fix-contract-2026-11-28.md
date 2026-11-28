# 고객센터 전체 수정 — 공통 계약 (구현 기준 · 2026-11-28)

근거: `docs/audit/customer-support-full-reaudit-2026-11-28.md` (결함 번호 C-·S-·A-·B-·D-·E-·T-).
Owner 지시(2026-11-28): 「수정안대로 진행해라, Owner 결정 필요 부분은 권장안을 만들어 진행 해라」.

## 0. Owner 결정 4건 = 권장안으로 확정
1. 쓰기 중 푸시로 다른 문의가 열리면 **쓰기 화면을 뒤에 유지**(상세 ‹·◁ = 쓰기 화면, 입력 그대로).
2. 담당 **수동 해제·재배정** 때 답 못 받은 고객 글 알림을 **다시 보냄**: 재배정 = 새 담당자, 해제 = support 권한 어드민 전원. 옛 담당자의 그 문의 미읽음 알림(고객 글·지정)은 읽음 처리.
3. 어드민 목록 빨간 숫자 = **지금대로 문의 단위**.
4. 어드민 프로필을 못 읽으면 **정지로 봄**(fail-closed, RLS 와 같게).

## 1. 요청 id (중복 방지 · S-1·S-2·S-3·C-2·C-7)
- 클라이언트는 쓰기 요청마다 `requestId`(uuid v4 문자열)를 JSON 본문에 넣는다:
  - `POST /api/support/cases/open` (접수)
  - `POST /api/support/cases/[caseId]` 추가 문의(`{ body, requestId }`)
  - `PATCH /api/admin/support/cases/[caseId]` `action: "reply"` (답변·내부 메모)
- id 는 **보낸 본문에 묶는다**: `{ requestId, body }` 로 저장(쓰기 초안·추가 문의 임시 저장·어드민 답 입력 상태). 본문이 같으면 다시 보낼 때 같은 id, 본문이 바뀌면 새 id. 성공하면 지운다.
- 서버: `support_messages.client_request_id uuid NULL` + 유일 부분 인덱스. 같은 id 의 글이 이미 있으면 **새로 쓰지 않고 처음 결과를 돌려준다**(`replayed: true`) — 알림·푸시·미읽음 증가·속도 제한 소모 없음. 멱등 확인은 **속도 제한보다 먼저**.
  - 접수 replay 응답 = 처음과 같은 `case`·`created` 값.
- `requestId` 가 없으면(구 클라이언트) 지금처럼 동작(호환).

## 2. 원자 DB 함수 (Owner 승인 후 운영 적용 · 파일은 이 PR)
- 새 마이그레이션 1개 `supabase/migrations/20271129100000_support_full_fix.sql` (+ 같은 이름 `_rollback.sql` 주석 블록 또는 별도 파일).
- `support_append_message(...기존 인자..., p_client_request_id uuid DEFAULT NULL)` → 기존 반환 + `replayed boolean`. 기존 호출과 호환.
- `support_open_case(...)` 한 트랜잭션: dedupe 키 `pg_advisory_xact_lock` → client_request_id replay 확인 → 진행 중 문의 조회 → 있으면 글 붙이기(append 와 같은 규칙) / 없으면 문의·세션(`ON CONFLICT DO NOTHING`)·첫 글·`case_created` 사건. 검증(분야·안내문·매장 소유·속도 제한)은 TS 가 먼저 한다. `discardFailedNewCase` 경로 제거(S-4). 붙이는 글 상한 8000자(S-5).
- `support_transition_case(...)` 한 트랜잭션 상태 전이 표:
  | 행위 | 허용 |
  |---|---|
  | 어드민 종료 | OPEN·WAITING_ADMIN·WAITING_USER → RESOLVED |
  | 고객 확인했어요 | WAITING_USER → RESOLVED (+본 시각 CAS) |
  | 자동 종료 | WAITING_USER → RESOLVED |
  | 보관 / 보관 해제 | RESOLVED → ARCHIVED / ARCHIVED → RESOLVED |
  | 재오픈(어드민만) | RESOLVED·ARCHIVED → OPEN |
  | 담당 지정·해제 | 진행 중만, 기대 담당자 CAS |
  | 우선순위 | 진행 중만, 같은 값 = 쓰기 없음 |
  - 같은 트랜잭션에서 상태·미읽음 0·세션 닫기·사건 기록. **이미 목표 상태면 `changed=false` 로 ok**(멱등, S-16·S-17·S-15).
- 인덱스: `admin_notifications (dedupe_key)` (B-4).
- 재생 SQL(5분 작업)의 `internal.is_platform_admin` → `internal.support_admin_has_support_permission` (S-8).
- 롤백 SQL 을 같은 PR 에 둔다. **운영 적용은 Owner 승인 후**. 웹 코드는 함수가 없을 때(적용 전) 실패하지 않도록 하지 않는다 — 순서는 「DB 적용 → 웹 병합」으로 고정.

## 3. 읽음 = 화면에 보인 것 (A-1·C-14)
- 고객 `GET /api/support/cases/[caseId]`·어드민 `GET /api/admin/support/cases/[caseId]` 는 **읽기만** 한다(읽음 처리 제거).
- 읽음 처리는 별도 요청:
  - 고객: `POST /api/support/cases/[caseId]` `{ action: "seen", shownMessageIds: string[], seenLastMessageAt: string|null }`
  - 어드민: `PATCH /api/admin/support/cases/[caseId]` `{ action: "seen", shownMessageIds, seenLastMessageAt }`
  - 서버 규칙은 지금의 GET 안 읽음 처리와 같다(보여 준 글만 · 그 뒤 새 글이 왔으면 0 으로 만들지 않음 · 종료+안 읽음 1회 노출 규칙 포함).
- 클라이언트는 **그 화면이 실제로 보일 때만**(`document.visibilityState === "visible"` · 그 문의 상세가 현재 화면 · 응답이 그려진 뒤) seen 을 보낸다. 숨겨진 상태에서 받은 내용은 다시 보일 때 보낸다.
- 요청 예산(`lib/perf/request-budget.ts`) 을 같은 PR 에서 맞춘다.

## 4. 숫자 신호 (A-2·A-3·A-11·B-5)
- 새 실시간 채널을 만들지 않는다. 신호 = **서버가 쓰는 행의 기존 실시간 구독**.
- 고객: 미읽음 숫자(`requester_unread_count`)를 바꾸는 모든 쓰기는 같은 요청 안에서 그 고객의 support_* 알림 행을 INSERT 또는 UPDATE 한다(원장 규칙). 고객 FAB·「내 문의」 목록은 support_* 알림 행 **INSERT·UPDATE** 둘 다에 다시 읽는다(지금은 INSERT 만).
- 어드민: 고객센터 알림 행(admin_notifications) 생성·읽음 뒤 헤더 받은 알림 숫자가 1초 안에 바뀐다(`ADMIN_INBOX_CHANGED_EVENT` 또는 공통 구독). `support_cases` 구독은 공통 구독 1곳만(콘솔은 창 이벤트로 받음).
- 쓰기 위치: `lib/support/support-notification-ledger.ts` 한 곳(미읽음 숫자·support 알림 읽음/생성/되살림).

## 5. 문의 창 (C-1~C-22)
- `lib/support/support-modal-machine.ts`(기존 `support-modal-controller.ts` 흡수·같은 공개 함수는 유지하거나 호출처 전부 교체):
  - 상태 `{ session, stack: View[], inflight }`, View = compose / detail / submitted / login.
  - 사건 = intent: close · back(‹·◁ 같은 경로) · navigate(href) · open_case · open_context · route_changed · auth_out.
  - inflight 중에는 close·back·navigate·open 을 **1개 보관**했다가 결과 뒤 실행. 모든 버튼은 같은 `busy` 로 비활성(쓰기·분야·세부·요금표·전환·진행 중 행·매장 채팅·머리글 ✕·상세 ✕·‹·추가 문의 입력칸·취소·확인했어요·문의하기).
  - open_case 는 stack 에 쌓음(쓰기 유지 · 결정 1) · 같은 문의면 다시 읽기 · submitted·login 위에서도 반영.
  - open_context 가 다른 맥락이면 새 쓰기 화면(새 key).
- `lib/support/support-modal-ops.ts` 요청 실행기 하나: 접수·추가 문의·확인했어요·seen·상세 읽기·진행 중 목록.
  - 쓰기 요청 동시 1개 · AbortController · 시간 제한 20초(쓰기)/15초(읽기) · 401 = `ensureSessionHealthy` 1회 재시도 뒤 login 화면.
  - 결과는 (session, viewId, caseId) 가 맞을 때만 그 View 에 붙임. 확인했어요 성공 = 그 caseId 상세만 pop.
  - 시간 제한으로 끊긴 쓰기 = 「연결 오류」 + 같은 requestId 로 다시 시도(서버 replay 로 중복 없음).
- 기록 항목: 넣은 항목을 모듈이 추적(`history.state` 표시 의존 제거). `usePathname` 변화(호스트가 시작하지 않은 이동) = route_changed → 창 닫고 기록 항목은 소비된 것으로 처리(C-20).
- 진입 주소(`SupportCaseBootstrapClient`·`SupportCenterEnterClient`): 주소 정리(`router.replace`) 가 끝난 뒤 열기 → ◁ 반복 없음(C-21).
- 진행 중 목록: `limit=5` · 대상이 바뀌면 행 비움 · 실패 = 안내+다시 시도(C-18·B-1). 요금표는 창 열린 동안 1번(B-2).
- 초안: 빈 내용으로 옛 초안 삭제 금지 — 지우기는 카드 확인·접수 성공 때만. 종료+안 읽은 답변 기억은 ✕·◁ 로 닫아도 지움.

## 6. 권한·소유 (S-7·A-6·A-7·결정 4)
- 「support 권한 어드민」 판정 1곳(`admin-notification-service.ts`)·프로필 못 읽음 = 정지로 봄.
- 회원 정지(`admin-member-moderation.ts` suspend) → `releaseSupportAssigneeOnActiveCases` + 전원 다시 알림(권한 회수와 같은 규칙).
- 재오픈 → 담당자가 받을 수 없으면 해제.
- FAB 숫자·「내 문의」 목록도 상세와 같은 매장 소유 확인.

## 7. 정리 (D-·E-·문서)
- 삭제: `lib/support/admin-support-queue-policy.ts`, `lib/support/support-first-admin-response.ts`, `support-triage-model.ts` 죽은 `buildShortTriageSeed` 와 그 시험. 안내문 API 는 계약 §8 대로 유지하되 수정 CAS.
- PATCH `status: ARCHIVED` 경로 제거(archive 하나) · 목록 filter/tab 하나로.
- 오류 코드: 서버 실패 5xx · 경합 409 · 라벨표(`support-display-labels.ts`·어드민 라벨)에 빠진 코드 추가.
- 어드민 OPEN = 「답변 필요」 · FAB 갈색 = `support-owner-cta.ts` · `AdminSupportArchivePage` 언어 삼항 제거.
- 마이그레이션 번호 중복: `20271128210000_support_rls_suspended.sql` 은 운영에 이미 적용됨 → 파일 이름은 그대로 두고 SSOT 에 적용 기록만(운영 이력 이름 불일치 방지).

## 8. 시험 규칙
- 결함마다 **동작 시험**(문자열 확인 금지). 기준 트리 `d2e0fc07f` 에서 실패해야 한다 — 확인은 별도 작업 트리 `/private/tmp/claude-501/-Users-bkkim--claude-spares-spare-a5h4H1/1c151bd8-a55a-48b5-baac-944b6e1fe96c/scratchpad/base-d2e0fc0` 에 시험 파일만 복사해 `npx vitest run <file>` (공용 작업 트리의 파일을 바꿔치기하지 않는다).
- 문자열만 보던 「구조 확인」 시험 중 동작을 주장하는 것은 동작 시험으로 바꾼다(T-1).
