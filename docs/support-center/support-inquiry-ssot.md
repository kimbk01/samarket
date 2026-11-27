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
| 같은 분야 진행 중 문의가 있을 때 접수 | 고객 | 기존 문의에 추가 → WAITING_ADMIN. 접수 완료 화면 = 「진행 중인 문의에 추가했어요」 + **기존 문의의** 분야·세부·번호 (F4) · 고객이 고른 세부는 어드민 대화에 표시(D8). 붙이려던 문의가 그사이 종료됐으면 새 문의로 접수(2차 F) | `:272-345` · 유일 인덱스 `uq_support_cases_one_active_per_key` |
| 추가 문의 | 고객 | → WAITING_ADMIN, 어드민 미읽음 +1 | `postRequesterSupportMessage` |
| 답변 | 어드민 | → WAITING_USER, 고객 미읽음 +1 | `adminReplySupportCase` |
| 확인했어요 | 고객 | → RESOLVED (알림 없음). 화면이 본 마지막 글 시각(`seenLastMessageAt`)과 다르면 닫지 않고 `case_updated` → 화면이 다시 읽어 새 답변을 보여 줌 (2차 A) | `requesterCloseSupportCase` |
| 상담 종료 | 어드민 | → RESOLVED, 고객 「종료」 알림 (F3) | `adminUpdateSupportCaseStatus` |
| 재오픈 | **어드민만** (고객 API 의 reopen = 400, 재감사 D12) | RESOLVED/ARCHIVED → OPEN, 고객 알림 | `reopenSupportCase` |
| 보관 / 보관 해제 | 어드민 | RESOLVED ↔ ARCHIVED (알림 없음) | 같은 함수 |

★ 목표 추가 전이 (**Owner 결정 2026-11-27 「7일로 정하기」**): WAITING_USER 이고 마지막 **공개 글**(`last_message_at`) 뒤 **7일** 동안 고객 글이 없으면 자동 RESOLVED (F7).
- 「마지막 글」 = 고객·어드민 **공개 글**만. 어드민 메모(INTERNAL_NOTE)는 시계를 다시 시작하지 않는다(재감사 D13 — DB 함수 `20271127230000`, 운영 적용 전에는 메모도 시계를 다시 시작한다).
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

어드민 알림 행의 수명 (재감사 D3 — 계약 빈칸 보완):
- 받는 사람 = 담당자(support 권한 필수) 또는 support 권한 전원. 보낸 사람 본인은 받지 않는다(D10).
- 어드민이 그 문의를 열면 → 그 어드민 것만 읽음.
- 그 문의의 어드민 일이 끝나면(공개 답변·종료·보관·고객 「확인했어요」·자동 종료) → **받은 어드민 전원** 읽음.
- 발송(권한 확인·저장·푸시)은 고객 응답 뒤에 끝까지 진행(재감사 D6). 실패분은 outbox·5분 재생 함수가 다시 만든다.

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

## 12. 수정 후 재감사 기록 (2026-11-27, `fix/support-inquiry-reaudit2`)

근거 `docs/audit/customer-support-inquiry-reaudit-2026-11-27/final-reaudit.md`. Owner 「수정 진행」.

| # | 수정 | DB |
|---|---|---|
| D1 | 상세 조회는 문의 id 가 바뀔 때만(콜백 고정) · 늦게 온 옛 응답 무시 · 「종료+안 읽은 답변」 내용은 앱 실행 동안 기억(다시 그려도 빈 화면 아님) | 없음 |
| D2 | 담당 지정·담당자 알림 모두 support 권한 필수 (`assignee_not_support_admin`) | 없음 |
| D3 | §3-2 「어드민 알림 행의 수명」 | 없음 |
| D4 | 종료 문의 공개 글은 DB 함수가 잠금 안에서 거부 → `case_closed` | **DB 함수 적용 승인 필요** |
| D5 | 「확인했어요」는 마지막 글 시각도 같을 때만 종료(그사이 답변 오면 다시 읽게) | 없음 |
| D6 | 어드민 알림 발송을 응답 뒤로(`keepAliveAfterResponse`) | 없음 |
| D7 | FAB 숫자: 실시간 재연결(RESYNC)·앱 복귀 따라잡기 때도 다시 읽음 | 없음 |
| D8 | 어드민 대화에 「고객이 고른 세부」 표시 (`followupIssues`) | 없음 |
| D9 | 첫 글 저장 실패 = 접수 실패(`first_message_failed`, 빈 문의 삭제) | 없음 |
| D10 | 보낸 사람 본인 제외 (`excludeRecipientIds`) | 없음 |
| D11 | 같은 사람 재지정 = 변화 없음·알림 없음 | 없음 |
| D12 | 고객 재오픈 API 제거(400) | 없음 |
| D13 | 메모는 「마지막 글」이 아님 | **DB 함수 적용 승인 필요**(D4 와 같은 파일) |
| D14 | 쓰기 화면 「진행 중인 문의」에도 종료+안 읽은 답변 문의 포함(맨 위) | 없음 |
| D15 | 고객 열람 때 어드민 알림 UPDATE 생략 · 어드민 상세 인증 1번 · 작업 직후 목록 중복 조회 생략 | 없음 |
| D16 | 안 읽은 공개 답변 삭제 시 고객 미읽음 −1·그 알림 읽음 | 없음 |

시험: `support-audit-phase1-regression.test.ts` 「post-fix reaudit D1~D16」 8건.

## 13. 2차 재감사 기록 (2026-11-27, `fix/support-inquiry-reaudit3`)

근거 `docs/audit/customer-support-inquiry-reaudit-2026-11-27/final-reaudit-2.md` · 시안 `ui-mockup.html`. Owner 「수정 진행」.

| # | 수정 | DB |
|---|---|---|
| A | 「확인했어요」: 화면이 본 `last_message_at` 을 보내고 서버가 그 값과 비교(다르면 `case_updated` → 화면 다시 읽기) + 쓰기 CAS. §12 D5 는 효과 없던 수정이라 이것으로 대체 | 없음 |
| B | 답변 삭제: 그 답변 알림이 **아직 안 읽힌 상태였을 때만**(UPDATE 결과로 확인) 고객 미읽음 −1. §12 D16 대체 | 없음 |
| C | 담당자 없는 문의도 5분 재생 함수가 support 권한 전원으로 다시 만든다 | **DB 함수 `20271127240000` 적용 승인 필요** |
| D | §12 D15 의 「작업 직후 1.5초 목록 신호 무시」 철회(남의 변경을 버렸다) — 작업 뒤 목록 1번 더 읽기는 감수 | 없음 |
| E | 읽음 0 은 화면에 준 글 목록 기준 시각과 같을 때만(고객·어드민) · 응답 뒤 어드민 알림은 어드민 일이 남았을 때만 생성 | 없음 |
| F | 붙이려던 문의가 그사이 종료 → 새 문의로 접수 · 접수 API 에 `case_closed` 409 · 종료 문의에 세션을 다시 열지 않음(글 먼저, 세션 나중) | 없음 |
| G | 세션 생성 실패도 빈 문의 삭제(`discardFailedNewCase`, 실패 기록) | 없음 |
| H | 어드민 화면 전용 오류 문구 `adminSupportErrorLabel` (ko/en 키) · 고객 `case_updated` 문구 | 없음 |
| I | 지정 알림 support 권한 필수 · 콘솔 토스트·소리 본인 글 제외 · 재생 함수 본인 제외·권한(C 와 같은 파일) | C 와 같음 |
| J | 재오픈 서비스는 항상 어드민 판정(고객 분기 제거) | 없음 |

UI 불일치 U1~U9(시안 5절)는 **Owner 결정 전** — 이 PR 에서 바꾸지 않음.
3차 독립 재감사(같은 PR, 병합 전)에서 추가로 고친 것:
- 재생 함수도 앱과 같은 조건(OPEN·WAITING_ADMIN 만, 담당자 유무 무관) — 이미 답한 문의에 미읽음 알림이 다시 생기던 경로 차단 · 첫 고객 글 제목 「새 고객 문의」. 적용 시 밀린 재생 = 0건(운영 조회).
- 응답 뒤 발송 때 상태를 못 읽으면 버리지 않고 기록 후 발송.
- 고객이 문의를 열 때 알림은 **보여 준 답변 것만** 읽음(`shownMessageIds`) — 목록 뒤에 온 답변의 알림·숫자가 남아 그 답변 삭제 시 숫자가 바르게 줄어든다. 삭제의 숫자 CAS 가 빗나가면 최신 값으로 1번 더.
- 문구: `case_updated` 「문의 내용이 바뀌어 다시 불러왔어요」(새 답변만이 아니므로) · 어드민 `not_closed` 일반 문구 · `invalid_message`.

시험: `support-audit-phase1-regression.test.ts` 「second reaudit A~J」 — **동작 재현**: A·B·B+E·E·I(지정 알림 권한·본인 제외) / **구조 확인(코드 위치)**: E2·F/G·H·J (가짜 DB 로 경합·삭제 실패를 끼워 넣을 수 없어 이름에 「구조 확인」 표시).

4차 독립 재감사(병합 직전, `8c926e73b`) 판정: **코드에 중간 이상 결함 없음**(DB 미적용분 제외). 같은 PR 에서 고친 것: 읽음 처리 답변 id = 보여 준 어드민 공개 답변만(요청 주소 길이) · 부분 실패에도 배지 캐시 비움.
남은 낮은 결함(알고 둠, 재지시 때): ① 고객 미읽음 숫자는 「본 목록 이후 새 글」이면 통째로 남아 알림 행과 1 차이가 날 수 있음(다음 열람 때 맞춰짐) ② 삭제 숫자 재시도가 몇 ms 경합에서 1 낮게 될 수 있음 ③ 상태 읽기 실패 시 보내는 알림은 끝난 문의일 수 있음 ④ (DB 파일) 같은 문의 고객 새 글 때 앱이 건너뛴 옛 글이 재생될 수 있음 ⑤ (DB 파일) support 권한 없는 담당자 재생은 0명 발송 — 앱 경로에는 전원 대체가 있음.

**운영 DB 적용 (2026-11-27 21:36 PHT, Owner 「적용 진행」)**: `20271127230000`(D4·D13) · `20271127240000`(C·I) 적용 완료 — 롤백 시험으로 종료 문의 공개 글 거부·메모가 마지막 글 시각을 바꾸지 않음·재생 0건 확인. 기록 `docs/audit/customer-support-inquiry-reaudit-2026-11-27/db-apply-result.md`.
