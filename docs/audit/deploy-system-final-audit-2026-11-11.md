# DIBAY 배포 시스템 최종 감사 (2026-11-11 11:25 PHT)

기준: 운영 main `fa928d6` (PR #141 병합, 10:32 PHT 배포 `dpl_FrU5gtfM`). 이 감사에서 운영(main·DB·Vercel·GitHub·Firebase) 변경 **0**.
분류: **A** 원인 확정·운영 무영향 → 독립 브랜치 구현 / **B** 확정·운영 반영 또는 설정 변경 필요 → 준비만 / **C** 측정 필요 / **D** 유지.

## 1. 현재 실제 배포 흐름
```
작업 브랜치 ─push→ (Vercel: main 외 배포 꺼짐, GitHub CI: PR 일 때만)
      │ PR 생성 (main 보호: PR 필수·ci-ok 필수·관리자 포함, 승인 0)
      ▼
GitHub CI (changes·static·test 1/2·2/2·android 계약·버전 검사 → ci-ok) ≈ 10.5분
      │ Owner 가 병합 (작업자는 병합 권한 차단)
      ▼
main push ─┬→ GitHub CI 다시 1회 (main push 트리거)
           ├→ 네이티브 빌드 워크플로 (android/ios/package*.json 바뀐 경우만)
           └→ Vercel: Ignored Build Step(누적 변경 판정) → 빌드(iad1, 8코어/16GB) → autoAssignCustomDomains=true → 운영 samarket.vercel.app 즉시 연결
```
증거: GitHub 보호 API(`pr:0, checks:[ci-ok], admins:true`, 11:0x PHT 조회) · Vercel 빌드 로그 「Running build in Washington, D.C. – iad1」 · 프로젝트 도메인 = `samarket.vercel.app` 1개.

## 2·3. 단계별 시간 (실측)
Vercel 운영 빌드 최근 30회 (11-10 18:48 → 11-11 10:32 PHT), 빌드 로그에서 단계 경계 시각으로 계산. 캐시 복원 30/30.

| 단계 | 평균 | 중앙값 | P95 |
|---|---|---|---|
| 대기 | 1초 | 1초 | 1초 |
| 설치 | 2초 | 2초 | 2초 |
| 컴파일 | 66초 | 62초 | 86초 |
| **TypeScript 검사** | **194초** | **170초** | **258초** |
| 페이지 생성·후처리 | 17초 | 16초 | 21초 |
| 업로드 | 23초 | 23초 | 26초 |
| **전체** | **312초** | **278초** | **399초** |

GitHub CI (main push, 작업별 실측): 구조 분리 후 최근 2회 — static 580·583초, test 1/2 625·612초, test 2/2 633·461초 → **벽시계 약 10.5분**. 분리 전 단일 작업 1,775초(29.6분). 작업 대기 1~3초.

## 4. 빌드 지연 근본 원인 (확정)
- TS 검사가 빌드의 62%. 10-18 89초 → 현재 157~258초 (TS 파일 10,610 → 12,991).
- **원인**: Next 16.1.7 `node_modules/next/dist/lib/typescript/runTypeCheck.js` 115·123줄 — `program.emit()`(캐시 `.next/cache/.tsbuildinfo` 기록) **다음에** `getPreEmitDiagnostics`(오류 계산). 그래서 계산한 오류 결과가 캐시에 남지 않고, Vercel 이 캐시를 복원해도 매번 전체 검사.
- 증거(로컬 Mac, 같은 입력·옵션, 2026-11-11 10:40~11:20 PHT):
  | 조건 | 원래 순서(Next) | 진단 먼저 |
  |---|---|---|
  | 처음 | 74~82초 | 76·84초 |
  | 변경 없음 | 74~82초(매번 전체) | **6초** |
  | 화면 파일 1개 변경 | — | **5초** |
  | 번역 카탈로그 변경 | — | 75초 (줄지 않음) |
  | 오류 주입 | — | 오류 4건 검출 · 실패 |
- 이전 보고의 「tsconfig `tsBuildInfoFile` 1줄」 안은 **틀림** — Next 가 그 값을 덮어씀. 정정.

## 5. 중복 빌드·비용
- 운영 빌드 약 43회/일, 같은 SHA 재빌드 7회(최근 표본). 1회 약 $0.15, 빌드 CPU = 지출의 81% (Vercel 청구 조회).
- CI: 10-26 이후 main push 897회 중 **취소 387(43%)** — 연속 푸시로 앞 실행이 밀려 취소. 병합 PR 은 PR CI + main CI 로 같은 검사 2회.
- 빌드 판정 스크립트(문서·테스트만 바뀐 커밋 건너뜀)는 동작함(최근 취소 배포 = 건너뜀).

## 6. 배포 구조 불일치와 권고
불일치: AGENTS.md 「작업 브랜치 → `git push origin HEAD:main`」 ↔ 실제 main 보호(PR 필수·ci-ok·관리자 포함) → 직접 푸시 거부됨.

| | A: 보호 해제·main 직접 푸시 | B: 보호 유지·PR 병합 |
|---|---|---|
| 반영 시간 | 로컬 검증 후 즉시 | + CI 약 10.5분 + Owner 병합 |
| 깨진 코드 운영 유입 | 로컬 검증에만 의존 | ci-ok 통과분만 |
| CI 실행 | main 1회 | PR 1회 + main 1회 |
| 작업자 권한 | 작업자가 반영 | Owner 가 병합 (작업자 병합 차단) |

**권고: B (보호 유지)**. 이유: main = 운영 즉시 반영이고 스테이징이 없으므로 ci-ok 가 유일한 자동 관문. 필요한 조치는 GitHub 변경이 아니라 **AGENTS.md 개발 프로세스 1번 문구를 「PR → ci-ok → Owner 병합」으로 맞추는 것**(B 분류, Owner 승인 후). main CI 중복은 `ci.yml` 의 main push 트리거 유지 여부를 Owner 결정 후 정리.

## 7. 남은 TEST 자원
| 자원 | 상태(조회 11:2x PHT) | 판정 |
|---|---|---|
| Vercel 커스텀 환경 `test` | 존재 · 추적 브랜치 `dev`(삭제됨 → 새 배포 없음) · 도메인 0 | B — APNs 연결 해제 후 삭제 |
| 운영 APNs 3행(`APNS_KEY_P8`·`APNS_TEAM_ID`·`APNS_KEY_ID`)의 test 연결 | 대상 production+preview + test | **D 유지** (값 보존 미증명·원본 .p8 없음 — Owner 지시) |
| `dibay-dev.vercel.app` 도메인 | 없음 | 철거 완료 |
| 원격 `dev` 브랜치 | 없음 | 철거 완료 |
| 원격 `fix/restore-main-centric` | 존재(`46442dd`, 병합됨) | 삭제 안전 — 작업자 삭제 차단, Owner 실행 |
| Supabase `dibay-test` | 삭제됨 | 완료 (백업 dump, 복원 NOT_PROVEN) |
| 운영 Firebase `.dev` 앱 등록 | 존재 | **D 유지** (영향 NOT_PROVEN) |
| `dibay-reset-qa` | 존재 | D 유지 |

## 8. 운영 기능 영향·회귀 위험
- `fa928d6` 배포 이후 런타임 오류 **0** (Vercel 조회, 10:32 PHT~). iOS VoIP 등록 1건 확인. 그 외 기능(통화·채팅·푸시 수신) 실기 **NOT_PROVEN**.
- 이번 수정(9번)의 위험: Next 버전이 바뀌면 스크립트가 **빌드를 실패**시킴(조용히 넘어가지 않음 — 의도). 검사 대상·필터·오류 판정 무변경. 런타임 코드 무변경.

## 9. 지금 구현한 것 (A)
브랜치 `perf/next-typecheck-diagnostics-first` (origin/main `fa928d6` 기준, main 미반영):
- `scripts/next-typecheck-diagnostics-first.mjs` — next 16.1.7 원문 2줄을 정확히 1개씩 찾아 「진단 먼저 → emit」 으로 교체. 버전·원문 불일치 시 exit 1. 재실행 시 「이미 적용됨」.
- `package.json` `prebuild` 에 연결 (Vercel 빌드 로그상 prebuild 실행 확인됨).
검증(로컬, 공유 node_modules 무변경 — 작업 폴더 전용 next 복사본):
| 항목 | 결과 |
|---|---|
| 처음 / 변경 없음 / 화면 1개 / 오류 수정 후 | 84 / 6 / 5 / 5초 |
| 화면 파일 오류 주입 | 실패 처리 PASS |
| 같은 오류, 변경 없이 재실행(캐시) | 실패 처리 PASS |
| 공통 파일 오류 주입 | 실패 처리 PASS |
| 공통 파일 되돌린 뒤 | 통과 82초 |
| eslint | PASS |
| Vercel 실제 단축 | **NOT_PROVEN** (운영 빌드가 돌아야 측정) |

## 10. Owner 승인 후 적용할 것과 기대 효과
| 항목 | 분류 | 기대 효과(근거) |
|---|---|---|
| 9번 브랜치 PR → ci-ok → 병합 | B | 화면 단위 수정 빌드: TS 170초 → 수 초(로컬 6·5초 기준) → 전체 약 278초 → 약 115초 **추정**. 공통·번역 파일 수정 빌드는 거의 그대로. 병합 후 연속 2회 운영 빌드 로그로 측정해 확정(C) |
| AGENTS.md 개발 프로세스를 PR 병합 방식으로 정정 | B | 문서·실제 일치 |
| 작업 반영 묶기(세션당 main 1회) | B | 빌드 43회/일·CI 취소 43% 감소 — 수치는 적용 후 측정(C) |
| `test` 환경·APNs 연결 | D | Owner 지시대로 유지 |
| 원격 `fix/restore-main-centric` 삭제 | B | 정리만 |
