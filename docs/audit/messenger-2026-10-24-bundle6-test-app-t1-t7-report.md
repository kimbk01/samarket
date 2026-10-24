# Bundle6 TEST APP T1–T7 실측 보고

`[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)`

- **시각**: 2026-10-24 ≈ 05:03 PHT
- **범위**: Cursor-direct 격리 TEST APP (`:3010`) + dibay-test (`tcwnueuzuxftyomttdyu`)
- **계정**: `bundle6.a@dibay-test.local` / `bundle6.b@dibay-test.local` (admin/test only · Owner OTP 미사용)
- **코드**: WT Bundle6 (`9caa5d443+WT-bundle6`) — **main/Prod/운영 DB 미반영 · STOP**
- **원본 증거**: `tmp/bundle6-ui-t1-t7-report.json` · `tmp/bundle6-ui-evidence/` · `tmp/bundle6-ui-t5-retry.json`

## 격리

| 항목 | 결과 |
|---|---|
| `GET /api/system/supabase-project` | `projectRef=tcwnueuzuxftyomttdyu` PASS |
| 로그인 A/B (cookie `sb-tcwnueuzuxftyomttdyu-auth-token`) | `/api/me/profile` 200 + 친구 탭 UI PASS |

## 결과 요약

| ID | 결과 | 증거 요지 |
|---|---|---|
| T1 | **PASS** | 친구 탭 검색 `bundle6b` → 발송(`targetUserId`) → DB `pending` |
| T2 | **PASS*** | 친구 탭 「받은 친구 요청」뱃지 `1` PASS · **중앙 팝업 Realtime 표시 = NOT_PROVEN** |
| T3 | **PASS** | 닫기/이동 후에도 DB `pending` 유지 + 수신 목록에 요청자 표시 |
| T4 | **PASS** | 목록 수락 PATCH 200 · 상호 `friend` 2행 · A/B 친구 목록 상호 표시 |
| T5 | **PASS** | 목록 거절 PATCH 200 · `rejected` · friend 0 (전체 스위트 중 `Failed to fetch` 1회 → **격리 재실측 PASS**) |
| T6 | **PASS** | reload + 재로그인 후 수신 목록에 요청 복구 |
| T7 | **PASS*** | 상호 friend 2행 + DB refetch 수락 경로 PASS · **중앙 팝업 Realtime = NOT_PROVEN** |
| regression | **PASS** | B가 A를 `blocked` → 발송 `400 blocked_target` |

\* T2/T7 공통: 수신 **목록/뱃지·수락·거절·상호 friend** 는 실측 PASS. 부트스트랩 `data.requests` → 중앙 팝업 큐 적재의 **즉시 표시**는 이번 세션에서 재현되지 않아 NOT_PROVEN (목록 SSOT·DB refetch 복구는 PASS).

## 레이어

| 레이어 | 판정 |
|---|---|
| CODE (WT) | 구현 존재 · 커밋/푸시 없음 |
| TEST APP UI/API | T1–T7 + block regression **PASS** (위 각주) |
| DEVICE / Production | **NOT_PROVEN** (범위 밖 · STOP) |
| 운영 DB | **미적용** |

## 종료 판정 메모 (후속)

이후 main+운영 DB는 반영됐으나, 본 실측의 **중앙 팝업 Realtime NOT_PROVEN**이 해소되기 전에는 묶음 6을 **CLOSED로 판정하지 않음** (Owner 2026-10-24).

## STOP (당시)

운영 DB · main · Production · 네이티브 빌드/푸시 **하지 않음**. Owner 다음 지시 대기.
