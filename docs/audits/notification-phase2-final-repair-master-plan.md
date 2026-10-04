# DIBAY NOTIFICATION — FINAL REPAIR MASTER PLAN (Phase 2)

- 작성일: 2026-10-04 · 기준 SHA: HEAD = origin/main = Production `9d5ac23a`
- **NO CODE CHANGE / NO DB / NO NATIVE / NO DEPLOY.** 이 문서만 추가.
- 증거 규칙 (Phase 0 PUSH-01 오판 재발 방지):
  1. subagent 보고는 위치 탐색에만 사용, 판정 근거로 사용하지 않음 — 모든 판정은 직접 읽은 코드 라인 / 직접 실행한 Prod SQL / 직접 실행한 순수 함수 결과.
  2. 상관 ≠ 인과: 집계 일치만으로 판정하지 않고 행 단위(device_id·call_id·occurrence_id)로 조인.
  3. 코드 주석은 "의도의 정황"으로만 기록, 확정 증거로 쓰지 않음.
  4. **QA/테스트 데이터와 운영 데이터를 분리** (`is_qa`, `created_by=11111111-…` placeholder, `QA-/D7-/SSOT-RT-/P7CLOSE-/CCAUTH-` 접두).
  5. "현재 코드가 만드는 상태"와 "과거 데이터(코드 버전 불명)"를 분리 — git 이력이 2026-10-01 로 squash 되어 과거 배포 코드 대조 불가.
- 접근 한계: Vercel runtime/aggregate logs **403**, 실기기 없음, 빌드 불가.

---

## 1. 전체 결함 증명 수준 (최종)

| ID | 내용 | 판정 | 실사용 영향 근거 | 비고 |
|---|---|---|---|---|
| **EVENT-11** (신규) | 수동/즉시 발송 완료 후 campaign 상태·집계가 갱신되지 않음 (영원히 `draft`), occurrence 최종상태가 실패를 무시 | **CONFIRMED (현행 코드 + Prod)** | 운영 캠페인 "11111"(83명 발송) 이 Admin 목록에 `draft` 로 표시 | §3.1 |
| **EVENT-12** (신규) | `/send` 가 test occurrence 를 실제 발송 대상으로 집을 수 있음 | **CONFIRMED (코드)** / Prod 발생 0 | 잠재 — 테스트 후 발송 시 회차·이력 오염 | §3.1 |
| **EVENT-13** (신규) | test-send occurrence 가 영구 `queued` | **CONFIRMED (현행 코드 + Prod 19건)** | Admin 이력 오표시 | §3.1 |
| **EVENT-01** | 저장된 draft(이벤트 Push/Bell 포함)를 Admin 에서 발송할 수 없음 | **CONFIRMED** — 원인 정정: UI 버튼 부재 + **draft 에는 occurrence 가 없어 `/send` 가 `occurrence_not_found`** | Prod 이벤트 캠페인 7건 전부 draft·occurrence 0 | 버튼만 추가 시 404 — 승인 거부된 방식이 실제로도 작동 불가 |
| **EVENT-02** | 이벤트 Push/Bell 캠페인 내용 동결 + 미리보기≠발송 | **CONFIRMED (코드)** — 3중 출처 | `materializePush/Bell` 이 "updated" 라 보고하나 `createAdminNotificationCampaign` replay 는 무변경 반환 | §3.2 |
| **CTA-01** | 구매자 주문 알림 → 목록 | **CONFIRMED** (Prod 323) — 목적지 정정 §5 | | 정본 = `/orders?expand={id}` (근거 §5) |
| **NOTIF-03** | CM 비텍스트 메시지 알림 type 오분류 | **CONFIRMED** (Prod 그룹 13 / 주문 4) | 설정·사운드·채널 오적용 | |
| **NOTIF-02** | 그룹 초대 알림 INSERT 결정적 실패 | **CONFIRMED (코드+스키마)** / 런타임 미관측 | 제약 도입(10-02) 후 그룹 생성 0 | 분류 정책 선행 |
| **NOTIF-01 / NOTIF-04** | DB 오류를 빈 목록 / 성공으로 위장 | **CONFIRMED (코드)** / 빈도 NOT_PROVEN | | 소비자 12곳 감사 선행 |
| **CTA-04** | 리뷰 답글 → 사장님 전용 경로 | **CONFIRMED** (Prod 1) | `store_reviews.order_id` 존재 → 구매자 목적지 산출 가능 | |
| **CTA-05** | 보관 push route 의 타계정 재생 | **CONFIRMED (코드)** | FRESH_LOGIN 정책과 모순 | |
| **CTA-07** | 알림 상세 Back 루프 | **CONFIRMED (코드)** / 런타임 NOT_PROVEN | | |
| **EVENT-03** | 히어로 배너 이벤트 가용성 미검사 | **CONFIRMED (코드)** / Prod 노출 0 | 운영자 미해제 시 노출 | |
| **EVENT-06** | 공지 캠페인 공지 존재·게시 미검증 | **CONFIRMED (코드)** / Prod draft 2 | | |
| **EVENT-07** | 이벤트 비게시 시 popup/banner 미중지 | 코드 정황(Phase 0 agent) — **직접 재검증 미완 → NOT_PROVEN** | | 추가 조사 |
| **EVENT-09** | 반복 캠페인 정지 | **재분류: 실제 원인 = QA 스크립트 직접 DB 쓰기** + 코드 취약성(잠재) | 운영 UI 경로로는 재현 불가 | §3.1 |
| **PUSH-01** | iOS 통화 terminal 일반 APNs alert | **PARTIALLY_PROVEN** (payload·발송 확정, 표시/중복 실기기 미증명) | apns-only 설치의 유일한 착신 수단 | 정책·실기기 선행 |
| **PUSH-02** | 실패 push 재시도 무효 | **CONFIRMED (코드)** / 손실 사례 0 | handoff 대상 실패는 전부 영구 오류 | 저우선 |
| **PUSH-03** | Android onNewToken 미업로드 | **PARTIALLY_PROVEN** — 다음 실행 시 재등록으로 완화 | FCM NotRegistered 30일 ~4 | 저우선 |
| **PUSH-07** | VoIP invalidate 가 사용자 전체 VoIP 비활성 | **CONFIRMED (코드)** / Prod 관측 불가 | | 저우선 |
| **PUSH-10** | delivery pending 113 정체 | **재분류: 과거 데이터.** 2026-10-02 call-push keep-alive(`f535b879`) 이후 251건 중 pending 0 (이전 주당 ~1%) | 원인(서버리스 teardown)은 정황, 로그 부재로 NOT_PROVEN | 모니터링 |
| **SOUND-01** | 커스텀 알림음이 BG/Killed 미적용 | **사실 CONFIRMED — 결함 아님, 문서화된 Phase 2 backlog** (`docs/notifications/notification-sound-ssot-phase1-lock.md`, `scripts/notification-sound-ssot-lock-manifest.json phase2Backlog`) | Admin UI 가 적용 범위를 표시하지 않음(UX) | §6 |
| **NOTIF-09** | 리마인더·자동완료 cron 미스케줄 | **CONFIRMED** — 알려진 상태(`docs/dibay-delivery-product-hard-lock.md:43` NOT_RUN) | accept_reminder 0건 | 정책 |
| **NOTIF-06** | 배달광고·비즈캐시 알림 marketing 분류 | 코드 사실 / 결함 여부 = 정책 | | 정책 |
| **EVENT-05** | 사용자 이벤트 목록 없음 | **결함 아님** — 제품 문서상 이벤트는 destination adapter(popup/banner/push/bell)로만 진입 (`docs/dibay-promotion-program-ssot-lock.md:56,124-142`) | | 신규 기능(D) |
| **GOV-01** (신규) | QA 스크립트가 Production DB 를 service role 로 직접 변경 | **CONFIRMED** (`scripts/qa/admin-campaign-runtime-gates.mjs:472-476,511-533` 등) | EVENT-09 데이터 생성 원인 | 운영 정책 |
| AUTH-01 | `community_messenger_call_log_user_hides` Prod 미적용 | CONFIRMED (알림 범위 밖) | | 별도 트랙 |

## 2. 허위·과장·오판 항목 (누적 정정)

| 단계 | 항목 | 정정 |
|---|---|---|
| Phase 0 | PUSH-01 Prod 증거 | 건수 상관을 인과로 오판 — 동일 기기 이중 발송 0건 |
| Phase 0 | PUSH-06 | order_status 는 HIGH |
| Phase 0 | CTA-02 | 계정 의존 경로 복원 금지 = 보안 정책 |
| Phase 0 | CTA-03 | 2026-08-05 test-send 1건, 현행 재현 불가 |
| Phase 0 | PUSH-14 | native ack 95%+ → 커스텀 FCM 서비스 정상 |
| Phase 0 | EVENT-05 | 제품 문서상 목록 미요구 |
| Phase 0 | SOUND-01 "결함" | 문서화된 미구현 범위 |
| **Phase 1** | EVENT-09 "근본 원인 확정·제품 결함" | 원인은 **QA 스크립트가 occurrence #1 을 직접 `sent` 로 쓴 것**. 운영 UI 경로(create→cron)에서는 completed_at ≥ scheduled_for 이므로 정지하지 않음. 코드 취약성만 남음(잠재) |
| **Phase 1** | EVENT-01 "UI 진입점 미구현이 원인" | 불완전 — draft 에 occurrence 가 생성되지 않는 서버 계약이 함께 원인 |
| **Phase 1** | EVENT-10 "원인 미확정" | 분해 완료 §3.1 (backfill 14 / 미발송 생성 27 / test 19 / rollup 결함 13) |
| **Phase 1** | CTA-01 정본 후보를 `/mypage/store-orders/{id}` 로 제시 | 정본은 `buyerStoreOrderDetailPath` = `/orders?expand={id}` (§5) |
| Phase 1 | PUSH-10 "원인 미확정" | 10-02 이후 재발 0 — 과거 데이터 |

---

## 3. 상태 전이 분석

### 3.1 Campaign → Occurrence → Dispatch (현행 코드)

```
[Admin create]  POST /api/admin/notification-campaigns → createAdminNotificationCampaign
  save_as_draft=true            → campaign.status=draft, occurrence 없음            ← EVENT-01 원인
  immediate (draft=false)       → campaign.status=draft(!), occurrence#1 queued(scheduled_for=null)
                                   → 브라우저가 별도 POST /send 호출 (confirmImmediateSend)
                                   → /send 실패/중단 시 queued 영구 잔류 (cron 은 scheduled_for null 미claim)
  scheduled                     → campaign.status=scheduled, occurrence queued(scheduled_for)
  recurring                     → campaign.status=active,   occurrence#1 queued(next slot)
[Test send]  POST /test-send → occurrence(trigger=test) queued → runNotificationCampaignTestSend
                                   → refreshOccurrenceMetrics: status≠sending 이라 종결 안 됨   ← EVENT-13
[Manual send] POST /send → resolveActiveOccurrenceForSend = 최신 queued|failed (trigger 무관) ← EVENT-12
                → claim RPC: queued→sending (started_at)  ※ scheduled_for 미래여도 claim 허용 ← EVENT-09 취약성
                → drain → runNotificationCampaignSendBatch
                     · occurrence.status 가 이미 sending 이므로 campaign 'sending' 갱신 생략
                     · 마지막 배치: occurrence.status = resolveFinalOccurrenceStatus(0,sent,0,sent) 를 **먼저** 기록 ← 실패 무시
                     · refreshOccurrenceMetrics: isDone = (pending=0 && status==='sending') → 이미 sent → **false**
                       → syncCampaignAggregateFromOccurrences 미실행 → campaign 상태·집계 미갱신   ← EVENT-11
[Cron 5분] claim_due(queued & scheduled_for≤now & campaign 미종료) → drain → done 이면 recurring 다음 회차
           active recurring 순회 → scheduleNextRecurringOccurrence (after = completed_at ?? scheduled_for)
```

- **원자성**: claim 은 `FOR UPDATE` + lease(600s) + 만료 재큐 — 동시 발송 방지 정상. 회차 생성은 `(campaign_id, sequence_number)` UNIQUE + idempotency key — 정상.
- **EVENT-11 Prod 증거**: `sent` occurrence 인데 campaign `draft` 13건 전부 `started_at` 존재(claim 경유)·`campaign.updated_at < started_at`(campaign 미갱신). 운영 1건("11111", 83명) 포함.
- **EVENT-10 분해(Prod)**: queued-immediate 41 = backfill(키 없음, 08-03~07) 14 + 생성 후 미발송(QA 스크립트 대부분) 27; queued-test 19 (EVENT-13); sent/draft 13 (EVENT-11). 운영 데이터는 "11111" 1건 + 미발송 3건("P1 iOS…", 테스트성 제목).
- **EVENT-09 실제 원인(Prod+코드)**: `[QA-D4X-…]` 캠페인 occurrence#1 은 `scripts/qa/admin-campaign-runtime-gates.mjs:472-476` 이 service role 로 직접 `status=sent, completed_at=now` 기록(started_at null·idempotency key 원형 유지와 일치). 스크립트 후속 단계(occ2 생성·`ended`) 미완 → 정지 데이터 잔류.
- **종료 후 active 잔류**: 운영 경로에서는 `!next` → `ended` 전환 코드 존재. 잔류 1건은 위 QA 데이터.
- **Cron 실행 증거**: commerce handoff `attempts=1, handed_off`(claim RPC 만 attempts 증가) → commerce cron 실행 증명. campaign cron 은 흔적을 남기는 대상(예약 회차)이 기간 중 없어 **실행 여부 NOT_PROVEN**.
- **재배포 시 기존 데이터**: 수정은 신규 발송부터 적용. 기존 13건 campaign 상태·집계 보정, QA 잔류 데이터 정리는 **별도 데이터 작업(Owner 승인)**.

### 3.2 Event → Campaign 내용 출처 (EVENT-02)

| 화면/동작 | 내용 출처 |
|---|---|
| 이벤트 패널 Push 미리보기 | 패널 로컬 state(`pushTitle/pushBody`) → 저장 시 `platform_promotion_distributions.config` |
| 저장 시 캠페인 | `createAdminNotificationCampaign(create_request_id=event-dist-push:{eventId}, save_as_draft)` — 최초 1회만 생성, 이후 replay 무변경 (패널엔 "updated" 표시) |
| 캠페인 상세 화면 | `admin_notification_campaigns` 행(title/body) |
| 실제 발송 | `occurrence.content_snapshot` (occurrence 생성 시점 동결) |
| `/send` 소스 검증 | 이벤트 published·기간 내 여부 (`evaluateOfficialCampaignSendEligibility`) — 정상 |

### 3.3 Delivery 상태 (PUSH-02 / PUSH-10)

```
dispatchPushForUser: insert delivery(pending, UNIQUE event_id+device_id) → send → update(sent|failed|skipped)
  - 재시도(handoff cron): insert 충돌 → duplicate_delivery skip → outcome noop → handed_off   (PUSH-02, 손실 사례 0)
  - pending 잔류: update 전 프로세스 종료 시 (10-02 keep-alive 이후 0건)
  - 통화 push: handoff 비대상(시간 민감, 설계상 재시도 없음)
```

---

## 4. Admin / User UI·UX 완성도 (A 기존 요구 누락 · B 구현됐으나 미연결 · C 결함 · D 신규/정책)

| 영역 | 항목 | 상태 | 분류 |
|---|---|---|---|
| Admin 이벤트 | 목록/생성/수정/미리보기/게시·중지/노출채널 | 존재 | — |
| Admin 이벤트 | 삭제 | 없음 (공지는 API 만 존재) | D |
| Admin 이벤트 | Push/Bell 발송 | 패널 "Push 보내기" → 발송 불가 상세로 이동 | **B + C** (EVENT-01/02) |
| Admin 캠페인 | 생성·즉시/예약/반복·대상 미리보기·테스트·이력 | 존재 | — |
| Admin 캠페인 | draft 수정 UI | PATCH API 만, 일부 필드(이미지·deeplink·channel·target_payload) 미지원, UI 없음 | B |
| Admin 캠페인 | draft 발송 | 불가 | **C** (EVENT-01) |
| Admin 캠페인 | 상태 표시 | 발송 완료가 `draft` 로 표시, 실패가 `sent` 로 표시 | **C** (EVENT-11) |
| Admin 캠페인 | test 이력 | 영구 `queued` | **C** (EVENT-13) |
| Admin 사운드 | 36종 매핑 편집 | 존재. **적용 범위(In-App/FG only, BG/Killed 는 OS 기본음) 미표기** | B (오해 소지) |
| User 알림 | 목록/페이지네이션/읽음/모두읽음/삭제/배지/Realtime | 존재 | — |
| User 알림 | 오류 표시 | 서버가 오류를 빈 목록·성공으로 위장 | **C** (NOTIF-01/04) |
| User 알림 | 상세 Back | 루프 | **C** (CTA-07) |
| User 이벤트 | 상세(종료 410 안내 포함) | 존재 | — |
| User 이벤트 | 목록 | 없음 — 제품 문서상 미요구 | D (EVENT-05) |
| User 공지 | 목록/상세(종료·삭제 안전 안내) | 존재. 목록은 최신 50 후 기간 필터 | 경미 |
| User CTA | 주문/리뷰답글 | 잘못된 목적지 | **C** (CTA-01/04) |

---

## 5. Notification / Sound / CTA SSOT (현행 사실 기준)

### 5.1 Notification 분류 SSOT
- Event registry: `lib/notifications/core/notification-event-registry.ts` (type → category, domain, preferenceKey, soundEventKey, androidChannelKey, deepLinkResolverKey).
- 메시지 계열 분류 권한: 저장된 `chat_domain` → `resolveNotificationMessageRoomKind` (텍스트 경로만 준수, 비텍스트는 미준수 = NOTIF-03).
- DB 레코드 SSOT: `notification_events` (UNIQUE user_id+dedupe_key; 메시지 6종은 chat_domain+domain_identity_key 필수).
- 정책 미정 분류: 그룹 초대, 배달광고·비즈캐시(현재 marketing), 거래 분쟁·선물(현재 community_activity), 포인트(현재 order_status).

### 5.2 Sound SSOT — 실제 적용 범위

| 표면 | 사용 소리 | 근거 |
|---|---|---|
| In-App / FG (WebView) | Admin 매핑 36종(원격 URL) — resolver 경유 | `notification-sound-engine`, `/api/app/notification-sound-resolve` |
| Android FG 채팅계열 | OS 알림 생략, In-App 재생 | `DibayFirebaseMessagingService.java:104-111` |
| Android BG/Killed 메시지 | 채널(전부 IMPORTANCE_HIGH, setSound 없음) = **시스템 기본음** | `DibayNotificationChannelRegistry.java:105-111`, `res/raw` 없음 |
| Android 통화 벨 | `ringtoneUrl` 커스텀 재생 (Native Call LOCK) | `DibayForegroundRingtone` |
| iOS BG/Killed alert | `aps.sound="default"` | `apns-sender-impl.ts:209` |
| iOS 통화 | CallKit (번들 `CallKitSilentRingtone.caf`) | `ios/App/App/Push/` |
- 문서상 Phase 2 backlog: Android 커스텀 URI 재생, FCM `android_channel_id` ensure 실연결. **Native Call LOCK 파일 수정 금지**(manifest).

### 5.3 CTA SSOT (목적지 판정)

| 알림 | 현재 목적지 | 판정 | 정본 근거 |
|---|---|---|---|
| 채팅/그룹/거래/주문 메시지 | `/community-messenger/rooms/{room}` | PASS(code) | registry resolver |
| 부재중 통화 | 방 | PASS(code) | |
| 착신 | `/community-messenger/calls/{sid}` | PASS(code) | |
| 구매자 주문 상태 | `/my/store-orders`(목록) | **FAIL** | 정본 `buyerStoreOrderDetailPath(id)` = **`/orders?expand={id}`** — 주문 완료 직후 이동(`navigateToBuyerStoreOrderDetail`), 주문채팅 시트·채팅 Back(`StoreOrderBuyerRoomSheet`, `orders/store/[orderId]/chat`)이 사용. `/my/store-orders/{id}` 는 이 경로로 redirect. `/mypage/store-orders/{id}` 는 마이페이지 비허브 상세(병존) |
| 사장님 주문 | `/stores/owner/orders?…order_id=` | PASS(code) | |
| 리뷰 답글(구매자) | `/stores/owner/reviews` | **FAIL** | 후보: `/orders?expand={store_reviews.order_id}` (리뷰 폼이 해당 허브에 존재 `StoreOrderReviewForm.tsx:72`) — Owner 결정 |
| 커뮤니티 | `/community/posts/{id}` | PASS(code) | |
| 거래 상태/제안 | `/post/{id}?…`·거래채팅 | PASS(code) | |
| Support | `/support/cases/{id}` | PASS(code) | 목록 tap 시 notificationId 누락(경미) |
| 공지/시스템/마케팅 캠페인 | `/mypage/customer-center/{type}/{id}` | PASS(code), 공지 존재 미검증(EVENT-06) | 종료·삭제 공지 안전 안내 존재 |
| 이벤트 | `/events/{id}` | PASS(code) — 종료 410/미존재 404 안내 | |
| 비로그인 탭 | Native: hold/login 후 재생(계정검사 불완전 CTA-05) · Web: 계정 의존 경로 미복원(정책) | | |

---

## 6. 수정 단위별 설계 (Root Cause 확정 항목만)

공통 원칙: 기존 API·RPC·DB 계약 재사용, 스키마 변경 없음(명시된 경우 제외), Native Call LOCK 미수정, 통화·주문 상태 전이·채팅 send/unread RPC 미수정.

### U1 — EVENT-11 + EVENT-13 : 발송 완료 상태 정합 (Admin 전용)
1. 증상: 발송 완료 캠페인이 `draft`·집계 0, 실패도 `sent`; test 회차 영구 `queued`.
2. 증거/재현: Prod 13+19행(§3.1). 재현: QA 계정 대상 즉시 발송 1회 → campaign.status 확인.
3. 최초 오류 지점: `run-campaign-send-batch.ts:248-259` (최종상태 선기록) / test-send 경로가 `sending` 미설정.
4. Root Cause: 종결 판정(`refreshOccurrenceMetrics` 의 `status==='sending'`)과 배치의 최종상태 선기록 순서 충돌.
5. 수정: 마지막 배치에서 최종상태를 직접 쓰지 않고 `refreshOccurrenceMetrics` 가 delivery 집계로 최종상태(partially_failed 포함)를 결정·campaign 동기화하도록 일원화. test 회차는 같은 종결 경로로 닫되 campaign 상태는 건드리지 않음(test 는 campaign 집계 제외).
6. 영향: Admin 목록·상세·필터, recurring 회차 완료 판정(`drained.done` 은 배치 반환값 기준이라 불변 — 확인 필요), 캠페인 집계 컬럼. 사용자 알림·push 무영향.
7. 보존: claim/lease/멱등, 발송 대상 계산, delivery 기록.
8. 테스트: 배치 완료 단위테스트(성공/부분실패/전부실패/test), 기존 campaign 테스트 전체.
9. Prod 검증: QA 계정 대상 1건 발송 → campaign/occurrence 상태·집계 쿼리.
10. 실기기: 불필요(Admin 서버 경로).
11. Rollback: 커밋 revert.
12. 불확실성: 과거 13행 보정 여부 — 별도 데이터 작업 승인 필요.

### U2 — EVENT-01 + EVENT-02 + EVENT-12 : Draft → 확인 → 발송 단일 흐름 (통합, 2 하위단위)
- **U2-a (서버)**
  - draft 발송 시점에 **현재 campaign 내용으로 occurrence 생성**(기존 `ensureCampaignOccurrence`·`buildCampaignContentSnapshot` 재사용) 후 기존 claim/drain 실행.
  - `resolveActiveOccurrenceForSend` 에서 `trigger_type='test'` 제외(EVENT-12), `scheduled_for > now` 인 scheduled/recurring 회차는 수동 claim 거부(EVENT-09 취약성 차단).
  - 이벤트 배포 저장 시 기존 draft 캠페인(occurrence 미발송 상태 한정)의 title/body/image/대상/deeplink 를 갱신 — 발송 완료 캠페인은 수정 금지, 새 발송은 새 draft(요청 id 버전화) — **"재발송 허용 여부"는 Owner 결정**.
  - PATCH 는 발송 전 draft 에 한해 콘텐츠 필드 지원 + 소스 계약(`campaign-source-authority`) 재검증.
- **U2-b (UI)**
  - 캠페인 상세: 발송 대상 미리보기(기존 `audience-preview`), 실제 발송될 내용 미리보기 = 서버가 snapshot 빌더로 만든 동일 데이터, 확인 다이얼로그, 멱등 키, 진행/결과 표시(기존 occurrence 표).
  - 이벤트 패널: 저장 안 된 변경이 있으면 "Push 보내기" 비활성.
- 영향: Admin 캠페인·이벤트 화면, `/send`·PATCH 계약(하위호환 유지: 기존 queued 회차 발송 동작 불변), 사용자에게 실제 캠페인 발송 발생.
- 보존: 생성 페이지 즉시발송, 예약/반복 cron, 소스 검증(이벤트 published 필수), claim 중복 방지.
- 위험: **실사용자 대상 발송 기능을 여는 변경** → 중복 발송·잘못된 대상 위험 → 확인 단계·멱등·QA 대상 리허설 필수.
- 테스트: send 계약(draft·queued·test·future scheduled), 내용 일치(미리보기 vs snapshot), 이중 클릭/재시도.
- Prod 검증: QA 계정만 대상으로 이벤트 Push draft → 수정 → 미리보기 → 발송 → `notification_events`/delivery/snapshot 일치.
- 실기기: Android/iPhone 수신·tap → `/events/{id}`.
- Rollback: UI/서버 각각 revert. 생성된 draft 데이터는 무해.
- 불확실성: 이벤트당 Push 1회 정책 여부(Owner).

### U3 — CTA-01 (+CTA-04 선택) : 구매자 주문 CTA 정본화
1. 증상/증거: §5.3, Prod 323.
2. 수정: `notify-store-commerce.ts` buyer 알림 6곳 `link_url` 을 `buyerStoreOrderDetailPath(orderId)` 로 (상수 대신 기존 함수 재사용). CTA-04 승인 시 리뷰 답글도 `buyerStoreOrderDetailPath(review.order_id)`.
3. 영향: inbox 링크, push routeUrl, Native auth gate(`/orders` 는 auth 필요 경로로 이미 포함), 그룹핑(주문 키는 meta.order_id 사용 — 링크 무관 확인 필요), owner 판정(`/stores/owner` 미포함 → buyer 유지).
4. 보존: owner 주문 알림, dedupe key, commerce handoff, 기존 323행(목록 링크 그대로).
5. 테스트: 링크 빌더 단위테스트, inbox resolver 테스트.
6. Prod: QA 주문 상태 변경 → 알림 link 확인.
7. 실기기: FG/BG/Killed tap → 해당 주문 카드 펼침 → Back.
8. Rollback: revert. 불확실성: `/orders?expand=` 가 삭제/숨김 주문에서 보이는 동작(빈 펼침) 확인 필요.

### U4 — NOTIF-03 : 비텍스트 메시지 분류 계약 준수
- 수정: `service.ts notifyCommunityMessengerMessageRecipients` 5개 호출부가 텍스트 경로와 동일하게 `resolveNotificationMessageRoomKind({chatDomain, roomType, directKey})` 결과를 전달(공용 pipeline 미수정).
- 영향: 그룹/거래/주문방 비텍스트 알림의 type·preference·sound·channel·mention. 사용자 설정에 따라 수신 여부 변화(정상화).
- 성능: room 필드 조회 추가 여부 측정(핫패스 인접 → T5 trace 전후 비교 REQUIRED).
- 보존: 텍스트 경로, unread/room bump RPC, Realtime 계약, 1:1 이미지.
- 별도(이번 단위 아님): 비텍스트 push 의 handoff/`after()` 보장.
- 검증: QA 방 4종 이미지 전송 → type 확인, 실기기 채널/소리.

### U5 — CTA-05 / CTA-07 : 클라이언트 라우팅 안전성
- CTA-05: pending route 기록 시 bound user 동봉, 재생 시 불일치/미기록이면 계정 의존 경로 폐기(`auth-route-classification` 기준 재사용).
- CTA-07: 상세 페이지 자동 이동만 replace (공유 함수 기본 동작 불변).
- 실기기: cold start tap, 로그아웃 후 다른 계정 로그인, support modal.

### U6 — NOTIF-01 / NOTIF-04 : 오류 정직화 (소비자 감사 후 설계 확정)
- 선행: `/api/me/notifications` 소비자 12곳의 `ok:false`·5xx 처리 확인(특히 503 캐시, 헤더 벨 무시 처리).
- 이후 서버 오류 시 5xx + `ok:false`, read-all 실패 시 실패 응답.

### U7 — EVENT-03 / EVENT-06 : 노출·발송 소스 가용성
- 히어로 배너: 이벤트 가용성(`resolvePlatformEventAvailability`) 필터.
- 공지 캠페인: 발송 시 `app_notices` 게시 상태 확인(이벤트와 동일 패턴).

### 보류(설계 미확정)
PUSH-01, PUSH-02, PUSH-03, PUSH-07, SOUND-01(native), NOTIF-02, NOTIF-06, NOTIF-09, EVENT-05, EVENT-07(재검증 필요).

---

## 7. 의존성·영향 Matrix

| 단위 | 직접 수정 | 간접 영향 | API 계약 | DB/RLS | Android | iOS | 기존 설치 앱 | 속도 | 중복·누락 | 보안 | 회귀 위험 | 복구 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| U1 | run-campaign-send-batch, campaign-delivery-recorder | Admin 목록/상세/필터, recurring 완료 | 불변 | 없음 | — | — | 무관 | 무관 | 없음 | 무관 | 낮음 | revert |
| U2-a | send route, campaign-create-service, save-event-distribution, PATCH route | 이벤트 패널, cron(불변 확인) | `/send` 확장(하위호환), PATCH 필드 추가 | 없음 | 수신 | 수신 | 무관 | 무관 | **중복 발송 위험 → claim·확인·멱등** | Admin 인증 유지 | 중 | revert |
| U2-b | Campaign detail, Event panel | — | 사용 | 없음 | — | — | 무관 | 무관 | 이중 클릭 | — | 낮음 | revert |
| U3 | notify-store-commerce (+review reply) | inbox/push route | 링크 문자열 | 없음 | tap 경로 | tap 경로 | 문자열만 → 호환 | 무관 | 없음 | 목적지 API 가 buyer 검증 | 낮음 | revert |
| U4 | community-messenger/service.ts 호출부 | 알림 분류·설정·사운드 | 불변 | 없음 | 채널 | sound | 무관 | 조회 1회 추가 가능(측정) | 수신 변화(정상화) | 무관 | 중 | revert |
| U5 | PushRouteListener, 알림 상세 | Native cold start | 불변 | 없음 | 경로 | 경로 | 원격 로드 여부 확인 필요(아래 ※) | 무관 | 없음 | 개선 | 중 | revert |
| U6 | /api/me/notifications, inbox-read-bridge | 소비자 12 | 오류 응답 변경 | 없음 | — | — | 무관 | 무관 | 없음 | 무관 | 중 | revert |
| U7 | hero banner loader, campaign source authority | 홈 배너, 공지 발송 | 불변 | 없음 | — | — | 무관 | 쿼리 1회 | 없음 | 무관 | 낮음 | revert |

※ `capacitor.config.ts:46-54` 는 빌드 env 에 따라 `server.url`(원격 Production 로드) 또는 local runtime 을 사용한다. 현재 배포된 스토어 빌드가 원격 로드인지는 **NOT_PROVEN**(빌드 산출물 미확인) — 원격 로드라면 웹 코드 변경은 서버 배포로 기존 설치 앱에 반영되고, 아니라면 앱 재배포가 필요. U3·U5 착수 전 확인 항목. Native 변경은 이번 계획에 없음.

## 8. 기존 정상 기능 보존 방안
- 통화 수신/종료 push 정책·Native Call LOCK 파일·CallKit/VoIP 경로: **수정 없음**.
- 주문 상태 전이(`store-order-process-model`)·commerce handoff·dedupe key: 수정 없음 (U3 는 링크 문자열만).
- 채팅 send/unread/room bump RPC·Realtime 계약: 수정 없음 (U4 는 알림 분류 인자만).
- 캠페인 claim/lease/멱등/소스 검증: 재사용, 약화 금지.
- 사운드 Phase 1 LOCK 경로: 수정 없음.
- 각 단위 전후 회귀: 해당 영역 기존 vitest 전체 + `verify:notification-sound-ssot-contract` + 관련 verify 스크립트.

## 9. 위험도별 구현 순서
| 순서 | 단위 | 위험 | 선행 조건 |
|---|---|---|---|
| 1 | U1 | 낮음 | 승인 |
| 2 | U7 | 낮음 | 승인 |
| 3 | U3 | 낮음 | 정본 경로·CTA-04 결정 |
| 4 | U2-a → U2-b | 중 (실발송 개방) | 재발송 정책 결정, QA 대상 리허설 |
| 5 | U5 | 중 | 실기기 담당 |
| 6 | U4 | 중 (핫패스 인접) | 성능 측정 계획 |
| 7 | U6 | 중 | 소비자 감사 결과 재보고 |
| 보류 | PUSH-01/02/03/07, SOUND native, NOTIF-02/06/09, EVENT-05/07 | 고/정책 | 정책·실기기·추가 조사 |

## 10. 전체 테스트 Matrix

| 단위 | Unit | Integration/Contract | DB | API Runtime(Prod QA) | Production 관측 | Android phone | Android tablet | iPhone | FG/BG/Killed | 소리 | CTA 도착 | 중복/성능 | 회귀 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| U1 | ✓ | send batch | 상태 쿼리 | QA 발송 | 상태·집계 | — | — | — | — | — | — | 중복 0 | campaign 테스트 |
| U2 | ✓ | send/PATCH 계약 | snapshot 비교 | QA 이벤트 발송 | delivery | 수신 | 수신 | 수신 | ✓ | 기본음 | `/events/{id}` | 이중클릭·재시도 | 생성/예약/반복 |
| U3 | ✓ | resolver | — | QA 주문 | link 값 | tap | tap | tap | ✓ | — | 주문 펼침·Back | — | owner 알림 |
| U4 | ✓ | pipeline | type 쿼리 | QA 방 4종 | type 분포 | 채널 | 채널 | sound | ✓ | 채널별 | 방 | T5 전후 | 텍스트 알림 |
| U5 | ✓ | — | — | — | — | cold start | cold start | cold start | ✓ | — | 계정 전환 | — | support modal |
| U6 | ✓ | 소비자 12 | — | 오류 주입(테스트 환경) | — | — | — | — | — | — | — | — | 목록/배지 |
| U7 | ✓ | — | — | QA 이벤트 종료 | 배너 응답 | 홈 | 홈 | 홈 | — | — | — | — | 배너 |
실기기 항목은 이 환경에서 수행 불가 — 담당자 수행 전까지 **NOT_PROVEN**.

---

## 11. Owner 정책 결정 목록
1. **CTA-01 정본**: 구매자 주문 알림 목적지 = `/orders?expand={id}` (권장, 근거 §5.3) vs `/mypage/store-orders/{id}`.
2. **CTA-04**: 리뷰 답글 → `/orders?expand={order_id}` 로 할지.
3. **U2**: 이벤트당 Push 재발송 허용 여부 / 발송 후 내용 수정 정책.
4. **PUSH-01**: iOS 통화 일반 APNs alert 유지 여부 (실기기 확인 후).
5. **SOUND**: (a) Admin 사운드 화면에 적용 범위(In-App 전용, BG/Killed=OS 기본음) 표기, (b) Phase 2 native 커스텀 사운드 착수 여부.
6. **분류**: 그룹 초대 / 배달광고·비즈캐시 / 거래 분쟁·선물 / 포인트 알림의 분류.
7. **NOTIF-09**: 리마인더·자동완료 cron 활성화.
8. **EVENT-05**: 사용자 이벤트 목록(신규 기능) 여부.
9. **데이터 정리**: QA 잔류 캠페인/occurrence, campaign 상태 13건 보정, delivery pending 113건 — 정리 여부·방식.
10. **GOV-01**: Production DB 대상 QA 스크립트 실행 정책(is_qa 격리·별도 프로젝트/branch).

## 12. 단계별 승인 요청
각 단위: `OWNER APPROVAL → IMPLEMENTATION → CODE/TEST → IMPACT REGRESSION → PRODUCTION PROOF → DEVICE PROOF → CHECKPOINT`. 승인되지 않은 다음 단위로 자동 진행하지 않음.

- [ ] U1 (EVENT-11/13) 승인
- [ ] U7 (EVENT-03/06) 승인
- [ ] U3 (CTA-01, 결정 1·2 포함) 승인
- [ ] U2-a / U2-b (결정 3 포함) 승인 — 고위험 취급
- [ ] U5 승인 (실기기 담당 지정 필요)
- [ ] U4 승인 (성능 측정 포함)
- [ ] U6 소비자 감사 착수 승인 (설계 재보고 후 별도 승인)
- [ ] 추가 증명: Vercel runtime log 권한, Prod QA 계정 사용 허가

**STOP — Owner 승인 대기.**
