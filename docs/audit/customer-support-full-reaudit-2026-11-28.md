# 고객센터 문의 — 전체 재감사·단일 수정안 (2026-11-28 PHT)

- 기준: 브랜치 `fix/support-low-residuals-2026-11-28` HEAD `d2e0fc07f` (= origin/main `075d0de` + PR #690 미병합)
- 방법: 독립 감사 4개(문의 창 상태×사건 전수 · 서버/DB · 알림·배지·어드민 · 계획 대비) 를 코드로 읽고, 핵심 결함은 작업자가 코드에서 다시 대조함.
- 판정 = **코드 판정**. 운영 화면·실기기·운영 DB 는 이번에 보지 않음 → 전부 NOT_PROVEN.
- 운영 DB 조회·파일 수정·배포 없음. PR #690 은 병합하지 않음(자동 병합 미등록).

## 0. 작업자 잘못 (먼저)

1. **한 건씩 땜빵 수정 반복** — 결함이 보일 때마다 그 지점만 고치고(창 회차 번호 → 「보내는 중」 표시 → 닫기 막기+20초), 다른 경로(매장 채팅·진행 중 행·푸시·추가 문의·서버 중복)를 보지 않았다. 그래서 고칠 때마다 새 결함이 나왔다(재감사 D1·D2, 20초 제한이 만든 중복 접수).
2. **PR #690 의 20초 제한이 새 결함을 만듦** — 서버가 이미 저장한 뒤 끊기면 「다시 시도」로 같은 글이 2번 붙는다(C-7).
3. **SSOT 문장 미갱신** — 정지 운영자 RLS(`20271128210000`)를 오늘 운영에 적용했는데 SSOT §5 83행은 「Owner 승인 대기」 그대로.
4. **마이그레이션 버전 번호 중복** — `20271128210000_support_rls_suspended.sql` 이 기존 `20271128210000_moim_r1_permissions_data.sql` 과 같은 번호.
5. 그동안 「결함 없음」「정상」 보고는 일부 경로만 본 것이었다.

## 1. 계획 대비 완료

계획(SSOT §2·§5·§6, 11-27·11-28 감사안) 항목 대부분은 코드로 완료 확인. 완료가 아닌 것만 적는다.

| 항목 | 판정 | 근거 |
|---|---|---|
| 전송 중 입력 잠금·✕ 비활성 | **일부** | 분야 줄·진행 중 행·매장 채팅이 전송 중에도 눌림 (C-1·C-4·C-5) |
| 「빈 내용으로 옛 초안을 지우지 않음」 | **미구현** | 카드 닫힘 뒤 내용을 다 지우면 300ms 저장이 옛 초안 삭제 `support-ticket-form.ts:238-240` |
| 종료+안 읽은 답변: 닫으면 내용 숨김 | **일부** | 「확인」으로만 기억 삭제, ✕·◁ 로 닫으면 옛 푸시로 다시 열 때 옛 답변 보임 `SupportTicketViews.tsx:1292` |
| 갈색 정의 한 곳 | **일부** | `SupportFab.tsx:41,52` 에 따로 정의 |
| 어드민 OPEN 이름 = 「답변 필요」 | **계약과 다름** | `copy-lib.ts:239` 「접수」 (색만 맞음) |
| 담당자 정지 → 담당 해제+전원 (§3-2) | **누락** | 정지 경로 `admin-member-moderation.ts:392` 에 해제 호출 없음 |
| 고객 알림 실패 재시도 | **누락** | 어드민 쪽만 outbox·재생 SQL, 고객 쪽은 기록만 `support-case-service.ts:523-535` |
| 시안 = 구현 | **불일치** | 11-28 `ui-mockup.html` 1~5절이 수정 전 모습(접수 완료 「확인」 주버튼·「새 문의 쓰기」·「숫자로」 문구·행 › 없음 등) |
| 문서 | **모순** | SSOT §5 83행 낡음 · `support-identity-case-session.md` 가 SSOT 와 반대(isRouteAdmin·admin sees all) · spec 문서가 없는 「§9」 참조 · 감사 문서가 없는 §11~§16 참조 · FAB 잠금 문서에 레지스트리 3곳 누락 |
| i18n | 일부 | 키 231쌍 ko·en 모두 있음. `AdminSupportArchivePage.tsx:50-62` 언어 삼항, 죽은 함수 `support-triage-model.ts:278` 한국어 |

## 2. 확인된 결함 (근본 원인별)

심각도: 높음 = 데이터 중복·손실·잘못된 상태 / 중간 = 사용자가 틀린 화면·숫자를 봄 / 낮음 = 드문 경합·정리.

### R1. 진행 중 요청을 한 곳에서 막지 않음 (문의 창)
막음은 접수용 `submittingRef` 하나이고 ✕·◁ 에만 걸림. 추가 문의·확인했어요는 상세 안 별도 `busy`.

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| C-1 | 전송 중 「매장에 문의하기」가 닫기 막음을 우회 → 결과·오류 버려짐 | `SupportTicketViews.tsx:737-744` → `SupportModalHost.tsx:374-377` | 중간 |
| C-2 | C-1 뒤 다시 열면 같은 글이 카드로 → 다시 접수 → 같은 글 2번 | `SupportModalHost.tsx:320` | 높음 |
| C-3 | 앞 회차 finally 가 `submittingRef=false` → 두 번째 전송 중 ◁ 로 닫힘, ✕ 는 비활성 표시(불일치) | `SupportModalHost.tsx:341` | 낮음 |
| C-4 | 전송 중 진행 중 행 → 상세 ✕ 활성으로 보이나 20초 무반응 · 성공이 상세를 「접수 완료」로 덮음 | `SupportTicketViews.tsx:343`, `SupportModalHost.tsx:416` | 중간 |
| C-5 | 전송 중 분야·세부·요금표 화면 이동 가능 → 실패 문구가 안 보임 | `SupportTicketViews.tsx:761,768,776,815` | 중간 |
| C-8 | 전송 중 화면 ‹ 는 동작, ◁ 는 무시 (‹≠◁) | `SupportModalHost.tsx:199-206` | 낮음 |
| C-9 | 전송 중 종료 문의 「문의하기」→ 이전 접수 결과가 다른 맥락 새 쓰기에 뜸 | `SupportModalHost.tsx:348-372` | 낮음 |
| C-15 | 추가 문의 보내는 중 입력칸 안 잠김 → 성공 시 보낸 뒤 입력한 글까지 지움 | `SupportTicketViews.tsx:1154,1309` | 높음 |
| C-16 | 추가 문의 보내는 중 「취소」 활성 → 취소했는데 전송됨 | `SupportTicketViews.tsx:1324` | 중간 |

### R2. 늦은 응답이 그 응답이 속한 화면에 묶여 있지 않음

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| C-6 | 전송 중 푸시로 다른 문의 열림 → 쓰기 화면 사라짐 → 실패가 안 보임 · 성공이 푸시 상세를 덮음 | `support-modal-controller.ts:71-76`, `SupportModalHost.tsx:416` | 중간 |
| C-13 | 「확인했어요」 늦은 성공이 문의 id 와 상관없이 지금 화면을 닫음 (A 확인 → B 로 이동 → A 응답이 B 를 닫음 / 새로 연 창을 닫음) | `SupportTicketViews.tsx:1180`, `SupportModalHost.tsx:478` | 중간 |
| C-14 | 추가 문의 보낸 뒤 상세를 떠나면 실패가 안 보임 · 성공이면 떠난 상세가 GET → 보여 주지 않은 글 알림 읽음 처리(§3-1 위반) | `SupportTicketViews.tsx:1156` | 중간 |
| C-18 | 회원↔매장 전환 시 진행 중 목록이 이전 대상 행을 유지 · 실패해도 오류 안 뜸 | `SupportTicketViews.tsx:309,319` | 중간 |

### R3. 열기 요청이 상태 전체를 덮어씀

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| C-10 | 접수 완료 화면에서 푸시를 눌러도 「접수 완료」 그대로 | `SupportModalHost.tsx:416` | 중간 |
| C-11 | 같은 문의 상세가 열린 채 새 답변 푸시 → 다시 읽지 않아 옛 내용 | `SupportModalHost.tsx:474`, `SupportTicketViews.tsx:1122` | 중간 |
| C-22 | 열린 쓰기 창 위로 다른 맥락 열기 → 상태는 옛 맥락, 저장 칸만 새 맥락 (도달 경로 확인 못 함) | `SupportModalHost.tsx:454`, `SupportTicketViews.tsx:460` | 낮음 |

### R4. 서버 요청 멱등 없음 · 확인 뒤 쓰기 (중복·경합)

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| C-7 / S-1 | 접수 20초 끊김·새로고침 뒤 다시 시도 → 같은 글 추가 문의로 2번 · 어드민 푸시 2번 · 속도 제한 2회 소모 | `support-case-service.ts:706-771`, `open/route.ts:53` | 높음 |
| S-2 | 추가 문의 재전송·연타 → 글 2건·알림 2건 | `support-case-service.ts:1307-1344` | 높음 |
| S-3 | 어드민 답변 재전송 → 답변 2건·고객 푸시 2건·미읽음 +2 | `support-case-service.ts:1602-1671` | 높음 |
| S-4 | 동시 접수 경합: 세션 23505 → 첫 요청이 문의 삭제(CASCADE) → 두 번째가 붙인 글도 사라지고 삭제된 id 로 ok | `support-case-service.ts:816-831,907-932` | 중간 |
| S-5 | 진행 중 문의에 붙는 접수 글은 2000자에서 잘림(새 문의는 8000자) | `support-case-service.ts:675-678,728` | 중간 |
| S-12 | 수정·삭제가 겹치면 삭제한 답변의 새 문장이 고객 알림함에 남음 | `support-case-service.ts:1163,1180` | 낮음 |
| S-14 | 삭제 연타 → 삭제 사건·감사 로그 2건 (`deleted_at IS NULL` 조건 없음) | `support-case-service.ts:1192-1195` | 낮음 |
| S-15 | 우선순위 변경에 CAS·같은 값 무시 없음, 종료 문의에도 바뀜 | `support-case-service.ts:1889-1912` | 낮음 |
| S-16 | 종료 처리 비원자: 상태 CAS 뒤 세션·사건·알림 정리 중 실패하면 재시도가 「이미 종료 ok」로 정리 안 함 | `support-case-service.ts:1760-1794,2042-2056` | 낮음 |
| S-17 | 재오픈 두 번째 클릭 = 400 「종료되지 않음」 | `support-case-service.ts:1921-1944` | 낮음 |

### R5. 알림·숫자 쓰기와 다시 읽기 신호가 묶여 있지 않음 · GET = 「봤다」

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| A-1 | 어드민이 문의를 열어 둔 채 자리를 비워도 고객 글이 오면 자동 GET → 미읽음 0·알림 읽음 (본 적 없음) | `AdminSupportPage.tsx:525-526`, `admin/.../[caseId]/route.ts:53-64` | 중간 |
| A-2 | 어드민 헤더 받은 알림 숫자가 최대 약 75초 늦음 (콘솔이 변경 이벤트를 안 보냄) | `ADMIN_INBOX_CHANGED_EVENT` 발신 0건 | 중간 |
| A-3 | 답변 삭제 시 고객 FAB 숫자 1 많게 남음 (INSERT 신호에만 반응) | `NotificationsBadgeRealtimeBridge.tsx:153` | 낮음 |
| A-4 / S-13 | 알림 행 생성 전 답변 삭제·수정 → 지운·고치기 전 원문이 고객 푸시·알림함에 남음 | `support-case-service.ts:1650-1664` | 낮음 |
| A-11 | 「내 문의」 목록이 새 답변 신호를 안 들음 → 상태 알약 낡음 | `SupportCasesHistoryList.tsx:46-101` | 낮음 |
| S-6 | 고객 알림 저장 실패 시 재시도 없음 → 알림 영구 누락 | `support-case-service.ts:523-535,599-606` | 중간 |

### R6. 권한·소유 판정이 경로마다 다름

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| S-7 | 담당자 정지 시 담당 해제 안 함 → 고객이 더 안 쓰면 볼 어드민 0명 | `admin-member-moderation.ts:392` | 중간 |
| S-8 | 「support 권한 어드민」 정의 3벌 (TS fail-open · RLS · 재생 SQL `is_platform_admin`) | `admin-notification-service.ts:56-77`, `20271127240000:46` | 낮음 |
| A-6 | FAB 숫자·목록은 매장 소유 확인 없음, 상세는 확인 → 소유 잃은 사장님은 숫자를 못 지움 | `support-case-service.ts:950-1076` | 낮음 |
| A-7 | 재오픈 때 권한 잃은 담당자 재확인 없음 | `support-case-service.ts:1914` | 낮음 |
| A-8 / S-11 | 수동 해제·재배정 때 옛 담당자 알림 남음, 새 담당자에게 남은 고객 글 안 알림 | `support-case-service.ts:1799-1887` | 낮음 (계약 공백) |

### R7. 기록 항목·경로 처리

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| C-20 | 창 아래에서 경로가 바뀌면(다른 푸시) 창이 안 닫히고 ◁ 를 한 번 더 눌러야 함 | `SupportModalHost.tsx:174` (경로 변화 감지 없음) | 중간 |
| C-21 | `/support/cases/X`·`/support/enter` 진입 뒤 ◁ 가 같은 주소로 돌아가 다시 열림 → ◁ 로 못 빠져나가는 반복 | `SupportCaseBootstrapClient.tsx:34-43`, `SupportCenterEnterClient.tsx:41-47` | 중간 |
| C-19 | 401 처리 4가지로 제각각 (상세 = 세션 살린 뒤 재시도, 접수 = 바로 로그인 화면, 목록 = 실패, 추가 문의·확인 = 오류 문구) | `SupportTicketViews.tsx:1074-1084,305,1149`, `SupportModalHost.tsx:298` | 중간 |

### R8. 병목·중복 코드·오류 코드

| # | 내용 | 근거 |
|---|---|---|
| B-1 | 진행 중 목록이 전체를 읽고 5행만 씀 (쓰기 화면 열 때마다·전환마다·돌아올 때마다) | `SupportTicketViews.tsx:301,309` |
| B-2 | 요금표를 들어갈 때마다 no-store 로 다시 받음 | `SupportTicketViews.tsx:376-390` |
| B-3 | 답변 1건마다 남은 고객 글 K 건 알림을 다시 퍼뜨림 (≈ K×(10+4A) 쿼리) · 삭제 경로에서 같은 행 2~3번 읽음 | `support-case-service.ts:457-492,388,407,1221-1243` |
| B-4 | dedupe 키 단독 조회에 맞는 인덱스 없음 (5분 재생 SQL 포함) · `notification_events` 조회에 `user_id` 빠짐 | `admin-notification-service.ts:491`, `support-case-service.ts:1142,1213` |
| B-5 | `/admin/support` 에서 `support_cases` 구독 2중 | `AdminSupportPage.tsx:532`, `AdminStorePointPendingProvider.tsx:1391` |
| D-1 | 죽은 코드: `admin-support-queue-policy.ts`(탭과 반대 규칙)·`support-first-admin-response.ts`·안내문 API(화면 호출 0) | — |
| D-2 | 같은 일 두 경로: PATCH status=ARCHIVED ≡ archive · 목록 filter/tab 두 체계 | `admin/.../[caseId]/route.ts:160-218` |
| E-1 | 서버 실패도 400 · `invalid_seen_last_message_at`·`store_forbidden`·`session_failed`·`first_message_failed` 라벨 없음 | 라우트 3개, `support-display-labels.ts` |
| T-1 | 「동작」을 주장하나 문자열만 보는 시험 다수 · 가짜 행 때문에 실제 경로를 안 타는 시험(`support-mark-read-idempotency-self-loop` CASE2·4) | `lib/support/__tests__` |

합계(표에서 직접 셈): 결함 **40건**(높음 5 · 중간 19 · 낮음 16) + 병목·중복 코드·오류 코드·시험 **9건** + §1 계획 불일치 중 표에 없는 **7건**(초안 삭제·종료+안 읽음·FAB 갈색·OPEN 이름·시안·문서·i18n). 중복 표기(C-7=S-1, A-4=S-13, A-8=S-11)는 1건으로 셈.

## 3. 단일 수정안 (한 PR · 한 번 병합)

땜빵을 멈추고 원인 8가지를 구조로 닫는다. PR #690 은 이 수정에 흡수(같은 브랜치에 쌓고 병합 1회).

### 3-1. 문의 창 = 상태 기계 + 단일 요청 실행기 (R1·R2·R3·R7, 웹)
- `lib/support/support-modal-machine.ts` (기존 `support-modal-controller.ts` 흡수)
  - 상태 = `{ session, stack: View[], inflight: Op|null }`. View = 쓰기 / 상세 / 접수 완료 / 로그인.
  - 모든 사건을 intent 로: 닫기·뒤로(‹ 와 ◁ 같은 경로)·이동·문의 열기·맥락 열기·경로 바뀜·로그아웃.
  - **요청 중(inflight)이면 닫기·이동·열기를 1개만 보관했다가 결과 뒤 실행** — 모든 버튼이 같은 기준(`busy`)으로 비활성.
  - 문의 열기는 덮어쓰지 않고 쌓음(쓰기 화면 유지) · 같은 문의면 다시 읽기 · 접수 완료·로그인 화면 위에서도 반영.
- `lib/support/support-modal-ops.ts` — 접수·추가 문의·확인했어요·상세 읽기·진행 중 목록이 **한 실행기**만 사용
  - 동시에 1개 · AbortController + 20초 공통 · 401 = 세션 살리기 1회 뒤 로그인 안내(한 규칙)
  - 결과는 (창 회차, 화면 id, 문의 id) 가 맞을 때만 그 화면에 붙임 · 확인했어요 성공은 그 문의 상세만 닫음
  - 추가 문의 입력칸 전송 중 잠금·취소 비활성 · 목록은 대상이 바뀌면 행 비움 · `limit=5`
- 기록 항목: `history.state` 표시 대신 넣은 항목을 모듈이 추적, 경로가 바뀌면 소비된 것으로 보고 닫음 · 진입 주소 클라이언트는 주소 정리 뒤 열기.
- 빈 내용으로 옛 초안 삭제 금지(카드 확인·접수 성공 때만 지움) · 종료+안 읽은 답변 ✕·◁ 도 「확인」과 같게.

### 3-2. 서버 = 요청 id 멱등 + 원자 RPC (R4, 웹 + **DB: Owner 승인 필요**)
- 클라이언트가 접수·추가 문의·어드민 답변마다 `requestId`(uuid) 생성, 초안과 함께 저장해 재시도 때 같은 id.
- DB: `support_messages.client_request_id` + 유일 부분 인덱스 · `support_append_message(…, p_client_request_id)` 가 같은 id 면 기존 행 + `replayed` 반환(알림 안 보냄).
- DB: `support_open_case(…)` RPC 한 트랜잭션(잠금 → 진행 중 조회 → 생성/붙이기 → 세션 `ON CONFLICT` → 첫 글 → 사건) → S-1·S-4 제거, `discardFailedNewCase` 제거. 붙이는 글도 8000자(S-5).
- DB: `support_transition_case(…)` 상태 전이 표 하나(종료·확인·자동 종료·보관·재오픈·담당·우선순위) — 상태·미읽음·세션·사건·담당 알림 정리를 같은 트랜잭션, 이미 목표 상태면 ok(멱등) → S-15·S-16·S-17.
- TS: 수정·삭제 update 에 `deleted_at IS NULL` 조건(S-12·S-14) · 오류 코드 5xx/409 정리·라벨 추가(E-1).

### 3-3. 알림·숫자 = 원장 하나 (R5·R6, 웹 + DB 일부)
- `lib/support/support-notification-ledger.ts` — 미읽음 숫자·알림 읽음을 바꾸는 쓰기는 모두 이 모듈만. 쓰기 끝에 **서버가 신호 1건**(고객 `support-counts:<userId>` · 어드민 `support-admin-counts`) → 고객 FAB·「내 문의」·어드민 헤더·사이드바·콘솔이 이 신호만 들음(A-2·A-3·A-11·B-5).
- 「본 것」 = 화면에 보인 것: 상세 GET 은 읽기만, 읽음은 `POST …/seen` 으로 분리 · 콘솔은 화면이 보일 때만(A-1) · 고객 창도 같은 방식(C-14).
- 고객 알림 발송 직전 글 다시 확인(삭제면 안 보냄·수정이면 최신 본문, A-4) · 고객 알림 실패도 outbox 재시도(S-6).
- 권한·소유 1곳: FAB·목록도 매장 소유 확인(A-6) · 정지·재오픈 때 담당 재확인(S-7·A-7) · 재생 SQL 을 support 권한 함수로(S-8, DB).
- 병목: 이미 알림 있는 글은 다시 퍼뜨리지 않음 · 같은 행 한 번만 읽기(B-3) · `admin_notifications(dedupe_key)` 인덱스(B-4, DB).

### 3-4. 정리 (웹·문서)
- 죽은 코드·두 갈래 경로 삭제(D-1·D-2) · 어드민 OPEN 「답변 필요」 · FAB 갈색 한 곳 · 언어 삼항 제거
- SSOT §5 갱신 · `support-identity-case-session.md`·spec 문서 정리 · 시안을 현재 계약대로 다시 그림 · 마이그레이션 번호 중복 정리
- 시험: 결함마다 **현재 코드에서 실패하는 동작 시험**(문자열 확인 금지) · 실제 DB 함수 동작은 운영 적용 뒤 읽기 전용 확인

### 3-5. 진행·검증 순서
1. (Owner 승인) 위 설계 확정 → 아래 결정 4건 답
2. 구현 1 PR (웹 + 마이그레이션 파일) · 결함마다 실패 재현 시험 → 수정 후 통과
3. 병합 전 **같은 4개 영역 전수 재감사**(상태×사건 표 다시 채움) → 결과 보고
4. (Owner 승인) 운영 DB 적용 → 웹 병합 순서 (RPC 가 먼저 있어야 함)
5. 운영 확인: 회원·사장님 로그인 실제 화면, 실기기 Android·iPhone (실행 10회 상한 안)

## 4. Owner 결정 필요 (계약에 없음)

1. 쓰기 중 푸시로 **다른 문의**가 열릴 때: 쓰기 화면을 뒤에 유지(‹ 로 돌아옴)할지, 닫을지 — 설계안 = 유지.
2. 담당자를 **수동으로 해제·재배정**할 때 답 못 받은 고객 글을 새 담당자(해제면 전원)에게 다시 알릴지 — 설계안 = 다시 알림.
3. 어드민 목록 빨간 숫자를 **문의 단위**(누가 열면 모두 0, 지금) 로 둘지 **어드민 단위**로 바꿀지 — 설계안 = 지금대로 문의 단위.
4. 어드민 권한 판정에서 프로필을 못 읽을 때 정지로 볼지(지금 = 정지 아님) — 설계안 = 정지로 봄(RLS 와 같게).

## 5. 확인 못 함

- 운영 Production 화면·실기기·운영 DB 행 수(미읽음 불일치·권한 잃은 담당 재오픈 건수) — 조회 안 함.
- 운영 DB 에 마이그레이션 밖 인덱스가 있는지(B-4 실제 부하).
- 열린 창 위로 `/support/enter` 푸시가 실제로 오는지(C-22 도달 경로).
- 이전 결함 번호(F/D/A–J/L/U/M/merge-gate) 하나하나의 되돌아감 여부 전수 재대조.
