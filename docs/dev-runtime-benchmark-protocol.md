# 개발 런타임 벤치마크 프로토콜 (5경로 고정)

목적: **구조 변경 없이** 동일 시나리오를 `webpack` / `turbo` / **커밋 간**에 반복해,  
`[dev-memory-watch]`, `compile:`, `Ready in`, HMR/전환 로그를 **파일로 고정**해 비교한다.

전제: 앱 동작·Provider·라우트 계약은 **이 문서만으로는 변경하지 않는다**.  
측정은 **수동 브라우저 조작 + 터미널 로그 캡처**가 기본이다.

---

## 1. 실행 명령 (번들러 고정)

**포트 3000을 비운 뒤** 한 터미널에서만 dev를 띄운다 (`next` dev lock 단일).

| 목적 | 명령 | 비고 |
|------|------|------|
| Webpack (순수 CLI, 래퍼 없음) | `npm run dev:compare:webpack` | `package.json` → `next dev --webpack` |
| Turbopack (순수 CLI) | `npm run dev:compare:turbo` | `package.json` → `next dev --turbo` |
| 로그 동시 저장 (Windows) | `pwsh -NoProfile -File scripts/benchmark-runtime-dev.ps1 -Bundler webpack` | 아래 [헬퍼 스크립트](#8-헬퍼-스크립트) |
| 로그 동시 저장 (Unix) | `./scripts/benchmark-runtime-dev.sh webpack` | 동일 |

일상 개발용 `npm run dev` (`node scripts/next-dev.cjs`)는 **포트 정리·힙 배너**가 있어 벤치마크와 조건이 다르다.  
**커밋 간 A/B**에는 위 **`dev:compare:*`** 를 우선 쓰고, 필요하면 별도 줄에 “이번 세션은 `npm run dev`”를 로그 헤더에 적는다.

**Node 힙** (선택이지만 기록 권장):

```powershell
$env:NODE_OPTIONS="--max-old-space-size=8192"
```

측정 시작 전 터미널에 `git rev-parse HEAD` 출력을 붙여 넣거나, 헬퍼가 프리앰블을 쓰도록 한다.

---

## 2. 탭·리프레시 규칙 (브라우저)

| 규칙 | 내용 |
|------|------|
| 탭 | **브라우저 탭 1개만** (같은 프로필에서 다른 localhost 탭 금지) |
| 창 | 가능하면 **시크릿이 아닌** 일반 창 1개 (확장 프로그램은 끄거나 동일 구성 유지) |
| Hard refresh | **세션당 1회만**: 첫 `http://localhost:3000` 로드 직전 **Hard refresh 한 번** (Windows: `Ctrl+Shift+R`). 이후 경로 이동은 **일반 클라이언트 네비게이션**만 사용 |
| 캐시 | 측정 전 브라우저 개발자도구 Network에서 **“Disable cache”** 끄기(기본) — 매번 hard refresh 하지 말 것 |
| 로그인 | 5경로 중 로그인 필요 구간은 **미리 동일 계정으로 로그인 완료** 후, 벤치마크 **시작 시각**부터 로그만 사용 |

---

## 3. 경로 순서 (고정)

아래 순서를 **한 사이클**로 정의한다. 한 사이클 끝나면 필요 시 **2~3사이클 반복** (권장 총 시간은 [권장 측정 시간](#10-권장-측정-시간)).

| # | 경로 | 전환(라우트 transition 1회) |
|---|------|------------------------------|
| 1 | `/philife` | 같은 탭에서 `/philife/write` 로 이동 (뒤로가기로 `/philife` 복귀는 아래 단계에서) |
| 2 | `/stores` | `/stores/search` |
| 3 | `/community-messenger` | `/community-messenger/trade-chats` |
| 4 | `/mypage` | `/mypage/account` |
| 5 | `/admin` | `/admin/stores` (권한 없으면 리다이렉트될 수 있음 → **동일 계정·동일 결과**를 유지할 것) |

**각 경로에서 수행할 동작 (동일 순서)**:

1. **첫 진입**: 주소창에 해당 경로 입력 후 Enter (또는 링크 1회 클릭).
2. **뒤로가기**: 브라우저 **뒤로** 1회 (`Alt+←` / 제스처 등 **한 가지만** 고정).
3. **재진입**: 앞으로 1회 또는 동일 경로를 다시 네비게이션 (**세션 내 동일 조작**으로 고정).
4. **HMR 1회**: 에디터에서 `scripts/dev-benchmark-hmr-probe.cjs` 를 연 뒤 **저장** 1회 (공백 추가·삭제). 앱에서 import 하지 않으며, dev 워처만 깨운다.
5. **Route transition 1회**: 위 표의 “전환” 열로 **클라이언트 네비게이션** 1회 (`<Link>` 클릭 권장; 주소창 직접 입력은 매번 동일하면 허용).

---

## 4. 반드시 수집할 로그 (터미널)

다음 패턴이 **하나의 로그 파일**에 남도록 `tee` 한다.

| 항목 | 출처 | 예시 패턴 |
|------|------|-----------|
| dev 메모리 | Node `instrumentation` | `[dev-memory-watch]` |
| 라우트 컴파일 | Next dev stdout | `compile:` 또는 `GET /path ... compile:` |
| 부팅 완료 | Next dev stdout | `Ready in` |
| HMR / 재컴파일 | Next dev stdout | `Compiling` / `○ Compiling` / `✓ Compiled` (버전에 따라 표기 상이) |
| 첫 응답 / 전환 | Next dev stdout | `GET /path 200 in **ms` (`in` 뒤가 **총 소요**, 괄호 안 `compile` / `render` 분해) |

**route transition latency**: 같은 줄의 `GET /target 200 in XXXms` 를 기록한다.  
**first response latency**: 해당 경로 **최초** `GET` 줄의 `in XXXms` (이전에 방문하지 않았을 때).

---

## 5. 로그 파일명 규칙

기본 디렉터리: **`benchmark-runs/`** (저장소 루트, `.gitignore`로 커밋 제외).

```
benchmark-runs/dev-<bundler>-<YYYYMMDD-HHmmss>-<shortsha>.log
```

- `<bundler>`: `webpack` | `turbo`
- `<shortsha>`: `git rev-parse --short HEAD` (7자 전후)

예: `benchmark-runs/dev-webpack-20260511-143022-a1b2c3d.log`

**로그 파일 맨 위에 붙일 프리앰블 (수동 또는 스크립트)**:

```
BENCHMARK_PROTOCOL=dev-runtime-benchmark-protocol.md v1
GIT_SHA_FULL=<git rev-parse HEAD>
GIT_BRANCH=<git branch --show-current>
NODE_VERSION=<node -v>
NPM_SCRIPT=dev:compare:webpack|dev:compare:turbo
NODE_OPTIONS=<echo $env:NODE_OPTIONS or printenv>
STARTED_UTC=<ISO8601>
BROWSER_RULES=single-tab,hard-refresh-once
```

---

## 6. 로그 grep / 추출 (복붙용)

### Windows (PowerShell, 로그 파일 하나)

```powershell
Select-String -Path .\benchmark-runs\dev-webpack-*.log -Pattern "dev-memory-watch|Ready in|compile:|Compiling|Compiled in|GET /"
```

### Unix (bash)

```bash
grep -E 'dev-memory-watch|Ready in|compile:|Compiling|Compiled in|GET /' benchmark-runs/dev-webpack-*.log
```

**`Ready in` 만:**

```bash
grep 'Ready in' benchmark-runs/dev-webpack-*.log
```

**`/philife` 관련 요청만:**

```bash
grep 'GET /philife' benchmark-runs/dev-webpack-*.log
```

---

## 7. Commit hash 기록 방식

1. 측정 **직전** 터미널에서:
   - `git rev-parse HEAD`
   - `git status -sb` (로컬 변경 있으면 벤치마크 **비권장**; 있으면 로그에 그대로 붙임)
2. 로그 파일명에 **short sha** 포함 (위 명명 규칙).
3. PR/이슈에 붙일 때: **풀 SHA 한 줄 + 로그 파일 경로(상대 경로)**.

---

## 8. Before / After 비교 표 (복사해 채움)

아래 표는 **한 경로·한 지표씩** 숫자만 옮긴다. 단위 통일: ms 또는 s.

| Step | Route | Metric | Before (commit / date / bundler) | After (commit / date / bundler) | Delta |
|------|-------|--------|-----------------------------------|----------------------------------|-------|
| Boot | — | Ready in | | | |
| Mem | — | heapUsed @ T+10m | | | |
| Mem | — | rss @ T+10m | | | |
| 1a | /philife | first GET total ms | | | |
| 1b | /philife | first compile ms | | | |
| … | … | … | | | |

**Before/After**는 **동일 bundler**끼리 먼저 비교한 뒤, webpack vs turbo는 **별도 표**로 나누는 것을 권장한다.

---

## 9. 헬퍼 스크립트

| 파일 | 역할 |
|------|------|
| `scripts/benchmark-runtime-dev.ps1` | `benchmark-runs/` 생성, 타임스탬프 파일명, 프리앰블 출력, `npm run dev:compare:*` stdout/stderr **tee** |
| `scripts/benchmark-runtime-dev.sh` | 동일 (bash) |
| `scripts/dev-benchmark-hmr-probe.cjs` | **실행되지 않음**. 내용 수정 후 저장만으로 HMR/재컴파일 유도 |

앱 런타임·Provider·`MainAppProviderTree`에는 **연결하지 않는다**.

---

## 10. 권장 측정 시간

| 단계 | 권장 |
|------|------|
| Cold start → Ready | 로그 1회 캡처 |
| 5경로 × (첫진입·뒤로·재진입·HMR·전환) | **약 8~12분** |
| 안정 구간 메모리 | **`[dev-memory-watch]` 30s 간격**이므로 **최소 10분 이상** 체류 시 곡선 20포인트 전후 |
| 반복 사이클 | 동일 세션에서 **2사이클** 또는 **세션 2개(오전/오후)** |

---

## 11. 다음 단계 준비도 (정의)

아래가 갖춰지면 **이후 구조 변경은 본 프로토콜로만 평가**한다.

- [ ] `benchmark-runs/`에 webpack 로그 1개 + turbo 로그 1개 (동일 커밋·동일 시나리오)
- [ ] 각 로그에 프리앰블 + `git rev-parse HEAD` 일치
- [ ] 비교 표에 **Ready in** + 대표 경로 **first compile** + T+10m **heapUsed** 기입

---

## 12. 알려진 한계

- **HMR 전용 ms**는 Next stdout에 항상 숫자로 찍히지 않을 수 있다. 그 경우 **`Compiling` ~ 다음 `GET`/`Compiled` 사이의 wall**을 영상/스톱워치로 보조하거나, **같은 조작만 반복 가능**하게 두고 상대 비교만 한다.
- **Turbo vs Webpack**은 캐시·병렬 정책이 달라 **절대값이 아닌 동일 프로토콜 상대 비교**가 목적이다.
- 로그인·네트워크·백엔드 지연은 `render:` 쪽에 섞인다. **가능하면 스테이징/로컬 API 고정**.

---

## 관련 문서

- `docs/dev-memory-runtime-separation.md` — dev 메모리 `[dev-memory-watch]` 출처·운영 분리 개념
