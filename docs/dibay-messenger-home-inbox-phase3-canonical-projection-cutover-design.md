# DIBAY Messenger Home Inbox — Phase 3 Canonical Projection Cutover Design

> **상태:** 설계 (코드 미착수) — 2026-07-13  
> **선행 판정:** Phase 2 **SHADOW READY** ✅  
> **이번 문서 범위:** Cutover 설계만. 구현·커밋·푸시 없음.

---

## 0. 공식 판정 (Phase 2 종료)

```text
COLD CLASSIFICATION RESOLVED
REALTIME PASS
SHADOW READY
```

### Phase 2 완료 항목 (고정 · 재수정 금지)

| 영역 | 판정 |
|------|------|
| Cold Classification | ✅ RESOLVED |
| Lite/Critical Tier Parity | ✅ |
| Bootstrap Classification | ✅ |
| Shadow Pipeline | ✅ |
| Realtime | ✅ PASS |
| Incoming Unread | ✅ PASS (교정 Harness) |
| Read Decrease | ✅ |
| Multi-tab | ✅ |
| STORE_DIFF | ✅ 0 |
| Phantom Room | ✅ 0 |
| API Delta | ✅ 0 추가 |
| Subscription Delta | ✅ 0 추가 |

### Gate A 정정 (Measurement Invalid → PASS)

이전 Gate A FAIL은 **제품 결함이 아님**. QA Harness가 **단일 `browserContext`에서 `addCookies`를 두 계정에 연속 호출**하여 관찰 탭(aaaa) 세션이 발신 탭(qqqq)으로 덮어써진 **Measurement Invalid**였다.

교정 Harness(계정별 분리 context)에서 확인:

```text
DB participant unread 증가
participant UPDATE realtime 수신
Legacy unread parity
Canonical unread parity
Bucket 유지 (trade)
UNEXPLAINED = 0
room-read 자동 호출 0건
```

증거: `.qa-logs/cm-gate-a-audit.json` · 교정 스크립트 `.qa-logs/.tmp-gate-a-audit.mjs`

---

## 1. Phase 3 목표

**Canonical Projection Cutover** — UI가 읽는 홈 인박스 목록·버킷·정렬·unread의 **표시 권위(source of truth)** 를 Legacy `CommunityMessengerBootstrap` 패치 경로에서 **Canonical Pipeline projection** 으로 전환한다.

| Phase 3에서 함 | Phase 3에서 하지 않음 |
|----------------|----------------------|
| UI read path를 Canonical projection으로 전환 | Legacy Writer 제거 |
| Feature flag·dual-run·rollback | Legacy 삭제 |
| Runtime 검증·rollback 기준 운영 | Reducer / Classification / Cache 계약 변경 |
| | DB / API / Realtime 구독 구조 변경 |

**Legacy Writer 제거·Legacy 삭제**는 Phase 3 완료 후 **별도 Cleanup Phase**에서만 수행한다.

---

## 2. 현재 아키텍처 (As-Is)

### 2.1 Dual path

```text
[서버] bootstrap / home-sync / critical / lite / full
         │
         ├─► Legacy path (UI 권위)
         │     applyHomeListPatch → setData(CommunityMessengerBootstrap)
         │     → useCommunityMessengerHomeState → primaryListItems → CommunityMessengerHome
         │
         └─► Canonical path (Shadow · 비표시)
               adapters → reducer → canonical store
               → buildMessengerHomeProjection → shadow diff vs legacy
```

### 2.2 핵심 모듈 (Freeze 대상 — Phase 3 설계 기준선)

| 모듈 | 경로 | 역할 |
|------|------|------|
| Types | `lib/community-messenger/home/inbox-pipeline/types.ts` | `CanonicalMessengerHomeRoom`, `MessengerHomeProjection`, event source |
| Adapters | `inbox-pipeline/adapters.ts` | `RoomSummary` / critical row → canonical patch |
| Reducer | `inbox-pipeline/reducer.ts` | generation·source별 merge, pending patch |
| Classification | `inbox-pipeline/classification.ts` | `resolveMessengerHomeBucket` |
| Projection | `inbox-pipeline/projection.ts` | `buildMessengerHomeProjection` → trade/delivery/inbox ids + bucket + unread |
| Shadow | `inbox-pipeline/shadow.ts` | dispatch, legacy snapshot diff, dev bridge |
| Legacy writer | `home-list-patch.ts`, `use-community-messenger-home-bootstrap.ts`, `use-community-messenger-home-realtime-bootstrap-list.ts` | React state + realtime patch |
| UI | `components/community-messenger/CommunityMessengerHome.tsx` | `data` (legacy bootstrap) 소비 |

### 2.3 Shadow 모드 (Phase 2 · dev/test)

- `localStorage samarket:cm-home-shadow-mode`: `null` \| `"shadow"` → shadow dispatch 활성, `"legacy"` → dispatch 비활성
- `window.__DIBAY_MESSENGER_HOME_SHADOW__`: **production 미노출** (`shadow.ts` `installMessengerHomeShadowRuntimeBridge`)
- UI는 Phase 2 종료 시점까지 **항상 Legacy `data`** 를 렌더

### 2.4 Projection 출력 계약

`MessengerHomeProjection`:

```text
tradeRoomIds[]      — dedupe + lifecycle + sort
deliveryRoomIds[]
inboxRoomIds[]      — direct + group, sort
bucketByRoomId      — trade | delivery | direct | group | excluded
unreadByRoomId      — room 단위 message unread count
```

`projection.ts`의 `toRoomSummary()`가 canonical room → `CommunityMessengerRoomSummary` 변환을 이미 제공 — **UI cutover 시 재사용 후보**.

---

## 3. Freeze 선언 (SHADOW READY 이후)

다음은 **안정화 대상**. Phase 3 구현 시 **동작 변경 PR 금지** (read-path wiring·flag만 허용).

```text
Shadow Pipeline (dispatch · compareLegacy · diagnostics)
Reducer (generation merge · pending patch · contextMeta 보호)
Projection (buildMessengerHomeProjection · bucket · dedupe · sort)
Classification (resolveMessengerHomeBucket)
Cache (bootstrap-cache · lite-merge-gate)
Bootstrap merge (critical→lite→full·home-sync)
Realtime Writer (applyHomeListPatch · participant/message realtime)
```

**예외:** Cutover를 위해 **읽기 전용 hook 1개 추가**·**feature flag 분기**·**projection → UI adapter** 는 Freeze 밖(별도 승인).

---

## 4. Legacy 정책

| 항목 | 정책 |
|------|------|
| Legacy Writer | **Rollback 전용** 유지 — 기능 추가·수정 금지 |
| Legacy bootstrap `setData` | Cutover 기간 동안 **병행 실행** (dual-run) |
| `buildLegacyMessengerHomeProjectionSnapshot` | diff·rollback 검증용 유지 |
| Legacy 삭제 | Phase 3 **완료 후** Cleanup Phase |

---

## 5. Dead File (Cleanup Backlog)

| 파일 | 상태 | 조치 |
|------|------|------|
| `lib/community-messenger/home/messenger-home-inbox-pipeline.ts` | **삭제 완료** (`P9_DEAD_MODULE_CONFIRMED` → `P9_CLEANUP_LOCKED`, 2026-07-13) | untracked draft — 런타임 import 0, live 경로 대체 확인 후 제거 |
| `lib/community-messenger/home/__tests__/messenger-home-inbox-pipeline.test.ts` | **삭제 완료** (동일) | 컴파일 불가 draft 전용 테스트 — canonical/live 테스트로 계약 커버 |

---

## 6. Cutover 전략

### 6.1 원칙

1. **표시만 전환** — 이벤트 ingest·reducer·realtime writer는 Freeze 유지.
2. **한 번에 한 축** — trade pillar → delivery → inbox(direct/group) → pillar summary 순 (또는 inverse, 아래 §7).
3. **Dual-run 필수** — Canonical UI 표시 + Legacy 병행 계산 + shadow diff.
4. **Rollback = flag 1줄** — Legacy read path 즉시 복귀.
5. **측정 Harness** — 계정별 **분리 browserContext** 고정 (Gate A 교훈).

### 6.2 Cutover 단계 (고정 순서)

| Step | 이름 | UI read | Legacy write | Shadow diff |
|------|------|---------|--------------|-------------|
| **3-0** | 설계·flag 스캐폴딩 | Legacy | ON | ON |
| **3-1** | Canonical read hook | Legacy (default) | ON | ON · optional `dual` UI |
| **3-2** | Trade pillar cutover | Canonical (trade tab only) | ON | ON · gate |
| **3-3** | Delivery pillar cutover | Canonical (delivery tab) | ON | ON |
| **3-4** | Inbox (direct/group) cutover | Canonical (friends/DM list) | ON | ON |
| **3-5** | Pillar summary·badge read | Canonical aggregates | ON | ON |
| **3-6** | Default flip | Canonical (all sections) | ON | ON (alarm only) |
| **3-7** | Legacy projection UI off | Canonical only | ON (rollback) | optional sample |
| **3-C** | Cleanup Phase (별도) | Canonical | OFF → remove | bridge remove |

**금지:** 3-2와 3-4를 동시 PR · Legacy writer 제거와 UI cutover 동시 · production shadow bridge 노출.

### 6.3 Read path 전환 방식 (설계)

새 hook (가칭 `useMessengerHomeCanonicalProjectionView`):

```text
inputs:  shadowDispatch.peekState() + viewerUserId + pillar/filter (기존 IA)
process: buildMessengerHomeProjection(rooms, viewerUserId)
output:  tradeRoomIds / deliveryRoomIds / inboxRoomIds
         + Map<roomId, CommunityMessengerRoomSummary> (toRoomSummary)
         + unreadByRoomId / bucketByRoomId
```

`useCommunityMessengerHomeState`는 **초기에는** `data`에서 room lookup; cutover 후에는 **canonical map에서 room resolve** (필드 부족 시 legacy row fallback 1회 — pending patch 타이밍만, 영구 dual-merge 아님).

### 6.4 Dual-run 모드

```text
projectionSource = legacy | canonical | dual

legacy    → UI = legacy only (현재)
canonical → UI = canonical only
dual      → UI = canonical, 내부 diff 로그 + UNEXPLAINED 알람 (staging/dev)
```

Production default: `legacy` → 단계별 `canonical` → 최종 `canonical`.  
`dual`은 staging·내부 QA 전용.

---

## 7. Projection 전환 순서 (권장 근거)

| 순서 | 대상 | 이유 |
|------|------|------|
| 1 | **Trade pillar** | Cold classification 검증 집중·dedupe 복잡도 highest · Phase 2.7 완료 |
| 2 | **Delivery pillar** | commerce lifecycle 동일 패턴 · trade와 독립 스모크 |
| 3 | **Inbox (direct/group)** | 친구·DM·그룹 · 필터·검색 결합 |
| 4 | **Pillar summary rows** | unread room count 집계 · 개별 room unread와 분리 검증 완료(Gate A) |
| 5 | **Tab badge / hub resync** | 하단 messenger badge는 **마지막** — Gate A 기준은 room unread이며 badge 정책 변경 금지 |

각 단계 **PASS gate** 통과 전 다음 단계 착수 금지.

---

## 8. Feature Flag

### 8.1 기존 (유지)

| Key | 값 | 의미 |
|-----|-----|------|
| `samarket:cm-home-shadow-mode` | `null` \| `shadow` \| `legacy` | canonical **dispatch** on/off (Phase 2) |

### 8.2 신규 (Phase 3)

| Key | 값 | 의미 |
|-----|-----|------|
| `samarket:cm-home-projection-source` | `legacy` (default) | UI read = legacy bootstrap |
| | `canonical` | UI read = buildMessengerHomeProjection |
| | `dual` | UI = canonical + legacy diff alarm |
| `samarket:cm-home-projection-pillar` | `all` \| `trade` \| `delivery` \| `inbox` | 부분 cutover 스코프 (staging) |

**우선순위:** env / query override (dev only) → localStorage → default `legacy`.

**Production:** `projection-source`는 서버 env 또는 remote config 1곳에서만 변경 (클라 임의 토글 금지). 초기 배포는 **internal cohort** 또는 **staging full flip** 후 prod.

### 8.3 Shadow bridge

Production에서 `__DIBAY_MESSENGER_HOME_SHADOW__` **노출 금지 유지**. Cutover 검증은 staging·Playwright·vitest.

---

## 9. Legacy Projection 비활성화

### 9.1 단계적 비활성화 (UI만)

| 단계 | Legacy UI read | Legacy write (`setData` / `applyHomeListPatch`) |
|------|----------------|--------------------------------------------------|
| 3-1 ~ 3-6 | 점진 OFF (pillar별) | **ON** |
| 3-7 | **OFF** (전 section) | **ON** (rollback) |
| 3-C | OFF | OFF → 코드 제거 |

### 9.2 비활성화 시 유지 항목

- `compareLegacy()` 호출 (sample rate 또는 staging 100%)
- bootstrap cache · silent refresh (데이터 공급은 Legacy writer가 계속 canonical에 feed)
- realtime writer → **양쪽 feed 유지** until 3-C

### 9.3 금지

- Legacy writer 제거를 UI cutover와 동일 PR에 포함
- unread `+1` 패치 · setTimeout refresh · polling으로 cutover 마스킹

---

## 10. Rollback 전략

### 10.1 즉시 Rollback (운영)

```text
1. samarket:cm-home-projection-source = legacy (또는 env ROLLBACK)
2. hard refresh / session flag clear
3. Legacy UI 즉시 복귀 (writer는 중단 없었으므로 state 연속)
```

**목표 복구 시간:** flag 전파 + 클라 reload **< 5분** (배포 없이 가능하도록 설계).

### 10.2 Rollback 후 검증

- Cold load 1회 · trade room bucket `trade` 유지
- Incoming unread 1회 (분리 context Harness)
- UNEXPLAINED = 0 (shadow still on in staging)

### 10.3 Rollback 데이터

Legacy bootstrap cache가 canonical cutover 중에도 갱신되므로 **데이터 손실 없음**. Canonical-only phantom room이 UI에 있었다면 rollback 시 Legacy presence 기준으로 소거.

---

## 11. Runtime 검증 계획

### 11.1 자동 (CI · PR gate)

| 검사 | 명령 / 위치 |
|------|-------------|
| Inbox pipeline unit | `vitest run lib/community-messenger/home/inbox-pipeline/__tests__/` |
| Shadow / classification | `shadow.test.ts`, `classification.test.ts`, `projection-replay.test.ts` |
| Trade classification | `vitest run lib/community-messenger/trade-chat-list/__tests__/trade-room-classification-enrich.test.ts` |
| Messenger home contract | `npm run verify:messenger-home` |
| List owner | `npm run verify:messenger-home-list-owner` |
| Realtime scope | `npm run verify:messenger-realtime-store-scope` |
| Typecheck | `npx tsc --noEmit` |

Phase 3 PR마다 **해당 pillar 관련 테스트만 추가** — 전체 parity 일괄 금지(개발 규정).

### 11.2 Staging Playwright (Cutover gate)

교정 Harness 패턴 필수:

```text
Context A = observer (aaaa) — Home only
Context B = sender (qqqq) — shared room composer
금지: 단일 context + addCookies × 2
```

시나리오 (각 pillar cutover 후):

| ID | 시나리오 | PASS |
|----|----------|------|
| P3-COLD | cold load · trade room bucket | `direct→trade` 0 |
| P3-INC | B→A incoming message | room unread +1 L/C parity |
| P3-READ | A read in room | unread -1 parity |
| P3-SORT | new message | same-bucket sort L/C parity |
| P3-MTAB | two tabs same account | no duplicate room · UNEXPLAINED 0 |
| P3-DIFF | shadow snapshot | UNEXPLAINED = 0 · STORE_DIFF = 0 |

산출물: `.qa-logs/cm-phase3-cutover-<pillar>-YYYYMMDD.json`

### 11.3 Dual-run 알람 (staging `projection-source=dual`)

| 메트릭 | 임계 |
|--------|------|
| `diff.unexplained` | **0** (sustained 30s) |
| `diff.bucket` | 0 |
| `diff.unread` | 0 |
| `diff.sort` | 0 (허용: BOTH_VALID_PRESENTATION_DIFF만) |
| reducer ms / projection ms | Phase 2 baseline +20% 이내 |

### 11.4 수동 스모크 (prod cohort)

- Trade / Delivery / Friends 각 1 room 진입·메시지·뒤로
- 하단 badge **변경 없음** 확인 (정책 변경 아님)
- Pillar summary row tap → 올바른 sub-route

---

## 12. Rollback 기준 (자동·수동)

다음 **하나라도** 발생 시 **즉시 Rollback** (`projection-source=legacy`):

| # | 기준 |
|---|------|
| R1 | Production에서 trade room이 cold 시 `direct`로 표시 (bucket transition) |
| R2 | Incoming unread room count Legacy ≠ Canonical **2회 연속** (교정 Harness) |
| R3 | `UNEXPLAINED > 0` staging dual-run **5분 sustained** |
| R4 | Phantom room (Legacy에 없는 room이 Canonical UI에만 표시) 사용자 보고 + 재현 |
| R5 | `STORE_DIFF` 재발 |
| R6 | API 호출 수 또는 Realtime subscription **증가** (Gate B/C 회귀) |
| R7 | 홈 cold FCP / list-ready **Phase 2 baseline +15%** 초과 (3회 median) |
| R8 | Pillar summary unread가 개별 room 합과 불일치 (집계 bug) |

Rollback 후: 원인 분류·Harness 증거·**Freeze 영역 수정은 별도 승인**.

---

## 13. 위험 및 완화

| 위험 | 완화 |
|------|------|
| pending patch로 canonical room 필드 부족 | UI resolve 시 legacy row 1회 fallback · home-summary merge 기존 경로 |
| pillar별 visible room IO vs projection 전체 불일치 | cutover는 **표시 목록 ids**만 canonical에서 take · subscription 집합은 기존 fingerprint 유지 |
| dual-run perf | projection memo · room map 참조 안정화 (`use-community-messenger-home-state` 패턴) |
| Harness session clobber | 문서화 + CI에서 분리 context 강제 |
| Freeze 위반 | PR checklist · diff path `inbox-pipeline/*` 변경 시 Phase 3 lead 승인 |

---

## 14. Phase 3 완료 정의 (Exit Criteria)

```text
[ ] projection-source=canonical 이 production 100% (cohort 없음)
[ ] trade · delivery · inbox 전 section canonical read
[ ] Legacy UI read OFF (3-7)
[ ] Legacy writer ON 유지 (rollback 5분 이내 검증 1회 PASS)
[ ] P3-COLD · P3-INC · P3-READ · P3-SORT · P3-MTAB 전부 PASS (교정 Harness)
[ ] 7일 staging dual-run UNEXPLAINED=0
[ ] Gate B/C 회귀 없음
[ ] Cleanup Phase 착수 승인 (Legacy writer 제거는 그때)
```

---

## 15. 다음 작업 (이번 문서 이후 · 승인 필요)

1. Feature flag 스캐폴딩 PR (`projection-source` read only, default `legacy`)
2. `useMessengerHomeCanonicalProjectionView` 설계 리뷰
3. Phase 3-2 Trade pillar cutover PR (첫 flip)
4. Playwright P3-* 시나리오를 `.qa-logs` harness로 고정 (분리 context)

**이번 단계에서 수행하지 않음:** 코드 수정 · commit · push · UI cutover · Legacy 삭제.

---

## 16. 참조

| 문서·경로 | 내용 |
|-----------|------|
| `lib/community-messenger/home/inbox-pipeline/` | Canonical pipeline SSOT |
| `.qa-logs/cm-gate-a-audit.json` | Gate A 교정 Harness 증거 |
| `.cursor/rules/chat-detail-bottom-nav-authority.mdc` | 메신저 탭·BottomNav (cutover 시 회귀 금지) |
| `docs/cm-notification-engine-phase3-migration.md` | 타 도메인 Phase 3 shadow→cutover 참고 패턴 |
| `npm run verify:messenger-home` | 홈 verification counter contract |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-13 | Phase 2 SHADOW READY 선언 · Phase 3 Cutover 설계 초안 (코드 없음) |
