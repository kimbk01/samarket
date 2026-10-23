# E-C2-A 구현 보고 — unknown→거절 함정 제거 (2026-10-23)

- **[배포 구분] 웹만**
- **Owner:** 조건부 승인 · **이번 구현 = C2-A만** · **main/Production 별도 승인 전 금지**
- 표 SSOT: `messenger-2026-10-23-stage-e-c2-a-product-state-table.md`

## 변경

| 파일 | 내용 |
|---|---|
| `map-call-v4-remote-terminal-reason.ts` | SSOT 추출 · unknown → **`ended`** (거절/실패 단정 금지) · outgoing missed → `no_answer` |
| `call-v4-actions.ts` | 위 mapper 사용 · direction 전달 |
| `__tests__/map-call-v4-remote-terminal-reason.test.ts` | 알려진 터미널 유지 · unknown≠rejected · notice 계약 |
| 제품 표 md | 12상태 · #3/#4 중복 기록 금지 · #9/#10/#11 NOT_PROVEN |

## 비범위 (미수정)

C2-B/C/D · 네이티브 · DB · CallKit/VoIP/FCM · E-C3/SIDE-08 · 전체 재감사

## 검증 (로컬)

| 게이트 | 결과 |
|---|---|
| eslint (변경) | PASS |
| `typecheck:build` | PASS |
| vitest mapper + notice contract | PASS |
| main push / Production | **금지 · 미실행** |

## 다음

로컬 PASS 보고 → Owner **main/Production 승인** 후 반영 · 이후 C2-B는 **별도 승인**.
