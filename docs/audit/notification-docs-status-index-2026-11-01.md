# 알림 문서 승인 상태 색인 (W0 · 2026-11-01 PHT)

목적: 그동안 git 밖(기본 체크아웃의 미추적 파일)에만 있던 알림 설계·감사 문서를 git 에 올린다. 각 문서의 **승인 상태를 문서 원문과 커밋 기록으로만** 판정한다. 문서 본문은 고치지 않았다.

- 미승인 초안은 승인 문서로 올리지 않는다. 아래 「상태」가 「승인 대기」인 문서는 근거 자료일 뿐 계약이 아니다.
- **계약(HARD LOCK)으로 유효한 것**은 「승인·구현」 문서와 `notification-system-ssot-hardlock-reaudit-2026-11-01.md` 의 C1~C6 이다. 계약을 지키는 장치는 해당 계약 테스트다.
- Cursor 실기 프롬프트(`cursor-prompt-*`, `handover-prompt-*`)와 증거 폴더(`evidence/notif-*`)는 올리지 않는다(Owner 규칙: 프롬프트·작업 지시서 커밋 금지).

| 문서 | 상태 | 근거 |
|---|---|---|
| `admin-push-send-process-v3-design-2026-10-30.md` | **승인·구현** | `3b40fad30` 커밋 메시지 「알림 발송 v3 — 한 화면·목적지 1개 (RULE 5·7 개정, Owner 승인)」. 문서 §「Owner 결정 필요 1건」(RULE 5)은 이 커밋에서 개정됨 |
| `admin-notification-create-defect-and-redesign-2026-10-30.md` | **승인·구현**(재설계안 §4) | `804f61ef0` 「알림 만들기 화면 발송 불가 원인 해소 + 화면 재설계」. 승인 문구는 문서·커밋에 없음 → 구현 사실만 확인 |
| `notification-redo-audit-2026-10-28.md` | **감사 보고**(결함 B-01~B-20 근거) | 구현 커밋 `fb0ddc7f3`·`5ac0cd681`·`82ef61c33`·`4ac101b5e` 등 「재감사 B-xx」 |
| `notification-redo-double-check-2026-10-28.md` | **감사 보고**(설계↔구현 대조) | 구현 커밋 「더블체크 B-15②·B-17·D-Q3·D-Q4·D-Q7」. 문서 안 「결정 필요」 항목은 미승인 |
| `notification-redo-separate-approval-2026-10-28.md` | **승인 요청서**(3건) | 그중 B-16 은 `ffc954a27` 구현. 나머지 항목 승인 여부는 문서·커밋으로 확인 안 됨 → 승인 대기로 본다 |
| `notification-sound-mode-impact-plan-2026-10-28.md` | **승인·구현** | 문서 3줄 「Owner 승인: 2026-10-28 …」, 구현 `b301fedf1`·`246c6553c`·`fea25fac8` |
| `notification-b1-samsung-launcher-badge-plan-2026-10-28.md` | **구현**(문서 제목은 「승인 대기」 시점 기록) | `b15fe1c86`, 설치 빌드 `bfaf78100`(versionCode 15). 실기 PASS 는 NOT_PROVEN |
| `notification-b7-xiaomi-launcher-plus1-plan-2026-10-28.md` | **Owner 결정: 수정하지 않음** | 문서 §8 「Owner 결정 (2026-10-28 20:05 PHT) — C 확정 · 수정하지 않음」 |
| `notification-u6-scroll-restore-plan-2026-10-29.md` | **구현** | `2f8a89b14` 「U6 알림센터 스크롤 복원」 |
| `ios-notification-permission-badge-only-fix-2026-10-29.md` | **구현** | `450416ae4` (iOS build 17) |
| `notification-android-small-icon-plan-2026-10-29.md` | **승인 대기**(문서 기준) | 문서 제목 「Owner 승인 대기」. `ic_stat_dibay` 는 `4b7cc2d16`(Owner 시안 A~D)에서 들어왔으나, 이 계획서 범위 전체가 반영됐는지 확인 안 됨 |
| `notification-call-presentation-impact-2026-10-29.md` | **승인 대기**(통화 규정) | 구현 커밋 없음 |
| `owner-prep-notification-remaining-2026-10-28.md` | **작업표**(실기 준비) | 설계·승인 문서 아님 |
| `notification-tap-list-sound-reaudit-2026-11-01.md` (이미 커밋) | 감사 + A·B·N5 구현 | `393882913` |
| `notification-android-native-e-plan-2026-11-01.md` (이미 커밋) | **승인 대기**(N1) | Owner 2026-11-01 「N1 은 별도 승인 전 수정하지 않음」 |
| `notification-list-cta-mockup-2026-11-01.html` (이미 커밋) | **보류**(C) | Owner 2026-11-01 「계약 안정 후 최종 시안 검토」 |
| `notification-system-ssot-hardlock-reaudit-2026-11-01.md` | **승인**(W0·W1·CI1·W2~W5, 보완 조건 포함) | Owner 2026-11-01 「SSOT 구조 개선 — Owner 결정 및 실행 승인」. 문서 끝 §6 에 승인 조건 기록 |
