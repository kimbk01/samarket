# DIBAY NOTIFICATION — U1 COMPLETION DESIGN (U1-A + U1-B 통합)

- 작성일: 2026-10-04 · 기준 SHA `9d5ac23a` (HEAD = origin/main = Production) · **제품 코드·DB·Native·Production 변경 없음**
- 검증: 저장소 밖 임시 git worktree 에 수정안 적용 → mock DB 격리 테스트 → worktree 삭제. 실제 사용자 발송·Production QA 발송 **미실행**.
- 저장소 상태 확인(직접 실행): `git status --porcelain --untracked-files=all` 출력 없음, 임시 테스트 파일 잔류 없음, worktree 1개(본 저장소)만 존재, `git diff 9d5ac23a HEAD` = `docs/audits/*.md` 5개뿐. 이전 보고 중 "changed on disk" 알림은 본인이 scratch 테스트·보고서를 sed/append 로 수정한 기록이며 커밋된 제품 코드 변경은 없음.

## 1. 확정 Root Cause

| ID | 원인 (현행 코드) | 증거 |
|---|---|---|
| EVENT-11 | 마지막 배치가 occurrence 를 실패 0 고정으로 `sent` 선기록 → `refreshOccurrenceMetrics` 종결 조건(`status==='sending'`) 불충족 → 실패 반영·campaign 동기화 미실행 | `run-campaign-send-batch.ts:248-260`; Prod 13건(운영 "11111" 포함); 격리 재현 |
| EVENT-13 | test-send 가 회차를 `sending` 으로 전이하지 않아 종결 불가 | Prod test `queued` 19건; 격리 재현 |
| EVENT-14 | scan 대상(전체/마케팅동의/활성/지역)은 대상 행을 `pending` 으로 만들지 않음 → 중간 배치에서도 `pending 0 && sending` 참 → 120명 후 종결 | `campaign-delivery-recorder.ts` 종결 분기; 격리 재현(250명 중 120명) |
| EVENT-15 | 즉시발송 회차는 `/send` 1회 drain(12초) 후 이어갈 경로 없음. cron 은 `scheduled_for` 있는 회차만 claim, lease 만료 재큐 후에도 영구 `queued` | `send/route.ts`, `claim_due_admin_notification_campaign_occurrence`(Prod 함수 정의); Prod 실측 0.25초/명(80명 18~22초) |
| ERR-1 | scan 쿼리 오류 → `[]` → "대상 없음 = 완료" | `campaign-target-scan.ts:26-29,61-64`, `run-campaign-send-batch.ts:186-190,243-246` |
| ERR-2 | 선택대상 pending 카운트 오류 → `count ?? 0` → 완료 | `run-campaign-send-batch.ts:236-242` |
| DUP-1 | 재실행 시 in-app 은 dedupe 되지만 **event id 없이 push 재발송**(기기 단위 dedupe 미적용) | `campaign-send-user.ts` duplicate 분기 → `dispatchPushForUser` 에 `notification_event_id` 미전달 |
| DUP-2 | scan 재실행 시 이미 처리한 사용자 재처리 (offset 은 배치 끝에만 저장) | `run-campaign-send-batch.ts:248-251` |
| TIME-1 | drain 이 남은 시간보다 긴 배치를 시작 → 플랫폼 타임아웃(60초)으로 배치 중단 가능; cron 은 tick 당 최대 3회차를 시간 확인 없이 claim | `claim-scheduled-campaign.ts` drain 루프, cron route |
| REC-1 | 반복+선택대상: 2회차부터 대상 행이 생성되지 않아 0명 발송 | 대상 생성은 생성 시 1회(`campaign-create-service.ts:221-228`)뿐, `scheduleNextRecurringOccurrence` 미생성 |

## 2. 수정 대상 파일 (7개, +215/−30, 미적용 — 부록 A)
1. `lib/admin/notification-campaigns/run-campaign-send-batch.ts`
2. `lib/admin/notification-campaigns/campaign-delivery-recorder.ts`
3. `lib/admin/notification-campaigns/campaign-send-user.ts`
4. `lib/admin/notification-campaigns/campaign-target-scan.ts`
5. `lib/admin/notification-campaigns/claim-scheduled-campaign.ts`
6. `app/api/admin/notification-campaigns/[campaignId]/send/route.ts`
7. `app/api/cron/notification-campaigns-dispatch-scheduled/route.ts`

DB 스키마·RPC·RLS·인덱스·Native·Admin UI·cron 스케줄 변경 **없음**.

## 3. 변경 전후 흐름

```
[현행]
/send → claim(sending) → drain(12s, 시간 무시하고 배치 시작) → 배치:
   scan: 120명 후 refresh 가 pending0 → 'sent' 종결 (나머지 영구 누락, 캠페인은 sent)     EVENT-14
   마지막 배치: 'sent'(실패 무시) 선기록 → 캠페인 동기화 안 됨 (draft 유지)              EVENT-11
   drain 미완료 → 그대로 반환 → lease 만료 → queued(scheduled_for null) → 영구 정체      EVENT-15
   scan/카운트 오류 → 완료로 처리                                                       ERR-1/2
   재실행: 처리한 사용자 재처리 + push 재발송                                            DUP-1/2

[수정 후]
/send → claim(sending) → [신규] scheduled_for 없으면 now 기록(복구용)
      → drain: 첫 배치 이후엔 "가장 느린 배치 시간이 남은 예산 안에 들어올 때만" 다음 배치  TIME-1
      → 배치: 이번 회차에 이미 기록된 사용자 skip(scan) → 발송 → done 판정(오류 시 ok:false) DUP-2, ERR-1/2
      → refreshOccurrenceMetrics(terminal = 배치의 done) → 실패 반영 최종상태 + 캠페인 동기화 EVENT-11/14
           · test 회차: 캠페인 동기화 생략 · 반복 캠페인: status(active) 유지              EVENT-13
      → 미완료/일시 오류: claim token 일치 시에만 queued 로 반납(due=기존값 또는 now)        EVENT-15
→ 기존 cron(5분): claim_due 가 반납된 회차를 claim → 같은 경로로 이어서 처리 → 마지막 대상 후 종결
   cron: tick 예산 안에 1배치 더 들어갈 때만 다음 회차 claim                             TIME-1
반복: 새로 생성된(queued) 회차에 한해 기존 대상 행을 pending 으로 재무장                    REC-1
in-app 중복 시: 기존 event id 조회 → push 에 전달 → 기존 UNIQUE(event_id, device_id) 로 기기 중복 차단  DUP-1
반복 회차 in-app dedupe key 만 회차 단위(`admin_campaign:{c}:{occ}:{u}`), 그 외 기존 키 유지
```

## 4. 기존 구조 유지 증거
- 이어서 처리 = **기존** `claim_due_admin_notification_campaign_occurrence` RPC + **기존** 5분 cron. 새 큐·테이블·엔진 없음.
- 사용자 단위 멱등 = **기존** `admin_notification_campaign_targets`(UNIQUE campaign_id,user_id; occurrence_id·status 컬럼) 재사용.
- push 기기 중복 차단 = **기존** `notification_deliveries_event_device_uidx`, `notification_events_user_dedupe_uidx` (Prod 존재 확인).
- 상태 값 = 기존 CHECK 집합 내(`queued/sending/sent/partially_failed/failed`), 매핑 함수 기존 그대로.
- 기존 호출 계약 유지: 비반복 회차의 `sendCampaignToUser` 호출 인자 5개 그대로(테스트로 고정), `fetchCampaignProfileScanSlice` 기본 동작(오류 시 `[]`) 유지 — audience preview 무영향, 배치만 opt-in.
- 기존 테스트 74개 **수정 없이** 전부 통과.

## 5. 중복·누락 방지 (상황별)

| 상황 | 중복 Push | 누락 | 근거 |
|---|---|---|---|
| 중복 claim (관리자 2회, 관리자+cron) | 없음 | 없음 | claim RPC `FOR UPDATE` + 상태 검사(기존) |
| lease 만료 | 해당 없음 | 없음 | lease 600초 ≫ 함수 최대 60초; 반납/재큐 후 cron 재개 |
| 동시 실행(cron 다중 인스턴스) | 없음 | 없음 | `SKIP LOCKED`(기존) |
| 배치 도중 프로세스 종료 | **in-app 포함 채널: 기기 단위 차단** / **push_only: 종료 직전 처리 중이던 사용자 1명 범위에서 가능** | 없음(재개 시 미처리자 발송) | 격리 테스트: 250명 중 61번째에서 강제 종료 → 재개 → 250명 각 1회 |
| Push 성공 직후 DB 기록 전 종료 | in-app 포함: delivery 행이 발송 **전** `pending` 으로 삽입되므로 재실행 시 UNIQUE 충돌 → skip / push_only: 재발송 가능 | 없음 | `dispatch-push-for-user.ts` insert→send→update 순서 |
| 재시도(failed 회차 재claim) | 없음 | 해당 없음 | 격리 테스트: 추가 발송 0 |
| 부분 실패 | 없음 | 실패 기기는 자동 재시도 없음(기존 정책) — `partially_failed` 로 **표시** | |
| scan/카운트/메트릭 조회 오류 | 없음 | 없음(완료로 위장 안 함, 재개) | 격리 테스트 |

**정확히 한 번(exactly-once)은 보장하지 않는다.** 외부 FCM/APNs 는 멱등 키가 없으므로, push_only 캠페인에서 "provider 수락 후 ~ 대상 행 기록 전" 사이(수 ms) 프로세스가 종료되면 재개 시 재발송될 수 있다. in-app 포함 캠페인은 기존 UNIQUE 로 기기 단위 중복이 차단된다.

## 6. 전체 영향 분석

| 영역 | 영향 |
|---|---|
| Admin 목록/상세 | 상태·집계 정상화, 대량 발송이 "진행 중(queued/sending)"으로 보이다 완료됨 |
| Campaign / Occurrence | 위 흐름. 반복 캠페인 `active` 유지 |
| Cron | 반납된 즉시 회차도 처리(기존 RPC 조건 그대로). tick 예산 확인 추가 |
| Retry | 캠페인 push 실패 자동 재시도 없음(기존과 동일) |
| notification_events | 반복 회차만 dedupe key 형식 변경(신규 행부터). 기존 행 무변경 |
| notification_deliveries | 재실행 시 기존 event id 로 dedupe 동작(기존 인덱스) |
| FCM/APNs/VoIP/알림음/CTA | 무변경 |
| Event / Notice 캠페인 | 같은 발송 경로 — 위 개선 동일 적용, 소스 검증(이벤트 게시) 무변경 |
| 예약 캠페인 | 예약 시각 claim 무변경, 완료 후 `sent` 로 동기화 |
| 테스트 발송 | 회차 종결, 캠페인 무변경 |
| 속도 | 120명 이하: 동일. 초과: 첫 배치 즉시 + 이후 cron 5분마다 약 1배치(≈120명) → 1,000명 ≈ 40분. 정확성 우선이며 속도 개선은 별도 과제 |
| 기존 데이터 | Prod `queued` 60건(test 19, immediate 41)은 모두 `scheduled_for` 없음 → cron 이 집지 않음, 변화 없음. 정지된 QA 반복 캠페인도 변화 없음(아래 §8) |
| Android/iOS/기존 설치 앱 | 서버 Admin/cron 경로만 |

## 7. 테스트 결과 (격리, mock DB)
- 기존 74개: 수정 없이 통과.
- 신규 21개(시나리오 19 + 발송 사용자 2) 포함 **95/95 통과**, 알림·push 영역 1,380/1,380 통과, `tsc -p tsconfig.app.json` exit 0, eslint 0 errors(경고 3건은 기준선과 동일한 기존 경고).
- **반증**: 같은 신규 테스트를 현행 코드에 실행 → 18건 실패, 3건 통과(이미 정상인 선택대상 250명·카운트 오류·정지 캠페인 불변).

| 시나리오 | 결과 |
|---|---|
| 전체 대상 1 / 80 / 120 / 121 / 250명 | 각 사용자 정확히 1회, 회차·캠페인 `sent` |
| 선택 대상 250명 | 정확히 1회, 종결 |
| 부분 실패 / 전체 실패 | `partially_failed` / `failed` |
| 반복 | 캠페인 `active` 유지, 회차 단위 dedupe |
| 반복+선택대상 다음 회차 | 신규 회차에 한해 대상 재무장 / 기존 회차 반환 시 무변경 |
| 예약 | `scheduled`→`sent`, 호출 계약 불변 |
| 테스트 발송 | 회차 종결, 캠페인 불변 |
| 중간 종료 후 재개 | 250명 각 1회, 누락 0 |
| 동시/중복 실행 | 반납은 claim token 보유자만 가능 / 기존 RPC 잠금(DB 수준 — mock 으로 증명 불가, 기존 RPC 정의로 근거) |
| DB scan 오류 | 완료로 처리 안 함, 재개 후 완료 |
| 카운트 오류 / 메트릭 조회 오류 | 완료 위장 없음, 다음 실행에서 종결 |
| Provider 오류 | 실패로 기록 |
| drain 시간 예산 | 들어가지 않는 배치는 시작 안 함 |
| 재실행 중복 in-app | 기존 event id 로 push dispatch → 기기 dedupe |

Production 증거: 없음(설계·격리 단계). Prod 근거는 원인 데이터(상태 이상 행, 실측 속도, 인덱스 존재)뿐.

## 8. 남는 위험
1. **exactly-once 미보장**: push_only 캠페인의 종료 직전 1명 범위 재발송 가능(§5).
2. **cron 의존**: 대량 발송 이어가기는 Vercel cron 실행에 의존. campaign cron 의 Prod 실행 흔적은 지금까지 없음(대상 회차 부재) → 배포 후 QA 검증 필요. cron 이 멈추면 "진행 중"으로 **보이며** 완료로 위장되지 않음.
3. **대량 발송 속도**: 1,000명 ≈ 40분.
4. **반복 캠페인 정지 QA 데이터**: 이번 설계는 다음 회차 계산 기준(`after`)을 **변경하지 않는다**. 검토 중 그 변경을 넣으면 정지된 `[QA-D4X]` 반복 캠페인(선택대상·in-app)이 배포 직후 8/15~8/19 지난 회차를 연속 생성·발송해 실제 계정에 알림이 나가는 부작용을 확인하여 제외했다. 이 캠페인은 현행처럼 정지 상태로 남는다(데이터 정리는 Owner 결정 사항).
5. 실패 기기 자동 재시도 없음(기존 정책 유지).
6. mock DB 격리 검증 — 실제 Supabase 쿼리 체인·cron 동작은 **NOT_PROVEN** (Production QA 필요).

## 9. Rollback
단일 커밋 revert. 스키마·데이터 변경 없음. 배포 후 생긴 상태 변화는 정상 상태값뿐(`sent/partially_failed/failed`, 반납된 `queued`+due) — 원복 시 기존 코드가 그대로 읽을 수 있는 값. 원복 시점에 반납된 즉시 회차가 있으면 cron(기존 RPC)이 계속 집어 처리함(동작 호환).

## 10. Owner 승인 요청
1. **U1(U1-A + U1-B) 구현 승인** — 부록 A diff 그대로 + 신규 테스트 21개 정식 추가.
2. **Production 검증 승인(별도)** — QA 계정만 대상, 순서: ① 선택대상 1명 즉시발송 ② 예약 1분 뒤 1건(cron claim 확인) ③ 반복은 제외. 각 단계 후 회차·캠페인·delivery SQL 확인. 실사용자 발송 없음.
3. 실기기 확인 범위: 캠페인 수신·탭 1회(Android/iPhone) — 담당자 지정 필요. 미수행 시 NOT_PROVEN.

**STOP — 승인 전 구현하지 않음.**

## 부록 A — 제안 diff (미적용)

```diff
diff --git a/app/api/admin/notification-campaigns/[campaignId]/send/route.ts b/app/api/admin/notification-campaigns/[campaignId]/send/route.ts
index c840ad3f..c57cc4ea 100644
--- a/app/api/admin/notification-campaigns/[campaignId]/send/route.ts
+++ b/app/api/admin/notification-campaigns/[campaignId]/send/route.ts
@@ -3,9 +3,12 @@ import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
 import { resolveActiveOccurrenceForSend } from "@/lib/admin/notification-campaigns/campaign-create-service";
 import { getCampaignOccurrence } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
 import {
+  CAMPAIGN_CONTINUABLE_ERRORS,
   claimAdminCampaignManualSend,
   drainNotificationCampaignSendBatches,
   newCampaignSendClaimToken,
+  releaseOccurrenceForContinuation,
+  stampOccurrenceDueForRecovery,
 } from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";
 import { evaluateOfficialCampaignSendEligibility } from "@/lib/admin/notification-campaigns/campaign-source-authority";
 import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
@@ -159,6 +162,10 @@ export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId
     );
   }
 
+  if (claim.claimed) {
+    await stampOccurrenceDueForRecovery(svc, occurrenceId);
+  }
+
   if (enqueueOnly) {
     return NextResponse.json({
       ok: true,
@@ -194,9 +201,17 @@ export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId
   });
 
   if (!drained.ok) {
+    if (claim.claimed && CAMPAIGN_CONTINUABLE_ERRORS.has(String(drained.error ?? ""))) {
+      await releaseOccurrenceForContinuation(svc, occurrenceId, claimToken, drained.error ?? null);
+    }
     return NextResponse.json({ ok: false, error: drained.error ?? "batch_failed" }, { status: 500 });
   }
 
+  if (!drained.done && claim.claimed) {
+    // U1-B: remaining targets continue via the existing scheduled dispatcher.
+    await releaseOccurrenceForContinuation(svc, occurrenceId, claimToken);
+  }
+
   return NextResponse.json({
     ok: true,
     occurrence_id: occurrenceId,
diff --git a/app/api/cron/notification-campaigns-dispatch-scheduled/route.ts b/app/api/cron/notification-campaigns-dispatch-scheduled/route.ts
index 6e9ffc10..d68076cf 100644
--- a/app/api/cron/notification-campaigns-dispatch-scheduled/route.ts
+++ b/app/api/cron/notification-campaigns-dispatch-scheduled/route.ts
@@ -4,8 +4,10 @@ import {
   getCampaignOccurrence,
 } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
 import {
+  CAMPAIGN_CONTINUABLE_ERRORS,
   drainNotificationCampaignSendBatches,
   newCampaignSendClaimToken,
+  releaseOccurrenceForContinuation,
   scheduleNextRecurringOccurrence,
 } from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";
 import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
@@ -45,15 +47,21 @@ async function runDispatchScheduled(req: Request) {
     error?: string;
   }> = [];
 
+  const tickStarted = Date.now();
+  let slowestBatchMs = 0;
   for (let i = 0; i < MAX_OCCURRENCES_PER_TICK; i += 1) {
+    // U1-B: do not claim another occurrence when one more batch would not fit the tick budget.
+    const remainingMs = MAX_WALL_MS_PER_OCCURRENCE - (Date.now() - tickStarted);
+    if (i > 0 && remainingMs < slowestBatchMs) break;
     const claimToken = newCampaignSendClaimToken();
     const claimed = await claimDueOccurrence(svc, { claimToken });
     if (!claimed?.id) break;
 
     const drained = await drainNotificationCampaignSendBatches(svc, claimed.id, {
       maxBatches: MAX_BATCHES_PER_OCCURRENCE,
-      maxWallMs: MAX_WALL_MS_PER_OCCURRENCE,
+      maxWallMs: Math.max(5_000, MAX_WALL_MS_PER_OCCURRENCE - (Date.now() - tickStarted)),
     });
+    slowestBatchMs = Math.max(slowestBatchMs, drained.slowestBatchMs ?? 0);
 
     if (!drained.ok) {
       await svc
@@ -63,6 +71,12 @@ async function runDispatchScheduled(req: Request) {
           updated_at: new Date().toISOString(),
         })
         .eq("id", claimed.id);
+      if (CAMPAIGN_CONTINUABLE_ERRORS.has(String(drained.error ?? ""))) {
+        await releaseOccurrenceForContinuation(svc, claimed.id, claimToken, drained.error ?? null);
+      }
+    } else if (!drained.done) {
+      // U1-B: continue on the next tick instead of waiting for lease expiry.
+      await releaseOccurrenceForContinuation(svc, claimed.id, claimToken);
     }
 
     results.push({
diff --git a/lib/admin/notification-campaigns/campaign-delivery-recorder.ts b/lib/admin/notification-campaigns/campaign-delivery-recorder.ts
index 77dec92a..67023209 100644
--- a/lib/admin/notification-campaigns/campaign-delivery-recorder.ts
+++ b/lib/admin/notification-campaigns/campaign-delivery-recorder.ts
@@ -51,7 +51,15 @@ export async function recordCampaignDelivery(
 }
 
 /** Channel-separated occurrence metrics — NOT combined push+in_app sent_count. */
-export async function refreshOccurrenceMetrics(svc: SupabaseClient, occurrenceId: string): Promise<void> {
+/**
+ * `opts.terminal` (U1-B): the batch runner's "no targets remain" decision. When provided it is the
+ * only completion signal; legacy callers without it keep the previous pending-targets rule.
+ */
+export async function refreshOccurrenceMetrics(
+  svc: SupabaseClient,
+  occurrenceId: string,
+  opts?: { terminal?: boolean }
+): Promise<void> {
   const { data: rows, error } = await svc
     .from("notification_campaign_deliveries")
     .select("channel, status")
@@ -108,7 +116,7 @@ export async function refreshOccurrenceMetrics(svc: SupabaseClient, occurrenceId
 
   const { data: occ } = await svc
     .from("admin_notification_campaign_occurrences")
-    .select("campaign_id, status")
+    .select("campaign_id, status, trigger_type")
     .eq("id", occurrenceId)
     .maybeSingle();
 
@@ -123,7 +131,9 @@ export async function refreshOccurrenceMetrics(svc: SupabaseClient, occurrenceId
     .eq("occurrence_id", occurrenceId)
     .eq("status", "pending");
 
-  const isDone = (pendingTargets ?? 0) === 0 && currentStatus === "sending";
+  const isDone =
+    currentStatus === "sending" &&
+    (typeof opts?.terminal === "boolean" ? opts.terminal : (pendingTargets ?? 0) === 0);
 
   if (isDone) {
     const finalStatus = resolveFinalOccurrenceStatus(pushFailed, pushSent, inAppFailed, inAppSent);
@@ -136,7 +146,9 @@ export async function refreshOccurrenceMetrics(svc: SupabaseClient, occurrenceId
       })
       .eq("id", occurrenceId);
 
-    if (campaignId) {
+    // U1: test occurrences never change campaign status/aggregates.
+    const isTestOccurrence = String((occ as { trigger_type?: string }).trigger_type ?? "") === "test";
+    if (campaignId && !isTestOccurrence) {
       await syncCampaignAggregateFromOccurrences(svc, campaignId, {
         status: finalStatus,
         push_sent: pushSent,
@@ -167,6 +179,14 @@ async function syncCampaignAggregateFromOccurrences(
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
@@ -174,7 +194,7 @@ async function syncCampaignAggregateFromOccurrences(
       skipped_count: latest.push_skipped,
       failed_count: latest.push_failed,
       target_count: (occRow as { target_member_count?: number } | null)?.target_member_count ?? 0,
-      status: mapOccurrenceStatusToLegacyCampaignStatus(latest.status),
+      ...(isRecurring ? {} : { status: mapOccurrenceStatusToLegacyCampaignStatus(latest.status) }),
       sent_at: latest.completed_at,
       updated_at: new Date().toISOString(),
     })
diff --git a/lib/admin/notification-campaigns/campaign-send-user.ts b/lib/admin/notification-campaigns/campaign-send-user.ts
index 95c784c9..a67436a3 100644
--- a/lib/admin/notification-campaigns/campaign-send-user.ts
+++ b/lib/admin/notification-campaigns/campaign-send-user.ts
@@ -69,7 +69,7 @@ export async function sendCampaignToUser(
   occurrenceId: string,
   userId: string,
   maps: SettingsMaps,
-  opts?: { forceChannel?: CampaignChannel; skipDuplicateCheck?: boolean }
+  opts?: { forceChannel?: CampaignChannel; skipDuplicateCheck?: boolean; dedupeScope?: "campaign" | "occurrence" }
 ): Promise<CampaignUserSendResult> {
   const channel = opts?.forceChannel ?? campaign.channel;
   const presentation = buildAdminCampaignNotificationPresentation({
@@ -128,6 +128,13 @@ export async function sendCampaignToUser(
   let anyPushSent = false;
   let lastSkipReason: CampaignSkipReason | string | null = null;
 
+  // U1-B: recurring occurrences are deduped per occurrence; other modes keep the existing key.
+  const inAppDedupeKey = opts?.skipDuplicateCheck
+    ? `admin_campaign:${campaign.id}:${userId}:${Date.now()}`
+    : opts?.dedupeScope === "occurrence"
+      ? `admin_campaign:${campaign.id}:${occurrenceId}:${userId}`
+      : `admin_campaign:${campaign.id}:${userId}`;
+
   if (campaignNeedsInApp(channel)) {
     const created = await createNotificationEvent(svc, {
       userId,
@@ -135,9 +142,7 @@ export async function sendCampaignToUser(
       category,
       title: presentation.title,
       body: presentation.body,
-      dedupeKey: opts?.skipDuplicateCheck
-        ? `admin_campaign:${campaign.id}:${userId}:${Date.now()}`
-        : `admin_campaign:${campaign.id}:${userId}`,
+      dedupeKey: inAppDedupeKey,
       displayPayload: {
         ...presentation.displayPayload,
         imageUrl: inAppImageUrl,
@@ -149,6 +154,15 @@ export async function sendCampaignToUser(
     if (!created.ok) {
       if (created.duplicate) {
         lastSkipReason = "duplicate_campaign_user";
+        // U1-B: reuse the existing event id so push delivery dedupe (notification_event_id, device_id)
+        // blocks re-sending to devices already attempted.
+        const { data: existingEvent } = await svc
+          .from("notification_events")
+          .select("id")
+          .eq("user_id", userId)
+          .eq("dedupe_key", inAppDedupeKey)
+          .maybeSingle();
+        notificationEventId = existingEvent?.id ? String((existingEvent as { id: string }).id) : null;
         await recordCampaignDelivery(svc, {
           campaignId: campaign.id,
           occurrenceId,
diff --git a/lib/admin/notification-campaigns/campaign-target-scan.ts b/lib/admin/notification-campaigns/campaign-target-scan.ts
index df2c67d3..ccb764b1 100644
--- a/lib/admin/notification-campaigns/campaign-target-scan.ts
+++ b/lib/admin/notification-campaigns/campaign-target-scan.ts
@@ -8,7 +8,8 @@ export async function fetchCampaignProfileScanSlice(
   svc: SupabaseClient,
   campaign: Pick<AdminNotificationCampaignRow, "target_type" | "segment_region_code">,
   offset: number,
-  limit: number
+  limit: number,
+  opts?: { throwOnError?: boolean }
 ): Promise<string[]> {
   const tt = campaign.target_type;
 
@@ -25,6 +26,7 @@ export async function fetchCampaignProfileScanSlice(
       .range(offset, offset + limit - 1);
     if (error) {
       console.error("[campaign scan marketing_opt_in]", error.message);
+      if (opts?.throwOnError) throw new Error(`target_scan_failed:${error.message}`);
       return [];
     }
     return (data ?? []).map((r) => String((r as { user_id: string }).user_id)).filter(Boolean);
@@ -61,6 +63,7 @@ export async function fetchCampaignProfileScanSlice(
   const { data, error } = await q;
   if (error) {
     console.error("[campaign scan profiles]", error.message);
+    if (opts?.throwOnError) throw new Error(`target_scan_failed:${error.message}`);
     return [];
   }
   return (data ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
diff --git a/lib/admin/notification-campaigns/claim-scheduled-campaign.ts b/lib/admin/notification-campaigns/claim-scheduled-campaign.ts
index b5cfe1f6..7e2da796 100644
--- a/lib/admin/notification-campaigns/claim-scheduled-campaign.ts
+++ b/lib/admin/notification-campaigns/claim-scheduled-campaign.ts
@@ -59,6 +59,7 @@ export async function drainNotificationCampaignSendBatches(
   skipped: number;
   failed: number;
   error?: string;
+  slowestBatchMs?: number;
 }> {
   const { getCampaignOccurrence } = await import(
     "@/lib/admin/notification-campaigns/campaign-occurrence-service"
@@ -171,9 +172,14 @@ export async function drainNotificationCampaignSendBatches(
   let skipped = 0;
   let failed = 0;
   let done = false;
+  let slowestBatchMs = 0;
 
-  while (batches < maxBatches && Date.now() - started < maxWallMs) {
+  // U1-B: never start a batch that is not expected to finish inside the wall budget
+  // (a batch killed by the platform timeout loses its offset and re-runs).
+  while (batches < maxBatches && (batches === 0 || Date.now() - started + slowestBatchMs <= maxWallMs)) {
+    const batchStarted = Date.now();
     const result = await runNotificationCampaignSendBatch(svc, occurrenceId);
+    slowestBatchMs = Math.max(slowestBatchMs, Date.now() - batchStarted);
     batches += 1;
     if (!result.ok) {
       await svc
@@ -200,7 +206,56 @@ export async function drainNotificationCampaignSendBatches(
     if (done) break;
   }
 
-  return { ok: true, done, batches, sent, skipped, failed };
+  return { ok: true, done, batches, sent, skipped, failed, slowestBatchMs };
+}
+
+/** Transient batch errors that a later continuation may succeed on. */
+export const CAMPAIGN_CONTINUABLE_ERRORS = new Set(["target_scan_failed", "targets_query_failed"]);
+
+/**
+ * U1-B: hand an unfinished occurrence back to the scheduled dispatcher (existing cron + claim RPC).
+ * Only the holder of `claimToken` can release; `scheduled_for` keeps its value or becomes now.
+ */
+export async function releaseOccurrenceForContinuation(
+  svc: SupabaseClient,
+  occurrenceId: string,
+  claimToken: string,
+  lastError?: string | null
+): Promise<boolean> {
+  const now = new Date().toISOString();
+  const { data: occ } = await svc
+    .from("admin_notification_campaign_occurrences")
+    .select("scheduled_for")
+    .eq("id", occurrenceId)
+    .maybeSingle();
+  const { data, error } = await svc
+    .from("admin_notification_campaign_occurrences")
+    .update({
+      status: "queued",
+      scheduled_for: (occ as { scheduled_for?: string | null } | null)?.scheduled_for ?? now,
+      send_claim_token: null,
+      send_claimed_at: null,
+      send_lease_expires_at: null,
+      ...(lastError ? { last_error: lastError } : {}),
+      updated_at: now,
+    })
+    .eq("id", occurrenceId)
+    .eq("status", "sending")
+    .eq("send_claim_token", claimToken)
+    .select("id");
+  return !error && Array.isArray(data) && data.length > 0;
+}
+
+/**
+ * U1-B: an immediate occurrence claimed by a manual send gets a due time so that, if the
+ * request dies, the existing lease reclaim + scheduled cron resume it instead of stranding it.
+ */
+export async function stampOccurrenceDueForRecovery(svc: SupabaseClient, occurrenceId: string): Promise<void> {
+  await svc
+    .from("admin_notification_campaign_occurrences")
+    .update({ scheduled_for: new Date().toISOString() })
+    .eq("id", occurrenceId)
+    .is("scheduled_for", null);
 }
 
 export async function scheduleNextRecurringOccurrence(
@@ -294,5 +349,24 @@ export async function scheduleNextRecurringOccurrence(
     campaign: snapshot,
   });
 
+  // Only a freshly created (queued) occurrence re-arms targets; an existing row returned by the
+  // idempotent RPC must not touch target state.
+  if (ensured.ok && ensured.occurrence.status === "queued" && String(row.target_type) === "selected_users") {
+    // U1-B: recurring selected-users occurrences reuse the campaign's existing target rows
+    // (one row per campaign+user) — only rows still bound to an earlier occurrence are re-armed.
+    await svc
+      .from("admin_notification_campaign_targets")
+      .update({
+        occurrence_id: ensured.occurrence.id,
+        status: "pending",
+        failure_reason: null,
+        skip_reason: null,
+        notification_event_id: null,
+        sent_at: null,
+      })
+      .eq("campaign_id", campaignId)
+      .neq("occurrence_id", ensured.occurrence.id);
+  }
+
   return ensured.ok ? ensured.occurrence : null;
 }
diff --git a/lib/admin/notification-campaigns/run-campaign-send-batch.ts b/lib/admin/notification-campaigns/run-campaign-send-batch.ts
index e11f46ec..355bbd34 100644
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
@@ -183,14 +180,40 @@ export async function runNotificationCampaignSendBatch(
     }
     scannedRaw = (pending ?? []).map((r) => String((r as { user_id: string }).user_id)).filter(Boolean);
   } else {
-    scannedRaw = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, NOTIFICATION_CAMPAIGN_BATCH_SIZE);
+    // U1-B: a failed scan is an error, never "no more targets".
+    try {
+      scannedRaw = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, NOTIFICATION_CAMPAIGN_BATCH_SIZE, {
+        throwOnError: true,
+      });
+    } catch {
+      return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: "target_scan_failed" };
+    }
     if (scannedRaw.length === 0) {
-      await refreshOccurrenceMetrics(svc, occurrenceId);
+      await refreshOccurrenceMetrics(svc, occurrenceId, { terminal: true });
       return { ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, done: true };
     }
     nextOffset += scannedRaw.length;
   }
 
+  // U1-B: per-user idempotency for scan re-runs (lease expiry / killed process). Users already
+  // recorded for THIS occurrence in admin_notification_campaign_targets are not sent again.
+  // selected_users needs no extra query: it only ever reads `pending` rows.
+  const alreadyProcessed = new Set<string>();
+  if (campaign.target_type !== "selected_users" && scannedRaw.length) {
+    const { data: doneRows, error: doneErr } = await svc
+      .from("admin_notification_campaign_targets")
+      .select("user_id")
+      .eq("campaign_id", campaign.id)
+      .eq("occurrence_id", occurrenceId)
+      .in("status", ["sent", "skipped", "failed"])
+      .in("user_id", scannedRaw);
+    if (doneErr) {
+      return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: "targets_query_failed" };
+    }
+    for (const r of doneRows ?? []) alreadyProcessed.add(String((r as { user_id: string }).user_id));
+  }
+  const dedupeScope = String(occurrence.trigger_type ?? "") === "recurring" ? "occurrence" : "campaign";
+
   const maps = await loadCampaignSettingsMaps(svc, scannedRaw);
 
   let sent = 0;
@@ -198,6 +221,7 @@ export async function runNotificationCampaignSendBatch(
   let failed = 0;
 
   for (const userId of scannedRaw) {
+    if (alreadyProcessed.has(userId)) continue;
     const eligibility = evaluateCampaignUserEligibility(campaign.type, userId, maps);
     if (!eligibility.eligible) {
       skipped += 1;
@@ -224,7 +248,10 @@ export async function runNotificationCampaignSendBatch(
       continue;
     }
 
-    const result = await sendCampaignToUser(svc, campaign, occurrenceId, userId, maps);
+    const result =
+      dedupeScope === "occurrence"
+        ? await sendCampaignToUser(svc, campaign, occurrenceId, userId, maps, { dedupeScope })
+        : await sendCampaignToUser(svc, campaign, occurrenceId, userId, maps);
     if (result.sent) sent += 1;
     else if (result.skipped) skipped += 1;
     else if (result.failed) failed += 1;
@@ -234,32 +261,41 @@ export async function runNotificationCampaignSendBatch(
 
   let done = false;
   if (campaign.target_type === "selected_users") {
-    const { count } = await svc
+    const { count, error: countErr } = await svc
       .from("admin_notification_campaign_targets")
       .select("id", { count: "exact", head: true })
       .eq("occurrence_id", occurrenceId)
       .eq("status", "pending");
+    // U1-B: count failure must not be read as "done".
+    if (countErr) {
+      return { ok: false, processed: scannedRaw.length, sent, skipped, failed, done: false, error: "targets_query_failed" };
+    }
     done = (count ?? 0) === 0;
   } else {
-    const peek = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, 1);
+    let peek: string[] = [];
+    try {
+      peek = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, 1, { throwOnError: true });
+    } catch {
+      // progress so far is persisted below via offset; next run resumes
+      await svc
+        .from("admin_notification_campaign_occurrences")
+        .update({ send_progress_offset: nextOffset, updated_at: now })
+        .eq("id", occurrenceId);
+      return { ok: false, processed: scannedRaw.length, sent, skipped, failed, done: false, error: "target_scan_failed" };
+    }
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
 
-  await refreshOccurrenceMetrics(svc, occurrenceId);
+  await refreshOccurrenceMetrics(svc, occurrenceId, { terminal: done });
 
   return { ok: true, processed, sent, skipped, failed, done };
 }
@@ -281,6 +317,15 @@ export async function runNotificationCampaignTestSend(
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
@@ -296,6 +341,6 @@ export async function runNotificationCampaignTestSend(
     else if (result.failed) failed += 1;
   }
 
-  await refreshOccurrenceMetrics(svc, occurrenceId);
+  await refreshOccurrenceMetrics(svc, occurrenceId, { terminal: true });
   return { ok: true, sent, skipped, failed };
 }
```

## 부록 B — 신규 격리 테스트 소스 (구현 시 정식 테스트로 추가)

### zz-u1ab-scenarios
```ts
/* TEMPORARY isolated scenario suite for U1-A + U1-B design (worktree only). */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type DB = Record<string, Row[]> & { __fail?: Record<string, number> };

const sendCampaignToUser = vi.fn();
vi.mock("@/lib/admin/notification-campaigns/campaign-send-user", () => ({
  sendCampaignToUser: (...args: unknown[]) => sendCampaignToUser(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-eligibility", () => ({
  loadCampaignSettingsMaps: async () => ({}),
  evaluateCampaignUserEligibility: () => ({ eligible: true }),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-source-authority", () => ({
  evaluateOfficialCampaignSendEligibility: async () => ({ ok: true }),
}));

class Q {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "update" | "upsert" | "insert" = "select";
  private patch: Row | Row[] | null = null;
  private countHead = false;
  private from_ = 0;
  private to_ = Number.MAX_SAFE_INTEGER;
  private orderKey: string | null = null;
  private single = false;
  constructor(private db: DB, private table: string) { db[table] ??= []; }
  select(_c?: string, opts?: { count?: string; head?: boolean }) { if (opts?.head) this.countHead = true; return this; }
  eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
  neq(k: string, v: unknown) { this.filters.push((r) => r[k] != null && r[k] !== v); return this; }
  is(k: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) === v); return this; }
  in(k: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
  gte() { return this; }
  order(k: string) { this.orderKey = k; return this; }
  range(a: number, b: number) { this.from_ = a; this.to_ = b; return this; }
  limit(n: number) { this.to_ = this.from_ + n - 1; return this; }
  maybeSingle() { this.single = true; return this; }
  update(p: Row) { this.op = "update"; this.patch = p; return this; }
  upsert(p: Row | Row[]) { this.op = "upsert"; this.patch = p; return this; }
  insert(p: Row) { this.op = "insert"; this.patch = p; return this; }
  then(resolve: (v: unknown) => void) {
    const f = this.db.__fail?.[`${this.table}:${this.op}`];
    if (f && f > 0) { this.db.__fail![`${this.table}:${this.op}`] = f - 1; return resolve({ data: null, count: null, error: { message: "injected" } }); }
    const match = this.db[this.table].filter((r) => this.filters.every((fn) => fn(r)));
    if (this.op === "update") { for (const r of match) Object.assign(r, this.patch); return resolve({ data: match.map((r) => ({ id: r.id })), error: null }); }
    if (this.op === "upsert") {
      for (const p of Array.isArray(this.patch) ? this.patch : [this.patch!]) {
        const ex = this.db[this.table].find((r) => r.campaign_id === p.campaign_id && r.user_id === p.user_id);
        if (ex) Object.assign(ex, p); else this.db[this.table].push({ ...p });
      }
      return resolve({ error: null });
    }
    if (this.op === "insert") { this.db[this.table].push({ ...(this.patch as Row) }); return resolve({ data: { id: "x" }, error: null }); }
    let rows = match;
    if (this.orderKey) { const k = this.orderKey; rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1)); }
    rows = rows.slice(this.from_, this.to_ + 1);
    if (this.countHead) return resolve({ count: rows.length, error: null });
    if (this.single) return resolve({ data: rows[0] ?? null, error: null });
    return resolve({ data: rows, error: null });
  }
}
const svcOf = (db: DB) => ({ from: (t: string) => new Q(db, t) }) as never;

function makeDb(o: { users?: number; targetType?: string; sendMode?: string; trigger?: string; occStatus?: string; selected?: number }): DB {
  const tt = o.targetType ?? "all";
  const db: DB = {
    profiles: Array.from({ length: o.users ?? 0 }, (_, i) => ({ id: `u${String(i).padStart(4, "0")}` })),
    admin_notification_campaigns: [{ id: "camp-1", type: "notice", target_type: tt, title: "t", body: "b", channel: "in_app_only",
      target_payload: {}, status: o.sendMode === "recurring" ? "active" : o.sendMode === "scheduled" ? "scheduled" : "draft", send_mode: o.sendMode ?? "immediate" }],
    admin_notification_campaign_occurrences: [{ id: "occ-1", campaign_id: "camp-1", sequence_number: 1, trigger_type: o.trigger ?? "immediate",
      status: o.occStatus ?? "sending", send_claim_token: "tok-1", scheduled_for: null, send_progress_offset: 0, started_at: "2026-01-01",
      content_snapshot: { title: "t", body: "b", type: "notice", channel: "in_app_only", target_type: tt } }],
    admin_notification_campaign_targets: [],
    notification_campaign_deliveries: [],
  };
  for (let i = 0; i < (o.selected ?? 0); i++) db.admin_notification_campaign_targets.push({ campaign_id: "camp-1", occurrence_id: "occ-1", user_id: `s${i}`, status: "pending" });
  return db;
}

/** mirrors real sendCampaignToUser side effects: delivery row + target row per user */
function sendImpl(db: DB, failIf?: (u: string) => boolean) {
  return async (_s: unknown, _c: unknown, occ: string, userId: string) => {
    const fail = failIf ? failIf(String(userId)) : false;
    db.notification_campaign_deliveries.push({ occurrence_id: occ, user_id: userId, channel: "in_app", status: fail ? "failed" : "sent" });
    const t = db.admin_notification_campaign_targets.find((r) => r.user_id === userId);
    const st = { status: fail ? "failed" : "sent", occurrence_id: occ };
    if (t) Object.assign(t, st); else db.admin_notification_campaign_targets.push({ campaign_id: "camp-1", user_id: userId, ...st });
    return { ok: !fail, sent: !fail, skipped: false, failed: fail };
  };
}
const occ = (db: DB) => db.admin_notification_campaign_occurrences[0];
const camp = (db: DB) => db.admin_notification_campaigns[0];
const sentUsers = () => sendCampaignToUser.mock.calls.map((c) => c[3] as string);

async function runToCompletion(db: DB, maxRuns = 10) {
  const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
  let r: Awaited<ReturnType<typeof runNotificationCampaignSendBatch>> | null = null;
  for (let i = 0; i < maxRuns; i++) {
    r = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    if (!r.ok || r.done) break;
  }
  return r!;
}

describe("U1-A+B scenario matrix (isolated)", () => {
  beforeEach(() => { sendCampaignToUser.mockReset(); vi.useRealTimers(); });

  for (const n of [1, 80, 120, 121, 250]) {
    it(`all-target ${n} users: every user exactly once, terminal sent, campaign synced`, async () => {
      const db = makeDb({ users: n });
      sendCampaignToUser.mockImplementation(sendImpl(db));
      const r = await runToCompletion(db);
      expect(r.ok).toBe(true);
      expect(r.done).toBe(true);
      expect(sentUsers().length).toBe(n);
      expect(new Set(sentUsers()).size).toBe(n);
      expect(occ(db).status).toBe("sent");
      expect(camp(db).status).toBe("sent");
    });
  }

  it("selected 250: exactly once, terminal", async () => {
    const db = makeDb({ targetType: "selected_users", selected: 250 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    const r = await runToCompletion(db);
    expect(r.done).toBe(true);
    expect(new Set(sentUsers()).size).toBe(250);
    expect(sentUsers().length).toBe(250);
    expect(occ(db).status).toBe("sent");
  });

  it("partial failure -> partially_failed; all failure -> failed", async () => {
    const a = makeDb({ users: 130 });
    sendCampaignToUser.mockImplementation(sendImpl(a, (u) => u.endsWith("7")));
    await runToCompletion(a);
    expect(occ(a).status).toBe("partially_failed");
    expect(camp(a).status).toBe("partially_failed");
    sendCampaignToUser.mockReset();
    const b = makeDb({ users: 3 });
    sendCampaignToUser.mockImplementation(sendImpl(b, () => true));
    await runToCompletion(b);
    expect(occ(b).status).toBe("failed");
  });

  it("recurring: campaign stays active; occurrence dedupe scope passed", async () => {
    const db = makeDb({ users: 5, sendMode: "recurring", trigger: "recurring" });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    await runToCompletion(db);
    expect(camp(db).status).toBe("active");
    expect(sendCampaignToUser.mock.calls[0][5]).toEqual({ dedupeScope: "occurrence" });
  });

  it("scheduled: scheduled -> sent; non-recurring call shape unchanged (5 args)", async () => {
    const db = makeDb({ users: 5, sendMode: "scheduled", trigger: "scheduled" });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    await runToCompletion(db);
    expect(camp(db).status).toBe("sent");
    expect(sendCampaignToUser.mock.calls[0].length).toBe(5);
  });

  it("test send: test occurrence closes, campaign untouched", async () => {
    const db = makeDb({ trigger: "test", occStatus: "queued" });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    const { runNotificationCampaignTestSend } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    await runNotificationCampaignTestSend(svcOf(db), "camp-1", "occ-1", ["t1"]);
    expect(occ(db).status).toBe("sent");
    expect(camp(db).status).toBe("draft");
  });

  it("killed mid-batch (offset not saved) then resumed: no user sent twice, nobody missed", async () => {
    const db = makeDb({ users: 250 });
    let calls = 0;
    const base = sendImpl(db);
    sendCampaignToUser.mockImplementation(async (...a: unknown[]) => {
      calls += 1;
      if (calls === 61) throw new Error("process killed"); // dies in the middle of batch 1
      return (base as (...x: unknown[]) => Promise<unknown>)(...a);
    });
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    await expect(runNotificationCampaignSendBatch(svcOf(db), "occ-1")).rejects.toThrow("process killed");
    expect(occ(db).send_progress_offset).toBe(0); // offset lost, like a real kill
    const r = await runToCompletion(db);
    expect(r.done).toBe(true);
    const delivered = db.notification_campaign_deliveries.map((d) => d.user_id);
    expect(delivered.length).toBe(250);
    expect(new Set(delivered).size).toBe(250);
  });

  it("DB scan error is not treated as completion; resume finishes", async () => {
    const db = makeDb({ users: 250 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    await runNotificationCampaignSendBatch(svcOf(db), "occ-1"); // batch 1 ok
    db.__fail = { "profiles:select": 1 };
    const r2 = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe("target_scan_failed");
    expect(occ(db).status).toBe("sending");
    const r3 = await runToCompletion(db);
    expect(r3.done).toBe(true);
    expect(new Set(sentUsers()).size).toBe(250);
    expect(occ(db).status).toBe("sent");
  });

  it("selected pending-count error is not completion", async () => {
    const db = makeDb({ targetType: "selected_users", selected: 5 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    db.__fail = { "admin_notification_campaign_targets:select": 2 }; // pending read ok? first select = pending list
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    const r = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r.ok).toBe(false);
    expect(occ(db).status).toBe("sending");
  });

  it("delivery-metrics read error leaves occurrence non-terminal (no false sent); next run closes", async () => {
    const db = makeDb({ users: 10 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    db.__fail = { "notification_campaign_deliveries:select": 1 };
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    const r1 = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r1.done).toBe(true);
    expect(occ(db).status).toBe("sending");
    const r2 = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r2.done).toBe(true);
    expect(occ(db).status).toBe("sent");
    expect(sentUsers().length).toBe(10);
  });

  it("provider failure is recorded as failure, not sent", async () => {
    const db = makeDb({ users: 4 });
    sendCampaignToUser.mockImplementation(sendImpl(db, (u) => u === "u0002"));
    await runToCompletion(db);
    expect(occ(db).status).toBe("partially_failed");
  });

  it("continuation release: only the claim holder releases; due time set; status queued", async () => {
    const db = makeDb({ users: 1 });
    const { releaseOccurrenceForContinuation } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    expect(await releaseOccurrenceForContinuation(svcOf(db), "occ-1", "other-token")).toBe(false);
    expect(occ(db).status).toBe("sending");
    expect(await releaseOccurrenceForContinuation(svcOf(db), "occ-1", "tok-1")).toBe(true);
    expect(occ(db).status).toBe("queued");
    expect(occ(db).scheduled_for).toBeTruthy();
    expect(occ(db).send_claim_token).toBeNull();
  });

  it("drain stops before a batch that would not fit the wall budget", async () => {
    const db = makeDb({ users: 500 });
    const base = sendImpl(db);
    let t = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => t);
    sendCampaignToUser.mockImplementation(async (...a: unknown[]) => { t += 100; return (base as (...x: unknown[]) => Promise<unknown>)(...a); }); // 120 users = 12s
    const { drainNotificationCampaignSendBatches } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    const d = await drainNotificationCampaignSendBatches(svcOf(db), "occ-1", { maxBatches: 10, maxWallMs: 20_000 });
    nowSpy.mockRestore();
    expect(d.ok).toBe(true);
    expect(d.batches).toBe(1); // 12s used; next 12s batch would exceed 20s
    expect(d.done).toBe(false);
  });

  function recurringSelectedDb() {
    const db = makeDb({ targetType: "selected_users", selected: 3, sendMode: "recurring", trigger: "recurring" });
    Object.assign(camp(db), { recurrence_kind: "daily", recurrence_time: "09:00", recurrence_timezone: "Asia/Seoul",
      recurrence_start_at: "2026-01-01T00:00:00Z", recurrence_end_at: null, recurrence_max_count: null, recurrence_weekday: null, status: "active" });
    for (const t of db.admin_notification_campaign_targets) t.status = "sent";
    Object.assign(occ(db), { status: "sent", scheduled_for: "2026-01-02T00:00:00Z", completed_at: "2026-01-02T00:05:00Z" });
    return db;
  }

  it("recurring selected_users: NEW (queued) next occurrence re-arms existing targets as pending", async () => {
    const db = recurringSelectedDb();
    const rpc = vi.fn(async () => ({ data: { id: "occ-2", campaign_id: "camp-1", sequence_number: 2, status: "queued" }, error: null }));
    const { scheduleNextRecurringOccurrence } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    const next = await scheduleNextRecurringOccurrence({ from: (t: string) => new Q(db, t), rpc } as never, "camp-1");
    expect(next?.id).toBe("occ-2");
    expect(db.admin_notification_campaign_targets.every((t) => t.status === "pending" && t.occurrence_id === "occ-2")).toBe(true);
  });

  it("recurring: idempotent RPC returning an EXISTING sent occurrence (stalled QA case) changes nothing", async () => {
    const db = recurringSelectedDb();
    const rpc = vi.fn(async () => ({ data: { id: "occ-1", campaign_id: "camp-1", sequence_number: 1, status: "sent" }, error: null }));
    const { scheduleNextRecurringOccurrence } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    await scheduleNextRecurringOccurrence({ from: (t: string) => new Q(db, t), rpc } as never, "camp-1");
    expect(db.admin_notification_campaign_targets.every((t) => t.status === "sent" && t.occurrence_id === "occ-1")).toBe(true);
    expect(camp(db).status).toBe("active");
  });
});
```

### zz-u1b-senduser
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationEvent = vi.fn();
const dispatchPushForUser = vi.fn();
const loadActivePushTargets = vi.fn();
const evaluateCampaignPushGate = vi.fn();
const recordCampaignDelivery = vi.fn();
const resolveCampaignUserAppState = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: (...args: unknown[]) => createNotificationEvent(...args),
}));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...args),
}));
vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/notification-campaigns/campaign-eligibility")>();
  return {
    ...actual,
    evaluateCampaignPushGate: (...args: unknown[]) => evaluateCampaignPushGate(...args),
  };
});
vi.mock("@/lib/admin/notification-campaigns/campaign-delivery-recorder", () => ({
  recordCampaignDelivery: (...args: unknown[]) => recordCampaignDelivery(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-presence", () => ({
  resolveCampaignUserAppState: (...args: unknown[]) => resolveCampaignUserAppState(...args),
}));
vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  fetchDomainBadgeAuthorityPayload: async () => ({
    projection: { appIconTotal: 0, bellTotal: 0 },
  }),
}));

const baseCampaign = {
  id: "camp-1",
  type: "notice" as const,
  target_type: "all",
  title: "Hello",
  body: "World",
  channel: "push_and_in_app" as const,
  target_url: null,
  image_url: null,
  deeplink_url: "/notifications",
  web_url: null,
  push_image_url: null,
  in_app_image_url: "https://cdn.example/inapp.jpg",
  priority: "normal" as const,
  visibility_policy: "default" as const,
  target_payload: null,
  segment_region_code: null,
  send_progress_offset: 0,
  status: "sending",
  sent_count: 0,
  skipped_count: 0,
  failed_count: 0,
  target_count: 0,
};

const maps = { notif: new Map(), prefs: new Map() };
const occurrenceId = "occ-1";

function svcMock(deviceRows: unknown[] = []) {
  return {
    from(table: string) {
      if (table === "user_devices") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: deviceRows, error: null }),
            }),
          }),
        };
      }
      return {
        from: () => ({ upsert: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      };
    },
  };
}

function svcWithEvents(existingEventId: string | null) {
  const base = svcMock([]);
  return {
    from(table: string) {
      if (table === "notification_events") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: existingEventId ? { id: existingEventId } : null, error: null }),
        };
        return q;
      }
      return base.from(table);
    },
  };
}

describe("U1-B duplicate re-run push dedupe (isolated)", () => {
  beforeEach(() => {
    vi.resetModules();
    createNotificationEvent.mockReset();
    dispatchPushForUser.mockReset();
    loadActivePushTargets.mockReset();
    evaluateCampaignPushGate.mockReset();
    recordCampaignDelivery.mockReset();
    resolveCampaignUserAppState.mockReset();
    recordCampaignDelivery.mockResolvedValue("del-1");
    resolveCampaignUserAppState.mockResolvedValue("background");
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null });
    dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 1, deliveries: [{ status: "skipped", device_id: "dev-1", provider_response: { reason: "duplicate_delivery" } }] });
  });

  it("re-run after in-app duplicate dispatches push WITH the existing event id (device-level dedupe applies)", async () => {
    createNotificationEvent.mockResolvedValue({ ok: false, duplicate: true, error: "duplicate" });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    await sendCampaignToUser(svcWithEvents("evt-existing") as never, baseCampaign, occurrenceId, "u1", maps);
    expect(dispatchPushForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ notification_event_id: "evt-existing" })
    );
  });

  it("dedupe key: default campaign scope unchanged; occurrence scope for recurring", async () => {
    createNotificationEvent.mockResolvedValue({ ok: true, row: { id: "e1" } });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    await sendCampaignToUser(svcWithEvents(null) as never, { ...baseCampaign, channel: "in_app_only" }, occurrenceId, "u1", maps);
    expect(createNotificationEvent.mock.calls[0][1].dedupeKey).toBe("admin_campaign:camp-1:u1");
    await sendCampaignToUser(svcWithEvents(null) as never, { ...baseCampaign, channel: "in_app_only" }, occurrenceId, "u1", maps, { dedupeScope: "occurrence" });
    expect(createNotificationEvent.mock.calls[1][1].dedupeKey).toBe("admin_campaign:camp-1:occ-1:u1");
  });
});
```
