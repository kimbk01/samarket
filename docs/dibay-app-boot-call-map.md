# DIBAY 앱 부팅·데이터 호출 지도

레이어: **App Boot** → **Surface** → **Detail** → **Background Hydration**

| API | 파일 | 시점 | mount/focus/vis/nav | 첫 화면 필수 | defer | 중복 | cache/dedupe | 판단 |
|-----|------|------|---------------------|-------------|-------|------|--------------|------|
| `/api/me/profile` | `lib/app-boot/fetch-app-boot-profile.ts` | App boot 1회 | mount | minimal만 예 | full→background | 낮음 | single-flight+TTL | **Boot 유지** |
| | `components/auth/SupabaseAuthSync.tsx` | auth 이벤트 | mount | 아니오 | 예 | 중 | boot store | **통합→boot** |
| | `contexts/RegionContext.tsx` | boot/invalidated | event | region만 | 예 | 중 | boot peek | **통합→boot** |
| | `components/auth/AuthComplianceRedirect.tsx` | 2×rAF | navigation | 동의만 | 예 | 중 | boot peek | **통합→boot** |
| | `components/i18n/AppLanguageProvider.tsx` | mount | mount | lang seed | 예 | 중 | boot peek | **통합→boot** |
| | `lib/profile/getMyProfile.ts` | on-demand | — | surface별 | — | dedupe full | **Detail/Surface** |
| | `lib/main-menu/bottom-nav-tap-prewarm-data.ts` | 탭 prewarm | navigation | 아니오 | 예 | 낮음 | — | **유지·prewarm** |
| `/api/auth/session` | `components/auth/SessionLostRedirect.tsx` | OAuth 경로 | navigation | 아니오 | 예 | single-flight | 3s client TTL | **유지·게이트만** |
| `/api/me/store-owner-hub-badge` | `lib/chats/owner-hub-badge-store.ts` | background | idle | 아니오 | **예** | single-flight | 5s srv+cli | **Background** |
| | `lib/chats/use-owner-hub-badge-total.ts` | BottomNav 구독 | mount | 배지 UI | fetch defer | 스토어 1갈래 | — | **구독 유지·fetch 지연** |

### Hub badge 서버 캐시 (2026-05-19, 회귀 방지)

클라: `owner-hub-badge-store.ts` defer·`MIN_FETCH_GAP_MS`·5s 중복 방지. 서버 cold 빌드는 wave1→2→3 병렬·prefetch 유지.

| Stage | Memory 모듈 | TTL | miss fallback |
|-------|---------------|-----|----------------|
| unread_parts | `hub-badge-unread-parts-memory-cache` | 5s | `hub_badge_user_unread_counters` → RPC → legacy |
| find_hub_store | `owner-hub-store-lookup-cache` | 45s | PostgREST stores+permissions embed |
| cm_unread | `cm-unread-room-count-memory-cache` | 5s | `get_community_messenger_unread_room_count` RPC |
| store_order_unread | `hub-store-order-unread-memory-cache` | 5s | store_orders limit 80 + participants |
| store_attention | `hub-store-attention-memory-cache` | 5s | `get_owner_hub_store_attention_counts` RPC |
| **route JSON** | `owner-hub-badge-cache.ts` | 5s | full `buildOwnerHubBadgePayloadWithMeta` |

통합 invalidate: `invalidateOwnerHubBadgeCache(userId)` — route + 위 memory(+ unread counter bypass).

측정: `npm run dev` 재시작 → `HUB_BADGE_TERMINAL_LOG=<터미널 경로>` → `node scripts/measure-owner-hub-badge-perf.mjs`. 스크립트는 `caller_component=measure_script`·`user_id_short` 로만 집계(백그라운드 hub-badge 로그 제외). run2 전 stage `memory`·`db_ms≤50` 합격. run3 plain GET은 run2 후 4.2s 이내. 상세 표: `docs/trade-perf-hot-path-changelog.md` 「Hub badge 회귀 방지」.
| `/api/community-messenger/bootstrap` | `home/use-community-messenger-home-bootstrap.ts` | CM surface | navigation | CM만 | critical→lite idle | single-flight | 8s route | **Surface** |
| | `cm-bootstrap-client-fetch.ts` | 위 훅 | — | CM | — | — | — | **Surface** |
| `/api/community-messenger/home-sync` | `cm-home-silent-lists-fetch.ts` | silent refresh | vis/focus | 아니오 | 예 | TTL+flight | **Background** |
| `/api/community-messenger/trade-chat-list-meta` | `use-trade-chat-list-meta-hydration.ts` | CM trade 탭 | idle | 아니오 | **예** | scheduler | **Background** |

## 검증 (dev)

1. hard reload 후 시나리오 3회
2. 브라우저 콘솔: `copy(JSON.stringify(window.__dibayBootVerify))`
3. `node scripts/dibay-boot-verify-report.mjs journal.json`
4. 터미널 `[route-perf]` / `[app-boot]` / `[cm-bootstrap-breakdown]` 대조

## API 재분류

- **A Boot**: `GET /api/me/profile?mode=minimal` (≈ lite 컬럼)
- **B Surface**: `bootstrap?tier=critical`, 홈/스토어 surface API
- **C Background**: hub-badge, home-sync, trade-chat-list-meta, `profile mode=full`
- **D Detail**: room full, trade/store/order detail
