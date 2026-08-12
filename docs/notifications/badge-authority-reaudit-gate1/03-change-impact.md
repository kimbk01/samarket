# 3. 변경별 제품 영향도

**Mode:** 영향 기술 · 구현/롤백 실행 없음

| ID | 변경 | 영향 표면 | 심각도 | 실측 | 비고 |
|----|------|-----------|--------|------|------|
| F2/F3 | dual App Icon | OS Icon, smoke, 지원 혼선 | **P0** | 20≠22 재현 | 공식 충돌 |
| F8/F9/F10 | NC route + page | Bell UX, NC, OwnerLite, FAB | **P0** | 스크린샷 | 셸 미연동 |
| F4 | Native echo member | Launcher digit | P1 | 런처=20 | 20이 명령서면 OK, dual이면 혼란 |
| F1 | Bell=A | Bell digit/list | P2 | A=0 일관 | 회귀 증거 없음 |
| F5/F6 | Owner C / hub | Owner FAB | P2 | NC에 Owner UI 노출은 F8 인과 | C 자체와 별개 |
| F11 | Push route | FCM tap | P2 | 이번 STOP 창 미심층 | |
| F13/F14 | resume / quarantine | App Icon stale / B 정확도 | P2 | 별도 실측 필요 | |
| F15 | backfill | A 데이터 | P1 (ops) | incident 후 복구 | 제품 UI와 별개 |
| — | Bottom/Trade empty claims | — | — | **미재현** | 영향도 산정 보류 |

---

## 영향 체인 (인과만)

```text
06bab8001
  └─ member App Icon에서 owner 제외
  └─ unifiedAttention(owner 포함) 유지
        └─ 동일 HTTP에 20과 22
              └─ Cap/e2cb → 런처 20
              └─ smoke → 22를 PASS로 오인

6c8e2c8eb Step8
  └─ Bell/See-all → /notifications
  └─ shell flags 미수정
        └─ /mypage/* 제외 규칙 밖
              └─ OwnerLite + FloatingAdd 노출
```
