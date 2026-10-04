# 고객문의 UI · CTA · 알림 SSOT 설계서 (Phase 3)

- 작성: 2026-10-05 · 상태: **승인 대기** (승인 전 코드 변경 없음)
- 기준 코드: `main` @ `8e7c3beb5` (Phase 1·2 배포 완료본)
- 원칙: **화면 재설계 금지 · 기존 컴포넌트 유지 · 최소 수정 · 레거시 동등성 · 한 가지 사실은 한 곳(SSOT)에서만 정의**
- 모든 "현재(As-Is)" 항목은 코드(file:line) 또는 운영 DB 조회로 확인한 사실만 기재. 추측 없음.
- 독립 검증: 별도 에이전트가 §0·§1 코드 주장 전부 재확인 → 전부 TRUE (DB 수치는 직접 조회로 확인).

---

## 0. 한눈에 보기 — 무엇이 깨져 있나

| # | 증상 (사용자가 겪는 것) | 원인 (확인됨) | 레거시는? |
|---|---|---|---|
| N1 | **관리자: 새 문의·고객 답글에 소리가 안 남** | `support_cases` 가 소리 대상 목록에 없음 → `SKIP_ADMIN_INFORMATIONAL` (`lib/notifications/admin-notification-sound-policy.ts:12-25`, `notification-sound-decision.ts:330-335`) | 소리 남 (`member_admin_note_threads`·`platform_admin_inquiries` 는 목록에 있음) |
| N2 | **관리자: 내가 담당 지정·우선순위 변경·문의 열기만 해도 "새 문의" 팝업** | `support_cases` UPDATE 의 이전값이 id 만 옴(DB `relreplident = d` 확인) → "이전엔 대기 아님→지금 대기"가 매번 참 (`lib/admin/admin-ops-sound-decision.ts:55-62`) | 팝업은 INSERT 기준이라 오발 없음 |
| N3 | **앱: 관리자 답변 알림이 알림함 목록에 안 보이는데 숫자는 올라감 (유령 알림)** | 서버는 DB `category`(inquiry_answered/admin_notice)로 세고, 앱 목록은 `category` 없이 `type`(support_*)으로 거름 → 목록에서 탈락 (`member-notification-a-projection.ts:132-151`, `badge-event-classifier.ts:72-87`). 운영 DB 기준 미읽음 support 알림 **48건** | 보임 (`inquiry_answered`/`inbox_message_received` 는 type=category) |
| N4 | **앱: 상담을 열어 읽어도 알림 숫자가 안 줄어듦** | 상담 읽음은 `requester_unread_count` 만 0으로 함. 같은 상담의 `notification_events` 는 안 건드림 (`support-case-service.ts:1004-1020`) | — |
| N5 | **앱: "주문 알림"을 끄면 고객센터 답변 푸시도 꺼지고, "공지 알림"을 꺼도 안 꺼짐** | 푸시 메타에 `event_type` 없음 → `"notification"` → 정책 미매칭 → `safe_fallback = order` (`web-push-user-settings-gate.ts:57-87`, `notification-preference-policy-registry.ts:149-154,240`) | — |
| N6 | **앱을 켜고 있을 때 관리자 답변이 와도 아무 표시 없음** | Android: 앱 화면 중이면 support 푸시 트레이 생략 (`DibayFirebaseMessagingService.java:114-118`). 웹 레이어: 배너 없음, 소리·숫자만 (`NotificationsBadgeRealtimeBridge.tsx:37-75`) | 동일하게 없음 (신규 요구) |
| N7 | **고객이 문의를 만들면 본인에게 "문의 SC-… / ORDER · mypage_store_order_detail" 푸시** | 생성 시 요청자 본인에게 알림 + 본문이 내부 코드 (`support-case-service.ts:47-52,406-417`) | 본인 알림 없음 |
| U1 | **"이전 문의 기록"이 두 화면(1:1 문의·받은 쪽지)에 같은 제목** · 받은 쪽지 14건은 고객센터에서 들어갈 길 없음 | 두 목록이 같은 i18n 키 (`MemberCsNoteListClient.tsx:41-50`), 허브엔 `/mypage/inquiries` 만 (`CustomerCenterHubClient.tsx:105-121`) | "1:1 문의" / "받은 쪽지" 로 분리 |
| U2 | **화면에 영문 코드 노출** (오류코드, `STORE_ORDER`, `COIN_WITHDRAWAL_REQUEST`, 미정의 상태값) | 오류·참조유형·상태 라벨 SSOT 없음 (§3B B2·B3 적용 위치 목록) | — |
| U3 | **사장님: "새 상담 N건"이 새 고객센터가 아닌 옛 쪽지 숫자** · "상담 내역" 탭 뱃지 항상 0 | `OwnerCustomerCareHubView.tsx:64-75,187`, `OwnerCustomerCenterView.tsx:73` | — |
| U4 | **관리자: 같은 상태를 화면마다 다른 말로** ("접수"/"open (확인)"/"사용자 답변 대기"/"waiting user (확인)") · 카테고리 영문 · "Owner/Member" 영문 | 관리자 라벨이 페이지 로컬 함수 + operator-labels 두 곳 (`AdminSupportPage.tsx:58-73`, `operator-labels.ts:24-36`) | — |
| U5 | **관리자: 다른 문의에 고객 답글이 와도 목록이 안 바뀜** (선택한 문의만 갱신) | 실시간 구독이 `case_id = activeId` 한정 (`AdminSupportPage.tsx:189-212`) | — |
| U6 | **관리자: 레거시 미처리 문의 본문을 읽을 화면이 없음** (보관 페이지는 제목·영문 상태만) | `AdminSupportArchivePage.tsx:130-153` 행이 링크 없는 `<li>` | 읽기·답변 가능했음 |
| U7 | 관리자 대시보드 "회원 문의/플랫폼 문의" 타일 항상 0 | 레거시 카운트 하드코딩 0 (`admin-action-queue.ts:463,469`, `AdminOrderNotificationsPageClient.tsx:110-125`) | — |

---

## 1. 현재 구조 (As-Is) — 확인된 화면 지도

### 1.1 회원(앱)

```
내정보 ─ [고객지원] 고객센터 (뱃지 없음) ─────────────▶ /mypage/customer-center (허브, FAB 숨김)
                                                      ├ [문의하기] ──▶ 고객센터 시트(START_CATEGORY)
                                                      ├ 공지 / 시스템 / 마케팅 게시판 타일
                                                      ├ 상담 내역 (뱃지 없음) ─▶ /mypage/support-history ─(행 탭)─▶ 시트(상담)
                                                      ├ 이전 문의 기록 ─▶ /mypage/inquiries  (1:1 문의만, 읽기전용)
                                                      ├ 포인트 / 충전 신청
                                                      (받은 쪽지 /mypage/inbox: 허브에서 진입 불가, 제목도 "이전 문의 기록")
FAB 「고객센터」(허용 화면만, 뱃지 없음) ──▶ 시트(맥락 고정 START_ISSUE)
푸시 탭 / 알림함 탭 ──▶ /support/cases/{id} ──▶ 시트(상담)   ※ 알림함엔 support 알림이 안 보임(N3)
```

시트(`SupportModalHost` → `SupportTriageFlow` / `SupportActiveConversation`)

| 단계 | 주요 CTA | 동작 |
|---|---|---|
| START_CATEGORY | 카테고리 버튼 | `SELECT_CATEGORY` |
| START_ISSUE | 세부유형 버튼 · 「다른 문제 문의」 | `SELECT_ISSUE` · `SWITCH_TO_GENERIC` |
| GUIDANCE | 「해결됐어요」 · 「상담사에게 문의」 | 시트 닫기 · `GUIDANCE_ESCALATE` |
| HANDOFF_SUMMARY | 「상담사에게 문의」(내용 비면 비활성) | `POST /api/support/cases/open` |
| 상담 | 「전송」(빈칸·오프라인·전송중 비활성) | `POST /api/support/cases/{id}` |
| 종료된 상담 | 「새 문의하기」 | 같은 대상(회원/매장)으로 START |

### 1.2 사장님(앱)
`/stores/owner/customer-care` → "DIBAY 고객센터" (뱃지 = **옛 쪽지 미읽음**) → `/stores/owner/customer-care/customer-center` 탭: 「상담 내역」(뱃지 0 고정) · 「이전 문의 기록」(옛 쪽지 미읽음). 「문의하기」는 storeId 있을 때만. 코인 출금 행 「문의하기」(맥락 고정).

### 1.3 관리자
사이드바 「고객지원 관제」(뱃지 = OPEN+WAITING_ADMIN 수, 75초 폴링 + 실시간 debounce) · 「이전 문의 기록」.
`/admin/support`: 상단 관제 카드(마운트 시 1회) → 필터칩 8종 · 검색(키 입력마다 재조회) → 3열(목록 / 대화 / 맥락).
대화 헤더: 「상담 종료」↔「재오픈」 · 「나에게 배정」 · 「배정 해제」 · 우선순위. 작성기: 「공개 답변」/「내부 메모」 토글 · 「답변」(종료 상담은 비활성 + 안내) · 「메모 저장」.
알림: 우하단 토스트 1칸(8초, "신청 상세 보기") · 소리 없음(N1) · 헤더 종 = 링크만(모달 없음).

### 1.4 알림 이벤트 (현재 수신자)

| 이벤트 | 수신자 | 제목 / 본문 | 문제 |
|---|---|---|---|
| support_case_created | **요청자 본인** | 문의 SC-… / `ORDER · surface` | 본인 알림 + 코드 노출 (N7) |
| support_customer_replied | 담당 관리자만 (미배정이면 없음) | 문의 SC-… / 고객 메시지 | 미배정은 콘솔 토스트·소리에 의존 → 소리 없음(N1) |
| support_admin_replied | 요청자 | 문의 SC-… / 관리자 메시지 | 알림함 미표시(N3), 토글 오적용(N5) |
| support_case_resolved | 요청자 | 문의 SC-… 종료 / `ORDER · surface` | 코드 노출 |
| support_case_assigned | **요청자** (배정된 관리자 아님) | 문의 SC-… / 담당자가 배정되었습니다. | 레거시에 없던 알림 |
| support_case_reopened | 요청자 (본인이 재오픈해도) | 문의 SC-… 재오픈 / `ORDER · surface` | 코드 노출 |

---

## 2. 목표 구조 (To-Be) — 화면은 그대로, 연결·라벨·알림만 정확히

### 2.1 회원 화면 구조 (변경점 ★)

```
내정보 ─ 고객센터 ──▶ 허브
                      ├ [문의하기]                                  (변경 없음)
                      ├ 게시판 타일                                  (변경 없음)
                      ├ 상담 내역  ★미읽음 숫자(요청자 미읽음 합)      ─▶ 상담 내역 목록 ─▶ 시트
                      ├ 이전 문의 기록 ★                             ─▶ /mypage/inquiries
                      │     ├ 섹션 「이전 1:1 문의」 (started_by=member)
                      │     └ 섹션 「이전 관리자 쪽지」 (started_by=admin)  ← 사장님 보관 탭과 같은 구조
                      ├ 포인트 / 충전 신청                            (변경 없음)
/mypage/inbox ★ → /mypage/inquiries#inbox 로 이동 (옛 링크·옛 알림 호환)
알림함 ★ support 알림 표시 → 탭 시 시트(상담) 열림, 상담을 읽으면 알림도 읽음 처리
앱 사용 중 관리자 답변 ★ (결정 D1) 상단 인앱 배너 「DIBAY 고객센터 · 답변이 도착했어요」 → 탭 시 시트(상담)
```

### 2.2 사장님 화면 (변경점 ★)
- Owner Care 「DIBAY 고객센터」 뱃지 ★ = 이 매장 OWNER 상담의 `requester_unread_count` 합 (옛 쪽지 숫자 제거)
- 고객센터 「상담 내역」 탭 뱃지 ★ = 같은 값 (하드코딩 0 제거)
- 「이전 문의 기록」 탭 뱃지 = 옛 쪽지 미읽음 (유지)

### 2.3 관리자 화면 (변경점 ★)
- 목록: ★ 어떤 문의든 고객 메시지가 오면 목록 갱신(300ms 묶음) — 상세는 선택한 문의일 때만 갱신
- 상태·역할·카테고리·우선순위 표기 ★ 전부 SSOT 라벨 (영문 코드·"(확인)" 제거)
- 맥락 열: 매장 ★ 매장명(+짧은 id), 우선순위 ★ 한글
- 검색 ★ 입력 300ms 후 1회 조회 (버튼·Enter 즉시)
- 보관 페이지 ★ 행 탭 → 그 자리에서 읽기전용 대화 펼침(기존 GET API 사용), 상태 한글
- 대시보드 레거시 0 타일 ★ → 「고객지원 답변 필요」 1개(= 사이드바 뱃지와 같은 값) → `/admin/support`
- 토스트 ★: 고객이 보낸 공개 메시지(새 문의 포함)마다 1회, 소리 1회. 관리자 자신의 행동으로는 안 뜸.
  문구 「고객지원 문의 · 회원|사장님 · SC-… · 미리보기」 / 둘째 줄 「문의 열기」. 닫기(✕) 추가.

### 2.4 CTA 표 (눌림 → 결과 → SSOT)

| 위치 | 라벨(키) | 눌림 | 결과 | 비활성 조건 | 데이터 SSOT |
|---|---|---|---|---|---|
| 허브 | 문의하기 `support_enter_cta` | `navigateToSupportCenter(generic MEMBER)` | 시트 START_CATEGORY | — | `support-triage-model` |
| 허브 | 상담 내역 `support_history_title` + 숫자 | Link `/mypage/support-history` | 목록 | — | `support_cases.requester_unread_count` |
| 허브 | 이전 문의 기록 `support_legacy_archive_title` | Link `/mypage/inquiries` | 2섹션 읽기전용 | — | `member_admin_note_threads.started_by` |
| 상담 내역 행 | (사건번호·카테고리·상태) | `deliverSupportOpen({caseId, source:"history"})` | 시트 상담 | — | 상태 라벨 = `support-status-label.ts` |
| 시트 상담 | 전송 `support_send_cta` | POST 메시지 | 말풍선 추가, 상태 답변 대기 | 빈칸·오프라인·전송중 | RPC `support_append_message` |
| 시트 종료 상담 | 새 문의하기 `support_new_inquiry_cta` | 같은 대상으로 START | 새 상담 | — | — |
| 알림함 행 | 문의 SC-… | `activateNotificationDestination` → `deliverSupportOpen({source:"inbox"})` | 시트 상담 + 알림 읽음 | — | `notification_events` |
| 인앱 배너(D1) | 답변이 도착했어요 | `deliverSupportOpen({caseId, source:"inbox"})` | 시트 상담 | 그 상담 시트가 이미 열려 있으면 배너 안 띄움 | `notification_events` INSERT |
| 관리자 토스트 | 문의 열기 | Link `/admin/support/{id}` | 해당 상담 선택 | — | `support_messages` INSERT |
| 관리자 상세 | 상담 종료 / 재오픈 | PATCH status RESOLVED / reopen | 버튼 토글 | busy | `support_cases.status` |
| 관리자 상세 | 답변 | PATCH reply | WAITING_USER, 고객 알림 1건 | busy·빈칸·종료 상담 | RPC |
| 관리자 상세 | 메모 저장 | PATCH reply internal | 고객 비노출 | busy·빈칸 | RPC |
| 관리자 상세 | 나에게 배정 / 배정 해제 | PATCH assign | 담당 표시 | busy | `assigned_admin_id` |

### 2.5 알림 규칙 (목표)

| 이벤트 | 누구에게 | 푸시 | 앱 알림함 | 인앱 배너(D1) | 관리자 토스트·소리 | 본문 |
|---|---|---|---|---|---|---|
| 새 문의 접수 | 관리자 콘솔 | — | — | — | ✅ (첫 고객 메시지 INSERT) | 고객 첫 메시지 미리보기 |
| support_case_created | ~~요청자~~ **보내지 않음** | — | — | — | — | — |
| 고객 추가 메시지 | 관리자 콘솔 + 담당자 푸시(현행) | 담당자 | — | — | ✅ | 고객 메시지 |
| support_admin_replied | 요청자 | ✅ (토글: 공지) | ✅ | ✅ | — | 관리자 메시지 |
| support_case_resolved | 요청자 | ✅ (공지) | ✅ | ✅ | — | 「상담이 종료되었습니다.」 |
| support_case_reopened | 요청자 (관리자가 재오픈한 경우만) | ✅ (공지) | ✅ | — | — | 「상담이 다시 열렸습니다.」 |
| support_case_assigned | (결정 D2) 권장: **보내지 않음** | — | — | — | — | — |

읽음 동기화: 회원이 상담을 열면 → 그 상담의 회원 측 support 알림 읽음 / 관리자가 상담을 열면 → 그 관리자의 `support_customer_replied` 알림 읽음. 이후 뱃지 캐시 무효화.

---

## 3. 수정 명세 (파일 단위, 최소 변경)

### 3A. 알림 정확도 — N1~N5, N7 (화면 구조 변경 없음)

| ID | 파일 | 변경 | 검증 |
|---|---|---|---|
| A1 (N1,N2) | `components/admin/store-points/AdminStorePointPendingProvider.tsx` | 토스트·소리 트리거를 `support_messages` INSERT(`sender_type ∈ MEMBER,OWNER` ∧ `message_type=PUBLIC`)로 이동. `support_cases` INSERT/UPDATE 구독은 **뱃지 새로고침만** 유지(토스트 제거). 사운드 키 = 메시지 id | 단위: 관리자 행동(배정·우선순위·열람·메모) → 토스트 0, 고객 메시지 → 토스트 1·소리 1 |
| A1 | `lib/notifications/admin-notification-sound-policy.ts` | `ACTIONABLE_TABLES` 에 `support_messages` 추가 | 계약 테스트 |
| A1 | `lib/admin/admin-ops-sound-decision.ts` | `support_messages` 분기 추가(위 조건). `support_cases` 분기는 토스트 판단에서 제외 | 단위 |
| A1 | 토스트 문구 | `Owner/Member` → SSOT 역할 라벨, 둘째 줄 신규 키 `admin_support_toast_open`「문의 열기」, 닫기 버튼 | 계약 |
| A2 (N3) | `lib/notifications/badge-authority-rebuild/badge-event-classifier.ts` | `MEMBER_NOTIFICATION_A_KINDS` 에 support 6종 추가 (서버 판정은 category 로 이미 A → 서버 결과 불변, 앱 목록만 일치) | 계약: 6종 × (서버 판정 = 앱 판정) |
| A2 | `lib/notifications/inbox-events-merge.ts` | `resolveBellPresentationType`: `support_*` → `"admin_notice"` (레거시 `inquiry_answered` 와 동일 표시) | 단위 + 알림함 탭 분류가 레거시 `inquiry_answered` 와 같은 탭인지 계약 테스트 |
| A3 (N4) | `lib/support/support-case-service.ts` `markSupportCaseReadForRequester` / `ForAdmin` | 같은 상담·같은 수신자의 미읽음 `notification_events`(`type like 'support_%'`, `display_payload->>supportCaseId = caseId`) `read_at = now()` + 뱃지 캐시 무효화 | 단위 + 운영 확인 쿼리 |
| A4 (N5) | `lib/notifications/pipeline/notify-push-dispatcher.ts` | `support_*` 일 때만 `meta.event_type = row.type` 추가 → 정책 레지스트리 `support_* → notice` 적용 (`resolutionSource = canonical_event`). `receiverRole` 은 추가하지 않음(owner 로 바뀌면 다시 safe_fallback) | 단위: resolutionSource ≠ safe_fallback, domain = notice |
| A5 (N7) | `lib/support/support-case-service.ts` | `support_case_created` 요청자 알림 제거 · reopened 는 actor ≠ 요청자일 때만 · resolved/reopened 본문 고정 문구 · (D2) assigned 제거 | 기존 계약 테스트 갱신 |

### 3B. 라벨·리스트 SSOT — U1~U7

| ID | 파일 | 변경 |
|---|---|---|
| B1 (U2,U4) | `lib/support/support-status-label.ts` | 고객 라벨(현행 유지) + **관리자 라벨**(접수/답변 대기/사용자 답변 대기/종료/보관 — 기존 필터칩 문구 유지) + 역할(회원/사장님) + 우선순위(일반/높음/긴급)를 한 파일에서 정의. `AdminSupportPage`·`AdminSupportControlPlane`·토스트가 모두 여기서 읽음 |
| B2 (U2) | 신규 `lib/support/support-error-label.ts` | 오류코드 → 문구 1곳: 401 로그인 필요 / forbidden·not_found 열 수 없음 / case_closed 종료된 문의 / network_error 네트워크 / 그 외 `common_content_unavailable`. 적용: `SupportModalHost.tsx:398,502`, `SupportTriageFlow.tsx:373,420`, `SupportCasesHistoryList.tsx:80`, `SupportCenterEnterClient` |
| B3 (U2) | 신규 `lib/support/support-reference-label.ts` + i18n `support_ref_*` 13종 | `SUPPORT_REFERENCE_TYPES` → 「주문」「출금 신청」 등. 적용: `SupportTriageFlow.tsx:278,481`, 관리자 맥락 열 |
| B4 (U1) | `MemberCsNoteListClient.tsx`, `/mypage/inbox` 페이지 | `/mypage/inquiries` = 2섹션(「이전 1:1 문의」·「이전 관리자 쪽지」, 사장님 보관 탭과 같은 문구·구조). `/mypage/inbox` → `/mypage/inquiries#inbox` redirect. 정의되지 않은 레거시 상태값은 영문 원문 대신 「확인 필요」 표시 |
| B5 | `SupportCasesHistoryList.tsx`, 허브 | 행 제목 폴백 `subject` → 카테고리 라벨. 허브 「상담 내역」 행 미읽음 숫자(기존 목록 API 재사용, 허브 진입 시 1회) |
| B6 (U3) | `OwnerCustomerCareHubView.tsx`, `OwnerCustomerCenterView.tsx`, `customer-center/page.tsx` | 뱃지 출처를 OWNER 상담 미읽음 합으로 교체 (기존 `GET /api/support/cases?audience=OWNER&storeId`) |
| B7 (U5) | `AdminSupportPage.tsx` | `support_messages` INSERT 구독 필터 제거 → 목록 300ms debounce 재조회, 상세는 `case_id === activeId` 일 때만. 검색 300ms debounce |
| B8 (U6) | `AdminSupportArchivePage.tsx` | 행 탭 → 읽기전용 대화 펼침(`GET /api/admin/member-notes/{id}` 기존), 상태 한글. 플랫폼 문의는 본문 필드 표시 |
| B9 (U7) | `AdminOrderNotificationsPageClient.tsx` | 0 고정 타일 2개 → `support_actionable` 타일 1개 → `/admin/support` |
| B10 | `docs/support-center/support-fab-visibility-owner-lock.md`, `support-fab-route-registry.ts` | 문서의 FAB 진입 함수명 정정(`navigateToSupportCenter`), 레지스트리에 누락된 광고 팝업 2화면 추가 |

### 3C. 결정이 필요한 항목

| ID | 내용 | 권장 |
|---|---|---|
| **D1** | 앱 사용 중 알림(인앱 배너). (a) 웹 레이어 배너 — 앱 재배포 불필요, 메신저 배너와 **같은 디자인 토큰, 별도 호스트**(메신저 도메인 경계 준수) / (b) Android 네이티브 포그라운드 트레이 — 스토어 재배포 필요, iOS 별도 | **(a)** |
| **D2** | `support_case_assigned` 고객 알림 (레거시 없음, 지금까지 12건 발송) | **제거** |
| **D3** | 관리자가 먼저 회원에게 문의 열기 (레거시 쪽지 기능, 지금은 불가) — **신규 기능** | 별도 단계로 분리 |
| **D4** | 레거시 미처리 8건(회원 1:1 5 · 플랫폼 계정요청 3) 종료 — B8 로 본문 확인 후 운영 확인 시 종료 | B8 배포 후 진행 |

### 하지 않는 것
화면 배치·색·컴포넌트 교체, 새 상태값·새 테이블, 고객 측 재오픈 버튼(Phase 1 결정: 종료 상담은 「새 문의하기」), 관리자 알림 센터(모달) 신설 — 관리자 알림 SSOT 는 **사이드바 뱃지 + 토스트 + 소리** 로 확정.

---

## 4. 검증 계획

1. **자동 테스트(CI)**: A1 토스트/소리 판정 표 · A2 서버=앱 분류 일치(6종) · A3 읽음 동기화 · A4 토글 해석 `notice` · A5 수신자 표 · B1 라벨 표(관리자 화면에 영문 enum 문자열 없음) · B2 오류 문구 · B4 inbox redirect.
2. **운영 DB 확인**: 배포 후 QA 계정 상담 열기 → 해당 support 알림 `read_at` 채워짐 · 미읽음 support 알림 수 변화.
3. **실기기(삼성·아이폰)**: 관리자 답변 → 푸시 → 알림함에 보임 → 탭 → 시트 → 숫자 감소 / 공지 토글 OFF → 푸시 안 옴, 주문 토글 OFF → 옴 / (D1) 앱 사용 중 배너.
4. **관리자 콘솔**: 고객 메시지 → 소리 1회 + 토스트 1회 / 배정·우선순위·열람 → 토스트 0 / 다른 상담 메시지 → 목록 갱신.

## 5. 순서
3A(알림) → 3B(라벨·리스트) → D1 → D4. 각 단계: 브랜치 → CI → 병합 → 운영 확인 → 다음 단계. 3C D3 는 별도 승인.
