# E-C1 실기기 보고 — 2026-10-23

- **[배포 구분] 웹만** — 앱 재시작만 (재빌드 불필요)
- **Production tip (최종):** `d02f38386` (안내 busyKind) · 선행 `f0f0c26be` / `577aa6e88` / `2139513c3`
- **기기:** S `RFCY40PY2CA` `@qqqq` · X `8b37179f7d94` `@zxzx11` · I `@wwww`
- **증거:** `tmp/ec1-device-2026-10-23/` · `tmp/ec1-notice-2026-10-23/`

## 결과 요약

| # | 항목 | 결과 |
|---|---|---|
| 1 | 상대 busy (X–I active 중 S→I) | **PASS** |
| 2 | 본인 busy (S–X server-live · force-stop 후 S→I) | **PASS** (DB·목록·안내) |
| 3 | 수신자 stub·busy call_log 0 | **PASS** |
| 4 | 종료 후 정상 재발신 | **PASS** |
| 5 | 무응답·거절·취소 무회귀 | **PASS** |

**E-C1 = CLOSED** (~20:50 PHT).

### 안내 문구 수정 → 재검증 PASS

1. `2139513c3` — web seed (Android Cap 미사용)
2. `d02f38386` — V4 `busyKind` → `showCallInAppNotice`
3. 재검증: S–X `735d6b1b` active · S force-stop · S→wwww → `fff220d1` `cancelled/caller_busy` · a11y 「다른 통화를 이용 중이라 새 통화를 시작할 수 없습니다.」 (`caller-notice-1.xml`)
4. **SIDE-08** (향후): 안내 bounds Y가 헤더「채팅」과 겹침 — E-C1 범위 밖

## 1) peer_busy

- session `55682fc7` `cancelled/peer_busy` · 안내 상대 카피 · messages 0

## 2) caller_busy

- 1차 `74f54071` — DB·목록 PASS · 안내 peer 카피 FAIL → `d02f38386` 수정
- 2차 `fff220d1` — caller 카피 **PASS** · SIDE-08 헤더 겹침만 잔여

## 3) 수신자

- call_log 발신자 only · room stub 없음 · iPhone busy 행 없음 (Owner)

## 남은 위험

1. SIDE-08 — APK 인앱 안내·알림 헤더 가림 / APK↔iOS 표시 차이 (향후)
2. 같은 기기 재발신은 클라 `ownLive` 가드로 서버 caller_busy 미도달 (의도)
