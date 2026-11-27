# 고객센터 문의 — 처음 지시부터 최종 감사 · 2026-11-28

상태: **감사·보고만** (코드·운영 DB 변경 없음). 시안 = 같은 폴더 `ui-mockup.html` (현재 운영 코드 기준으로 새로 그림).

## 0. 조건 · 증거

| 항목 | 값 |
|---|---|
| 감사 코드 | origin/main **63057603f** (고객센터 마지막 변경 = PR #678 `ece96be`, 그 뒤 4커밋은 모임 작업 — 공용 알림 `appendUserNotification` 에 선택 인자 `bell_only` 추가뿐, 고객센터 호출은 영향 없음 확인) |
| 방법 | ① 독립 에이전트 3개(서버·알림 / 화면·CTA / 누수·병목·보안) — 계약서와 코드만 주고 결론은 주지 않음 ② 중간 이상 결함은 작업자가 코드 줄·운영 DB로 다시 확인 |
| 운영 DB | 읽기 전용 조회 (`begin read only … rollback`) · 2026-11-28 PHT |
| 화면·실기기 | 0회 (브라우저 열기 0회) → 화면 판정은 전부 **코드 판정**, 실기 NOT_PROVEN |

## 1. 작업자 실수 (먼저)

| # | 실수 | 증거 |
|---|---|---|
| W1 | **시안을 U1~U9 수정 뒤 갱신하지 않았다.** 계약 §14 가 `ui-mockup.html` 을 근거로 가리키는데, 그 시안은 수정 전(54bc4d3) 모습 — 버튼 모서리 12px, 「고객 답변 대기」, 사장님 초록 버튼, 결함 A·B 표시가 그대로 | 시안 6·122행 「운영 54bc4d3」 · 코드 `SUPPORT_BTN` 4px |
| W2 | **11-27 「현실적 결함 없음 · 남은 위험 0」 보고는 범위 일부로 내린 전체 결론이었다.** 1~7차 감사는 주 서비스 흐름만 봤고, RLS 직접 조회·보조 어드민 API(control-plane·guidance)·속도 제한·어드민 실시간 부하·「답 쓰는 동안 온 고객 글」을 보지 않았다. 이번에 중간 등급 6건이 나왔다 | 아래 2절 D1~D6 |
| W3 | **어드민 알림 수정은 운영에서 한 번도 실행되지 않았다.** 마지막 문의 생성 2026-11-14, 그 뒤 문의·글 0건 → `admin_notifications`·outbox 의 고객센터 행 0건. 수정 후 운영 PASS 는 버튼 모양·7일 자동 종료뿐이고, 알림 생성·푸시·읽음은 코드 PASS 만 | 운영 조회: `support_cases` max(created_at)=2026-11-14 01:07 UTC · support 알림 0행 |
| W4 | AI 비용을 처음에 건당 $0.02 로 말했다(생각 토큰 누락) — 11-28 $0.04(Opus) 로 정정 | 대화 기록 |
| W5 | 이번 감사 중 운영 DB 조회에서 없는 컬럼 이름을 추측했다(가드 훅이 막아 전송 안 됨) · GROUP BY 오류 SQL 1건은 운영에 전송됨(오류 42803, 작업자 MCP 오류) | 가드 거부 메시지 · 오류 응답 |

## 2. 결함

### 중간 (6)

| # | 분류 | 결함 | 증거 | 깨지는 상황 |
|---|---|---|---|---|
| D1 | 오류·누락 | 답변을 보내면 그 문의의 고객 글 알림이 **언제 온 것이든 전부** 읽음 + 상태가 무조건 「고객 확인 대기」 | `support-case-service.ts:1373` `resolveSupportAdminNotifications` · `resolveAdminNotificationsForWork` 는 문의·kind 만 조건(`admin-notification-service.ts:919-922`) · DB `support_append_message` 어드민 공개 글 → WAITING_USER | 어드민이 답을 쓰는 몇 분 사이 고객이 추가 글 → 답 전송 → 그 글이 「답변 필요」 탭·알림함·푸시에서 모두 빠짐. 남는 표시는 빨간 미읽음 숫자뿐 |
| D2 | 누수(보안) | 고객이 **삭제된 어드민 답변 원문과 종료 문의 글**을 Supabase 직접 조회로 읽을 수 있음 | 운영 정책 `support_messages_requester_select` = `message_type='PUBLIC' AND 본인 문의` — `deleted_at` 조건 없음 · `authenticated` SELECT 권한 · 운영 삭제 글 2행 | 로그인 토큰 + 공개 키로 `/rest/v1/support_messages?case_id=eq.<내 문의>` |
| D3 | 권한 | `/api/admin/support-control-plane` 이 support 권한을 보지 않음 — 아무 어드민이나 문의 최대 500건·고객 첫 글·회원 id 열람 | `app/api/admin/support-control-plane/route.ts:11` `requireAdminApiUser()` · 화면 호출처 0 | support 권한 없는 운영자 |
| D4 | 권한 | 안내문 API GET·POST 가 아무 어드민 허용 — 고객 접수 검증에 쓰이는 안내문을 support 권한 없이 쓰기 가능 | `app/api/admin/support/guidance/route.ts:18,58` `isRouteAdmin()` | 〃 |
| D5 | 누수·병목 | 고객 추가 글에 **속도 제한 없음** — 글 1건마다 담당자(없으면 support 어드민 전원)에게 알림·푸시 | `app/api/support/**`·`lib/support/**` 속도 제한 코드 0 · 본문 최대 8000자 | 고객이 100번 보내면 100 × 어드민 수 푸시 |
| D6 | 병목·누수 | 어드민 실시간 증폭 · 메모 노출 — 모든 어드민 화면이 `support_messages`·`support_cases` 변경을 구독, 콘솔은 문의 행의 **모든** 변경(읽음 표시 포함)마다 목록 다시 읽기(약 10쿼리). support 권한 없는 어드민 브라우저에도 내부 메모 본문이 실시간으로 전달 | `AdminStorePointPendingProvider.tsx:1293·1323·1329` · `AdminSupportPage.tsx:447` `event:"*"` · 운영 `supabase_realtime` 에 두 표 포함 · RLS 어드민 = `is_platform_admin` | 답변 1회 ≈ 답한 콘솔 50쿼리 + 열린 콘솔마다 목록 10쿼리 + 벨 |

### 중간 — 화면 (6) · 시안 5절에 빨간 점선

| # | 결함 | 증거 |
|---|---|---|
| U-2 | 종료 문의 상세에 상태 줄이 없음 — 목록은 「새 답변」, 들어가면 상태 표시 없음 (계약 §14 U1 「상세 상태 줄도 같은 알약」 위반) | `SupportTicketViews.tsx:1046` `!closedView` |
| U-3 | 쓰기 → 진행 중 문의 → ‹ 로 돌아오면 쓰기 화면이 새로 만들어져 입력하던 글이 카드로 바뀜 · 저장(300ms) 전 입력 유실 가능 | `SupportModalHost.tsx:334·349` · `SupportTicketViews.tsx:411` |
| U-4 | 회원/매장 전환 버튼 누르는 영역 약 24px (44px 미달) | `SupportTicketViews.tsx:462·474` `px-2 py-1` 11px |
| U-5 | 사장님 목록과 회원 목록이 다른 컴포넌트 — 사장님은 로딩 글자·밑줄 오류 버튼(44px 미만)·더 보기 없음 | `SupportCasesHistoryList.tsx:158·164` |
| U-6 | 어드민 문의 화면 2개의 상태 색·탭 이름이 다름 (고객 확인 대기 = 노랑 vs 파랑, 종료 = 회색 vs 초록, 「답변 필요/종료」 vs 「처리 대기/처리 완료」) | `AdminSupportPage.tsx:112-124·88-94` / `AdminCommunitySupportPage.tsx:41-47` |
| U-9 | i18n 계약 위반 — 코드 안 한국어·언어 삼항, 영어에 개발 용어 「(B3)」「(B4)」 | `support-reference-admin-href.ts:207-240` · `support-category-groups.ts:9-36` · `AdminSupportPage.tsx:560·1239·1243` · `CustomerCenterHubClient.tsx:170` |

### 낮음 (서버·데이터)

| # | 결함 | 증거 |
|---|---|---|
| L1 | 종료·보관 문의에도 담당 지정 가능 → 「담당 문의 지정」 알림·푸시가 나가고 안 읽음으로 남음 · 동시 지정 CAS 없음 | `support-case-service.ts:1489-1556` |
| L2 | 담당자의 support 권한이 빠지면 그 사람에게만 간 고객 글 알림을 볼 어드민이 0명 (재생은 dedupe 키가 있어 다시 안 보냄) | `admin-membership.ts:340` · `20271127240000` NOT EXISTS |
| L3 | 고객 응답에 내부 값 노출 — `assigned_admin_id`·글 `sender_admin_id`(어드민 회원 id)·`priority`·`admin_unread_count` | `support-case-service.ts:739·779·849` `select("*")` |
| L4 | DB 오류 원문이 응답으로 나감 · 어드민 `priority` 값 검증 없음 | 어드민 PATCH `:150-160` · open 500 `createErr.message` |
| L5 | 담당자 = 글쓴이(어드민이 회원으로 문의 + 본인 담당)면 아무에게도 알림 없음 | `:262-277` |
| L6 | 고객이 답변 전(OPEN·WAITING_ADMIN) 문의도 닫을 수 있음 — 계약 §2 빈칸 | `requesterCloseSupportCase` `:1653` |
| L7 | 어드민 답변·종료·재오픈 응답이 고객 FCM 발송까지 기다림 | `:1358-1373·1469·1628` |
| L8 | 어드민 전원 발송 시 후보마다 권한 조회 3건을 차례로 (응답 뒤라 체감 영향 없음) | `admin-notification-service.ts:351-361` |
| L9 | 정리 없이 쌓임 — outbox 「처리됨」 행(고객 글마다 1행), `admin_notifications`, `support_case_events` | 저장소 삭제 경로 0 |
| L10 | FAB 숫자 하나에 문의 목록 전체(최대 50행) GET · 허브 → 창 열기 → 닫기 = 같은 GET 3회 · `/api/support/cases` 요청 예산 항목 없음 | `use-support-requester-unread.ts:51-80` · `lib/perf/request-budget.ts` |
| L11 | 고객 상세 GET 에서 문의 행 2번 조회 · 상세 쿼리 전부 순차 · 글 목록 limit 없음 | `[caseId]/route.ts:34` + `:1794` · `:848` |
| L12 | 화면 호출처 0 인 경로: `/api/support/guidance`, `/api/admin/support/guidance`, `/api/admin/support/summary`(벨 숫자와 기능 중복), control-plane, `POST /api/admin/support/cases`(항상 405) · 고객 실시간 구독이 있다는 낡은 주석 | `:1781-1783·1820` |
| L13 | 옛 경로가 어드민 알림 종류를 회원 알림함 표(`notification_events`)에 쓴 행 45건 남음(2026-09-02~10-04, 전부 읽음) | 운영 조회: created 27 · assigned 12 · customer_replied 6 |
| L14 | (이론) 로그아웃·계정 전환 때 FAB 가 다시 안 그려지면 이전 숫자 유지 · (이론) 대기열 작업이 UTC 분 0~4 를 넘기면 그 시간 자동 종료 건너뜀 · (NOT_PROVEN) 5분 재생 SQL 이 `support_messages.created_at` 단독 인덱스 없음 | `use-support-requester-unread.ts` · cron `:67` · `20271127240000:25-65` |

### 낮음 (화면·문구)

| # | 결함 | 증거 |
|---|---|---|
| U-7 | 사장님 화면: 문의하기 갈색, 선택 탭은 초록 | `OwnerCustomerCenterView.tsx:109` |
| U-8 | 목록 안내 「종료된 문의는 사라져요」와 달리 종료 + 새 답변 문의가 목록에 남음 | `support_ticket_list_hint` |
| U-10 | 같은 문의 행이 쓰기 화면에는 ›, 내 문의 목록에는 없음 | `SupportTicketViews.tsx:295` / `SupportCasesHistoryList.tsx:66-89` |
| U-11 | 보관 문의는 「보관 해제」만 → 재오픈까지 2단계 (계약 §2 는 ARCHIVED 도 재오픈 대상) | `AdminSupportPage.tsx:980` |
| U-12 | 매장 없는 사장님: 계약은 「문의하기 비활성」, 코드는 버튼 숨김 + 같은 경고 2번 | `OwnerCustomerCenterView.tsx:85·131` |
| U-13 | 영어 이름 다름 — 어드민 탭 「Closed」, 알약 「Resolved」(탭 키를 매장 도메인에서 빌려 씀) | `AdminSupportPage.tsx:91-92` |
| U-14 | 어드민은 내용 없는 접수 첫 글을 코드값 그대로 표시 가능(「문의 접수 · PAYMENT …」) · 진행 중 목록 불러오기 실패 시 표시 없이 숨김 · 어드민 「답변」 전송 중 표시 없음 | `AdminSupportPage.tsx:1070·1153` · `SupportTicketViews.tsx:239` |
| U-15 | 계약 안 불일치: §4 FAB = 「진행 중」 합 vs §11 F3 종료 + 안 읽은 답변 포함 · `support-status-label.ts:6-9` 낡은 주석 · 상태 null 이면 「답변 완료」 반환 | 계약 §4·§11 · `support-status-label.ts:21` |

## 3. 처음 지시 항목별 판정

| 지시 항목 | 코드 | 운영 | 비고 |
|---|---|---|---|
| 어드민 알림 (새 문의·추가 글·담당 지정) | 결함 D1·D3·D5·D6·L1·L2·L5 | **NOT_PROVEN** (11-14 뒤 문의 0건) | W3 |
| 어드민 알림 확인(읽음·정리) | D1 | NOT_PROVEN | |
| 로그인 / 비로그인 | PASS (고객 API 5개 401 · 본인·매장 소유 확인 · 비로그인 안내 → 로그인 뒤 같은 화면) · 결함 D2(직접 조회) | 화면 NOT_PROVEN | |
| 프로세스별 (접수·합치기·답변·추가 문의·확인했어요·종료·7일 자동 종료·재오픈) | 주 흐름 PASS · D1·L1·L6 | 7일 자동 종료 PASS(11-27 12:00 UTC `auto_7d`) · 나머지 NOT_PROVEN | |
| UI·UX·CTA (계획 일치) | U-2~U-15 | 「문의 접수」 44px·4px · 어드민 「고객 확인 대기」(11-27 확인) | W1 |
| SSOT | 계약 빈칸 2(D1 시점·L6) · 계약 내부 불일치 U-15 · 시안 W1 | — | |
| 오류·중복·누락·누수·병목 | 2절 전체 | — | |
| AI 자동 답변 | 없음(계약 §7) — Owner 「지금은 아님」 | — | |

## 4. 운영 DB 상태 (2026-11-28 읽기 전용)

| 항목 | 값 |
|---|---|
| 문의 | 38건 전부 RESOLVED · 고객 미읽음 합 0 · 어드민 미읽음 합 0 · 진행 중 세션 0 |
| 회원 알림함 고객센터 행 | 미읽음 0 (답변 31 · 종료 36 · 재오픈 4 · 옛 어드민 종류 45 = L13) |
| 어드민 알림·outbox 고객센터 행 | 0 · 0 |
| DB 함수 | `support_append_message` 잠금 뒤 시각·종료 문의 공개 글 거부 = 적용됨 |
| RLS·실시간 | D2 정책 · `support_cases`·`support_messages` 가 `supabase_realtime` 에 포함 |

## 5. 확인했고 맞은 것 (코드 PASS)

고객 API 인증·남의 문의 접근 차단 · 어드민 목록/상세/PATCH/summary/category-settings 는 support 권한 · 글 수정·삭제 본인만 · 고객 재오픈 400 · 접수 합치기 키 = 유일 인덱스 · 경합 23505 이어감 · 종료돼 있으면 새 문의 · 실패한 빈 문의 삭제 · 「확인했어요」 `seenLastMessageAt` + CAS · 어드민 종료 전이 제한·CAS · 7일 자동 종료 CAS·고객 알림 없음 · 읽음 숫자 「보여 준 글 뒤 상대 글 수」 + CAS · 답변 삭제는 안 읽은 알림일 때만 −1 · 발송 판정 함수 하나 · 재생 SQL 진행 중만·미배정 전원·본인 제외 · 권한 동기화 4곳 · FAB 재조회 신호·리스너 정리 · 어드민 폴링 75초·보일 때만 · 목록 상한 100/200 · 검색 토큰 정리 · `"use client"` 서버 모듈 import 없음 · U1·U3·U4·U6·U7·U9 반영.

## 6. 수정 계획 (승인 필요 · 한 PR · 독립 재감사 통과 뒤에만 병합 등록)

| 묶음 | 대상 | 방법 |
|---|---|---|
| DB (운영 적용 승인 필요) | D2·D6(메모) | RLS 고객 정책에 `deleted_at is null` + 종료 문의는 읽은 답변만 / 고객 직접 SELECT 권한이 앱에 불필요하면 회수 · 어드민 정책을 support 권한 기준으로 |
| 알림 | D1·L1·L2·L5 | 답변 요청에 어드민이 본 마지막 고객 글 id 를 보내 그 글까지만 읽음 · 뒤에 온 글이 있으면 상태 WAITING_ADMIN 유지 · 종료 문의 담당 지정 거부·CAS · 권한 회수 시 그 알림 재발송 · 담당 = 글쓴이면 전원 |
| 권한 | D3·D4·L12 | control-plane·guidance 를 support 권한으로, 호출처 0 경로 정리(405 껍데기·summary 중복) |
| 속도 | D5·D6·L10·L11 | 고객 글 속도 제한 · 콘솔 구독을 INSERT·상태 변경만 · 비support 어드민 구독 제거 · FAB 숫자 전용 응답 · 요청 예산 등록 · 중복 조회 제거 |
| 노출 | L3·L4 | 고객 응답 필드 목록 고정 · DB 원문 대신 오류 키 |
| 화면 | U-2~U-15 | 상세 상태 줄 · 쓰기 화면 유지 · 전환 버튼 44px · 목록 컴포넌트 하나 · 어드민 상태 정의 하나 · i18n 키화 · 문구 정정 |
| 계약 | D1 시점·L6·U-15 | 계약서에 「어드민이 본 글까지」 · 고객 종료는 WAITING_USER 만(또는 명시) · FAB 정의 하나 |
| 데이터 (승인 필요) | L13·L9 | 옛 어드민 종류 45행 삭제(백업) · outbox 처리됨 행 보관 기한 |
| 검증 | 전부 | 실패 상황 재현 시험 · 운영: 새 시험 문의 1건으로 어드민 알림·푸시·읽음 실측(W3) |
