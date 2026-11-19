# 고스트 통화 1단계 실기 결과 — 2026-11-19

- 대상: PR #513 (`895cfd4e4`) · Production READY 확인(Vercel `dpl_4kU72SYPx46rFsHShLzwugwuqrji`)
- 기기: Samsung SM-M156S (q테스트1, 거는 쪽) · Xiaomi 24076RP19G (zxzx11, 받는 쪽) · 둘 다 1.2.7(79) · 방 `1de13b3e`
- 시각 11:09~11:22 PHT · 앱 처음 실행 3회(Samsung 강제 종료 후 재실행 2회 + 오전 재시험 1회 포함 세션 합계) · 예상 Supabase 요청 ≈ 3 × 195 = 585건
- 소리 청취: NOT_PROVEN

| ID | 시험 | 결과 | 증거 (운영 DB 세션 · 캡처) |
|---|---|---|---|
| G1 | 수락 직후 Samsung 앱 강제 종료 → 아무도 다시 걸지 않음 | **PASS** — 제안 이벤트 `stamped:false`, `connected_at` 없음 → 11:12:28 서버 `failed_network` 종료(2분 정리 작업, 수락 후 2분 9초) → Xiaomi 통화 화면 11:12:31 닫힘. 기록 「음성 통화 · 중단됨」 | `59ed8f38` · `g1-*.png` |
| G2 | 고스트 중(수락 37초 뒤) Samsung 재실행 → 재발신 | **PASS** — 재발신 11:13:52 → 고스트 11:13:53 `failed_network` 종료 → 새 통화 11:13:55 벨, `caller_busy` 없음 | `9a2ae8e4` → `d95fc6dd` · `g2-*.png` |
| G3 | iPhone 수신 쪽 | **NOT_PROVEN** — iPhone 잠금(Face ID) | — |
| G4 음성 | 정상 통화 3분 | **PASS** — 3분 14초 양쪽 「통화 중」, 기록 211초(`connected_at`=미디어 증거 11:14:10) | `d95fc6dd` · `g4-*-voice-*.png` |
| G4 영상 | 정상 영상 통화 30초 넘김 | **PASS** — 54초 「좋음」 유지, 84초 정상 종료 | `8593b7f1` · `g4-s-video-0054.png` |
| G5 거절 | 벨 중 Xiaomi 거절 | **PASS** — `rejected/declined`, 양쪽 화면 정리 | `32cab905` |
| G5 벨 중 취소 | Samsung 취소 | **PASS** — `cancelled/canceled` | `b2647ba0` |
| G5 무응답 | 응답 없음 | **PASS** — 31초 뒤 `missed` | `48aa0d56` |
| G5 종료 후 즉시 재발신 | 4초 통화 종료 3초 뒤 재발신 | **PASS** — 정상 벨 | `1d0564bb` → `a9199b32` |
| G5 취소 후 지연 푸시 · 통화 중(제3자) · Android↔iPhone | — | **NOT_PROVEN** (미실시: 지연 푸시 재현 수단·세 번째 계정·iPhone 없음) | — |

## 확인된 사실 중 설계와 다른 점
- 설계서는 종료 후 기록을 「연결 끊김」이라 적었으나, 화면 글자는 **「중단됨」**(기존 09:17 `heartbeat_timeout` 기록과 같은 표시). 저장 문장은 「연결 끊김」, 화면 재계산 문장은 「중단됨」으로 다른 기존 동작(RECHECK.md 부수 관찰). 이번 변경으로 생긴 차이가 아님.

## 조작 사고 (설정 변경 없음)
- 11:19 영상 종료 탭 중 Samsung 이 설정 → 「앱 정보」 화면으로 넘어감(조작 버튼 숨김 상태 탭). 아무 설정도 바꾸지 않았고, 앱은 살아 있었으며(pid 확인), 뒤로가기로 복귀.
