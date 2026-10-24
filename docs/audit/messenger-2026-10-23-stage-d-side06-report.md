# 단계 D REPORT — SIDE-06 목록 안읽음 낙관 +1 제거 (2026-10-23)

- 근거: `docs/audit/messenger-2026-10-23-stage-c-report.md` · B F3 FAIL
- **main 푸시·Production: 본 보고 후 Owner 별도 승인 전 금지**

## 1. 원인
메시지 INSERT Realtime이 홈 목록에 `unreadCount + 1` 낙관 반영 → participant RT 절대값(1)과 겹쳐 UI **2**. B 증거: UI=2 · DB `unread_count=1`.

## 2. 수정 파일
| 파일 | 변경 |
|---|---|
| `lib/community-messenger/home/project-room-activity-to-home-list.ts` | 수신 → `realtime_message_insert` + `boostUnreadCount: false` · 발신만 `sender_local_echo` |
| `lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message.ts` | `bumpRoomUnreadIfNeeded` no-op (낙관 +1 차단) |
| `lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts` | fallback patch `boostUnreadCount: false` |
| `components/community-messenger/CommunityMessengerHome.tsx` | 주석 정합 |
| 관련 vitest 2파일 | SIDE-06 기대값·회귀 테스트 |

**미변경:** 네이티브 · DB · 알림 · 통화 · SIDE-01/03/05/07.

## 3. 영향
- 홈 목록 unread만. 프리뷰·정렬·발신 echo(unread→0) 유지.
- unread SSOT = participant RT / `summary_patch` / home-sync.
- CallKit/VoIP/FCM/APNs 비대상.

## 4. 테스트 (로컬)
- `vitest` (exclude `.claude/**`): project-room-activity · patch-truth-version · home-room-live-patch · call-stub-home-list · merge-critical → **50 PASS**
- eslint 변경 파일: **error 0**
- `typecheck:build`: **PASS**

## 5. 배포 (2026-10-23 ~16:51 PHT)
- main / origin: **`04369b207`** (해당 커밋만 푸시 · 무관 dirty 미포함)
- Production: **Ready** `dpl_6k6R8VtiQjePnaMXzX3QY4No9HcZ` · alias `samarket.vercel.app`

## 6. 실기기 F3 (2026-10-23 16:52~16:58 PHT) — **PASS**
| 항목 | 결과 |
|---|---|
| 앱 재시작 후 F3-1 (1건→안읽음 1) | PASS |
| F3-2 (→2) | PASS |
| F3-3 (→3) | PASS |
| 방 입장 → 0 | PASS |
| F4 같은 방 즉시 표시·알림 없음 | PASS |
| 무회귀 (정렬·프리뷰·송수신) | PASS (Owner 「무회귀 끝」) |

## 7. 최종 판정
**SIDE-06 = DEVICE_PASS / CLOSED** (코드+Production+실기기)

## 8. 복구
- `git revert 04369b207` → push main → 앱 재시작.
