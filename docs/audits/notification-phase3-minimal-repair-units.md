# DIBAY NOTIFICATION — 최소 수정 단위 확정 보고 (Owner Final Direction 적용)

- 작성일: 2026-10-04 · 기준 SHA `9d5ac23a` (HEAD = origin/main = Production) · **코드/DB/Native/배포 변경 없음**
- 원칙: 기존 구조·기능·SSOT·UI/UX 유지, 확인된 결함만 최소 수정. 기존 기준이 있는 사항은 Owner 에게 재질문하지 않음.
- 근거: 직접 읽은 코드 라인 + 직접 실행한 Production SQL. (subagent 보고 미사용)

## 0. 기존 기준 적용 (Owner 결정 불필요 처리)

| 항목 | 적용 기준 | 근거 |
|---|---|---|
| 구매자 주문 CTA | `buyerStoreOrderDetailPath(id)` = `/orders?expand={id}` | `lib/delivery/customer/navigate-to-buyer-store-order-detail.ts:4` — 주문 완료·주문채팅 시트·채팅 Back 공용 |
| 리뷰 답글 CTA | 같은 함수에 `store_reviews.order_id` | reply route 가 이미 `order_id` 조회(`route.ts:60,115`), Prod 리뷰 417/417 order_id 보유 |
| 이벤트 Push 발송 | 기존 정책: 이벤트당 캠페인 1개(고정 request id), 발송은 캠페인 화면에서 | 패널 안내문 + `save-event-distribution.ts` |
| iOS 통화 APNs | 현행 유지(변경 없음) | `call-push-provider-policy.test.ts` 고정 정책 |
| 알림음 | Sound Phase 1 LOCK 유지, Native 신규 구현 없음 | `notification-sound-ssot-phase1-lock.md` |
| 알림 분류 | 기존 registry·매핑 유지 (그룹 초대 = 기존 `group_message`/`group`) | Prod 기존 초대 12건 `group_message, chat_domain=group, group:{room}` |
| 주문 Cron | 현행(미스케줄) 유지 | `dibay-delivery-product-hard-lock.md:43` |
| 이벤트 목록 | 신규 화면 없음 | `dibay-promotion-program-ssot-lock.md` |
| 운영/QA 데이터 | 삭제·보정 없음 | Owner 지시 |

## 1. 이번 재검증에서 새로 확인된 상호 의존성 (U1 설계 변경 사유)

`refreshOccurrenceMetrics` 의 종결 조건은 `pending 대상 = 0 && status = sending` 이다 (`campaign-delivery-recorder.ts`).
- 전체/마케팅동의/활성/지역 대상(scan 방식)은 대상 행을 `sent/skipped` 로만 기록하고 `pending` 을 만들지 않는다(`run-campaign-send-batch.ts:212-223`, `campaign-send-user.ts:36-60`).
- 따라서 **중간 배치(120명 단위)가 끝날 때마다 종결 조건이 참** → 첫 배치 후 회차가 `sent` 로 종결되고 다음 배치는 `occurrence_already_completed` 로 중단된다 (**EVENT-14, 코드 확정**).
- 현재 Prod 대상 프로필 107명 < 배치 120명이라 **아직 발생하지 않음**(잠재). 사용자 120명 초과 시 확정 발생.
- 마지막 배치는 최종상태를 먼저 기록해 종결 조건을 막음 → campaign 동기화 누락(**EVENT-11**). 즉 EVENT-11 과 EVENT-14 는 같은 종결 판정 결함의 양면이며, EVENT-11 만 단독 수정하면 EVENT-14 를 즉시 악화시킬 수 있다.

## 2. 수정 단위 (확정 원인만)

| ID | 확정 원인 | 최소 수정 내용 | 영향 범위 | 위험 | 검증 방법 |
|---|---|---|---|---|---|
| **U1** EVENT-11/13/14 | 회차 종결 판정이 "pending 0" 기준이라 scan 대상은 조기 종결(14), 마지막 배치는 상태 선기록으로 campaign 미동기화(11), test 회차는 `sending` 을 거치지 않아 영구 queued(13) | 종결 판정을 **배치의 `done` 결과 하나**로 통일: `run-campaign-send-batch` 가 `done` 일 때만 기존 `refreshOccurrenceMetrics` 에 종결 지시 → 기존 `resolveFinalOccurrenceStatus`(실패 반영)·`syncCampaignAggregateFromOccurrences` 실행. test 회차는 같은 종결 경로로 닫되 campaign 상태는 미변경 | `run-campaign-send-batch.ts`, `campaign-delivery-recorder.ts`. 호출자: `/send`, 예약 cron, test-send. Admin 목록·상세 상태/집계 | 중 (발송 루프 종결 로직) | 단위: 120명 초과 scan·selected_users·부분실패·전부실패·test. Prod: QA 계정 대상 1건 → 회차/캠페인 상태·집계 쿼리. 사용자 알림 생성·push 경로 무변경 확인 |
| **U7-a** EVENT-03 | 히어로 배너 로더가 이벤트 게시·기간 미검사 | `loadActiveEventHeroBanners` 에서 기존 `resolvePlatformEventAvailability` 로 active 만 반환 | 히어로 배너 API → 거래홈·커뮤니티홈 배너 | 낮음 | 단위: 게시/비게시/종료/예정. Prod: 배너 API 응답 |
| **U7-b** EVENT-06 | 공지 캠페인 발송 시 공지 게시 상태 미확인 | 기존 이벤트 검사와 같은 위치(`evaluateOfficialCampaignSendEligibility`)에 공지 게시 확인 추가. **`/send`·예약 cron 에만 적용**, test-send 는 현행 유지(미게시 공지 테스트 허용 보존) | 호출자 3곳 중 2곳 | 낮음 | 단위: 게시/삭제/보관/기간외 공지. Prod: QA draft 로 거부 응답 확인 |
| **U3** CTA-01/04 | 구매자 주문 알림 `link_url` 상수 `/my/store-orders`(목록) / 리뷰 답글 `/stores/owner/reviews`(사장님 전용) | `notify-store-commerce.ts` 구매자 6곳 → `buyerStoreOrderDetailPath(orderId)`; 리뷰 답글 → `buyerStoreOrderDetailPath(orderId)` | 알림 목록 링크·push 이동. 그룹핑은 `meta.order_id` 기준이라 무영향(`group-inbox-by-thread.ts:81-104`). `/orders` 는 안전 경로 허용목록·Native 인증 게이트에 이미 포함. 기존 323건은 목록 링크 그대로(호환) | 낮음 | 단위: 링크 빌더. Prod: QA 주문 상태 변경 후 link 값. 실기기: FG/BG/Killed 탭 → 주문 카드 펼침 → Back |
| **U8** NOTIF-02 (그룹 초대) | `appendUserNotification` 이 `chatDomain/domainIdentityKey` 를 전달하지 않아 기존 분류(`group_message`)가 DB CHECK 위반으로 INSERT 실패 | `appendUserNotification` 에 선택 인자(chatDomain·domainIdentityKey·roomId) 통과만 추가, 그룹 초대 producer 가 기존 `groupRoomIdentity(roomId)` 전달 — 기존 Prod 기록과 동일 형식 | 그룹 초대 알림 1종. 다른 append 호출자는 인자 미전달 → 동작 불변 | 낮음 | 단위: 초대 INSERT 성공·형식. Prod: QA 그룹 생성 1회 → 행 확인 |
| **U4** NOTIF-03 | CM 비텍스트 5개 호출부가 roomKind 미전달 → 모든 방에서 `chat_message` | 5개 호출부에 텍스트 경로와 같은 `resolveNotificationMessageRoomKind` 결과 전달(공용 pipeline·RPC 무수정) | 그룹/거래/주문방 이미지·스티커·파일·음성·공유 알림의 type·수신설정·채널·소리가 텍스트와 동일해짐 | 중 (채팅 핫패스 인접) | 단위: 방 종류별 type. Prod: QA 방 4종 이미지 → type 분포. 성능: 전송 경로 T5 전후 비교. 실기기: 채널/소리 |
| **U5-a** CTA-07 | 알림 상세가 자동 이동에 `router.push` 사용 → Back 시 재이동 루프 | 상세 페이지 자동 이동만 replace (공유 `activateNotificationDestination` 은 기본값 유지, 옵션만 추가) | 알림 상세 1화면 | 낮음 | 브라우저 Back 시나리오, 목록 탭 Back 회귀 |
| **U5-b** CTA-05 | 보관 push 경로에 수신자 미기록 → 다른 계정 로그인 후 이전 계정 화면으로 이동 | 보관 시 현재 사용자 id 기록, 재생 시 불일치·미기록이면 기존 `auth-route-classification` 기준으로 계정 의존 경로 폐기 | `PushRouteListener` | 중 (Native 탭 경로) | 실기기: cold start 탭, 로그아웃→타계정 로그인, support modal |
| **U2** EVENT-01/02/12 | (a) draft 에 회차가 없어 `/send` 가 404, (b) 상세에 발송 진입점 없음, (c) 이벤트 저장 시 기존 draft 내용이 갱신되지 않음(replay 무변경인데 "updated" 표시), (d) `/send` 가 test 회차를 고를 수 있음 | 기존 함수만 사용: ① draft 발송 시 현재 캠페인 내용으로 `ensureCampaignOccurrence` 후 기존 claim/drain ② 상세 화면에 기존 `audience-preview` + 실제 snapshot 미리보기 + 확인 + 멱등 키 ③ 이벤트 저장 시 **미발송 draft 에 한해** 내용 갱신(발송된 캠페인은 기존 정책대로 변경 불가) ④ 회차 선택에서 test·미래 예정 회차 제외 ⑤ 패널은 미저장 변경 시 발송 비활성 | 실사용자 발송 개방. Admin 캠페인·이벤트 화면, `/send` | **고** | 계약 테스트(draft·queued·test·future), 미리보기=snapshot 일치, 이중클릭/재시도. Prod: QA 계정 대상만 리허설. 실기기 수신·탭 → `/events/{id}` |
| **U6** NOTIF-01/04 | 목록 DB 오류를 빈 목록, 모두읽음 실패를 성공으로 응답 | **설계 보류** — 응답 소비자 12곳(`MyNotificationsView`, 헤더 벨, owner/admin 목록, dedupe 캐시 등)의 오류 처리 확인 후 재보고 | 소비자 12곳 | 중 | 소비자 감사 |

## 3. 수정 대상에서 제외 (사유)

| 항목 | 사유 |
|---|---|
| PUSH-01 iOS 통화 APNs | 현행 유지 기준. 실기기 미증명 |
| PUSH-02 재시도 | 손실 사례 0, 중복 방지 UNIQUE 와 결합 — 안전한 최소 수정 미확정 |
| PUSH-03 / PUSH-07 | 영향 소규모·관측 불가, Native/계정 경로 |
| PUSH-10 pending 113 | 10-02 이후 재발 0, 데이터 보존 |
| EVENT-09 | 원인 = QA 스크립트 직접 쓰기(데이터). 미래 회차 수동 claim 차단은 U2-④에 포함 |
| EVENT-05 / NOTIF-06 / NOTIF-09 / SOUND native | 기존 기준 유지 |
| EVENT-07 | 직접 재검증 미완 — NOT_PROVEN 유지 |
| 운영·QA 데이터 정리 | 삭제·보정 금지 |
| GOV-01 | 코드 수정 대상 아님(운영 정책) — 보고만 |

## 4. 공통 보존·검증
- 수정하지 않는 것: 통화 push·Native Call LOCK, 주문 상태 전이·commerce handoff, 채팅 send/unread/room bump RPC·Realtime, Sound LOCK 경로, DB 스키마.
- 각 단위: 해당 영역 기존 vitest 전체 + typecheck + 관련 verify 스크립트(`verify:notification-sound-ssot-contract` 등) → Production 확인 → 실기기(담당자 수행 전 NOT_PROVEN).
- Rollback: 각 단위 단일 커밋 revert (DB 변경 없음).
- 미확인 전제: 스토어 앱이 원격 웹(`server.url`)을 로드하는지 NOT_PROVEN — U3·U5 의 기존 설치 앱 반영 여부에 영향.

## 5. 권장 검토·구현 순서
U1 → U7 → U3 → U8 → U5-a → U4 → U5-b → U2 (U6 은 소비자 감사 후 별도)

**STOP — 단위별 Owner 승인 후 하나씩 구현.**
