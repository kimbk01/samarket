# 관리자 inbox·bell 폴링 — 실측·원인·설계 (2026-11-22 PHT)

- 지시: Owner 「다음으로 넘어 가자」 → 재감사 §8 「관리자 inbox·bell 폴링 하루 약 4.2천」.
- 근거: Vercel 관측 2026-11-21 00:00 ~ 11-22 05:00 UTC · 코드(main `594e032`). 운영 변경 없음.
- 확인: #558 은 12:53 PHT 기준 아직 병합 전(CI 대기) · 운영 `594e032`.

## 1. 실측 (29시간)
| 라우트 | 요청 | Supabase 호출 | 1회당 | 내용(1회당) |
|---|---|---|---|---|
| `/api/admin/inbox?summary=1` | 212 | 1,060 | 5.0 | 알림 1.0 · 전달 상태 RPC 1.0 · **관리자 확인(profiles 1.0 · user_sessions 0.88 · admin_memberships 0.83 · jwks 0.15)** |
| `/api/admin/admin-bell` | 207 | 764 | 3.7 | 작업 대기 수 RPC 1.0 · **관리자 확인(profiles 1.0 · user_sessions 0.79 · admin_memberships 0.73 · jwks 0.1)** |
- 시간당 최대 약 45~48번씩 = **관리자 탭 1개가 75초마다** 두 라우트를 부른 것과 같다(`NOTIFICATION_SYNC_POLL_MS = 75_000`). 관리자 화면을 안 연 시간은 0.
- 하루 약 1,500 호출(11-20 평일 약 1,550). 재감사 때 「약 4.2천」은 그때 구간 값 — 지금은 그보다 적다.

## 2. 원인 (코드)
| 사실 | 근거 |
|---|---|
| 관리자 화면 틀(`AdminPlatformShell`)이 **두 폴러를 함께** 띄운다 — 작업 대기 수(`AdminStorePointPendingProvider` → admin-bell)와 받은 알림 수(`AdminInboxLink` → inbox summary). 둘 다 화면이 보일 때 75초마다 | `components/admin/shell/AdminPlatformShell.tsx:238,289` · `AdminStorePointPendingProvider.tsx:973` · `AdminInboxLink.tsx:55` |
| 요청마다 관리자 확인(`requireAdminApiActor`)을 따로 해서 같은 확인이 75초에 2번 | 두 라우트 첫 줄 |
| 작업 대기 수는 Realtime 깨우기도 있음(75초는 보조). 받은 알림 수는 Realtime 없음 | `AdminStorePointPendingProvider.tsx` `admin-ops-realtime-bridge` |
- 결함이라기보다 **같은 화면의 두 숫자를 두 요청으로 따로 받는 구조**가 원인. 동작은 설계대로다.

## 3. 설계
| 항목 | 내용 | 파일 |
|---|---|---|
| AB-1 한 요청으로 | admin-bell 응답에 받은 알림 요약(`unread`·전달 상태 — inbox summary 와 같은 계산·같은 권한 조건)을 함께 넣는다(선택 쿼리 `?with_inbox=1`) | `app/api/admin/admin-bell/route.ts` · inbox summary 계산을 함수로 떼어 두 라우트가 같이 씀 |
| AB-2 폴러 하나 | `AdminInboxLink` 는 자기 75초 폴링을 하지 않고, 작업 대기 수 폴러(같은 화면 틀)가 받은 값을 받아 쓴다. 받은 알림 바뀜 이벤트(`ADMIN_INBOX_CHANGED_EVENT`)·화면 돌아옴 때는 지금처럼 바로 다시 읽음 | `AdminInboxLink.tsx` · `AdminStorePointPendingProvider.tsx` |
| 유지 | inbox 목록 화면·읽음 처리 · 75초 간격 · 관리자 확인 방식(보안 — 바꾸지 않음) | — |
- 효과: 75초마다 8.7 → 약 5.7(관리자 확인 1번 · jwks 포함) · 하루 약 **−550**(관리자 탭 1개 기준).

## 4. 영향·위험
| 항목 | 내용 |
|---|---|
| 영향받는 화면 | 관리자 전 화면 머리(알림 아이콘 숫자·「!」 표시) · 작업 대기 배지. 숫자·조건 무변경이어야 함 |
| 권한 | inbox 요약은 지금 `requireAdminApiActor` 통과한 관리자에게만 — admin-bell 도 같은 확인을 먼저 함. 전달 상태(dead letter)는 지금처럼 최고 관리자만 |
| 실패 | 요약 계산 실패 → 그 필드만 비우고 아이콘은 지금처럼 「!」(실패 표시) |
| 통화·메신저 | 무관 |
| 운영 DB | 변경 없음 |
| 롤백 | Instant Rollback |

## 5. 범위 밖 (보고만)
- 관리자 확인(profiles·user_sessions·admin_memberships, 1회당 약 2.6)을 짧게 기억해 두면 더 줄지만, 권한 회수·세션 종료가 늦게 반영되는 **보안 판단**이라 이번 설계에 넣지 않았다.

## 6. NOT_PROVEN
- 관리자 탭이 2개 이상 열릴 때의 하루 양(지금 실측은 탭 1개 수준).
