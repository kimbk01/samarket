# Boundary Refactor Baseline (partial, session-scoped)

**상태: PARTIAL — 프로토콜 전체(webpack·turbo 각각 cold + 브라우저 5경로 전 단계)는 아직 한 세트로 끝나지 않았습니다.**  
이유: 로컬에 **`npm run dev`가 이미 점유** 중이면 `dev:compare:*`를 동시에 띄울 수 없고(Next dev lock), 비로그인 **HTTP 프로브는 `/login?next=…`만** 서버 로그에 남습니다.

**고정한 것**

- 워킹 트리 기준 **의도 커밋**: `793bdb85e69a662b2d21b0faa0a789812a08da96` (short: `793bdb85`)
- **실제 dev 세션**: `node scripts/next-dev.cjs` + `NODE_OPTIONS=--max-old-space-size=8192` (터미널 메타데이터 기준).  
  → 프로토콜의 **`npm run dev:compare:webpack`과 번들러/래퍼 조건이 다릅니다.** 정식 baseline은 compare 스크립트로 재수집해야 합니다.

---

## webpack baseline (정식 미실행)

| 항목 | 값 |
|------|-----|
| 명령 | `npm run dev:compare:webpack` (**포트 비운 뒤** 단독 세션) |
| tee | `pwsh -NoProfile -File scripts/benchmark-runtime-dev.ps1 -Bundler webpack` |
| Ready in | **이번 자동화에서 미캡처** (compare cold 로그에 기록) |
| heap/rss | **이번 자동화에서 미캡처** (로그 파일에 `[dev-memory-watch]` 누적) |
| HMR | **이번 자동화에서 미캡처** (probe 저장 1회) |

---

## turbo baseline (정식 미실행)

| 항목 | 값 |
|------|-----|
| 명령 | `npm run dev:compare:turbo` |
| tee | `scripts/benchmark-runtime-dev.ps1 -Bundler turbo` 또는 `.sh turbo` |
| 비고 | **webpack dev와 동시에 동일 repo에서 기동 불가** → webpack baseline 완료 후 **별도 cold 세션**으로 수집 |

---

## 관측 스냅샷 (기존 `npm run dev` 세션, 터미널 로그 일부)

**[dev-memory-watch]** (샘플 2점; 동일 세션 내 백그라운드 활동 포함)

- `rss=3756187648 heapUsed=3656742184 heapTotal=3795423232` (약 3.5 GiB rss / 3.4 GiB heapUsed)
- `rss=3662114816 heapUsed=3418760944 heapTotal=3747438592` (약 3.4 GiB rss / 3.2 GiB heapUsed)

**비로그인 HTTP 순회 후 서버 로그** (대상 경로가 아니라 **로그인 리다이렉트**)

- `GET /login?next=%2Fphilife` … `compile: 4ms` 수준
- 동일 패턴: `/stores`, `/community-messenger`, `/mypage`, `/admin` 및 전환 URL → **실제 5경로 RSC `compile:`이 아님**

→ **인증된 브라우저**로 프로토콜 §3을 수행한 `benchmark-runs/dev-webpack-*.log`가 있어야 “first route compile”이 의미 있습니다.

---

## /philife — /admin (프로토콜 준수 데이터)

| Route | first entry `GET … compile` | back / re-entry | HMR | transition |
|-------|------------------------------|-----------------|-----|--------------|
| /philife | **pending** (로그인 세션 + compare 로그) | pending | pending | pending |
| /stores | pending | pending | pending | pending |
| /community-messenger | pending | pending | pending | pending |
| /mypage | pending | pending | pending | pending |
| /admin | pending | pending | pending | pending |

**community-messenger bootstrap 관련 ms**  
→ 인증 후 네비게이션으로만 의미 있는 분리; 현재 스냅샷에서는 **미수집**.

---

## 현재 가장 무거운 graph 추정 (정성)

- **장시간 dev 세션**: `/stores/owner`·스토어 API·`presence`·알림 등 **병행 요청**이 `compile:`·rss를 들쭉날쭉하게 만듦.
- **`MainAppProviderTree` 동기 잔량**: 헤더 스택·`TradeChatEntryCreatingOverlay`·`ConditionalAppShell` 등 **아직 lazy 전이 아닌 블록**.
- **루트/글로벌 크롬**: `app/layout.tsx` 쪽 메신저·통화·브리지(정책상 이번 라운드 비대상).

---

## webpack vs turbo 차이

- **이번 문서에서 수치 비교 없음** (turbo cold 로그 미수집).
- 이후 동일 커밋·동일 시나리오로 `benchmark-runs/`에 두 파일을 남기면 표로 채울 것.

---

## 다음 최우선 구조 개선 후보 (baseline 이후에만)

1. 프로토콜대로 **compare webpack + turbo 로그 1세트** 확보 (가장 우선).
2. 수치가 나온 뒤: `MainAppProviderTree` 잔여 **UI-only lazy** 후보(오버레이는 hot-path 검토 후).
3. `(main)/layout` RSC·데이터 경계(별도 설계).

---

## 지금 건드리면 위험한 것

- `MainShellMessengerParticipantBridge`, `CallIncomingChrome`, `TradeChatEntryCreatingOverlay` (합의된 금지/보류).
- Provider 순서·BottomNav·trade hot-path 계약.

---

## 정식 baseline으로 바꾸는 체크리스트

1. `npm run dev` 중지 → `.next/dev/lock` 해소 확인  
2. `pwsh -NoProfile -File scripts/benchmark-runtime-dev.ps1 -Bundler webpack`  
3. 브라우저 **로그인** 후 `docs/dev-runtime-benchmark-protocol.md` §3 전부 수행  
4. Ctrl+C로 로그 종료 → `benchmark-runs/dev-webpack-*.log` 보관  
5. 동일 절차로 `-Bundler turbo`  
6. 이 파일 상단 **상태를 COMPLETE**로 바꾸고 표에 숫자 기입 (또는 별도 `benchmark-runs/BASELINE-SUMMARY.md`는 gitignore이므로 팀 공유 시 **이 문서 또는 PR 본문**에 붙이기)

---

*생성 시각(UTC 기준 로컬 기록): 벤치마크 실행 환경에 맞게 직접 적으세요.*
