# 단계 E SCOPE REPORT — 기능 설계 범위 정리 (2026-10-23 · 구현 금지)

- 계획 SSOT: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §3 **E** · §1 P2 · §2 묶음6 · §5-6
- 방침: `docs/audit/DIBAY_메신저_통화_기존계획_계속진행_및_별도결함관리_20261023.md`
- **본 문서 성격:** Owner 승인 전 **설계·상태 보고만**. 코드·네이티브·DB·main·배포 **금지**.
- **제외 (별도 대장 유지 · E에 섞지 않음):** SIDE-01·03·05·07 · SIDE-02·04 · E1/E2/E9/E10 · 희귀 수신 · A~D PASS 재검증 · 전체 재감사

---

## 0. A~D 진행 결과 (문서 반영용 요약)

| 단계 | 결과 | 증거 |
|---|---|---|
| **A1~A7** | **PASS** | tip 누적 · A7 tip `0fb36c4f9` · A6 `afa50338c` |
| **B** | **완료** (관찰) | `docs/audit/messenger-2026-10-23-stage-b-report.md` · C1~G2 |
| **C** | **완료** (설계) | `docs/audit/messenger-2026-10-23-stage-c-report.md` · D 후보=SIDE-06만 |
| **D** | **SIDE-06 CLOSED** | 커밋·Prod `04369b207` · F3 실기기 PASS · `stage-d-side06-report.md` |
| **C 잔여 FAIL** | 미확정 유지 | SIDE-01·03·05·07 — E와 분리 |

참고: 계획 §3 **D** 원문은 「§2 묶음 1~5」구현이었으나, Owner 지시로 C에서 **SIDE-06만** D 승인·완료했다. 묶음 1~5는 아직 미착수(E가 아님 · 별도 Owner 승인 필요 시 후속).

---

## 1. 단계 E 정의 (계획 원문)

> **E** | 친구 요청(§2-6), 통화 12상태·중앙 팝업·통화 중 기록(§1 P2) — 기능 설계 별도 문서 → 승인 → 구현 | PASS

E는 **신규/미구현 기능** 트랙이다. B FAIL 핫픽스(SIDE)와 섞지 않는다.

---

## 2. E 항목별 현황

### E-F1 — 친구 요청 (§2-6 · §5-6)

| 항목 | 내용 |
|---|---|
| **Owner 결정 (2026-10-23)** | Contact LOCK **유지** · 이번 E에서 **보류**. 기존 친구 추가·목록·차단·메시지·통화 권한 **변경 금지**. |
| **목표(계획)** | 요청 저장(DB) → 상대 기기 **실시간 중앙 팝업**(수락/거절) → 수락 시 양쪽 친구 행 생성 |
| **현재 상태** | **Telegram식 단방향 Contact LOCK** (`docs/community-messenger/friend-contact-ssot-lock.md`). 요청/수락/거절 **없음**. |
| **이번 E** | **설계·구현 모두 하지 않음.** |

---

### E-C1 — 통화 「통화 중」기록 0건 (§1 P2 · D4)

| 항목 | 내용 |
|---|---|
| **상태** | **CLOSED** · tip `d02f38386` · 실기기 PASS · `stage-e-c1-impl-report.md` / `stage-e-c1-device-report.md` |
| **목표(계획)** | busy 시에도 **기록 1건** · 상대 busy vs 본인 busy 구분 · 게이트·벨·푸시·CallKit·VoIP 불변 |
| **구현 요지** | 공유 stub **불가** → 터미널 `cancelled` 세션 + call_log(발신자 목록만) + 로컬 채팅 줄 · API `peer_busy`+`busyKind` · DB 스키마 무변경 |
| **다음** | **발신자 안내** 설계 → 승인 → 구현. |

### 발신자 안내 — 무응답 시 발신자 인앱 안내 (§1 P2)

| 항목 | 내용 |
|---|---|
| **상태** | **CLOSED** · tip `c30d0a971` · 실기기 PASS · `stage-e-caller-notice-design.md` / `*-impl-report.md` / `*-device-report.md` |
| **목표** | 링 타임아웃 시 발신자에게 「상대 응답 없음」안내 1회 · callee `missed` 와 문구·경로 분리 |
| **구현** | event `no_answer` · Cap Android: outgoing missed→no_answer + native 해제 후 배너 · 중앙 팝업은 SIDE-08/E-C3 |

---

### E-C2 — 통화 12상태 구분 (§1 P2)

| 항목 | 내용 |
|---|---|
| **상태** | **C2-A CLOSED** (`fd685655d` · Prod 일치) · 표 `stage-e-c2-a-product-state-table.md` |
| **목표(계획)** | 제품/UI 12구분 · DB status 12종 아님 |
| **C2-A** | unknown→거절 제거 · 중립 `ended` · CLOSED |
| **C2-B** | Phase A 코드 main(`bcad9b4b7`) · 실기기 본경로 NOT_PROVEN · Native release NOT APPROVED |
| **C2-C** | **BLOCKED — 연결 불가 증거 없음** · `stage-e-c2-c-unreachable-design.md` · 재조사·선구현 금지 |
| **C2-D** | **구현 보류** · `stage-e-c2-d-reconnect-fail-design.md` · #12 미구현·미검증 · 기존 재연결/종료 변경 금지 |
| **E-C3** | **웹 A 로컬 구현 완료 · main/Prod 승인 대기** · SIDE-08 웹 CLOSED · `stage-e-c3-central-notice-design.md` |

---

### E-C3 — 통화 U 중앙 공통 팝업 (§1 P2)

| 항목 | 내용 |
|---|---|
| **상태** | **설계 완료 · 구현 승인 대기** · `stage-e-c3-central-notice-design.md` |
| **목표(계획)** | 확정 안내를 상단 배너가 아닌 **중앙 공통 팝업**(`DibayInfoDialog` 재사용) |
| **1차 범위** | 웹만 · `no_answer`/`peer_busy`/`caller_busy`/`call_failed`/`peer_declined` · C2-C/D·CallKit 제외 |
| **네이티브** | Activity/VC overlay 변경은 **별도 승인(B)** · 1차는 미포함 |

---

## 3. E 실행 순서 (Owner 확정 · 2026-10-23)

1. ~~E-F1~~ **보류** (Contact LOCK 유지).
2. **E-C1** busy 기록 — 상세 설계 `stage-e-c1-busy-record-design.md` → **구현은 Owner 승인 후**.
3. **발신자 안내** (E-C1 다음 · 별도 설계).
4. **E-C2** 12상태 → **E-C3** 중앙 팝업 (각각 별도 설계·승인).
5. 한 주제·한 커밋. SIDE 대장과 혼합 금지.

---

## 4. 현재 Owner 게이트

- E-C1 설계 §10: 권장안(C) 채택 · API 호환 A/B · 수신자 스텁 공유 노출 → **승인 후 구현**.
- 코드·DB·네이티브·main·Production: **아직 금지**.

---

## 5. 변경 없음 선언

본 문서·E-C1 설계 작성으로 **코드·네이티브·DB·main·Production 변경 없음.**  
SIDE-01·02·03·04·05·07 및 E1/E2/E9/E10·희귀 수신 **미수정**.