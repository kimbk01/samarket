# 알림 재감사 — 별도 승인 요청 3건 (2026-10-28 · 구현 보류 · 커밋 안 함)

1단계 감사의 결함 20건 중 아래 3건은 Owner 규정상 따로 승인을 받아야 해서 이번 반영에서 뺐다.
- 운영 DB 함수 변경 · 네이티브 변경 → 각각 별도 승인.
- 통화 공용 발송 파일 변경 → 통화 규정 3항(영향 분석·계획 문서 + Owner 승인 후 구현).

---

## 1. 운영 DB 함수 변경 — B-04(오너 운영 알림 분리) + D-Q1(오너 「주문」 숫자에 취소 요청)

### 1-1. B-04
- **확인된 원인**
  - 관리자 주문 개입(`admin_store_order_intervention`), 매장 심사 결정(`admin_store_decision`), 관리자 매장 운영 공지(`admin_store_operational_notice`), 광고 심사·상태·캐시(`delivery_ad_*`) 알림이 오너 kind 목록에 없다.
  - 대상 목록: TS `owner-store-commerce-notification-meta.ts:11-28`, DB `public.owner_store_commerce_notification_kinds()`.
  - 그래서 분류기 끝 분기에서 **회원 A(종·앱 아이콘)** 로 집계되고, **오너 알림함에는 보이지 않는다**.
  - DB 에 실제 행이 있다: 운영 공지 4건, 광고 7건.
- **바꿀 것**
  - ① DB 함수 `owner_store_commerce_notification_kinds()` 의 반환 목록에 위 kind 를 추가하는 마이그레이션 1개.
  - ② TS 목록에 같은 kind 를 추가한다(TS·SQL 일치 테스트 포함).
- **영향**
  - 회원 종 숫자가 이 알림 수만큼 줄어든다(정상화).
  - 오너 알림함·오너 관리자 종(B-03 반영분)에 이 알림이 보인다.
- **반영 순서**
  - DB 함수를 먼저 적용하고 TS 를 나중에 반영해야 한다.
  - 순서가 바뀌면 그 사이에 이 알림이 회원·오너 어디에도 안 보인다.
- **2단계 착수 전 확인 필요**: 이 알림들의 meta 에 `store_id` 가 있는지. 오너 알림함은 매장 단위로 거른다.
- **롤백**: 함수 정의를 이전 본문으로 되돌린다(데이터 변경 없음).

### 1-2. D-Q1 (Owner 결정: 취소 요청 포함)
- **현황**
  - FAB 「주문」 = 접수대기 + 환불 + 취소요청(`store-operation-c-projection.ts:53-59`).
  - 오너 관리자 하단·사이드바·긴급 숫자 = 접수대기 + 환불. 근거는 `owner-hub-order-counts-cache.ts:106-111`, 그리고 운영 DB 함수 `get_owner_store_ops_snapshot_counts(uuid)` 에 `cancel_requested` 집계가 없다는 것(운영 DB 확인).
- **바꿀 것**
  - ① `get_owner_store_ops_snapshot_counts` 에 `cancel_requested_count` 를 추가하는 마이그레이션(기존 필드 무변경).
  - ② TS 스냅샷 타입·정규화·`ownerHubOrderAlertsFromMeta` 에 합산을 추가한다.
- **영향**: 취소 요청이 있는 매장에서 오너 관리자 숫자가 FAB 와 같아진다.
- **롤백**: 함수 본문을 되돌리면 TS 는 새 필드를 0 으로 처리한다.

**승인 요청**: 마이그레이션 2개 작성 → 운영 DB 적용 → 적용 결과 SELECT 확인 → TS 반영(단독 커밋).

---

## 2. 네이티브 변경 — B-16(Android 백그라운드 앱 아이콘 숫자) + D-Q3 Android 알림음·진동 끔

- **B-16 원인(코드 확인)**
  - 서버는 FCM data 에 `badgeCount` 를 항상 보낸다(`fcm-data-payload-contract.ts:228-237`).
  - 그러나 `DibayAppIconDeliveryAdapter.onDomainNotificationPosted`(:77-79)는 로그만 남긴다.
  - 그래서 앱이 꺼져 있거나 백그라운드일 때 런처 숫자가 바뀌지 않는다.
- **D-Q3 Android**
  - Android 8 이상은 소리·진동이 **채널에 고정**되어 있다.
  - 「알림음 끔」「진동 끔」을 실제로 적용하려면 무음·무진동 채널을 따로 만들고, 서버가 그 채널을 지정해야 한다.
- **바꿀 것(네이티브)**
  - ① FCM 수신 시 `badgeCount` 로 요약 알림 숫자를 갱신한다.
  - ② 무음 / 무진동 / 무음+무진동 채널을 생성한다.
  - ③ data 의 소리·진동 표시에 따라 채널을 선택한다.
- **필요 조건**
  - versionCode 증가, `npm run native:prepare`, 재빌드·재설치.
  - 구 바이너리(현재 1.2.4 (13))에서는 새 표시를 무시하므로 기존 동작이 유지된다.
- **실기 항목**
  - 삼성·샤오미 백그라운드/종료 상태 푸시 수신 후 런처 숫자.
  - 알림음 끔·진동 끔 상태에서 푸시가 소리·진동 없이 표시되는지.
  - 통화 수신벨은 영향이 없는지(통화 채널은 별개).

---

## 3. 통화 공용 발송 파일 변경 — D-Q3 iOS 알림음 끔 / 서버 소리·진동 표시

- **원인**
  - 설정 게이트는 푸시 발송 여부(`sendPush`)만 쓰고 `playSound`·`vibrate` 는 버린다(`web-push-user-settings-gate.ts:157,173`).
  - iOS 는 `aps.sound:"default"` 가 고정이다(`apns-sender-impl.ts:224`).
  - 그래서 알림음을 꺼도 푸시는 울린다.
- **바꿀 것**
  - ① 발송 직전에 같은 resolver 결과로 `playSound=false` 이면 APNs `aps.sound` 를 생략하고, FCM data 에 소리·진동 표시를 싣는다.
  - ② `skip_settings_gate` 인 통화 푸시는 지금 그대로 둔다.
- **규정 사유**: `lib/push/dispatch/apns-sender-impl.ts`·`fcm-sender-impl.ts` 는 통화 푸시와 같은 발송 파일이다(AGENTS 통화 규정 1항). 통화 경로 무변경을 테스트로 증명하고, 통화 행렬 실기를 같이 해야 한다.
- **iOS 진동**: 앱이 끌 수 없다(OS 설정). iOS 에서 진동은 OS 설정을 따른다(Owner 결정 반영).
- **실기 행렬**
  - 알림음 끔 상태에서 iOS·Android 일반 알림이 무음으로 오는지.
  - 통화 행렬 전체(AGENTS 통화 규정 5항): 음성·영상 발신·수신, 거절, 벨 중 취소, 지연 푸시, busy, 무응답, 재발신.
