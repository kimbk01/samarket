# 개발 메모리 vs 운영 런타임 메모리 분리 진단

목표: `next dev`(Webpack/Turbopack/HMR)에서의 힙 재시작과, `next start` 운영 런타임 누수를 **분리**해 관측한다. Supabase DB 용량과는 무관한 축이다.

## 1단계: 현재 설정 요약 (코드베이스 기준)

| 항목 | 값 |
|------|-----|
| `npm run dev` | `node scripts/next-dev.cjs` |
| 기본 `--max-old-space-size` | **4096** (`NODE_OPTIONS`에 이미 `--max-old-space-size` 가 있으면 **추가·덮어쓰기 안 함**) |
| 16GB+ 명시 상향 | 환경 변수 **`SAMARKET_DEV_HEAP_MB`** (예: `8192`) — **명시 시에만** 적용, 상한 8192·하한 512 클램프 |
| Windows 기본 번들러 | `next-dev.cjs`가 `--turbo`/`--webpack` 미지정 시 **`--webpack` 자동 추가** |
| `dev:turbo` | `node scripts/next-dev.cjs --turbo` (포트 정리·잠금 포함 래퍼) |
| `dev:webpack` | `next dev --webpack` (순수 CLI) |
| 비교용 (래퍼 없음) | `npm run dev:compare:turbo` / `npm run dev:compare:webpack` |
| `next.config.js` `experimental` | `staleTimes`, `optimizePackageImports`, **`webpackMemoryOptimizations: true`** 병합 |
| `proxy` | Next 16 `proxy.ts` — 세션·리다이렉트 (별도 Node 힙과 무관한 요청당 비용) |
| `tsconfig.json` include | `.next/dev/types/**/*.ts` — dev 타입 생성물 의존 (`tsc`는 dev 빌드 후 필요) |
| `[dev-memory-watch]` 끄기 | **`SAMARKET_DEV_MEMORY_WATCH=0`** (또는 `false` / `off`) — `instrumentation`에서 모듈 로드 생략 |
| `[dev-memory-watch]` 간격·첫 지연 | 선택: **`SAMARKET_DEV_MEMORY_WATCH_MS`**, **`SAMARKET_DEV_MEMORY_WATCH_STARTUP_DELAY_MS`** (§2) |

## 2단계: 개발 메모리 로그

- 진입: 프로젝트 루트 `instrumentation.ts` → development 일 때만 `lib/dev/instrumentation-dev-memory-watch.ts` 를 dynamic import (Edge 번들이 `process.memoryUsage` 를 정적으로 끌어오지 않도록 분리).
- 조건: `NODE_ENV === "development"` 일 때만 타이머 등록. **`SAMARKET_DEV_MEMORY_WATCH=0|false|off`** 이면 **로드·타이머 없음**.
- 간격: 기본 **30초** — `SAMARKET_DEV_MEMORY_WATCH_MS` (밀리초, 최소 5000, 최대 600000).
- 첫 샘플: 기본 **2.5초 지연** (`Ready` 직후에 가깝게 맞춤). `SAMARKET_DEV_MEMORY_WATCH_STARTUP_DELAY_MS` 로 조정(0~120000). **0**이면 `queueMicrotask` 직후 1회 + 주기.
- 중복: `register()` 이중 호출 시에도 **타이머 1세트**만 (`globalThis.__samarketDevMemoryWatchStarted`).
- 형식: `[dev-memory-watch] phase=startup-delayed|startup|interval rss=…(…MiB) heapUsed=… heapTotal=… external=…`
- 운영: `register()` 초기에 `NODE_ENV !== "development"` 이면 즉시 반환 — **타이머 없음**

## 3단계: 운영 런타임 분리 테스트 절차

아래는 **로컬에서** dev vs prod 런타임을 나누는 최소 절차다.

1. **운영 모드**
   ```bash
   npm run build
   npm run start
   ```
2. 같은 시나리오(탭 수·페이지 순회)를 **약 10분** 반복한다.
3. **판단**
   - **`next dev`만** `[dev-memory-watch]` 가 단조 증가하고 Next가 재시작하면 → **번들러/HMR/컴파일 캐시** 이슈 우선.
   - **`next start`에서도** rss/heapUsed가 계속 증가하면 → **애플리케이션 런타임**(전역 캐시·클로저·미해제 타이머 등) 의심 → 프로파일링·별도 이슈로 추적.
4. Supabase 업그레이드는 **API 타임아웃·429·저장공간 알림** 등 DB/프로젝트 한도가 실측으로 드러날 때만 검토한다. **dev 서버 메모리 재시작의 1차 원인으로 DB 용량을 두지 않는다.**

## 4단계: 완료 보고서 템플릿 (실측 후 채움)

| 측정 | 결과 (직접 기록) |
|------|------------------|
| 적용된 dev heap (시작 로그 `[samarket] Node heap …`) | |
| `dev:compare:webpack` 10분 rss/heap 추이 | |
| `dev:compare:turbo` 10분 rss/heap 추이 | |
| `next start` 10분 rss/heap 추이 | |
| Supabase 용량 관련 여부 | 서버 메모리와 직접 연결 안 함 / 별도 지표 필요 시 기술 |
| 이번 작업으로 수정된 파일 | `instrumentation.ts`, `lib/dev/instrumentation-dev-memory-watch.ts`, `scripts/next-dev.cjs`, `next.config.js`, `package.json`, `docs/dev-memory-runtime-separation.md` |

## 5단계: import / 레이아웃 점검 보고 (코드 변경 없음 — 후속 우선순위)

아래는 **구조 개선 후보**이며, 이번 라운드에서는 수정하지 않았다.

### A. 루트 `app/layout.tsx` — 전역 크롬

| 파일 | 내용 |
|------|------|
| `app/layout.tsx` | `CallIncomingChrome`, `CommunityMessengerPresenceRuntimeChrome`, `MainShellMessengerParticipantBridge` 등 **앱 전역** 클라이언트 크롬 |

**원인**: 라우트와 무관하게 메신저·통화 관련 모듈 그래프가 루트에 붙는다.

**예상 영향**: 프로덕션 번들 청크 분할로 완화될 수 있으나, **dev**에서는 해당 모듈 컴파일·HMR 시 메모리 사용이 커질 수 있다.

**우선순위**: 중 — 실측으로 `(main)`만 열었을 때 vs 메신저 진입 후 힙 차이를 본 뒤 결정.

### B. `(main)/layout.tsx` — 메인 셸 데이터 + 프로브

| 파일 | 내용 |
|------|------|
| `app/(main)/layout.tsx` | `loadMainBottomNavItemsServerCached`, `getHomeTradeChipCategoriesForServer`, `MessengerRoomRouteEntryMountProbe` |

**원인**: 메인 영역 공통 RSC 데이터 + 메신저 라우트 마운트 프로브가 한 레이아웃에 공존.

**예상 영향**: dev에서 `/stores/owner` 등 탭 이동 시 관련 모듈 전부 컴파일 대상에 포함될 수 있음.

**우선순위**: 중 — 기능 변경 없이 줄이려면 라우트 그룹 분리 등 설계 검토가 필요 (별도 RFC).

### C. `app/admin/layout.tsx`

| 파일 | 내용 |
|------|------|
| `app/admin/layout.tsx` | `AdminShell`, `AdminGuard`, 서버 `getOptionalAdminUserId` |

**원인**: `/admin` 전용이므로 일반 사용자 페이지 번들과는 분리되어 있다.

**예상 영향**: 관리자 페이지 개발 시에만 해당 청크 로드 — **사용자 플로우 전역 오염은 상대적으로 낮음**.

**우선순위**: 낮 (분리 양호).

### D. `app/(main)/community-messenger/layout.tsx`

| 파일 | 내용 |
|------|------|
| `CommunityMessengerRoomClientPrefetch`, `CommunityMessengerMediaPreflight`, `MessengerSnackbarHost` |

**원인**: 메신저 도메인 모듈이 해당 세그먼트에만 묶임.

**예상 영향**: 메신저 진입 시 컴파일 부하 집중 — **도메인 경계는 명확**.

**우선순위**: 낮~중.

### E. Barrel / 아이콘

| 패턴 | 예시 |
|------|------|
| `lucide-react` | 대부분 named import (`ChevronDown` 등). `lib/business/owner-hub-menu-icons.ts` 등 **한 파일에서 여러 아이콘** import — 트리셰이킹은 번들러에 의존 |
| `@/*` 경로 | 광범위 alias — dev에서 **경로별 컴파일 그래프가 크게 느껴질 수 있음** (구조적 특성) |

**우선순위**: 낮 — `experimental.optimizePackageImports`에 `lucide-react` 미포함; 필요 시 추후 번들 분석 후 추가 검토.

---

## 다음에 손댈 구조 개선 후보 (3개)

1. **루트 레이아웃의 메신저/통화 크롬**: 경로 플래그 기준 lazy boundary 재검토 (기능 동일·청크만 분리 — 별도 작업).
2. **`optimizePackageImports`에 `lucide-react` 추가 여부**: 번들 분석(`build:analyze`) 후 효과 측정.
3. **`(main)/layout` RSC 병렬 로드**: 이미 `Promise.all`; 추가 분리는 도메인 정책과 함께 검토.
