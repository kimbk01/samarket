# Legacy × DIBAY — Gap Analysis (FIX 후보만)

**Status:** PHASE 2 DRAFT — 2026-08-02 (후보만 · 승인 대기)  
**NOT declared:** KEEP/REVERT/FIX 확정 · 코드 수정 · HARD LOCK · CONTRACT/RUNTIME/PRODUCT PASS  

| 선언 | 상태 |
|------|------|
| PHASE 0 Contract Wire | ✅ CODE PASS |
| PHASE 1A Legacy Availability | ✅ **NOT FOUND** (증거 확정) |
| PHASE 1B Legacy Evidence Collection | ⏭️ SKIPPED (1A NOT FOUND) |
| PHASE 2 Gap (본 문서) | ✅ 후보 기입 → **STOP · 사용자 승인 대기** |
| 코드 FIX | ⏸️ 승인 전 금지 |

**PHASE 1A 증거 경로**

`.qa-logs/badge-legacy-ux/phase1a-availability-20260802-133641/VERDICT.txt`

**전제 (헌장 우선순위)**

1. 사용자 승인 명시 계약  
2. Legacy UX — **부재 (1A NOT FOUND)** → 2번 축 증거 없음  
3. 현재 DIBAY  

→ Gap 비교축 = **사용자 승인 계약 ↔ DIBAY 관찰**. Legacy UX 행은 `N/A (NOT FOUND)` 로만 표기.  
현재 DIBAY를 Legacy로 간주하지 않음.

관련: [`notification-legacy-audit.md`](./notification-legacy-audit.md) · [`notification-legacy-ux-product-contract.md`](./notification-legacy-ux-product-contract.md)

---

## 제품 계약 우선순위 (변경 금지)

| 순위 | 기준 |
|------|------|
| **1** | 사용자 승인 명시 계약 |
| **2** | Legacy UX 실측 — 본 프로젝트에서 **가용 증거 없음** |
| **3** | 현재 DIBAY 구현 |

---

## PHASE 1A 결과 (FACT)

| 항목 | 관찰 |
|------|------|
| 결과 | **NOT FOUND** |
| 기기 패키지 | `com.dibay.app` only (Xiaomi · Samsung) |
| 별도 Legacy 패키지 | 없음 |
| 발견된 APK | `com.dibay.app` debug/perf 빌드만 — **Legacy 제품 아님** |
| Legacy IPA | 없음 |
| Git 태그 `pre-conversation-engine-legacy-removal` | 코드 이력 태그 — Badge Legacy 앱 아님 |
| 설치 가능한 Legacy Badge 앱 | 없음 |

PHASE 1B: **수행하지 않음**.

---

## 판정 칸

| 사용자 승인 계약 | DIBAY | 판정 (후보) |
|------------------|-------|-------------|
| 동일 (wire 일치) | 동일 | **KEEP** |
| 계약 있음 · DIBAY 불일치 | — | **FIX 후보** |
| Badge 범위 밖 확장 | — | **REVERT 후보** |

Legacy UX 열은 1A 이후 전부 `N/A (NOT FOUND)`.

---

## Gap 표 — 사용자 승인 계약 ↔ DIBAY

| ID | 계약 (1순위) | Legacy | DIBAY (코드/PHASE0 관찰) | 판정 후보 | 증거 | 승인 |
|----|--------------|--------|---------------------------|-----------|------|------|
| G-AB-01 | Member Bell = A_member (chat·missed·store intake 제외) | N/A (NOT FOUND) | digit = `notificationAttentionTotal` / attention projection 제외 집합 | **KEEP** | PHASE0 wire · vitest attention | PENDING |
| G-AB-02 | Bell list = 동일 A 제외 집합 | N/A | Tier1 `excludeChat`+`excludeOwner`+`excludeMissed` → fetch/server | **KEEP** | PHASE0 BUG-01 | PENDING |
| G-AB-03 | Member App Icon = A + GD+Group+Trade+Customer + orphan; Owner∉ | N/A | builder + `memberAppIconRoomCount` · customer-only store axis | **KEEP** | PHASE0 · R6 | PENDING |
| G-AB-04 | orphan missed ∈ App Icon · ∉ Bell | N/A | HTTP `orphanMissedCallCount` → client `memberMissedCallCount` | **KEEP** | PHASE0 BUG-02 · orphan wire test | PENDING |
| G-AB-05 | Store intake / Owner chat → Member Bell·App Icon +0; 기존 Store 표면 | N/A | intake classify exclude; no Store Projection module | **KEEP** | PHASE0 · storeOperational=0 | PENDING |
| G-AB-06 | Store Projection / Authority 신규 금지 | N/A | `member-store-attention` 삭제 · 참조 0 | **KEEP** | rg 0 | PENDING |
| G-AB-07 | Dirty tree Badge-only (Call/RoomUnread/Native 0) | N/A | tracked diff Badge 경로만 | **KEEP** | PHASE0 BUG-03 | PENDING |
| G-MARK-01 | Mark-all이 A만 / missed·rooms·store 유지 (1순위 미확정 시) | N/A | events: missed skip; legacy `notifications`는 owner만 제외 → chat/missed 혼입 **가능** | **FIX 후보** | route.ts mark_all_read legacy filter | PENDING |
| G-LIFE-01 | A Notification Lifecycle (Push→Deep Link→Read→재실행) runtime | N/A | PHASE0 유닛만 · 기기 Lifecycle 미실측 | **FIX 후보** (검증 과제 · 코드 변경 아님) | runtime 미착수 | PENDING |
| G-LIFE-02 | B Communication Lifecycle runtime | N/A | 동일 | **FIX 후보** (검증 과제) | runtime 미착수 | PENDING |

---

## Atomic Change 권고 (승인 후 · 지금 구현 금지)

| 순서 | 범위 | 후보 |
|------|------|------|
| PHASE 3 | A Notification Lifecycle | G-MARK-01 (승인 시) + G-LIFE-01 검증 |
| PHASE 4 | B Communication Lifecycle | G-LIFE-02 검증 |
| — | Call / RoomUnread / Native / Store Projection | 수정 금지 |

---

## STOP

PHASE 2 후보 기입 완료. **사용자 승인 전 코드 수정 금지.**

승인 시 지시 예:

- `G-MARK-01 승인` / `G-MARK-01 보류`  
- `G-AB-* KEEP 일괄 승인`  
- `PHASE3 Atomic Change 시작` (승인된 FIX만)
