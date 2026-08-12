# 4. 변경별 KEEP / REVERT / REBUILD 분류

**Mode:** 분류만 · **Partial Rollback 여부 = 아직 결정하지 않음**  
**금지:** R1/R2 구현, 코드 수정, 배포

분류 정의:

| 라벨 | 의미 |
|------|------|
| **KEEP** | 현재 변경을 유지한 채 다음 게이트로 가져감 |
| **REVERT** | 해당 커밋/동작만 되돌려 이전 동작 복구 |
| **REBUILD** | 방향은 살리고 구현을 다시 짠다 (단순 revert로 부족) |

---

## 분류표

| ID | 변경 | 분류 | 근거 (증거) |
|----|------|------|-------------|
| F1 Bell digit A | `d6dbb91d4` | **KEEP** | 명령서 §3.1; asas55 digit/list 일치; 회귀 증거 없음 |
| F2 member App Icon owner 제외 | `06bab8001` 의도 | **KEEP (의도)** | 명령서 §1 C·§2; 실측 20 = A+B_member |
| F3 unifiedAttention을 App Icon 경쟁 권위로 남김 | `06bab8001`+`6c8e2c8eb` | **REVERT 또는 REBUILD** | 22는 owner 포함 legacy; Member Icon 정의와 충돌. *어떤 필드명을 살릴지는 미결정* |
| F4 Native echo member | `e2cb00ec8` | **KEEP** (F3 정리 전제) | 런처가 20을 따른 것은 member 공식과 정합 |
| F5 Owner C | Slice 2-5 | **KEEP** | 명령서 §1 C; NC 노출은 F8 문제 |
| F6 Owner hub invalidate | | **KEEP** | 읽음 후 hub 정합 |
| F7 Gate3 A/B modules / quarantine | `6c8e2c8eb` | **KEEP** (추가 검증 여지) | identity quarantine는 방향 맞음 |
| F8 Bell → `/notifications` | Step8 | **REBUILD** | 명령서 §7은 NC 목표 → 단순 popup REVERT는 계획과 충돌 가능. 셸 계약 없는 채 배포된 **진입만** 문제 |
| F9 NC page | Step8 | **REBUILD** | 페이지 자체+A UI는 유지 후보; 셸 연동 재구축 |
| F10 See-all → `/notifications` | Step8 | **REBUILD** | `/mypage/notifications`는 OwnerLite off였음 — 경로 선택 실수 |
| F11 Push routing | Step8/9 | **KEEP/감사중** | 이번 P0와 직접 인과 미증명 |
| F13 Cap resume versioning | | **KEEP/감사중** | |
| F14 Room quarantine | | **KEEP** | |
| F15 Backfill | | **KEEP** (ops 완료분) | 재실행 규칙만 강화 |
| Dirty popup 복구 (working tree) | 미커밋 | **STOP 보존** | A/B 미선택; 증거로만 보관 |
| Bottom/Trade empty | — | **분류 보류** | 미재현 |

---

## 아직 하지 않는 것

- Partial Rollback **승인/기각 선언**
- F3/F8/F9에 대한 실제 revert 커밋
- OwnerLite 플래그 패치 구현
- unified 필드 삭제 구현

---

## 다음 결정에 필요한 팀장 입력 (구현 전)

분류상 갈림만 명시한다 (구현 아님):

1. F3: unified를 **진단 전용으로 REBUILD**할지, 응답에서 **REVERT(제거)** 할지  
2. F8: NC 진입 **유지+셸 REBUILD** vs 임시 **popup REVERT** (명령서 §7과 긴장)

이 두 입력이 오기 전에는 Partial Rollback 범위를 확정하지 않는다.
