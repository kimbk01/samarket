# 고객센터 문의(접수형) 단일 정의 — SSOT

- 작성: 2026-11-27 · 상태: **확정** — Owner 「구현 진행」(2026-11-27) · 구현 PR `fix/support-inquiry-ssot` (§11 구현 기록). ★ 표시 = 이 PR 로 바뀐 동작
- 기준 코드: `origin/main` **45493ecb7** · 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 (증거: `docs/audit/customer-support-inquiry-reaudit-2026-11-27/evidence.md`)
- 이 문서가 고객센터 **문의**의 유일한 정의다. `support-ui-notification-ssot-spec.md`(2026-10-05, 채팅식)는 **역사 기록**으로만 남는다(아래 §9 대체 표).
- 범위 밖(별도 SSOT): 고객센터 게시판(`docs/dibay-customer-center-content-hard-lock.md`), 고객지원 화면 구성·뒤로(`docs/audit/customer-support-ssot-2026-11-26/report.md`), FAB 허용 화면(`support-fab-visibility-owner-lock.md`).

## 1. 무엇이 무엇인가

| 이름 | 정의 | 단일 출처 |
|---|---|---|
| 문의 1건 | `support_cases` 행 1개. 대상 MEMBER(회원) / OWNER(사장님, `owner_store_id` 필수) | `lib/support/support-case-service.ts` |
| 문의 내용 | `support_messages` (PUBLIC = 고객·어드민 공개, INTERNAL_NOTE = 어드민 메모) | 같은 파일 · DB 함수 `support_append_message` |
| 분야·세부 | 코드 레지스트리 + 어드민 「문의 유형 관리」 이름·순서·숨김 덮어쓰기(`support_category_settings`, 운영 0행 = 코드 기본값) | `lib/support/support-category-registry.ts`, `support-category-settings.ts` |
| 고객 화면 | 한 화면 쓰기 → 접수 완료 → 내 문의(질문·답변) | `components/support/SupportModalHost.tsx`, `SupportTicketViews.tsx` |
| 어드민 화면 | `/admin/support` 3열(목록·대화·맥락) | `components/admin/support/AdminSupportPage.tsx` |

## 2. 상태와 전이 (현재 = 코드 확인)

| 상태 | 뜻 | 고객 화면 | 어드민 탭 |
|---|---|---|---|
| OPEN | 접수됨, 어드민 답 없음 | 내 문의에 보임 「답변 대기」 | 답변 필요 |
| WAITING_ADMIN | 고객이 추가로 씀 | 보임 | 답변 필요 |
| WAITING_USER | 어드민 답변함 | 보임 「답변 완료」 · 「추가 문의」「확인했어요」 | 고객 확인 대기 |
| RESOLVED | 종료 | **사라짐**(목록·상세 내용 모두) | 종료 |
| ARCHIVED | 보관(종료에서만) | 사라짐 | 보관 |

| 동작 | 누가 | 전이 | 근거 |
|---|---|---|---|
| 접수 | 고객 | 없음 → OPEN (첫 글 = 시드, 어드민 미읽음 **증가 안 함** — F2) | `support-case-service.ts:394-403` · DB 함수 ELSE 분기 |
| 같은 분야 진행 중 문의가 있을 때 접수 | 고객 | 기존 문의에 추가 → WAITING_ADMIN (세부 무시 · 접수 완료 화면은 **새로 고른 분야·세부 + 기존 번호**를 보여 줌 — F4) | `:272-345` · 유일 인덱스 `uq_support_cases_one_active_per_key` |
| 추가 문의 | 고객 | → WAITING_ADMIN, 어드민 미읽음 +1 | `postRequesterSupportMessage` |
| 답변 | 어드민 | → WAITING_USER, 고객 미읽음 +1 | `adminReplySupportCase` |
| 확인했어요 | 고객 | → RESOLVED (알림 없음) | `requesterCloseSupportCase` |
| 상담 종료 | 어드민 | → RESOLVED, 고객 「종료」 알림 (F3) | `adminUpdateSupportCaseStatus` |
| 재오픈 | 어드민 | RESOLVED/ARCHIVED → OPEN, 고객 알림 | `reopenSupportCase` |
| 보관 / 보관 해제 | 어드민 | RESOLVED ↔ ARCHIVED (알림 없음) | 같은 함수 |

★ 목표 추가 전이 (**Owner 결정 2026-11-27 「7일로 정하기」**): WAITING_USER 이고 마지막 글(`last_message_at`) 뒤 **7일** 동안 고객 글이 없으면 자동 RESOLVED (F7).
- 고객 알림 없음(고객 「확인했어요」와 같은 취급). 사건 기록 `status_changed` · `by: "auto_7d"`.
- 고객이 답변을 아직 안 읽었으면(`requester_unread_count>0`) §3-1 규칙대로 내용이 보이고, 읽으면 사라진다.
- 종료 시 `admin_unread_count = 0` (F6 와 같은 규칙).
- 실행: 기존 정기 작업(cron)에 붙이는 것을 우선 — 새 cron 추가 여부·주기는 구현 설계에서 정한다(요청 예산 `docs/request-budget-ssot.md` 준수).

## 3. 알림 — 누가 무엇을 받는가

### 3-1 고객(요청자)

| 사건 | 알림 종류 | 푸시·알림함 | 누르면 | 현재 판정 |
|---|---|---|---|---|
| 접수 | 없음 | — | — | 코드 PASS (10-04 이후 발송 0건) |
| 어드민 답변 | `support_admin_replied` (category inquiry_answered) | 둘 다, 푸시 설정 「공지」 | 문의 상세 | 코드 PASS · 운영 발송 sent 32 |
| 어드민 종료 | `support_case_resolved` | 둘 다 | 「종료된 문의」 빈 화면 | **FAIL (F3)** |
| 어드민 재오픈 | `support_case_reopened` | 둘 다 | 문의 상세 | 코드 PASS |
| 담당 지정 | 없음 (D2) | — | — | 코드 PASS (09-24 이후 0건) |
| 문의를 열면 | 그 문의의 고객 알림 읽음 처리 | — | — | 코드 PASS · 종료 문의 알림은 F5 |

★ 목표 (**Owner 결정 2026-11-27 「권장안으로 정하기」** — 11-10 「종료 문의는 사라짐」을 이렇게 좁힌다): 고객이 아직 읽지 않은 답변이 있는 문의(`requester_unread_count>0`)는 종료돼도 질문·답변을 보여 주고 버튼은 「확인」만 둔다. 고객이 그 화면을 열면 읽음(0)이 되고, 그 뒤로는 지금처럼 목록·상세에서 사라진다. 읽은 답변이 없는 종료 문의는 지금 그대로 숨김 (F3).

### 3-2 어드민

| 사건 | 현재 | ★ 목표 |
|---|---|---|
| 새 문의 접수 | 콘솔이 열려 있을 때만 토스트·소리(Realtime) · 사이드바 숫자(75초, 화면 보일 때만). **어드민 알림함·푸시 0 (F1)** | 담당자 없음 → `support` 권한 활성 어드민 전원에게 어드민 알림(kind `support_customer_replied`, 제목 「새 고객 문의 · SC-…」) + 푸시 1회. dedupe = `support_customer_replied:<첫 글 id>` (새 종류를 만들지 않는다 — 회원 알림 종류 `support_case_created` 와 이름 충돌 방지) |
| 고객 추가 문의 | 담당자 있으면 그 담당자만 알림함+푸시, **없으면 0 (F1)** | 담당자 있으면 담당자, 없으면 `support` 권한 어드민 전원 |
| 담당 지정 | 지정된 어드민에게 알림 없음(종류 `support_case_assigned` 정의만 있고 만드는 곳 0 — F14). 대신 5분 주기 재생 함수가 지난 72시간 고객 글(**최초 문의 포함**)을 새 담당자에게 한꺼번에 보냄 — 이미 읽은 글도 (F13) | 지정 시 「담당 지정」 1건만, 재생은 지정 이후 글만 |
| 어드민이 문의를 열면 | 미읽음 0 · 그 어드민의 알림 읽음 | 그대로 |
| 종료 | 미읽음 숫자 그대로 남음 (F6) | 종료·보관 시 `admin_unread_count = 0` |

토스트·소리 규칙(현행 유지): 고객 PUBLIC 글 INSERT 1건 = 토스트 1 + 소리 1, 어드민 자신의 행동은 0 (`lib/admin/admin-ops-sound-decision.ts`).

## 4. 숫자(배지) 정의

| 숫자 | 정의 | 보이는 곳 |
|---|---|---|
| 고객 FAB 숫자 | 진행 중 문의의 `requester_unread_count` 합 | FAB 허용 화면만 (`support-fab-route-registry.ts`) |
| 어드민 사이드바 | 상태 OPEN+WAITING_ADMIN 문의 수 | 사이드바 「고객지원」 · 대시보드 |
| 어드민 목록 빨간 숫자 | `admin_unread_count` — ★ 새 문의 첫 글도 1로 셈(F2), 종료 시 0(F6) | 목록 행 |

★ FAB 숫자는 고객지원 알림이 왔을 때만 다시 읽는다(지금은 모든 알림마다 목록 전체 — F11).

## 5. 로그인 / 비로그인

| 상황 | 동작 | 판정 |
|---|---|---|
| 비로그인 「문의하기」 | 로그인/가입 안내 → 맥락 저장 → 로그인 후 같은 창 | 코드 PASS · 화면 NOT_PROVEN |
| 비로그인 푸시·링크로 문의 상세 | 상세 401 → 로그인 안내 | 코드 PASS · 화면 NOT_PROVEN |
| 쓰는 중 세션 만료 | 접수 401 → 로그인 안내, 내용은 기기 임시 저장 → 「이어 쓰기」 | 코드 PASS · 화면 NOT_PROVEN |
| 고객 API 5개 | 로그인 필수, 서버가 본인·매장 소유 재확인 | 코드 PASS |
| 어드민 API | `support` 권한 · 실시간 구독 RLS = admin/super_admin (운영 5명 전원 해당) | 코드·DB PASS |

★ 창을 열 때 로그인 확인 중에는 쓰기 화면 대신 로딩을 보인다(비로그인에게 쓰기 화면이 잠깐 보이는 것 방지).

## 6. CTA

| 화면 | 버튼 | 결과 | 비활성 |
|---|---|---|---|
| 허브·FAB·맥락 화면 | 문의하기 | 쓰기 화면 | 사장님인데 매장 없음 |
| 쓰기 | 문의 접수 | 접수 완료 (★ 기존 문의에 붙었으면 「진행 중인 문의에 추가했어요」 — F4) | 분야·세부·내용 없음, 전송 중 |
| 접수 완료 | 내 문의 보기 / 확인 | 내 문의 목록 / 닫기 | — |
| 문의 상세(답변 완료) | 추가 문의 / 확인했어요 | WAITING_ADMIN / RESOLVED | 전송 중 |
| 어드민 상세 | 답변·메모 저장·나에게 배정·배정 해제·우선순위·상담 종료·재오픈·보관 | §2 | 바쁨·빈칸·종료 문의 답변 |

## 7. AI 자동 답변 (현재 없음)

- 코드·계획·DB 모두 없음. 규칙형 안내(`support_guidance_entries` 운영 2행, API 2개)는 11-10 이후 호출처 0.
- ★ 권장 순서(Owner 결정 필요): ① 어드민 답변 **초안**(어드민이 고쳐서 보냄, 고객에게 자동 발송 없음) → ② 고객 1차 안내(등록 안내 범위 안에서만, 근거 없으면 상담사로; 돈·계정·신고 제외). F1·F2 수정 뒤.

## 8. 결함 → 수정 계획 (구현 결과 = §11)

| # | 수정 | 바뀌는 곳 | 승인 종류 |
|---|---|---|---|
| F1 | 어드민 알림 `support_case_created` 신설 · 미배정 추가 문의도 support 권한 어드민 전원 | `support-case-service.ts`, `admin-notification-kinds.ts`, 어드민 알림함 문구 키 | 구현 승인 |
| F2 | 접수 첫 글도 어드민 미읽음 +1 (상태는 OPEN 유지) | DB 함수 `support_append_message` 시드 분기 | **운영 DB 적용 승인** |
| F3 | 고객이 읽지 않은 답변이 있으면 종료돼도 내용 표시(§3-1) — 상세 API 가 종료 + `requester_unread_count>0` 이면 내용 반환 후 읽음 처리, 내 문의 목록·FAB 숫자에도 그 문의 포함 | 고객 상세·목록 API, `SupportTicketViews` 종료 화면 | 결정 완료(Owner 11-27) · **구현 승인 대기** |
| F4 | 기존 문의에 붙은 경우 접수 완료 화면에 그대로 알림, 어드민 대화에 고객이 고른 세부를 표시 | `SupportModalHost`·`SupportTicketViews`·open API 응답 `created` 사용 | 구현 승인 |
| F5 | 종료 문의의 미읽음 고객 알림 19건 읽음 처리 + 종료 시 그 문의 알림 읽음 | 데이터 정리 + 종료 함수 | **운영 DB 쓰기 승인** |
| F6 | 종료·보관 시 `admin_unread_count=0` + 기존 6건 정리 | 종료 함수 + 데이터 | **운영 DB 쓰기 승인**(6건) |
| F7 | WAITING_USER 7일 자동 종료(§2) | 정기 작업 + 종료 함수 | 결정 완료(Owner 11-27, 7일) · **구현 승인 대기** |
| F8 | 이 문서를 SSOT 로, 옛 문서 상단에 「대체됨」 표시 | 문서 | 구현 승인 |
| F9 | 어드민 알림 제목 문구 키 (코드·DB 재생 함수 두 곳) | `support-case-service.ts:773` · DB `admin_notification_replay_support_replies` | 구현 승인 + **운영 DB 적용 승인** |
| F10 | API `closeAfter` 제거 · 재오픈 상태 조건 | 어드민 API·서비스 | 구현 승인 |
| F11 | FAB 숫자 재조회는 고객지원 알림일 때만 | `use-support-requester-unread.ts` | 구현 승인 |
| F12 | 안내 API 2개 — AI 2단계에 재사용 또는 삭제 | — | AI 결정과 함께 |
| F13 | 재생은 지정 시각 이후 글만 (지정 전 글은 F1 로 이미 전원에게 알림) | DB 재생 함수 | **운영 DB 적용 승인** |
| F14 | 다른 어드민이 지정하면 지정된 어드민에게 `support_case_assigned` 1건 | `adminAssignSupportCase` | 구현 승인 |
| F15 | 상태 변경 API 는 정해진 전이만 허용 (종료 → 진행 중은 재오픈 경로로만) | 어드민 API·`adminUpdateSupportCaseStatus` | 구현 승인 |

배포 구분: F2·F9(재생 함수)·F13 = DB 함수, F5·F6 = DB 데이터, 나머지 = 웹. 네이티브 변경 없음. 통화·메신저 코드 무관.

## 9. 옛 문서 대체 표 (`support-ui-notification-ssot-spec.md` → 이 문서)

| 옛 정의 (10-05) | 지금 (11-10 이후) |
|---|---|
| 채팅식 시트(분야→세부→안내→대화) | 접수형 한 화면 쓰기 |
| 앱 사용 중 인앱 배너(D1) | 제거 (6b6f8f440) |
| 허브 「상담 내역」 숫자 | 제거 → FAB 숫자 |
| 종료 상담 「새 문의하기」로 내용 보며 새 문의 | 종료 문의 내용 숨김 |
| 문의 상세 실시간 갱신 | 제거 |

## 10. 검증 행렬 (수정 후)

1. 코드: 관련 vitest(현재 기준선 25파일 218건 PASS) + 신규 계약 시험(F1 수신자 표·F2 미읽음·F6 종료 0·F11 재조회 조건).
2. 운영 DB: 시험 문의 1건 → `admin_notifications` 행·`push_status`, `admin_unread_count=1`, 종료 후 0.
3. 실기기(Owner 계정·휴대폰): 고객 접수 → 어드민 휴대폰 푸시 → 어드민 답변 → 고객 푸시 → 고객 확인/추가 문의. 앱 실행 상한 10회.

## 11. 구현 기록 (2026-11-27, `fix/support-inquiry-ssot`)

| # | 구현 | DB 변경 |
|---|---|---|
| F1 | `notifyAdminsOfCustomerMessage` — 새 문의·추가 문의 모두 같은 함수. 담당자 있으면 담당자, 없거나 권한 잃었으면 support 권한 전원 | 없음 |
| F2 | 문의 행을 만들 때 첫 글이 시드면 `admin_unread_count = 1` (DB 함수는 그대로) | **없음**(설계 때 예상한 DB 함수 변경 불필요) |
| F3 | 상세 API: 종료 + `requester_unread_count>0` 이면 내용 반환 후 읽음 / 목록 API `requesterVisibleActiveOrFilter()` / 종료 화면 안내 + 「확인」 | 없음 |
| F4 | open 응답 `created=false` → 접수 완료 화면 「진행 중인 문의에 추가했어요」 + 기존 문의의 분야·세부·접수 시각. 고른 세부는 사건 `followup_issue_selected` | 없음 |
| F5 | 고객 「확인했어요」 시 그 문의 알림 읽음 처리. 기존 19건 = `data-cleanup.sql` | **데이터 정리 승인 필요** |
| F6 | 어드민 종료·보관·고객 종료·자동 종료 시 `admin_unread_count = 0`. 기존 6건 = `data-cleanup.sql` | **데이터 정리 승인 필요** |
| F7 | `autoCloseStaleAnsweredSupportCases` — 새 cron 없이 `/api/cron/admin-notification-delivery`(5분)에서 매시 첫 실행만(UTC 분 0~4) = 하루 24번 조회 | 없음 |
| F9 | 어드민 알림 제목 = 카탈로그 키(`admin_support_notify_*`, ko). DB 재생 함수의 `'문의 '` 문구는 F1 이후 재생할 글이 없어 그대로 둔다 | 없음 |
| F10 | 답변 API `closeAfter` 삭제 · 재오픈 상태 CAS | 없음 |
| F11 | FAB 숫자는 `SUPPORT_NOTIFICATION_ARRIVED_EVENT`(고객지원 알림 INSERT)에서만 재조회 | 없음 |
| F13 | F1 이 모든 고객 글에 같은 dedupe 키로 알림을 만들므로 DB 재생 함수가 지난 글을 다시 보내지 않는다 | **없음**(DB 함수 변경 불필요) |
| F14 | 다른 어드민이 지정하면 지정된 어드민에게 `support_case_assigned` 1건(제목 「담당 문의 지정 · SC-…」) | 없음 |
| F15 | 상태 API 는 RESOLVED·ARCHIVED 로만(그 밖 = `invalid_transition`). 종료 → 진행 중은 재오픈 경로만 | 없음 |
| §5 | 창을 열 때 로그인 확인 중이면 쓰기 화면 대신 DIBAY 스피너(비로그인에게 쓰기 화면이 잠깐 보이던 것) | 없음 |
| F12 | 안내 API 2개 — AI 결정 때까지 그대로 | — |

시험: `lib/support/__tests__/support-audit-phase1-regression.test.ts` 「support inquiry SSOT 2026-11-27」 9건.
