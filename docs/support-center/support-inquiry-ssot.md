# 고객센터 문의(접수형) 단일 정의 — SSOT

- 상태: **확정 — 현재 동작만 적는다** (2026-11-29 전체 수정 반영 · 브랜치 `fix/support-low-residuals-2026-11-28` · 계약 `docs/audit/customer-support-full-fix-contract-2026-11-28.md`). 옛 「현재/목표」 표·수정 기록은 지웠다 → 12절 기록 목록과 git 기록.
- 이 문서가 고객센터 **문의**의 유일한 정의다. `support-ui-notification-ssot-spec.md`(2026-10-05, 채팅식)는 역사 기록.
- 범위 밖(별도 SSOT): 고객센터 게시판 `docs/dibay-customer-center-content-hard-lock.md` · 고객지원 화면 구성·뒤로 `docs/audit/customer-support-ssot-2026-11-26/report.md` · FAB 허용 화면 `support-fab-visibility-owner-lock.md`.
- 결함 번호는 감사 문서마다 따로 매겨졌다(같은 「D1」이 여러 문서에 있다). 이 문서는 번호 대신 **규칙**으로 적는다.

## 1. 무엇이 무엇인가

| 이름 | 정의 | 단일 출처 |
|---|---|---|
| 문의 1건 | `support_cases` 1행. 대상 MEMBER(회원) / OWNER(사장님, `owner_store_id` 필수) | `lib/support/support-case-service.ts` |
| 문의 내용 | `support_messages` — PUBLIC(고객·어드민 공개) / INTERNAL_NOTE(어드민 메모) | 같은 파일 · DB 함수 `support_append_message` |
| 사건 기록 | `support_case_events` — 상태 변경·담당·수정 원문·`admin_reply_seen`(답변마다 본 시각) | 같은 파일 |
| 분야·세부 | 코드 레지스트리 + 어드민 「문의 유형 관리」 덮어쓰기(`support_category_settings`) | `support-category-registry.ts`, `support-category-settings.ts` |
| 고객 화면 | 문의 창(전체 화면): 쓰기 → 접수 완료 → 상세 · 「내 문의」 페이지 | `components/support/SupportModalHost.tsx`, `SupportTicketViews.tsx`, `SupportCasesHistoryList.tsx` |
| 어드민 화면 | `/admin/support` (목록·대화·맥락) | `components/admin/support/AdminSupportPage.tsx` |

## 2. 상태와 전이

| 상태 | 고객 화면 이름·색 | 어드민 이름·색(탭 = 알약) |
|---|---|---|
| OPEN | 답변 대기 · 노랑 | 답변 필요 · 빨강 |
| WAITING_ADMIN | 답변 대기 · 노랑 | 답변 필요 · 빨강 |
| WAITING_USER | 답변 완료 · 초록 | 고객 확인 대기 · 노랑 |
| RESOLVED | 종료 · 회색 (안 읽은 답변이 있으면 「새 답변」 · 초록) | 종료 · 회색 |
| ARCHIVED | 종료 · 회색 (〃) | 보관 · 회색 |

단일 정의: 고객 = `supportRequesterStatusPill` (`lib/support/support-status-label.ts`) · 어드민 = `components/admin/support/admin-support-status.ts` + `supportAdminStatusLabel(status, t)`.

| 동작 | 누가 | 결과 |
|---|---|---|
| 접수 | 고객 | DB 함수 `support_open_case` **한 트랜잭션**(같은 진행 중 키 잠금 → 요청 id 재전송 확인 → 진행 중 문의 있으면 붙이기 / 없으면 문의·세션·첫 글·사건). 새 문의 OPEN, `admin_unread_count = 1`. 같은 분야 진행 중 문의에 붙으면 WAITING_ADMIN (접수 완료 = 「진행 중인 문의에 추가했어요」 + 기존 문의 번호). 붙는 글도 8000자 |
| 추가 문의 | 고객 | WAITING_ADMIN, 어드민 미읽음 +1 |
| 요청 id | 고객 접수·추가 문의 · 어드민 답변 | 본문에 묶인 `requestId`(uuid). 같은 id 재전송 = 새로 쓰지 않고 처음 결과(`replayed: true` · 알림·미읽음·속도 제한 소모 없음 · 속도 제한보다 먼저 확인). 남의 글에 쓰인 id = 409 `request_id_conflict` · id 없는 요청(배포 전 웹 번들 — 앱 재시작 전)은 예전처럼 처리 |
| 속도 제한 | 고객 | 접수·추가 문의 합쳐 **1분 5건 · 1시간 30건** 초과 = 429 `rate_limited` |
| 답변 | 어드민(support) | DB 함수가 WAITING_USER · 고객 미읽음 +1 → 3절 「답변 정리」로 아무도 안 본 고객 글이 남으면 WAITING_ADMIN |
| 답변 삭제 | 그 어드민 | 내용 숨김(고객 화면 빈 자리) · 그 답변 알림이 안 읽혔으면 고객 미읽음 −1 · 남은 답변 기준으로 다시 판정 → 답 못 받은 고객 글이 생기면 WAITING_USER 였으면 WAITING_ADMIN 으로, 이미 「답변 필요」(WAITING_ADMIN · 재오픈 OPEN)면 상태 그대로 · 지운 답변이 봤던 글의 어드민 알림만 되살림(첫 고객 글이면 제목 「새 고객 문의」) |
| 답변 수정 | 그 어드민 | 8000자 상한 · 수정 전 원문은 사건 기록 · 고객 화면 「수정됨」 |
| 확인했어요 | 고객 | **WAITING_USER 에서만** (OPEN·WAITING_ADMIN = `invalid_transition` · 이미 종료 = 성공으로 봄(같은 요청 두 번)). 화면이 본 마지막 글 시각과 다르면 `case_updated` → 다시 읽어 새 답변을 보여 줌. 성공 = RESOLVED, 알림 없음 |
| 상담 종료 | 어드민 | RESOLVED, 고객 「종료」 알림. 화면이 본 마지막 글 시각(`seenLastMessageAt`)과 다르면 **409 `case_updated`**(그 뒤 온 고객 글을 못 본 종료 방지) → 다시 읽음 |
| 보관 / 보관 해제 | 어드민 | RESOLVED ↔ ARCHIVED (알림 없음) |
| 재오픈 | 어드민만 (고객 API reopen = 400) | RESOLVED·ARCHIVED → OPEN, 고객 알림 |
| 담당 지정 | 어드민(support) | 진행 중 문의만(종료·보관 = `case_closed`) · 읽은 담당자 CAS(경합 = `case_updated`) · 같은 사람 재지정 = 변화 없음 |
| 7일 자동 종료 | 정기 작업(매시 첫 실행, 판정 = 작업 시작 시각) | WAITING_USER 이고 마지막 **공개 글** 뒤 7일 → RESOLVED, 고객 알림 없음, 사건 `auto_7d` |

상태 전이(종료·확인했어요·자동 종료·보관·보관 해제·재오픈·담당·우선순위)는 DB 함수 `support_transition_case` **하나**의 표로만 — 상태·미읽음·세션·사건·어드민 알림 읽음을 한 트랜잭션, 이미 목표 상태면 성공(`changed=false`). 모든 상태 변경은 CAS(읽은 상태·시각과 같을 때만). 어드민 PATCH `status` 는 RESOLVED 만(보관 = `archive`). 오류 → HTTP 상태 표 하나(`supportErrorHttpStatus`: 입력 400 · 권한 403 · 없음 404 · 경합 409 · 속도 429 · 서버 500·503). 어드민 메모는 `last_message_at`·상태를 바꾸지 않는다. 종료 문의엔 공개 글 불가(DB 함수가 잠금 안에서 거부, 글 시각 = 잠금 뒤 `clock_timestamp`).

## 3. 알림

### 3-1 고객
| 사건 | 종류 | 누르면 |
|---|---|---|
| 어드민 답변 | `support_admin_replied` | 문의 상세 |
| 어드민 종료 | `support_case_resolved` | 안 읽은 답변이 있으면 그 내용 + 「확인」, 없으면 「종료된 문의예요」 + 「문의하기」 |
| 어드민 재오픈 | `support_case_reopened` | 문의 상세 |
| 접수·담당 지정·자동 종료 | 없음 | — |

종료·재오픈 고객 알림은 DB 함수가 상태를 바꾸는 **같은 트랜잭션**에서 재시도 대기열에 안전망 행(앱과 같은 dedupe 키)을 넣는다 — 앱이 알림 저장 전에 끊겨도 5분 작업자가 만들고, 앱이 먼저 만들었으면 「이미 있음」으로 닫는다(그사이 상태가 다시 바뀌었으면 만들지 않음). 고객 알림 행은 **응답 전에** 저장(같은 요청 · 실패면 1번 더 · 그래도 실패면 어드민 알림과 같은 재시도 대기열에 고객 알림 사건을 넣어 5분 작업자가 다시 만듦), 푸시는 응답 뒤 — 보내기 직전 행을 다시 읽어 지운 답변이면 안 보내고 고친 답변이면 고친 본문. 미읽음 숫자·알림 읽음 쓰기는 `support-notification-ledger.ts` 한 곳.

**읽음 = 화면에 보인 것**: 상세 GET 은 읽기만. 화면이 실제로 보일 때(문서 visible · 그 상세가 맨 위 · 그린 뒤) `POST {action:"seen", shownMessageIds, seenLastMessageAt}` 로 보여 준 글의 알림만 읽음. GET 이 `needsSeen=false`(읽을 것 없음)면 seen 을 보내지 않는다.

### 3-2 어드민
- 종류: `support_customer_replied`(고객 글 1건 = 1알림, 키 `support_customer_replied:<글 id>`, 제목 「새 고객 문의 · SC-…」/「고객 추가 문의 · SC-…」 — 앱 즉시 발송·다시 알림은 카탈로그 키. 5분 재생 SQL 은 한국어 제목을 저장하지만 대기열 작업자가 보낼 때 카탈로그 키로 다시 만든다(문의를 못 읽으면 저장값) · `support_case_assigned`.
- 받는 사람: 담당자(support 권한) / 담당자 없거나 담당자 = 글쓴이 → support 권한 어드민 전원. 보낸 사람 본인 제외. **정지·차단·탈퇴 운영자(최고관리자 제외)와 프로필을 못 읽은 운영자는 받는 사람·담당자에서 빠진다**(판정 1곳 `resolveAdminRecipientAuthority` · 정지·차단 처리 때 담당 해제 + 전원 다시 알림 · 재오픈 때 받을 수 없는 담당자 해제). 푸시는 10명씩 동시.
- **「이 고객 글에 어드민 일이 남았나」 (단일 규칙 `supportReplySawMessage`)**: 문의가 OPEN·WAITING_ADMIN 이고, 그 글 뒤 어드민 공개 답변 중 **그 글을 본 답변**이 없을 때. 「봤다」 = 답변이 저장 직후 맨 먼저 남긴 `admin_reply_seen.seen_at ≥ 글 시각`. `seen_at` = 어드민이 답을 보낼 때 **화면에 보이던** 마지막 글 시각(답을 쓰는 사이 새 고객 글이 화면에 나타나면 「답을 쓰는 사이 고객 글이 더 왔어요」 안내). 기록이 아직 없는 답변 = 안 봤음(2026-11-28 이전 옛 답변만 봤음). 앱 즉시 발송·대기열 작업자·답변 정리·답변 삭제가 모두 이 규칙 하나(`reconcileSupportAdminWork`).
- **답변 정리**: 본 시각 기록 → 답 받은 글 알림만 받은 어드민 전원 읽음 + 담당 지정 알림 읽음 → 상태를 최신 어드민 답변 기준으로 맞춤(안 본 글 있음 = WAITING_ADMIN, 없음 = WAITING_USER, CAS 마지막 글 = 최신 답변) → 남은 글 알림 없으면 만듦.
- 그 밖에 일이 끝나면(종료·보관·「확인했어요」·자동 종료) 받은 어드민 전원 읽음. 어드민 상세 GET 은 읽기만 — 콘솔이 화면이 보일 때만 `seen` 을 보내 그 어드민 것만, 보여 준 글까지 읽음(숨은 탭에서 자동으로 다시 읽은 상세는 다시 보일 때).
- **담당 수동 해제·재배정**: 옛 담당자의 그 문의 알림(고객 글·지정)은 읽음, 답 못 받은 고객 글은 새 담당자(해제면 support 전원)에게 다시 알림.
- 발송 실패 = outbox(재시도 8회) · 5분 재생 SQL(OPEN·WAITING_ADMIN, 72시간). 판정 「끝난 일」이면 처리됨 표시. 처리됨 표시가 있는데 다시 보내야 하면 그 행을 대기로 되살린다.
- 담당자가 support 권한을 잃으면 진행 중 문의의 담당을 풀고(규칙 1곳 `releaseSupportAssigneeOnActiveCases`) 답 못 받은 고객 글을 support 전원에게 다시 보낸다(응답 뒤 · 1회 최대 200건, 5개씩 동시 — 넘는 글은 기록만 남기고 탭·목록으로 보임).
- 토스트·소리: 고객 공개 글 1건 = 1회, 어드민 본인 행동·본인이 고객으로 쓴 글 = 0.

## 4. 숫자(배지)
| 숫자 | 정의 | 읽는 곳 |
|---|---|---|
| 고객 FAB | 진행 중 문의 + 종료됐지만 안 읽은 답변 있는 문의의 `requester_unread_count` 합 | `GET /api/support/cases?summary=unread` · 같은 사용자·대상 요청 공유 + 5초 캐시 · 다시 읽음 = 고객지원 알림 행 INSERT·UPDATE(읽음)·재연결·앱 복귀·창 닫힘 · 목록·숫자도 상세와 같은 매장 소유 확인(창이 열릴 때 캐시를 낡음 표시 → 닫힌 뒤 다시 붙는 FAB 가 새로 읽음 · 진행 중이면 끝난 뒤 1번 더) · 사용자 바뀜·401 = 0 |
| 어드민 사이드바 | OPEN+WAITING_ADMIN 수 | `admin-bell` |
| 어드민 헤더 받은 알림 | 내 `admin_notifications` 안 읽은 수 | 내 알림 행 생성·읽음 실시간(`recipient_admin_id=eq.본인` · 300ms 묶음) · seen·저장 성공 직후 |
| 어드민 목록 빨간 숫자 | `admin_unread_count` (첫 글 1 · 종료 시 0) — **문의 단위**(누가 열어 seen 하면 모두 0 · Owner 결정 2026-11-29 권장안) | 목록 행 |

## 5. 로그인 · 권한 · 노출
| 항목 | 규칙 |
|---|---|
| 비로그인 「문의하기」 | 로그인/가입 안내(맥락 저장) → 로그인 뒤 같은 창. 창을 열 때 로그인 확인 중 = 스피너 |
| 고객 API (`/api/support/**`) | 로그인 필수(예외: `category-settings` = 공개 표시값) · 목록·숫자 = 본인이 보낸 문의만 · 상세·글·종료 = 본인 + 사장님 문의는 매장 소유 재확인 · 응답 필드 고정(`support-requester-view.ts`: 담당자·우선순위·어드민 id·어드민 미읽음 없음, 삭제 글 본문 비움, `edited_at` 포함) · DB 오류 원문 대신 고정 키 |
| 어드민 API (`/api/admin/support/**`) | 전부 `requireAdminPermission("support")` (목록·상세·PATCH·분야 설정·안내문) |
| DB 직접 조회·실시간 (RLS) | 고객 직접 SELECT 없음 · 어드민 = `internal.support_admin_has_support_permission` (활성 membership + support 권한) — 운영 적용 2026-11-28. **정지 운영자 제외**는 `20271128210000` — 운영 적용 2026-11-28 (`docs/audit/customer-support-inquiry-final-2026-11-28/rls-suspended-apply-result.md`) |

## 6. 화면 · CTA
공통: 문의 창 버튼 = **44px · 모서리 4px** (`SUPPORT_BTN`), 다시 시도 = `SupportRetryButton` 하나, 로딩 = DIBAY 스피너 하나. 사장님 문의의 주 버튼 = **갈색**(누를 수 있을 때·전송 중), 진짜 비활성만 회색 — 정의 `support-owner-cta.ts` 하나.

| 화면 | 버튼 | 결과 · 비활성 |
|---|---|---|
| 고객지원 허브 · FAB · 맥락 화면 | 문의하기 | 쓰기 화면. 사장님인데 매장 없음 = 보이되 비활성 + 안내 1번 |
| 쓰기 | 분야·세부(44px) · 문의 접수 | 접수 완료. 비활성 = 분야·세부·내용 없음·전송 중 · 회원↔매장 전환(누르는 영역 44×44, 매장 있는 회원만) · 쓰는 글 자동 저장(닫기·뒤로·상세 열기 때 바로 저장 · 「작성 중인 문의가 있어요」 카드가 떠 있을 때 아래 **내용 칸**에 새로 쓰기 시작하면 카드를 닫고 새 글을 저장(분야 고르기·전환으로는 카드 유지, 빈 내용으로 옛 초안을 지우지 않음) · 이어 쓰기 = 초안의 대상·매장·분야·세부·내용 그대로) |
| 쓰기 — 진행 중인 문의 | 행(60px, 알약, ›) | 같은 창 상세. 돌아오면 입력 그대로(쓰기 화면은 숨긴 채 유지) · 불러오기 실패 = 안내 + 다시 시도 |
| 접수 완료 | 내 문의 보기(보조) · 확인(보조) | 내 문의 / 닫기 (성공이면 보낸 그 글의 초안만 지움 · 실패면 글·초안 그대로 · 시간 초과로 끊긴 접수는 같은 요청 id 로 다시 시도 → 중복 없음) |
| 상세 — 답변 대기 | 확인(보조) | 닫기 (「진행 중인 문의」에서 연 상세 = 쓰기 화면으로) |
| 상세 — 답변 완료 | 추가 문의(보조) · 확인했어요(주, 위에 「문의가 종료되고 목록에서 사라져요」 한 줄) | 입력칸 + 취소·보내기 (추가 문의 글은 문의별 임시 저장, 보내거나 취소하면 지움) / 종료 |
| 상세 — 종료+안 읽은 답변 | 확인(보조) | 닫기(그 뒤 내용 숨김 — ✕·◁ 로 닫아도 같음 · 같은 앱 실행 중 옛 푸시로 다시 열어도 「종료된 문의예요」) |
| 상세 — 종료 | 문의하기 | 같은 대상 새 쓰기(그 문의의 대상·매장 먼저) |
| 내 문의 (회원·사장님 같은 컴포넌트) | 행 · 더 보기 · 빈 목록(회원 = 「문의하기」, 사장님 = 안내만) | 상세. 안내 「종료된 문의는 답변을 확인하면 목록에서 사라져요」 |

- **요청 중 (상태 기계 `support-modal-machine.ts` + 요청 실행기 `support-modal-ops.ts` 하나)**: 쓰기 요청(접수·추가 문의·확인했어요)은 동시에 1개. 요청 중에는 창의 **모든 버튼·✕·‹·입력칸이 같은 `busy` 로 잠김**(분야·세부·요금표·전환·진행 중 행·매장 채팅·추가 문의 입력·취소·확인했어요·문의하기). 그 사이 온 닫기·◁·이동·푸시 열기는 **1개 보관했다가 결과가 그 화면에 붙은 뒤** 실행(접수 성공 직후 ◁ 가 실행되면 「접수 완료」를 거치지 않고 닫힘). 시간 제한 쓰기 20초 · 읽기 15초 → 「연결 오류」. 401 = 세션 살리기 1번 뒤 로그인 안내(모든 요청 같은 규칙). 결과는 (창 회차·화면·문의)가 맞을 때만 그 화면에 붙는다.
- **기록 항목**: 창 아래에서 경로가 바뀌어 창이 닫히면 창이 넣은 항목은 기록 중간에 남는다 — 그 회차 표지를 이 탭 메모리에 두고, ◁ 로 그 항목에 돌아오면 한 번만 더 뒤로 가 건너뛴다(◁ 두 번 필요 없음). 표지는 쓰면 지워 앞으로 가기는 막지 않고, 새로고침하면 비워 남은 옛 항목 때문에 보던 화면을 떠나지 않는다.
- **열기**: 푸시·알림으로 다른 문의를 열면 지금 화면 위에 쌓는다(쓰기 중이면 쓰기 화면은 뒤에 그대로 — ‹·◁ = 쓰기 화면, Owner 결정 2026-11-29 권장안). 같은 문의면 다시 읽는다. 접수 완료·로그인 화면 위에서도 열린다. 다른 맥락으로 열면 새 쓰기 화면. 창 아래에서 경로가 바뀌면(다른 화면으로 이동) 창을 닫는다. 진입 주소(`/support/cases/…`·`/support/enter`)는 주소를 정리한 뒤 창을 연다(◁ 반복 없음).
- **뒤로**: 화면 ‹ 와 기기 ◁ 는 같다 — 한 단계 뒤로(분야 선택·요금표·진행 중 상세 → 쓰기, 추가 문의 입력 → 입력칸 닫힘). 첫 단계에서만 창을 닫는다. 「진행 중인 문의」에서 연 상세의 「확인했어요」·「확인」도 쓰기 화면으로 돌아간다. 푸시·목록에서 바로 연 상세는 닫는다.
- 초점: 상세를 열면 상세 제목, 돌아오면 눌렀던 행. 전송 중 버튼도 이름이 읽힌다.
- 안내 문구: 답변은 **알림**으로 알려 드린다(사장님 고객센터 화면엔 FAB 없음 · 매장 운영 상태 등 FAB 허용 화면엔 사장님 갈색 FAB — `support-fab-route-registry.ts`).
- 어드민: **저장하는 동안은 목록에서 다른 문의를 누를 수 없다**(저장 결과·실패 안내가 그 문의 화면에 뜨도록) · 답변·메모 / 나에게 배정·해제 / 우선순위(NORMAL·HIGH·URGENT) / 상담 종료 / 보관 / 재오픈(종료·보관 모두) / 보관 해제 / 수정·삭제(본인 글, 삭제는 사유+재입력). **다른 문의를 누르면 상세를 바로 비우고, 지금 열린 문의의 응답만 그리며, 모든 동작은 화면에 보이는 문의 = 열린 문의일 때만 그 id 로 보낸다.** 좁은 화면에서 주 동작은 44px. 종료 문의는 공개 답변 칸 대신 「재오픈」 안내. 답을 쓰는 사이 고객 글이 더 오면 「답을 쓰는 사이 고객 글이 더 왔어요」 · `case_updated` 면 다시 읽고 「그사이 문의가 바뀌어 다시 불러왔어요」.

## 7. 실시간 · 요청 예산
- 고객: 문의 표 실시간 구독 없음(서버 API 만). FAB·「내 문의」는 4절 신호로만 다시 읽음(support_* 알림 행일 때만 — 다른 알림 읽음으로는 안 읽음).
- 어드민: 공통 구독(Provider) **1곳**만 support 권한일 때 `support_messages` INSERT·`support_cases` INSERT/UPDATE/DELETE·내 `admin_notifications` 를 받는다(`admin_notifications` 실시간 등록 = 마이그레이션 `20271129100000`). 콘솔은 자기 구독 없이 공통 구독의 창 이벤트로 받는다. 다시 읽기는 목록에 있는 문의면 보이는 값(상태·담당·마지막 글·우선순위·어드민 미읽음)이 바뀔 때만. 목록 밖 문의는 새 상태가 지금 탭에 속하면 바로(실시간 이전 값이 없어 탭에 새로 들어온 것인지 알 수 없음 — 「전체」 탭은 늘 바로), 아니면 30초에 1번(탭 숫자 맞춤). 내 작업 메아리: 문의 행은 보내는 동안만, 내가 쓴 글은 보낸 뒤 3초까지 건너뜀. 공통 구독은 글 INSERT 마다 숫자를 1번 다시 읽는다(300ms 묶음). 읽음 처리는 값이 바뀔 때만 UPDATE. 콘솔 목록은 가장 최근 요청 응답만 그리고, 열린 문의의 상태·담당이 다른 곳에서 바뀌거나 `case_updated`·`case_closed`·`status_conflict`·`invalid_transition`·`invalid_seen_last_message_at` 이면 상세를 다시 읽는다.
- 요청 예산(`lib/perf/request-budget.ts` · `docs/request-budget-ssot.md`) — **실측으로 모두 예산 이하**(시험이 고정): `/api/support/cases` 3 · `/api/support/cases/[caseId]` 7 · `/api/support/cases/open` 7 · `/api/admin/support/cases` 12 · `/api/admin/support/cases/[caseId]` 13. 받는 어드민 수 비례 알림·푸시·숫자 신호는 응답 뒤.

## 8. 보관 · 정리
- `support_cases`·`support_messages`·`support_case_events`(본 시각·수정 원문 포함) = 업무 기록, **정리하지 않는다**(문의 삭제 시 함께 삭제).
- outbox 처리된 고객센터 행 = 30일 뒤 정기 작업이 정리(1회 1000행).
- `admin_notifications` = 보관 정리는 `ADMIN_NOTIFICATION_ARCHIVE_ENABLED=1` 일 때만(어드민 알림 공통 설정).
- 안내문 API(`/api/support/guidance`, `/api/admin/support/guidance`) = 화면 호출 0, AI 자동 답변 결정 때 쓰거나 지운다(Owner 「AI 는 이후」). 수정은 revision CAS(경합 409 `guidance_revision_conflict`). 쓰지 않던 `admin-support-queue-policy.ts`·`support-first-admin-response.ts` 는 지웠다. control-plane API 는 호출 0 이라 삭제. 실시간 주제 인가 함수의 고객 분기(`support-modal-case-*`)는 쓰는 화면이 없고 행 전달은 RLS 가 막는다 — DB 함수라 그대로 둔다.

## 9. AI 자동 답변
없음. Owner 2026-11-28 「지금은 아님」.

## 10. 정한 동작(결함 아님) · 고객센터 밖
정한 동작 — 일이 숨지 않는 쪽으로 정했고, 다음 행동에서 바로잡힌다:
- 보낼 때 「본 시각」 = 상세 응답의 문의 행 값 — 상세를 읽는 짧은 사이에 온 고객 글은 「안 봤음」(「답변 필요」에 남음).
- 동시 답변 정리가 역순으로 끝나면 WAITING_ADMIN 으로 남음(남기는 쪽 — 다음 답변·종료 때 바로잡힘).
- 「답변 → 바로 종료」 시 고객 알림 도착 순서는 보장하지 않음(둘 다 도착).
- 속도 제한은 센 뒤 저장 — 동시에 몰아 보내면 한도를 1~2건 넘을 수 있음.
- 답변 삭제로 「답변 필요」에 돌아와도 `admin_unread_count` 는 올리지 않음(탭·알림으로 보임).
- 마이그레이션 버전 `20271128210000` 이 두 파일(`support_rls_suspended`·`moim_r1_permissions_data`)에 겹침 — 둘 다 운영 적용됨, 운영 이력 이름이 달라 파일 이름은 바꾸지 않음.

고객센터 밖(공통 컴포넌트 · 보고만): 「내 문의」 「더 보기」 40px = 내정보 공용 `MyListPager` · 어드민 공통 버튼 `AdminActionButton` sm 32px·`adminCta(…, ko)`.

## 11. 확인 상태 (2026-11-28)
| 항목 | 코드 | 운영 | 실기기 |
|---|---|---|---|
| 고객 허브·문의 창·내 문의 모양(로그인 회원) | PASS | 버튼 44px·4px 실측 PASS (이번 수정 전 판) | NOT_PROVEN |
| 어드민 콘솔 탭 숫자·종료 상세 | PASS | 실측 PASS (이번 수정 전 판) | — |
| RLS(고객 0행·support 어드민 전체) | — | 역할 시험 PASS | — |
| 어드민 알림 생성·푸시 · 답변 정리 | PASS(시험) | NOT_PROVEN(배포 뒤 문의 0건) | NOT_PROVEN |
| 사장님·비로그인 화면 · 기기 ◁ | PASS(시험) | NOT_PROVEN | NOT_PROVEN |

## 12. 기록
감사·설계·적용 기록(이 문서의 근거): `docs/audit/customer-support-full-reaudit-2026-11-28.md`(전체 재감사) · `docs/audit/customer-support-full-fix-contract-2026-11-28.md`(전체 수정 계약) · `docs/audit/customer-support-inquiry-reaudit-2026-11-27/` (report · evidence · final-reaudit · final-reaudit-2 · data-cleanup · db-apply-result) · `docs/audit/customer-support-inquiry-final-2026-11-28/` (final-audit · final-audit-2 · ui-mockup · rls-apply-result · data-cleanup-l13-result). PR #671 · #673 · #675~#678 · #683 · `fix/support-final-check-2026-11-28`.
