# Final Cold Runtime Baseline

**측정 일시(UTC)**: 2026-05-11 (자동화 cold 세션)  
**커밋**: `793bdb85e69a662b2d21b0faa0a789812a08da96` (short `793bdb85`)  
**전제**: `npm run clean` 후 `NODE_OPTIONS=--max-old-space-size=8192` 로 각각 **단일** `next dev` 프로세스.

**원본 로그 (gitignore)**

- Webpack: `benchmark-runs/dev-webpack-20260511-150859-793bdb85.log`
- Turbo: `benchmark-runs/dev-turbo-20260511-151144-793bdb85.log`

**한계 (로그 기반으로만 기술)**

1. **`POST /api/test-login` → 410 Gone** (`compile: 20.6s` 포함): 이 환경에서 E2E용 로그인 표면이 꺼져 있어 **쿠키 기반 5경로 RSC**는 수집되지 않았다. `GET /login?next=…` 및 **다른 클라이언트가 동시에 열어둔 탭** 요청이 로그에 섞였다.
2. **Turbo 로그의 `[dev-memory-watch]`**는 30초 간격 타이머상 **2회만** 찍혀 **peak가 세션 후반이 아닐 수 있음** (Webpack은 5회).
3. **HMR**: `scripts/dev-benchmark-hmr-probe.cjs` mtime 갱신은 Webpack 로그에 **전용 `Fast Refresh` 줄이 거의 없음**. Turbo는 `Compiling /api/me/stores/[storeId]/order-counts` 등 **일부** `Compiling` 줄만 확인.
4. 따라서 아래 숫자는 **“이번 cold 머신·이번 로그에서 읽힌 값”**이며, 프로토콜 전체(로그인 1탭만·백/재진입/HMR 고정) **완전 준수는 아님**.

---

## webpack

| 항목 | 값 (로그에서 확인) |
|------|---------------------|
| **Ready in** | **3.5s** |
| **Peak heap / rss** (`[dev-memory-watch]` 중 max `heapUsed`) | **heapUsed ≈ 1.70e9 B (~1.58 GiB)**, `rss ≈ 3.52e9 B` (동일 줄) |
| **첫 무거운 문서 compile (로그인 경유)** | `GET /login?next=%2F` **compile 29.4s**, total 30.6s |
| **community-messenger (presence)** | `POST /api/community-messenger/presence` **compile 최대 25.8s** (total 27.4s), 그 외 13.8s / 3.0s 등 |
| **admin (로그에 남은 첫 hit)** | `GET /admin/stores` **compile 29.1s**, total 32.4s |
| **HMR** | probe 터치에 대응하는 **명시적 Fast Refresh 로그는 확인 못 함** (상한 미기록) |

---

## turbo

| 항목 | 값 (로그에서 확인) |
|------|---------------------|
| **Ready in** | **2.8s** |
| **Peak heap / rss** (샘플 2회 중 max) | **heapUsed ≈ 4.24e8 B (~0.39 GiB)**, `rss ≈ 2.06e9 B` — **세션이 짧아 후반 피크를 못 잡았을 수 있음** |
| **첫 `GET /login?next=%2F` compile** | **8.1s** / **7.2s** (연속 두 줄, 총 9.7s / 8.8s) |
| **presence (첫 줄)** | `POST /api/community-messenger/presence` **compile 1466ms**, total 1809ms |
| **HMR** | probe 저장 후 **`Compiling /api/me/stores/[storeId]/order-counts`** 등 일부만 확인 |

---

## /philife — /admin (프로토콜 “직접 `GET /philife`” 등)

- 로그에 **`GET /philife` (쿼리 없음)** 형태는 **거의 없음**; 대부분 `GET /login?next=%2Fphilife…` 또는 API·타 경로 혼입.
- **`GET /stores/aa11`**, **`GET /mypage/addresses?…`**, **`GET /admin/stores`** 등은 **동시에 열린 다른 UI**에서 발생한 것으로 보이며, **단일 통제 시나리오로 분리 불가**.

---

## 가장 무거운 route (이번 로그 기준)

1. **`GET /admin/stores`**: total **32.4s**, **compile 29.1s** (Webpack).
2. **`GET /login?next=%2F`**: total **30.6s**, **compile 29.4s** (Webpack cold).
3. **`GET /mypage/addresses?…`**: total **31.3s**, **compile 28.9s** (Webpack).

---

## 가장 무거운 graph 추정 (정성, 로그 근거)

- **Cold 시 `/login` RSC + proxy + 첫 API 그래프**가 수십 초 compile 구간을 만든다.
- **`POST /api/community-messenger/presence`** cold compile이 **수 초~25s**까지 튀며, 메신저 부트스트랩 경로가 무겁다.
- **Admin `/admin/stores`**, **스토어 owner API** (`/api/me/stores/.../order-counts` compile 21.3s 등) **관리·상점 API 번들**이 별도 무게축.

---

## giant graph 감소 여부 (이번 baseline만으로)

- **판정 불가**: 이 로그는 **최근 lazy/boundary 커밋 전후 A/B**가 아니라 **현재 워킹 트리 한 점**의 스냅샷이며, **test-login 실패·외부 탭 혼입**으로 **사전-사후 비교 불가**.

---

## webpack vs turbo 차이 (동일 로그 품질 한계 내)

| 지표 | Webpack (관측) | Turbo (관측) |
|------|----------------|--------------|
| Ready | **3.5s** | **2.8s** |
| 첫 `/login?next=%2F` compile (유사 조건) | **~29s** | **~7–8s** |
| 첫 `POST …/presence` compile | **13.8s ~ 25.8s** | **~1.5s** (첫 줄; 이후 요청 다름) |

→ **Turbo가 dev cold에서 훨씬 빠르게 보이는 구간**이 있으나, **동일 요청 순서·동일 인증 상태로 정렬되지 않았으므로** “Turbo가 항상 이 정도”라고 단정하지 않는다.

---

## 구조 개선 효과 판단

- **이 baseline 파일만으로는 lazy/boundary 효과를 수치 입증할 수 없음** (동일 시나리오·동일 인증·혼입 제거 후 재측정 필요).

---

## 다음 실제 최우선 구조 개선 후보 (측정 가능하게 하기 위해)

1. **로그인 가능한 cold run**: `test-login` 410 원인 해소 또는 **브라우저에서 export한 쿠키**로 `curl` 재현 → 프로토콜 §3 **그대로** 로그에 남기기.
2. **Tee 인코딩 UTF-8 통일** (헬퍼 스크립트만, 다음 PR): 현재 로그에 **UTF-16 null**이 섞여 `grep`이 불편함.
3. **측정 중 다른 localhost 탭 종료**로 로그 혼입 제거.

---

## 지금 건드리면 위험한 것

- 계약상 금지: **`MainShellMessengerParticipantBridge`**, **`CallIncomingChrome`**, **`TradeChatEntryCreatingOverlay`**, Provider 순서·BottomNav·trade hot-path.

---

## 다음 단계 (runtime architecture)

- 본 문서의 **Webpack/Turbo 로그 파일**을 기준선으로 두고, **동일 절차·로그인 성공·탭 1개**로 재실행한 뒤 **커밋 간 diff**만으로 “효과 있음/없음/악화”를 표에 적는다.
