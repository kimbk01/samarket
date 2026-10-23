# E-C1 실기기 보고 — 2026-10-23 ~19:38 PHT

- **[배포 구분] 웹만** — 앱 재시작만 (재빌드 불필요)
- **Production tip:** Ready `samarket-jsnbl41tc…` · main `577aa6e88fc` (E-C1 `f0f0c26be` + CI insert hotfix)
- **기기:** S `RFCY40PY2CA` `@qqqq` · X `8b37179f7d94` `@zxzx11` · I `00008120-…` `@wwww`
- **증거 스크린/XML:** `tmp/ec1-device-2026-10-23/`

## 결과 요약

| # | 항목 | 결과 |
|---|---|---|
| 1 | 상대 busy (X–I active 중 S→I) | **PASS** |
| 2 | 본인 busy (S–X server-live 중 S→I, 앱 force-stop 후 재발신) | **PASS** (DB·목록) / 안내 문구 **FAIL** |
| 3 | 수신자 stub·busy call_log 0 · room 메시지 0 | **PASS** (DB) · iPhone 통화 탭 busy 행 **없음** (Owner 확인) |
| 4 | 종료 후 정상 재발신 | **PASS** (거절·무응답·취소 발신 모두 성립) |
| 5 | 무응답·거절·취소 무회귀 | **PASS** — 거절 `23c96f76 rejected/declined` · 무응답 `e2466e77 missed/missed` · 취소 `df042466 cancelled/canceled` |

**E-C1 = DEVICE_PARTIAL — CLOSED 아님** (caller_busy 안내 문구 수정 코드 완료 · Production·실기기 재확인 대기).

### 안내 문구 수정 (코드 · 미배포)

- 원인: `alertOutgoingCallFailure(text)` 가 카피에서 event 재추론 → 영문 caller 문구의 `on another call` 이 `peer_busy` 로 분류
- 수정: busy 응답 시 `showCallInAppNotice({ event: caller_busy|peer_busy })` 직접 표시 · infer 휴리스틱에 caller 분기 추가
- 파일: `call-session-navigation-seed.ts` · `call-in-app-notice-store.ts` · notice contract test

## 1) peer_busy

- 시각: `2026-10-23T11:27:43Z`
- 사전: X→I 음성 연결 (`1d8115c8` ended_by_caller, ~2분)
- S 통화 탭 재발신 → 안내 `상대방이 현재 통화중입니다.` · 목록 tip `w테스트1(@wwww) 통화 중 음성 통화`
- DB: session `55682fc7` `cancelled/peer_busy` qqqq→wwww · call_log 1 · duration 0 · **공유 messages 0**

## 2) caller_busy

- 같은 기기 재발신은 클라 `ownLive` 가드로 API 미도달 → force-stop으로 클라 live 제거 후 서버 `active` 유지 상태에서 재발신
- 시각: `2026-10-23T11:38:26Z`
- DB: session `74f54071` `cancelled/caller_busy` qqqq→wwww · call_log 1 · duration 0 · messages 0
- 목록: `w테스트1(@wwww) 다른 통화 중 음성 통화` **PASS**
- 인앱 안내: 여전히 `상대방이 현재 통화중입니다.` (**caller 카피 아님**) → `busyKind=caller` 클라 반영 의 또는 다른 alert 경로 **FAIL**

## 3) 수신자

- busy session의 call_log `caller_user_id=qqqq` only · room stub 없음
- iPhone 통화 탭 육안 **NOT_PROVEN**

## 남은 위험

1. caller_busy 인앱 안내가 peer 문구로 나옴 (목록·DB는 정상)
2. 같은 기기 재발신은 E-C1 서버 경로를 타지 않음 (의도된 클라 가드) — 멀티기기/강제재시작에서만 caller_busy 기록
3. 무응답·거절·취소 회귀 미측정
