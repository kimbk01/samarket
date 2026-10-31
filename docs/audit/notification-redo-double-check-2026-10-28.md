# 알림 재감사 — 3단계 이중 점검 (설계 ↔ 구현 대조) · 2026-10-28 · 커밋 안 함

- **기준**
  - 설계: `notification-redo-audit-2026-10-28.md` §B·§C-2·§D, `notification-redo-separate-approval-2026-10-28.md`, `notification-sound-mode-impact-plan-2026-10-28.md`, Owner D-Q1~D-Q7 결정.
  - 코드: `origin/main` **b74475ce1**.
- **방법**
  - ① 작업자가 줄 단위로 대조했다.
  - ② 독립 검토 에이전트가 설계와 커밋 diff 를 대조했다(작업자 판정은 전달하지 않음).
  - ③ 독립 검토의 지적을 작업자가 코드로 하나씩 재확인했다.
  - ④ 운영 DB 를 SELECT 로 대조했다.
- **판정 표기**
  - 「정확」: 설계대로 구현됨.
  - 「사유 있는 차이」: 설계와 다르지만 근거가 코드로 확인됨.
  - 「결정 필요」: Owner 승인이 필요해 구현하지 않음.
  - 실기기·Production 은 전부 **NOT_PROVEN**(5단계 실기 대상).

## 1. 이중 점검에서 새로 찾아 고친 결함 (main 반영)

| 커밋 | 항목 | 결함(이중 점검에서 확인) | 수정 |
|---|---|---|---|
| fea25fac8 | D-Q3 | 공지·마케팅 캠페인은 자체 게이트 뒤 `skip_settings_gate` 로 보낸다. 그래서 알림음을 꺼도 캠페인 푸시는 울렸다(`campaign-send-user.ts:334`). | 게이트 결정을 payload 에 싣는다. dispatch 는 meta 의 값을 일반 알림에 한해 발송·기록한다. |
| fea25fac8 | D-Q7 | 모든 관리자 업무 푸시가 설정 없이 무조건 발송됐다. 「일반 업무는 관리자 설정 적용」 결정이 빠졌다. | critical 은 기본 알림음. 그 밖은 관리자 운영 알림음 설정(`admin_notification_preferences.sound_enabled`)이 꺼져 있으면 무음. |
| 088fc8c97 | D-Q4 | 매장 심사·영업 정지 결정, 관리자 주문 개입을 D-Q3 매장 토글로 끌 수 있게 됐다(필수 운영 조치 위반). | 두 kind 를 필수(owner_order_ops)로 지정하고 매장 토글 대상에서 뺐다. |
| 088fc8c97 | D-Q3 | 진동 끔이 푸시에 반영됐는데도 알림 설정 화면의 진동 토글은 숨겨져 있었다(N-10 「읽는 곳 없음」 주석). | 토글을 복원했다(기존 문구 키 `settings_notif_vibration`). |
| eccf398b3 | B-17·D-Q6 | 새 주문 본문 2키(`notify_commerce_new_order_body`·`_named`)가 승인표 밖 축약 문구 그대로였다(매장명 빠짐). | 승인 문구로 원복했다(ko/en). |
| 6fd8f4da0 | B-15② | Android 탭은 path 만 넘기는데, 오너 화면 경로의 `?storeId=` 를 읽지 않아 회원 A 로 분류됐다(서버 `requireMemberA` 가 거절해 데이터 영향은 없음). | 오너 화면 경로의 storeId 로 오너(C) 판정(웹만). |
| 0e2a22404 | U-F | 관리자 건수 배지 `text-white` 3곳이 남아 있었다. | `text-sam-on-primary` |

- **검증**(최종 트리 1회)
  - `typecheck:build` 통과.
  - 알림·푸시·관리자·컴포넌트 vitest 5,171건 중 실패 9건은 기존 Node26 localStorage 환경 실패(장바구니 1파일)이고 나머지는 통과. 추가 테스트 12건 포함.
  - 변경 파일 eslint: 오류 0, 기존 경고 2.
  - 오너 UI 토큰 래칫 65건 통과, `verify:design-system-hard-lock` OK.
- **[배포 구분]** 웹만. 다만 이전 커밋의 네이티브 변경(B-16·D-Q3 Android)은 아직 빌드 전이다.

## 2. 항목별 최종 대조표

| ID | 설계 | 구현(origin/main) | 판정 |
|---|---|---|---|
| B-01 | commerce 저장 직후 1회 즉시 발송, 크론은 복구 | `append-user-notification.ts` → `claimCommercePushHandoffEventById`(조건부 UPDATE: pending·미claim) → 발송. 크론 RPC 는 `FOR UPDATE SKIP LOCKED`. 이중 발송은 인라인 발송이 120초를 넘겨 크론이 stale 로 재claim 할 때만 가능 | 정확 |
| B-01 리마인드 | 크론 주기 확인 후 별도 판정 | 확인함: `vercel.json` `store-order-accept-reminders` = 매분. 주문 후 첫 실행이 30초 전이면 다음 실행(60초+)에서 30초·60초가 함께 나간다(약 절반의 주문) | **결정 필요(§3-1)** |
| B-02 | `void notify` → after() | 감사 목록 전부 + 같은 유형 모임 강퇴·차단 2곳 | 정확(+같은 결함 2곳) |
| B-03 | 오너 화면 종 = 오너 알림 | 목록·「전체 보기」는 설계대로. 숫자는 설계의 count API 대신 매장 목록 행의 미읽음 수 | 사유 있는 차이: 설계의 count API(`owner_store_commerce_unread_only`)는 매장 범위가 아니다(전 매장 합, `owner-dashboard-notifications-snapshot.ts:247-265` storeId null). 오너 화면은 목록을 시작 시 바로 불러오므로(지연 없음) 0 표시는 첫 로드 동안뿐 |
| B-04 | 오너 운영 4종 오너 알림함 | TS·DB 함수(kinds 28 · ops 13) 운영 적용 확인. DB 적용 00:44 UTC → 커밋 푸시 00:51 UTC(DB 먼저) | 정확. 절차 차이: D-Q1 과 한 커밋(b003b4438) |
| B-05 | INSERT 때 종 resync | 반영 | 정확 |
| B-06/D-Q2 | 문의·지원·회원노트 → 시스템 | 반영 | 정확 |
| B-07①/D-Q1 | 오너 「주문」에 취소 요청 | DB 함수 `cancel_requested_count` 운영 적용 확인, TS 합산 | 정확 |
| B-07② | 계정 전환 시 하단 채팅 초기화 | 반영 | 정확 |
| B-08 | 메신저 방 id 우선 | 반영 | 정확 |
| B-09 | 시각 키 → 결정적 키 | 주문 개입·매장 결정: 대상 행 updated_at. 커뮤니티 엔진 댓글 조치는 `${id}:${nowIso}` 유지 | 사유 있는 차이: 그 라우트는 `.eq("status", expectedStatus)` 비교 갱신이라 같은 전이 재시도는 409·unchanged 로 끝나 알림까지 가지 않는다(중복 불가). 회원노트는 작성 API 410(발생 경로 없음) |
| B-10 | 받는 사람 언어 | 대체 이름 2곳 반영. 가격 제안 3종은 D-Q5(기능 미복원)로 제외 | 정확 |
| B-11/D-Q3 | 알림음·진동·매장 토글 실제 적용 | 서버 soundMode(일반 알림·캠페인·관리자), APNs 무음, Android 무음·무진동 채널, 진동 끔 + 맞춤음 변형, Android 7, 매장 토글(관리자 매장 공지·광고) | 정확(실기 NOT_PROVEN). 문구 1건 §3-3 |
| B-12 | 오너 포인트 소리 키 | writer 0(카탈로그만) | 의도적 미구현(근거 확인) |
| B-13 | 포인트 분류·소리 | 「시스템」 탭 분류 반영. 소리 키·채널은 오너 정산음·「배달 알림」 채널 그대로 | **결정 필요(§3-2)** — 설계: 회원용 키가 없으면 Owner 결정. 레지스트리에 회원 포인트 키 없음 |
| B-14 | 오너 플랫폼 문의 답변 알림 | 관리자 PATCH·오너 POST 모두 410 `legacy_writer_disabled` | 의도적 미구현(근거 확인) |
| B-15① | 제안 수락 목적지 | D-Q5(기능 미복원) | 의도적 미구현(근거 확인) |
| B-15② | 오너 path 판정 | 6fd8f4da0 | 정확 |
| B-16 | Android 백그라운드 런처 숫자 | 반영(빌드 전) | 정확(실기 NOT_PROVEN) |
| B-17/D-Q6 | 오역·불일치 수정, 승인표 밖 원복 | 원복 완료(새 주문 본문 포함). writer 0 인 거래 2키·「물품」 대체어는 쓰이지 않아 유지 | 정확 |
| B-18/D-Q7 | 관리자 업무 푸시 회원 설정 분리 | 회원 게이트 우회 + critical 필수 + 일반 = 관리자 알림음 설정 | 정확 |
| B-19 | 사장님 알림음 즉시 반영 | 반영 | 정확 |
| B-20 | 거래 광고 처리 후 종 갱신 | 반영 | 정확 |
| D-Q4 | 제재·운영 조치 필수 | 거래·커뮤니티·모임·채팅 제재 + 매장 심사 결정·주문 개입 | 정확 |
| D-Q5 | 과거 데이터는 증명된 오류만 별도 승인 | 데이터 변경 없음 | 정확(데이터 정정은 별도 승인 대기) |
| U-A | 오너 목록 공용 컴포넌트 | 공용 목록·날짜 구역·선택·행 탭·`?tab=`. 탭 바는 같은 클래스로 직접 그림 | 정확(경미한 차이) |
| U-B | 전체·읽은 삭제, 서버 일괄 읽음, 더 보기 | 삭제 2종 + 확인창 반영. 전체 읽음은 불러온 행(최대 200) | **결정 필요(§3-4)** — 오너 목록 API 상한 200·페이지 없음, 기존 일괄 읽음 함수는 매장 범위가 아님(다매장 오너의 다른 매장까지 읽음 처리) → DB 함수 변경 필요 |
| U-C | 실패·로딩 | 반영 | 정확 |
| U-D | 상세 | 반영 | 정확 |
| U-E | 종 팝업 | 반영 | 정확 |
| U-F | 배지 토큰·종 목적지 | 배지 전부 반영. 관리자 종 목적지는 업무 큐 HARD LOCK 으로 유지 | 정확(목적지는 HARD LOCK 유지) |
| U-G | 공통 정리 | 반영 | 정확 |
| U-H | 죽은 코드 | Owner 선택 항목 | 미구현(동작 영향 없음) |
| 통화 | 통화 payload 무변경 | 독립 검토·테스트 모두 무변경 확인. 통화 공용 파일 변경이 있으므로 통화 행렬 실기는 필수 | 코드 PASS · 실기 NOT_PROVEN |

## 3. Owner 결정 필요 (구현 보류)

1. **오너 접수 리마인드 30초·60초**: 매분 크론이라 약 절반의 주문에서 두 알림이 함께 나간다. 30초 정확도는 지금 구조로 불가능하다.
   - 권장: 같은 실행에서 둘 다 해당하면 60초 하나만 보낸다(중복 울림 제거).
   - 대안: 그대로 둔다.
2. **회원 포인트 충전 결과 알림음·채널**: 지금은 오너 정산음 + Android 「배달 알림」 채널이다.
   - 회원용 키가 없으므로, 기존 회원 키 `admin_notice_received`(「공지 알림」 채널)로 매핑할지 결정해야 한다.
3. **알림음 토글 문구**: 「인앱 알림음」 3화면(`settings_notif_inapp_sound`·`order_notifications_sound_toggle`·`store_owner_notif_sound`). 이제 푸시 소리도 끄므로 문구가 실제보다 좁다.
   - 권장: 「알림음 / Notification sound」.
4. **오너 알림 「더 보기」·매장 범위 서버 일괄 읽음**: 오너 목록 RPC 에 offset·store 범위 일괄 읽음을 추가해야 한다. 운영 DB 함수 변경이라 별도 승인이 필요하다.
5. **과거 데이터(D-Q5)**: 구매자 확인 1건 링크 정정 여부. 제안 수락 14건은 거래방 id 이고 404 여부가 NOT_PROVEN 이다.
6. **구 바이너리**: Play 에 (14) 가 올라간 뒤 `android_min_version_code=14` 를 적용할지(운영 설정).
7. **U-H**: 죽은 코드 제거 여부.

## 3-1. 이중 점검에서 새로 찾은 결함 (승인 범위 밖 · 구현 안 함)

- **B-21 알림 문구 언어 출처 불일치 → Owner 승인 후 수정 완료(b74475ce1)**
  - 앱 언어는 `user_settings.preferred_language` 에 저장된다(`app/api/me/settings/route.ts:73` 「앱 언어 source of truth는 user_settings」).
  - 알림 문구는 `profiles.preferred_language` 에서 읽는다(`lib/notifications/notification-user-language.ts:4-16`).
  - 둘을 맞추는 트리거나 코드는 없다(운영 DB 트리거 0건 확인).
  - 운영 DB 에서 두 값이 다른 계정이 **20명**이다(user_settings en 30 · profiles en 16).
  - 영향: 앱을 영어로 바꾼 사용자도 알림은 한국어로 받을 수 있다 → 실기 E17 FAIL 예상.
  - 수정(b74475ce1): `loadNotificationUserLanguage` 가 `user_settings.preferred_language` 명시값(ko/en)을 먼저 쓰고, 비었거나 기기 언어이거나 읽기 실패면 `profiles` 로 폴백한다. 주문·포인트 writer 의 복제 로더 3곳(`notify-store-commerce`·`notify-store-points`·`notify-user-points`)도 공용 로더로 통일했다. 데이터 변경 없음.
  - 검증: `typecheck:build`·`typecheck:test` 통과. 관련 vitest 10,738건 중 실패 15건은 메신저 이미지 자동 저장 2파일(Node26 localStorage 환경). 신규 테스트 5건 통과.
  - 가격 제안 writer(`offer-server-i18n`, ko 고정)는 D-Q5(기능 미복원)로 제외.
- 범위 밖 보고만:
  - 오너 픽업 주문의 마지막 버튼 라벨이 「배달완료」로 표시된다(`store-order-process-model.ts:253-267`, 매장 도메인).
  - 모임 승인·반려·강퇴·차단 API 를 부르는 화면이 앱에 없다(writer 는 있음).
  - 판매자 거래완료 API 410 으로 관리자 구매자 확인 처리 대상이 새로 생기지 않는다.

## 4. 운영 DB 대조 (SELECT · 2026-10-28 14:0x PHT)

- 마이그레이션 6건 적용: 20261028004405, 20261028004409, 20270702120000~150000.
- `owner_store_commerce_notification_kinds()` 28개, `owner_store_ops_notice_notification_kinds()` 13개, `get_owner_store_ops_snapshot_counts` 에 `cancel_requested_count` 있음.
- **배포(2026-10-28 00:15 UTC / 08:15 PHT) 이후 새 알림 이벤트 0건.** 즉시 발송·soundMode·pending 해소는 운영 데이터로 아직 확인할 수 없다 → 5단계 실기에서 확인.
- 배포 전 14일 기준(참고): commerce 첫 발송 평균 63.5초, 최대 119.8초.
- 기기 버전: S·X `1.2.4 (13)`, I `1.2 (15)`. Android 는 (14) 설치 전.

## 4-1. CI 실패 수정

- fea25fac8 의 srv10 테스트 3줄이 mock 호출 인자를 타입 없이 읽어 CI `typecheck:test` 가 실패했다(로컬 `typecheck:build` 는 테스트를 포함하지 않음).
- d123f5827 에서 인자 타입을 지정했다. 로컬 `typecheck:test` 통과.

## 5. 절차 차이 기록 (규정 대비)

- b003b4438: DB 마이그레이션·TS·B-04·D-Q1 을 한 커밋에 넣었다(설계 「단독 커밋」 원칙과 다름). 운영 DB 는 먼저 적용했다.
- 4ac101b5e: D-Q4·D-Q3·B-18·B-19 를 한 커밋에 묶었다.
- 09d6a7281: 오너 목록 하단 링크를 버튼 3개 줄로 바꿨다. U-G 링크 정리 범위보다 넓다(동작 변경 없음).
- 246c6553c: FCM 수신 파일 무변경 조건을 Owner 「남은 위험 모두 처리」 지시로 해제하고 한 줄(`setDefaults`)만 바꿨다.
