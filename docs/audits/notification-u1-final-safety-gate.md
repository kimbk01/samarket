# DIBAY NOTIFICATION — U1 FINAL SAFETY GATE (EVENT-11 / 13 / 14)

- 작성일: 2026-10-04 · 기준 SHA `9d5ac23a` · **제품 코드·DB·Native·Production 변경 없음**
- 검증 방식: 직접 코드 판독 + Prod SQL(읽기 전용) + **격리 검증** — 저장소 밖 임시 git worktree 에 수정안을 적용하고 mock DB 로 테스트한 뒤 worktree 삭제. 운영 사용자 발송·Production QA 발송 **미실행**.

## 0. 결론 먼저

Phase 3 의 U1 제안("종결 판정을 `done` 하나로 통일")은 **철회**한다. 이유는 아래 Q1·Q2: 그렇게 바꾸면 120명 초과 캠페인이 "조기 종결(잘못된 sent)" 대신 "영구 미완료(sending→queued 정체)"로 바뀔 뿐, 나머지 사용자에게 발송되지 않는 점은 같다. 대량 발송 완료는 U1 범위로 안전하게 해결할 수 없다.

대신 **U1-A**(EVENT-11·13 만, 다중 배치 동작은 현행 그대로)를 제출한다. EVENT-14(+ 신규 확인 EVENT-15)는 **U1-B 로 분리·보류**(현재 Prod 프로필 107명 < 배치 120명이라 미발생).

## 1. 8개 확인 항목 답변

| # | 질문 | 답 (근거) |
|---|---|---|
| 1 | 120명 초과 시 다음 배치가 생성·발송되는가 | **현행: 아니오.** 격리 재현: 250명 scan 캠페인 → 1배치 120명 후 occurrence `sent`, 2배치 `occurrence_already_completed` (EVENT-14). **U1-A 후에도 동일(변경 안 함).** 또한 즉시발송 `/send` 는 drain 벽시계 12초(`send/route.ts`) 인데 Prod 실측 배치 속도 ≈0.25초/명(80명 18~22초) → 1회 호출당 1배치만 처리, 이후 이어서 처리하는 주체가 없음(cron 은 `scheduled_for` 있는 회차만 claim) = **EVENT-15**. |
| 2 | `done` 의 의미 | `run-campaign-send-batch` 의 `done` = "이번 배치 후 남은 대상 없음" (selected: pending 0 / scan: 다음 1명 peek 없음). 현행 종결은 `done` 이 아니라 `refreshOccurrenceMetrics` 의 `pending 0 && sending` 이 결정 → scan 대상은 중간 배치에서도 참(EVENT-14), 마지막 배치는 상태 선기록으로 거짓(EVENT-11). ※ scan/카운트 쿼리 **오류 시에도 `done=true`** 로 처리됨(현행, 잔여 위험). |
| 3 | 부분실패·재시도·중복 실행 | 동시 실행: claim RPC `FOR UPDATE`+lease, cron `SKIP LOCKED` → 정상(무변경). 부분실패: 현행은 항상 `sent`, U1-A 후 기존 `resolveFinalOccurrenceStatus` 로 `partially_failed/failed` 기록. `failed` 회차 재claim 시: scan offset 끝·selected 대상 non-pending → **추가 발송 0**(격리 테스트 확인). 재실행 중복: 배치 도중 프로세스 종료 시 offset 미갱신 → 재실행 시 in-app 은 dedupe, **push 는 재발송**(현행 동작, U1-A 무변경, 잔여 위험). |
| 4 | 선택 대상·전체 대상 | 선택 대상 130명: 1배치 비종결 → 2배치 종결, 130명 각 1회(격리 테스트). 전체 대상 ≤120명: 단일 배치 종결+캠페인 동기화. 전체 대상 >120명: 현행과 동일(EVENT-14, U1-B). |
| 5 | 테스트 회차 | 현행: 영구 `queued`(Prod 19). U1-A: test 회차도 `sending`→종결, **campaign 상태·집계 미변경**. UI 테스트 발송은 별도 QA draft 캠페인을 생성하므로 실제 캠페인과 섞이지 않음(`AdminNotificationCampaignCreatePage.tsx:408-440`). API 로 실제 캠페인에 test 를 보내면 대상 행이 test 회차로 덮이는 기존 문제(EVENT-16)는 U1-A 무변경. |
| 6 | 상태 계약 일치 | campaign CHECK: `draft/scheduled/active/paused/ended/cancelled/sending/sent/partially_failed/failed`. U1-A 후: 즉시(draft)→`sent/partially_failed/failed`, 예약(scheduled)→동일, **반복(active)→유지**(스케줄러가 `active` 요구 — `claim-scheduled-campaign.ts:220`), test→미변경. 매핑은 기존 `mapOccurrenceStatusToLegacyCampaignStatus` 그대로. |
| 7 | 기존 데이터 변경 없이 가능? | 예. 신규 종결분부터 적용. 기존 13건(`sent` 회차·`draft` 캠페인)·19건 test `queued` 는 그대로 남음(보정 안 함). |
| 8 | 부작용 | 아래 Impact Matrix. Notification 생성·Push 발송 코드(`campaign-send-user`, `dispatchPushForUser`) **무변경**. |

## 2. ROOT CAUSE
- EVENT-11: `run-campaign-send-batch.ts:248-260` 이 `done` 시 occurrence 를 `resolveFinalOccurrenceStatus(0, sent, 0, sent)`(실패 0 고정)로 **먼저** `sent` 기록 → 직후 `refreshOccurrenceMetrics` 의 종결 조건 `status === 'sending'` 불충족 → 실패 반영 최종상태 계산·`syncCampaignAggregateFromOccurrences` 미실행.
- EVENT-13: `runNotificationCampaignTestSend` 가 회차를 `sending` 으로 바꾸지 않아 같은 종결 조건 불충족.
- EVENT-14: scan 대상은 대상 행을 `sent/skipped` 로만 기록(`pending` 없음) → 중간 배치에서 `pending 0 && sending` 참 → 조기 종결.
- EVENT-15(신규): 즉시발송 회차는 `/send` 1회 drain(12초) 이후 이어갈 경로가 없음.

## 3. FIRST DIVERGENCE
- EVENT-11/13: 마지막 배치 직후 occurrence update(`run-campaign-send-batch.ts:248`) / test-send 시작 시 상태 미전이(`run-campaign-send-batch.ts` `runNotificationCampaignTestSend`).
- EVENT-14: 첫 중간 배치 후 `refreshOccurrenceMetrics` 종결 분기.

**격리 재현(현행 코드)**: 250명 scan → 1배치 후 occurrence `sent`·campaign `sent`, 2배치 `occurrence_already_completed`, 수신 120명 / 80명 단일 배치 → occurrence `sent`·campaign `draft` / 10% 실패 → `sent`. (Prod 의 "11111" 캠페인 상태와 일치)

## 4. EXACT CHANGE (U1-A, 2개 파일, +24/−13 — 아직 미적용)

`lib/admin/notification-campaigns/run-campaign-send-batch.ts`
1. 마지막 배치 update 에서 `status`/`completed_at` 선기록 제거(offset·updated_at 만 기록) → 종결은 기존 `refreshOccurrenceMetrics` 단일 경로가 결정.
2. `runNotificationCampaignTestSend`: 회차가 `queued` 면 `sending`(+started_at) 으로 전이 후 발송 → 같은 경로로 종결.
3. 사용하지 않게 된 `resolveFinalOccurrenceStatus` import 제거.

`lib/admin/notification-campaigns/campaign-delivery-recorder.ts`
4. `refreshOccurrenceMetrics`: `trigger_type` 조회, **test 회차면 campaign 동기화 생략**.
5. `syncCampaignAggregateFromOccurrences`: campaign `send_mode` 조회, **recurring 이면 status 미변경**(집계·sent_at 만 갱신).

변경하지 않는 것: 종결 조건 자체(`pending 0 && sending`), `done` 계산, claim/lease RPC, cron, `/send`, `sendCampaignToUser`, push/notification 생성, DB 스키마.

(전체 diff: 문서 말미 부록 A — 승인 시 그대로 적용)

## 5. IMPACT MATRIX

| 대상 | 변경 전 | 변경 후 | 영향 |
|---|---|---|---|
| 즉시/예약 캠페인 상태 | 발송 후에도 `draft`/`scheduled` | `sent`/`partially_failed`/`failed` | Admin 목록·필터·상세 정상화 |
| 캠페인 집계(sent/skipped/failed/target_count) | 0 유지 | 최신 회차 기준 갱신 | 목록 표시 |
| 회차 최종상태 | 항상 `sent` | 실패 반영 | `partially_failed` 표시 증가 가능(예: 만료 토큰 기기) — 기존 함수 계약 그대로 |
| 반복 캠페인 | `active` 유지(동기화 미실행 덕분) | `active` 유지(명시적 보호) + 집계 갱신 | 스케줄러 무영향 |
| test 회차 | 영구 `queued` | 종결 | campaign 무변경, `/send` 가 test 회차를 집을 창이 수 초로 축소(EVENT-12 근본 해결은 U2) |
| 발송된 캠페인 PATCH | `draft` 라 수정 가능(오동작) | `sent` → 기존 PATCH 가드로 수정 불가 | 기존 의도 회복 |
| 예약 회차 취소 route | `scheduled` 만 갱신 | 동일 | 없음 |
| 다중 배치(>120) | EVENT-14 | **동일** | 변화 없음(U1-B) |
| Cron / claim / lease / `/send` | — | 무변경 | 없음 |
| Notification 생성·Push·FCM/APNs·알림음·CTA | — | 무변경 | 없음 |
| Android / iOS / 기존 설치 앱 | — | 서버 Admin 경로만 | 없음 |
| DB/RLS | — | 없음 | 없음 |
| 속도 | — | 종결 시 select 1회 추가(campaign send_mode) | 무시 가능 |

## 6. REGRESSION TEST
- 기존: `lib/admin/notification-campaigns/**`, `app/api/admin/notification-campaigns/**`, `app/api/cron/**` — 현행 74/74 통과(기준선), **수정안 적용 worktree 에서 81/81 통과**(기존 74 + 신규 7).
- 신규 7 케이스(구현 시 정식 테스트로 추가): ① 단일 배치 → 회차·캠페인 `sent` ② 부분실패 → `partially_failed` ③ 전부실패 → `failed` & 재실행 추가발송 0 ④ 선택대상 130명 2배치·중복 0 ⑤ 반복 캠페인 `active` 유지 ⑥ test 회차 종결·캠페인 불변 ⑦ EVENT-14 현행 유지(특성화).
- **반증 확인**: 같은 신규 테스트를 수정 전 코드에 돌리면 5건 실패(①②③⑤⑥), 2건 통과(④⑦ = 불변 확인용) → 테스트가 변경을 실제로 검증함.
- typecheck: `tsc -p tsconfig.app.json --noEmit` exit 0 (worktree).
- 구현 후 Production 검증: 별도 승인 시 QA 계정만 대상으로 즉시발송 1건 → 회차·캠페인 상태/집계 SQL 확인. 승인 전 미실행.
- 실기기: 해당 없음(서버 Admin 경로, 알림 발송 로직 무변경).

## 7. ROLLBACK
단일 커밋 revert. DB·데이터 변경 없음 → 즉시 원복. 원복 시 기존 동작(EVENT-11/13)으로 복귀할 뿐 데이터 손상 없음.

## 8. REMAINING RISK
1. **EVENT-14/15 (U1-B, 보류)**: 대상 120명 초과 시 일부 사용자만 발송. 해결에는 회차 이어가기 경로 + 재실행 시 push 중복 방지(사용자 단위 멱등)가 함께 필요 → 고위험 별도 설계 필요. 현재 프로필 107명.
2. 종결이 이제 `refreshOccurrenceMetrics` 의 delivery 조회 성공에 의존 — 조회 오류 시 회차가 `sending` 으로 남고 lease(600초) 후 `queued` 재큐(예약 회차는 cron 이 재처리, 즉시 회차는 EVENT-15 와 같은 정체). 기존에는 상태 선기록으로 종결됨.
3. scan/카운트 쿼리 오류를 `done=true` 로 취급(현행, 무변경).
4. 배치 도중 프로세스 종료 시 push 재발송 가능(현행, 무변경).
5. `partially_failed` 표시 증가는 정상 동작이나 운영자 체감 변화.
6. 격리 검증은 mock DB 기반 — 실제 Supabase 쿼리 체인 동작은 Production QA 검증 전까지 **NOT_PROVEN**.

**STOP — U1-A 승인 시 위 EXACT CHANGE 만 구현.** U1-B 는 별도 설계·승인 대상.

## 부록 A — 제안 diff (미적용)

```diff
diff --git a/lib/admin/notification-campaigns/campaign-delivery-recorder.ts b/lib/admin/notification-campaigns/campaign-delivery-recorder.ts
index 77dec92a..8e883f1a 100644
--- a/lib/admin/notification-campaigns/campaign-delivery-recorder.ts
+++ b/lib/admin/notification-campaigns/campaign-delivery-recorder.ts
@@ -108,7 +108,7 @@ export async function refreshOccurrenceMetrics(svc: SupabaseClient, occurrenceId
 
   const { data: occ } = await svc
     .from("admin_notification_campaign_occurrences")
-    .select("campaign_id, status")
+    .select("campaign_id, status, trigger_type")
     .eq("id", occurrenceId)
     .maybeSingle();
 
@@ -136,7 +136,9 @@ export async function refreshOccurrenceMetrics(svc: SupabaseClient, occurrenceId
       })
       .eq("id", occurrenceId);
 
-    if (campaignId) {
+    // U1: test occurrences never change campaign status/aggregates.
+    const isTestOccurrence = String((occ as { trigger_type?: string }).trigger_type ?? "") === "test";
+    if (campaignId && !isTestOccurrence) {
       await syncCampaignAggregateFromOccurrences(svc, campaignId, {
         status: finalStatus,
         push_sent: pushSent,
@@ -167,6 +169,14 @@ async function syncCampaignAggregateFromOccurrences(
     .limit(1)
     .maybeSingle();
 
+  const { data: campRow } = await svc
+    .from("admin_notification_campaigns")
+    .select("send_mode")
+    .eq("id", campaignId)
+    .maybeSingle();
+  // U1: recurring campaigns keep their lifecycle status (active/paused/ended) — scheduler depends on it.
+  const isRecurring = String((campRow as { send_mode?: string } | null)?.send_mode ?? "") === "recurring";
+
   await svc
     .from("admin_notification_campaigns")
     .update({
@@ -174,7 +184,7 @@ async function syncCampaignAggregateFromOccurrences(
       skipped_count: latest.push_skipped,
       failed_count: latest.push_failed,
       target_count: (occRow as { target_member_count?: number } | null)?.target_member_count ?? 0,
-      status: mapOccurrenceStatusToLegacyCampaignStatus(latest.status),
+      ...(isRecurring ? {} : { status: mapOccurrenceStatusToLegacyCampaignStatus(latest.status) }),
       sent_at: latest.completed_at,
       updated_at: new Date().toISOString(),
     })
diff --git a/lib/admin/notification-campaigns/run-campaign-send-batch.ts b/lib/admin/notification-campaigns/run-campaign-send-batch.ts
index e11f46ec..93eb07de 100644
--- a/lib/admin/notification-campaigns/run-campaign-send-batch.ts
+++ b/lib/admin/notification-campaigns/run-campaign-send-batch.ts
@@ -8,10 +8,7 @@ import {
   recordCampaignDelivery,
   refreshOccurrenceMetrics,
 } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
-import {
-  getCampaignOccurrence,
-  resolveFinalOccurrenceStatus,
-} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
+import { getCampaignOccurrence } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
 import type { AdminNotificationCampaignOccurrenceRow, CampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
 import { sendCampaignToUser } from "@/lib/admin/notification-campaigns/campaign-send-user";
 import { fetchCampaignProfileScanSlice } from "@/lib/admin/notification-campaigns/campaign-target-scan";
@@ -245,17 +242,12 @@ export async function runNotificationCampaignSendBatch(
     done = peek.length === 0;
   }
 
+  // U1: terminal status is decided only by refreshOccurrenceMetrics (failure-aware + campaign sync).
   await svc
     .from("admin_notification_campaign_occurrences")
     .update({
       send_progress_offset: nextOffset,
       updated_at: now,
-      ...(done
-        ? {
-            status: resolveFinalOccurrenceStatus(0, sent, 0, sent),
-            completed_at: now,
-          }
-        : {}),
     })
     .eq("id", occurrenceId);
 
@@ -281,6 +273,15 @@ export async function runNotificationCampaignTestSend(
     occurrence.content_snapshot as Parameters<typeof campaignRowFromContentSnapshot>[1]
   );
 
+  // U1/EVENT-13: test occurrence enters `sending` so the shared terminal path can close it.
+  if (occurrence.status === "queued") {
+    const startedAt = new Date().toISOString();
+    await svc
+      .from("admin_notification_campaign_occurrences")
+      .update({ status: "sending", started_at: occurrence.started_at ?? startedAt, updated_at: startedAt })
+      .eq("id", occurrenceId);
+  }
+
   const maps = await loadCampaignSettingsMaps(svc, userIds);
   let sent = 0;
   let skipped = 0;
```
