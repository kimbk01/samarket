# Gate 1 — Read Writer Map

**Mode:** AUDIT ONLY  
**HEAD:** `449e02771`

---

| 사용자 동작 | 호출 함수/API | 변경 데이터 | 영향 표면 | 문제 |
|-------------|---------------|-------------|-----------|------|
| Bell 항목 클릭 (팝업) | inbox read bridge / mark event read | `notification_events.read_at` | Bell list, A, App Icon | 라우트 fire-and-forget 여부 잔존 가능 |
| Bell 모두 읽음 | `markAllNotificationEventsRead` + mark-all stores | A rows `read_at` | Bell→0, App Icon=A+B | Slice 후 다중 store 정렬 커밋 있음 (`1a814053b`) |
| Bell 항목 삭제 | PATCH `/api/me/notifications` | `deleted_at` | list, A if unread | A-only path Gate3 |
| Bell 전체 삭제 | PATCH `delete_all_member_a` | `deleted_at` | list empty, A=0 | NC page 경로와 팝업 경로 이중 |
| NC `/notifications` 열기 | Gate3 Step 8 `router.push` | (읽음 아님) | 셸 전체 | **OwnerLite+FAB 겹침 PRODUCT FAIL** |
| 방 진입 | room read cursor ACK | participant unread→0 | Row, Hub, Bottom, B, App Icon | Enter≠ACK 계약 문서화됨; 위반 잔존 가능 |
| FCM 채팅 탭 | PushRouteListener → room | ACK 후 unread | B surfaces | FCM만으로 0 만들면 FAIL |
| FCM 시스템 알림 탭 | PushRouteListener → route | notification read | A | payload identity 누락 시 오염 |
| Owner push 탭 | store route | C / B_store | Owner only | member A 건드리면 FAIL |
| Foreground 수신 | RT / badge-count rebuild | projection rebuild | all | rebuild≠새 event |
| Background / cold / resume | Cap resume versioned apply | echo App Icon | launcher | cache apply vs authority 경합 가능 |

---

## Critical read-path defects (evidence)

1. **Gate 3 Step 8** (`6c8e2c8eb`): Bell click → `/notifications` without excluding `OwnerLiteStoreBar` / `FloatingAddButton` → 상단 「주문 현황/받은 문의」16 + 초록 + FAB (실측 스크린샷 2026-08-03).
2. 명령서 §5.1: 읽음 확정 후 라우트. Step 8은 **라우트만** 바꾸고 셸 계약을 안 잠금.
3. Working tree에 Step 8 팝업 복구 diff가 **이미 dirty** — Gate1 결정 전 추가 수정/커밋 금지.
