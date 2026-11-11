# Hub effect inventory — effects that would run while a hub is CSS-hidden (instead of `<Activity hidden>`)

Source: worktree msg-p0 at origin/main (components/route-transition/** edits irrelevant). Static trace: import graph from each hub's `app/(main)/<hub>/layout.tsx` + `page.tsx` (only edges importing a Component (`Xyz`) or hook (`useXyz`), incl. `import()`/`next/dynamic`), then every `useEffect`/`useLayoutEffect`/`useInsertionEffect`/`useSyncExternalStore` call site in reached files. One row per call site (not per mounted instance — list items like PostCard/SamarketThumbnail mount many instances).

Categories: R realtime · T timer/rAF · L window/document listener · O observer · F fetch · S external store · D DOM · N none. Multiple letters = several apply.

Key assumptions for risk:
- Hidden hubs receive **frozen router contexts** (`FrozenRouterContexts`), so effects whose deps are only `pathname`/`searchParams`/`params` do not re-run while hidden. `useRouter()` is NOT frozen — `router.replace` from a hidden hub navigates the visible app.
- Today `<Activity hidden>` runs effect cleanups on hide (and unsubscribes `useSyncExternalStore`); with CSS hiding none of that happens, so **anything registered globally while visible stays registered** (shell header extras, overlay registry, back stack, body scroll lock, PTR gesture on the shared scroll root).
- `display:none` makes IntersectionObserver report not-intersecting and ResizeObserver report 0×0; if hiding uses `visibility/opacity/transform/content-visibility` instead, observers keep reporting visible and the O/T ad-impression rows become live impressions.
- S rows on plain in-memory stores = LOW (hidden re-render only); S rows whose subscribe() starts IO on first subscriber (owner hub badge, notification badge poll, owner-lite store) = HIGH because a hidden hub keeps the refcount > 0.
- F rows are LOW when they only run on mount / route-frozen deps (they already ran when the hub was first shown); HIGH when they are driven by a listener/timer or by global deps (language, auth/membership, region/address, refresh ticks, async-loaded state).


## home (63 effects, 32 HIGH)

| hub | file:line | component/hook | kind | what it does | category | risk | reason |
|---|---|---|---|---|---|---|---|
| home | `components/home-hub/HomeOngoingSection.tsx:23` | HomeOngoingSection | Effect | fetch /me store-orders hub summary (force when refreshSeq>0) | F | **HIGH** | refreshSeq bumps from PTR (hidden PTR gesture still bound) -> fetch |
| home | `components/home-hub/HomePostsSection.tsx:38` | HomePostsSection | Effect | fetch philife neighborhood feed for home posts shelf (revisit-gated) | F | **HIGH** | deps rot/seq change refetch while hidden |
| home | `components/home-hub/HomeStoresSection.tsx:98` | HomeStoresSection | Effect | load home stores shelf (revisit-gated by gateKey) | F | **HIGH** | deps include isMember/rot/seq/language — rotation or auth change refetches while hidden |
| home | `components/home-hub/HomeTradeRow.tsx:59` | HomeTradeRow | Effect | load home trade row (revisit-gated) | F | **HIGH** | deps rot/seq/config change refetch while hidden |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:417` | PhilifeHeaderNotificationInbox | SyncExternalStore | refcounted: first subscriber schedules badge fetch and poll interval | S | **HIGH** | poll interval stays armed while hidden hub mounted |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:496` | PhilifeHeaderNotificationInbox | Effect | dispatch tier1 header overlay open/close events | N | **HIGH** | if inbox left open on hide, global 'overlay open' state persists (no cleanup) |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:698` | PhilifeHeaderNotificationInbox | Effect | deferred load of notification sound settings (/api) | T,F | **HIGH** | runs once per mount; loadSound identity change refetches |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:710` | PhilifeHeaderNotificationInbox | Effect | startup-deferred inbox list prefetch (/api notifications) | T,F | **HIGH** | network; re-runs on deps change while hidden |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:731` | PhilifeHeaderNotificationInbox | Effect | window settings/inbox-changed events -> reload sound / mark inbox dirty | L,F | **HIGH** | network fetch from hidden hub on global events |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:772` | PhilifeHeaderNotificationInbox | Effect | body.classList overflow-hidden while panel visible | D | **HIGH** | if left open on hide, body scroll lock persists over visible hub |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:792` | PhilifeHeaderNotificationInbox | Effect | document keydown(Esc)/window resize/scroll -> layout panel | L,D | **HIGH** | only while visible=open; global keyboard+scroll listener if left open |
| home | `components/ptr/DibayPtrRevealAdLayer.tsx:110` | useDibayPtrRevealAd | Effect | ensurePtrRevealAd(pathname, variant) — fetch PTR ad | F | **HIGH** | deps adsVersion/frameWidthPx/snap.phase change while hidden (ResizeObserver reports 0 then back) |
| home | `components/ptr/DibayPtrRevealAdLayer.tsx:118` | useDibayPtrRevealAd | Effect | PTR reveal ad exposure/impression bookkeeping per pull phase | F,O | **HIGH** | records ad impression if hidden hub's PTR store phase changes (gesture bound to shared scroll root) |
| home | `components/ptr/DibayPtrRevealAdLayer.tsx:185` | useDibayPtrRevealAd | Effect | mark PTR ad impressed when held past threshold | N | **HIGH** | ad impression analytics driven by shared-root PTR gesture |
| home | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:113` | DibayOverlayRoot | Effect | window keydown Escape -> onClose | L | **HIGH** | global keyboard listener while sheet open (not cleaned on hide) |
| home | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:122` | DibayOverlayRoot | Effect | document.body overflow hidden while open | D | **HIGH** | scroll lock persists over visible hub if sheet open on hide |
| home | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:84` | DibayOverlayRoot | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay registry persists if sheet open on hide |
| home | `hooks/use-representative-address-line.ts:179` | useRepresentativeAddressLine | Effect | load representative address line on pathname/load change | F | **HIGH** | load identity changes with auth; fetches address defaults |
| home | `hooks/use-representative-address-line.ts:183` | useRepresentativeAddressLine | Effect | window popstate -> reload address line (silent) | L,F | **HIGH** | fires on every back/forward in visible hub -> address fetch from hidden hub |
| home | `hooks/use-representative-address-line.ts:189` | useRepresentativeAddressLine | Effect | SAMARKET_ADDRESSES_UPDATED -> force reload address | L,F | **HIGH** | network fetch from hidden hub on address save |
| home | `hooks/use-representative-address-line.ts:201` | useRepresentativeAddressLine | Effect | auth changed -> force reload address / clear | L,F | **HIGH** | network fetch from hidden hub on auth change |
| home | `lib/addresses/use-address-defaults-boot-retry.ts:14` | useAddressDefaultsBootRetry | Effect | app-boot event -> retry address defaults load | L,F | **HIGH** | network fetch from hidden hub on boot events |
| home | `lib/chats/use-owner-hub-badge-total.ts:36` | useOwnerHubBadgeBreakdown | SyncExternalStore | useSyncExternalStore(subscribeOwnerHubBadge) | S | **HIGH** | refcounted: first subscriber starts owner hub badge pipeline (startHub); hidden hub keeps refcount>0 so it never stops |
| home | `lib/chats/use-owner-hub-badge-total.ts:41` | useOwnerHubBadgeBreakdownWhenEnabled | SyncExternalStore | useSyncExternalStore(subscribeOwnerHubBadge) | S | **HIGH** | refcounted: first subscriber starts owner hub badge pipeline (startHub); hidden hub keeps refcount>0 so it never stops |
| home | `lib/delivery/owner/projections/use-owner-navigation-summary.ts:58` | useOwnerNavigationHasPreferredStore | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| home | `lib/stores/use-owner-lite-store.ts:15` | useOwnerLiteStore | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| home | `lib/stores/use-owner-lite-store.ts:24` | useOwnerLitePreferredStoreRow | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| home | `lib/ui/overlay-back-stack.ts:121` | useOverlayHardwareBack | Effect | pushOverlayBackEntry while active | N | **HIGH** | hardware-back stack entry persists -> back press closes hidden sheet instead of navigating |
| home | `lib/ui/ptr/use-dibay-ptr-gesture.ts:98` | useDibayPtrGesture | Effect | PTR gesture: touchstart/move/end/click capture on main app scroll root (+sticky header, extra scroll containers) | L,T | **HIGH** | binds to SHARED [data-main-hub-scroll-body]/main scroll root — hidden hub's pull-to-refresh fires on visible hub's pull, preventDefault on touchmove |
| home | `lib/ui/use-form-keyboard-focus-visibility.ts:154` | useFormKeyboardFocusVisibility | Effect | document focusin/focusout + visualViewport resize/scroll + ResizeObserver to keep focused input visible | L,O,T,D | **HIGH** | global focus/keyboard listeners while enabled (sheet open) |
| home | `lib/ui/use-form-keyboard-viewport.ts:220` | useFormKeyboardViewport | SyncExternalStore | subscribe visualViewport/keyboard store while enabled | S,L | **HIGH** | global keyboard listener while enabled |
| home | `lib/ui/use-register-open-overlay.ts:10` | useRegisterOpenOverlay | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay count persists if sheet left open on hide |
| home | `components/common/SamarketThumbnail.tsx:107` | SamarketThumbnail | LayoutEffect | calls probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| home | `components/common/SamarketThumbnail.tsx:114` | SamarketThumbnail | LayoutEffect | boot metric: thumbnail requested | N | LOW | mount-time metric only |
| home | `components/common/SamarketThumbnail.tsx:99` | SamarketThumbnail | Effect | calls isThumbnailUrlLoaded, probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| home | `components/home-hub/HomeBanner.tsx:104` | HomeBanner | Effect | pick banner id from rotation state | N | LOW | local state |
| home | `components/home-hub/HomeScreen.tsx:81` | HomeScreen | Effect | calls initRotation | N | LOW | pure state/ref sync |
| home | `components/home-hub/HomeScreen.tsx:98` | HomeScreen | Effect | register home PTR refresh handler (per-hub store) | N | LOW | only invoked by home PTR gesture |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:340` | PhilifeHeaderNotificationInbox | Effect | sync ref | N | LOW | pure state/ref sync |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:358` | PhilifeHeaderNotificationInbox | Effect | sync ref | N | LOW | pure state/ref sync |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:452` | PhilifeHeaderNotificationInbox | Effect | assign refs/state | N | LOW | pure state/ref sync |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:512` | PhilifeHeaderNotificationInbox | Effect | window TIER1_HEADER_OVERLAY_CLOSE -> closePanel | L | LOW | custom event; local state only |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:524` | PhilifeHeaderNotificationInbox | Effect | enter/exit animation timeout on open change | T | LOW | one-shot timer |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:824` | PhilifeHeaderNotificationInbox | Effect | fetch owner-unread-by-store when open | F | LOW | only while open |
| home | `components/philife/PhilifeHeaderNotificationInbox.tsx:838` | PhilifeHeaderNotificationInbox | Effect | load inbox list on open | F | LOW | only while open |
| home | `components/ptr/DibayPtrRevealAdLayer.tsx:105` | useDibayPtrRevealAd | Effect | note PTR reveal identity (auth/user/device) | N | LOW | in-memory |
| home | `components/ptr/DibayPtrRevealAdLayer.tsx:75` | useDibayPtrRevealAd | SyncExternalStore | useSyncExternalStore(subscribePtrRevealAds) | S | LOW | in-memory store; hidden tree re-renders on change only |
| home | `components/ptr/DibayPtrRevealAdLayer.tsx:83` | useDibayPtrRevealAd | Effect | sync ref | N | LOW | pure state/ref sync |
| home | `components/ptr/DibayPtrRevealAdLayer.tsx:99` | useDibayPtrRevealAd | Effect | calls signalAdVisible | N | LOW | pure state/ref sync |
| home | `components/ptr/DibayPtrRevealBand.tsx:58` | DibayPtrRevealBand | Effect | assign refs/state | N | LOW | pure state/ref sync |
| home | `components/ptr/DibayPtrSlot.tsx:77` | DibayPtrSlot | SyncExternalStore | useSyncExternalStore(store.subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| home | `components/ptr/DibayPtrSlot.tsx:89` | DibayPtrSlot | LayoutEffect | ResizeObserver -> frame width state | O | LOW | display:none reports 0 width; state churn only (feeds 110) |
| home | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:131` | DibayOverlayRoot | Effect | restore focus on close | D | LOW | only on close |
| home | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:89` | DibayOverlayRoot | Effect | assign refs/state | N | LOW | pure state/ref sync |
| home | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:93` | DibayOverlayRoot | Effect | enter animation rAF/timeout + save focused element | T,D | LOW | only on open change |
| home | `hooks/use-client-membership-state.ts:294` | useClientMembershipState | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| home | `hooks/use-client-membership-state.ts:296` | useClientMembershipState | Effect | bind global auth listener + ensureMembershipResolved(source) | F | LOW | deduped/resolved once; deps=source constant |
| home | `lib/chats/use-owner-hub-badge-total.ts:226` | useOwnerHubBadgeTabUnreadCount | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| home | `lib/chats/use-owner-hub-badge-total.ts:229` | useOwnerHubBadgeTabUnreadCount | Effect | perf/rerender trace bump on badge count change | N | LOW | local trace only (runs on each badge change while hidden) |
| home | `lib/layout/use-html-shell-flags-sync.ts:11` | useHtmlShellFlagsSync | LayoutEffect | request html shell flags sync on key change | D | LOW | one-shot |
| home | `lib/ui/overlay-back-stack.ts:118` | useOverlayHardwareBack | Effect | assign refs/state | N | LOW | pure state/ref sync |
| home | `lib/ui/ptr/use-dibay-ptr-gesture.ts:86` | useDibayPtrGesture | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| home | `lib/ui/use-form-keyboard-focus-visibility.ts:299` | useFormKeyboardFocusVisibility | Effect | scroll focused field into view when keyboard bottom changes | T,D | LOW | enabled sheets only |

Excluded from home (26 call sites in reached files):
- AppLanguageProvider ×3 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/i18n/AppLanguageProvider.tsx`)
- useClientMembershipRecoveryFailed ×1 — hook/component in reached file but not referenced by hub tree (`hooks/use-client-membership-state.ts`)
- useRepresentativeAddressPresentation ×5 — hook/component in reached file but not referenced by hub tree (`hooks/use-representative-address-line.ts`)
- useRepresentativeFullAddressLine ×4 — hook/component in reached file but not referenced by hub tree (`hooks/use-representative-address-line.ts`)
- useOwnerFabOrdersBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabStoreBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrderChatBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHeaderOpsAttentionCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHeaderOpsAttentionCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrdersBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabStoreBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrderChatBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHubBadgeStoreDeepLink ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerNavigationSummary ×1 — hook/component in reached file but not referenced by hub tree (`lib/delivery/owner/projections/use-owner-navigation-summary.ts`)
- useOwnerLiteHasPreferredStore ×1 — hook/component in reached file but not referenced by hub tree (`lib/stores/use-owner-lite-store.ts`)
- DibayPromptDialog ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayPromptDialog.tsx`)
- DibayAppDialogImperativeBridge ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayAppDialogImperativeBridge.tsx`)

## community (106 effects, 44 HIGH)

| hub | file:line | component/hook | kind | what it does | category | risk | reason |
|---|---|---|---|---|---|---|---|
| community | `components/ads/FeedAdBannerCarousel.tsx:124` | FeedAdBannerCarousel | Effect | fetch feed ad banners (non-pool) + refresh | T,F | **HIGH** | network ad fetch/refresh while hidden |
| community | `components/ads/FeedAdBannerCarousel.tsx:285` | FeedAdBannerCarouselView | Effect | IntersectionObserver >=50% visible (ad impression gate) | O | **HIGH** | impression gate; display:none should report false but verify (if hidden via visibility/opacity it stays true) |
| community | `components/ads/FeedAdBannerCarousel.tsx:299` | FeedAdBannerCarouselView | Effect | 1s dwell timer -> sendFeedAdEvent impression | T | **HIGH** | AD IMPRESSION analytics; fires if halfVisible stays true while hidden |
| community | `components/ads/FeedAdBannerCarousel.tsx:345` | FeedAdBannerCarouselView | Effect | setInterval auto-advance carousel | T | **HIGH** | interval keeps running if inView stays true (non-display:none hiding) |
| community | `components/community/CommunityFeed.tsx:1134` | CommunityFeed | Effect | profile-updated event -> clear caches + refetch feed | L,F | **HIGH** | network fetch from hidden hub |
| community | `components/community/CommunityFeed.tsx:1152` | CommunityFeed | Effect | fetch top ads (revisit-gated) + refresh timer | T,F | **HIGH** | ad fetch + refresh timeout keeps running while hidden |
| community | `components/community/CommunityFeed.tsx:1204` | CommunityFeed | Effect | fetch feed ad pool (revisit-gated) + refresh timer | T,F | **HIGH** | ad pool refetch timer keeps running while hidden |
| community | `components/community/CommunityFeed.tsx:1425` | CommunityFeed | Effect | idle prewarm of neighbor tabs (initial) | T,F | **HIGH** | checks document visibility but not hub visibility; network prefetch |
| community | `components/community/CommunityFeed.tsx:1437` | CommunityFeed | Effect | prewarm adjacent nav tab feeds | T,F | **HIGH** | network prefetch on deps change |
| community | `components/community/CommunityFeed.tsx:1691` | CommunityFeed | Effect | idle prefetch of other nav tabs | T,F | **HIGH** | network prefetch on deps change |
| community | `components/community/CommunityFeed.tsx:1794` | CommunityFeed | Effect | idle prewarm /market bottom tab | T,F | **HIGH** | network prefetch |
| community | `components/community/CommunityFeed.tsx:508` | CommunityFeed | Effect | router.replace to URL topic slug when topic authority ready | N | **HIGH** | topicAuthorityReady can flip after async fetch while hidden -> navigates the visible app |
| community | `components/community/CommunityFeed.tsx:912` | CommunityFeed | LayoutEffect | boot feed load for selection (topic options/plan) | F | **HIGH** | re-runs on plan/topic option changes while hidden -> feed fetch |
| community | `components/my/MyHubHeaderActions.tsx:61` | MyHubHeaderInAppSoundInner | Effect | deferred load of notification sound settings (/api) | T,F | **HIGH** | network; re-runs if loadSound identity changes |
| community | `components/my/MyHubHeaderActions.tsx:71` | MyHubHeaderInAppSoundInner | Effect | settings-changed event -> reload sound settings | L,F | **HIGH** | network from hidden hub |
| community | `components/my/MySubpageHeader.tsx:130` | MySubpageHeader | LayoutEffect | setMainTier1Extras(tier1 header) for shell header | N | **HIGH** | shell header registration not cleared on hide -> hidden hub's title can leak to visible header |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:417` | PhilifeHeaderNotificationInbox | SyncExternalStore | refcounted: first subscriber schedules badge fetch and poll interval | S | **HIGH** | poll interval stays armed while hidden hub mounted |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:496` | PhilifeHeaderNotificationInbox | Effect | dispatch tier1 header overlay open/close events | N | **HIGH** | if inbox left open on hide, global 'overlay open' state persists (no cleanup) |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:698` | PhilifeHeaderNotificationInbox | Effect | deferred load of notification sound settings (/api) | T,F | **HIGH** | runs once per mount; loadSound identity change refetches |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:710` | PhilifeHeaderNotificationInbox | Effect | startup-deferred inbox list prefetch (/api notifications) | T,F | **HIGH** | network; re-runs on deps change while hidden |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:731` | PhilifeHeaderNotificationInbox | Effect | window settings/inbox-changed events -> reload sound / mark inbox dirty | L,F | **HIGH** | network fetch from hidden hub on global events |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:772` | PhilifeHeaderNotificationInbox | Effect | body.classList overflow-hidden while panel visible | D | **HIGH** | if left open on hide, body scroll lock persists over visible hub |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:792` | PhilifeHeaderNotificationInbox | Effect | document keydown(Esc)/window resize/scroll -> layout panel | L,D | **HIGH** | only while visible=open; global keyboard+scroll listener if left open |
| community | `components/ptr/DibayPtrRevealAdLayer.tsx:110` | useDibayPtrRevealAd | Effect | ensurePtrRevealAd(pathname, variant) — fetch PTR ad | F | **HIGH** | deps adsVersion/frameWidthPx/snap.phase change while hidden (ResizeObserver reports 0 then back) |
| community | `components/ptr/DibayPtrRevealAdLayer.tsx:118` | useDibayPtrRevealAd | Effect | PTR reveal ad exposure/impression bookkeeping per pull phase | F,O | **HIGH** | records ad impression if hidden hub's PTR store phase changes (gesture bound to shared scroll root) |
| community | `components/ptr/DibayPtrRevealAdLayer.tsx:185` | useDibayPtrRevealAd | Effect | mark PTR ad impressed when held past threshold | N | **HIGH** | ad impression analytics driven by shared-root PTR gesture |
| community | `components/stores/advertising/useDeliveryAdEvents.ts:45` | useDeliveryAdImpressionObserver | Effect | IntersectionObserver + dwell timer -> delivery ad IMPRESSION beacon | O,T,F | **HIGH** | ad impression analytics; verify hidden element never counts as visible |
| community | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:113` | DibayOverlayRoot | Effect | window keydown Escape -> onClose | L | **HIGH** | global keyboard listener while sheet open (not cleaned on hide) |
| community | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:122` | DibayOverlayRoot | Effect | document.body overflow hidden while open | D | **HIGH** | scroll lock persists over visible hub if sheet open on hide |
| community | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:84` | DibayOverlayRoot | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay registry persists if sheet open on hide |
| community | `hooks/use-community-local-filter.ts:83` | useCommunityLocalFilter | Effect | syncFromMaster local filter (address master fetch) | F | **HIGH** | syncFromMaster identity depends on viewer -> refetch on auth change |
| community | `hooks/use-community-local-filter.ts:92` | useCommunityLocalFilter | Effect | addresses-updated -> force syncFromMaster | L,F | **HIGH** | network from hidden hub |
| community | `hooks/use-philife-feed-viewer-sig.ts:23` | usePhilifeFeedViewerSig | SyncExternalStore | useSyncExternalStore subscribing Supabase auth.onAuthStateChange | S,R | **HIGH** | Supabase auth subscription kept alive while hidden |
| community | `lib/chats/use-owner-hub-badge-total.ts:36` | useOwnerHubBadgeBreakdown | SyncExternalStore | useSyncExternalStore(subscribeOwnerHubBadge) | S | **HIGH** | refcounted: first subscriber starts owner hub badge pipeline (startHub); hidden hub keeps refcount>0 so it never stops |
| community | `lib/chats/use-owner-hub-badge-total.ts:41` | useOwnerHubBadgeBreakdownWhenEnabled | SyncExternalStore | useSyncExternalStore(subscribeOwnerHubBadge) | S | **HIGH** | refcounted: first subscriber starts owner hub badge pipeline (startHub); hidden hub keeps refcount>0 so it never stops |
| community | `lib/delivery/owner/projections/use-owner-navigation-summary.ts:58` | useOwnerNavigationHasPreferredStore | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| community | `lib/stores/use-owner-lite-store.ts:15` | useOwnerLiteStore | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| community | `lib/stores/use-owner-lite-store.ts:24` | useOwnerLitePreferredStoreRow | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| community | `lib/ui/overlay-back-stack.ts:121` | useOverlayHardwareBack | Effect | pushOverlayBackEntry while active | N | **HIGH** | hardware-back stack entry persists -> back press closes hidden sheet instead of navigating |
| community | `lib/ui/ptr/use-dibay-ptr-gesture.ts:98` | useDibayPtrGesture | Effect | PTR gesture: touchstart/move/end/click capture on main app scroll root (+sticky header, extra scroll containers) | L,T | **HIGH** | binds to SHARED [data-main-hub-scroll-body]/main scroll root — hidden hub's pull-to-refresh fires on visible hub's pull, preventDefault on touchmove |
| community | `lib/ui/use-app-viewport-size.ts:50` | useAppViewportSize | Effect | window resize/orientationchange + visualViewport resize/scroll -> rAF size state | L,T | **HIGH** | global listener; re-renders hidden hub on every keyboard/viewport change |
| community | `lib/ui/use-form-keyboard-focus-visibility.ts:154` | useFormKeyboardFocusVisibility | Effect | document focusin/focusout + visualViewport resize/scroll + ResizeObserver to keep focused input visible | L,O,T,D | **HIGH** | global focus/keyboard listeners while enabled (sheet open) |
| community | `lib/ui/use-form-keyboard-viewport.ts:220` | useFormKeyboardViewport | SyncExternalStore | subscribe visualViewport/keyboard store while enabled | S,L | **HIGH** | global keyboard listener while enabled |
| community | `lib/ui/use-register-open-overlay.ts:10` | useRegisterOpenOverlay | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay count persists if sheet left open on hide |
| community | `components/ads/FeedAdBannerCarousel.tsx:265` | FeedAdBannerCarouselView | Effect | matchMedia reduced-motion listener | L | LOW | rare |
| community | `components/ads/FeedAdBannerCarousel.tsx:274` | FeedAdBannerCarouselView | Effect | IntersectionObserver inView | O | LOW | display:none -> not intersecting (stops autoplay) |
| community | `components/ads/FeedAdBannerCarousel.tsx:314` | FeedAdBannerCarouselView | Effect | document visibilitychange -> pageVisible | L | LOW | cheap listener |
| community | `components/ads/FeedAdBannerCarousel.tsx:377` | FeedAdBannerCarouselView | LayoutEffect | calls window.requestAnimationFrame | T | LOW | one-shot timer/rAF |
| community | `components/ads/FeedAdReportButton.tsx:24` | FeedAdReportButton | Effect | toast auto-dismiss timeout | T | LOW | one-shot |
| community | `components/common/SamarketThumbnail.tsx:107` | SamarketThumbnail | LayoutEffect | calls probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| community | `components/common/SamarketThumbnail.tsx:114` | SamarketThumbnail | LayoutEffect | boot metric: thumbnail requested | N | LOW | mount-time metric only |
| community | `components/common/SamarketThumbnail.tsx:99` | SamarketThumbnail | Effect | calls isThumbnailUrlLoaded, probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| community | `components/community/CommunityFeed.tsx:1258` | CommunityFeed | Effect | IntersectionObserver sentinel -> load more | O,F | LOW | display:none sentinel never intersects |
| community | `components/community/CommunityFeed.tsx:1468` | CommunityFeed | Effect | assign refs/state | N | LOW | pure state/ref sync |
| community | `components/community/CommunityFeed.tsx:1531` | CommunityFeed | Effect | sort menu outside-click/scroll/resize/keydown while menu open | L | LOW | only while menu open |
| community | `components/community/CommunityFeed.tsx:1559` | CommunityFeed | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| community | `components/community/CommunityFeed.tsx:1564` | CommunityFeed | Effect | first-card paint metric (rAF) | T | LOW | perf metric; requires feed key change |
| community | `components/community/CommunityFeed.tsx:1586` | CommunityFeed | LayoutEffect | rAF scroll selected topic tab into view | T,D | LOW | DOM only |
| community | `components/community/CommunityFeed.tsx:1625` | CommunityFeed | LayoutEffect | calls communityNavSelectionKey | N | LOW | pure state/ref sync |
| community | `components/community/CommunityFeed.tsx:435` | CommunityFeed | LayoutEffect | calls peekPhilifeNeighborhoodTopicOptionsFromCache, isSameCommunityTopicOptionsAuthority, buildFeedChipsFromPhilifeTopicOptionsJson, resolveCommunityFeedBootSelection | N | LOW | pure state/ref sync |
| community | `components/community/CommunityFeed.tsx:454` | CommunityFeed | Effect | sync ref | N | LOW | pure state/ref sync |
| community | `components/community/CommunityFeed.tsx:459` | CommunityFeed | LayoutEffect | redirect ?category=recommend to canonical href | N | LOW | deps router-frozen while hidden |
| community | `components/community/CommunityFeed.tsx:532` | CommunityFeed | LayoutEffect | restore hub nav state into URL once | N | LOW | pathname frozen; one-shot |
| community | `components/community/CommunityFeed.tsx:555` | CommunityFeed | Effect | persist hub nav state | N | LOW | pathname frozen |
| community | `components/community/CommunityFeed.tsx:573` | CommunityFeed | Effect | fetch topic options (revisit-gated 60s) | F | LOW | mount-only |
| community | `components/community/CommunityFeed.tsx:610` | CommunityFeed | Effect | assign refs/state | N | LOW | pure state/ref sync |
| community | `components/community/HorizontalDragScroll.tsx:58` | HorizontalDragScroll | Effect | pointer/scroll listeners on own element | L | LOW | element-scoped |
| community | `components/layout/sector-header/SectorHeaderBar.tsx:37` | SectorHeaderBar | LayoutEffect | ResizeObserver to balance header side widths | O,D | LOW | DOM only |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:340` | PhilifeHeaderNotificationInbox | Effect | sync ref | N | LOW | pure state/ref sync |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:358` | PhilifeHeaderNotificationInbox | Effect | sync ref | N | LOW | pure state/ref sync |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:452` | PhilifeHeaderNotificationInbox | Effect | assign refs/state | N | LOW | pure state/ref sync |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:512` | PhilifeHeaderNotificationInbox | Effect | window TIER1_HEADER_OVERLAY_CLOSE -> closePanel | L | LOW | custom event; local state only |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:524` | PhilifeHeaderNotificationInbox | Effect | enter/exit animation timeout on open change | T | LOW | one-shot timer |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:824` | PhilifeHeaderNotificationInbox | Effect | fetch owner-unread-by-store when open | F | LOW | only while open |
| community | `components/philife/PhilifeHeaderNotificationInbox.tsx:838` | PhilifeHeaderNotificationInbox | Effect | load inbox list on open | F | LOW | only while open |
| community | `components/philife/PhilifePullRefreshRegister.tsx:13` | PhilifePullRefreshRegister | LayoutEffect | register philife PTR handler | N | LOW | invoked only by philife PTR store |
| community | `components/platform-events/EventPromotionHeroBanner.tsx:26` | EventPromotionHeroBanner | Effect | fetch hero banners (revisit-gated) | F | LOW | mount/placement only |
| community | `components/ptr/DibayPtrRevealAdLayer.tsx:105` | useDibayPtrRevealAd | Effect | note PTR reveal identity (auth/user/device) | N | LOW | in-memory |
| community | `components/ptr/DibayPtrRevealAdLayer.tsx:75` | useDibayPtrRevealAd | SyncExternalStore | useSyncExternalStore(subscribePtrRevealAds) | S | LOW | in-memory store; hidden tree re-renders on change only |
| community | `components/ptr/DibayPtrRevealAdLayer.tsx:83` | useDibayPtrRevealAd | Effect | sync ref | N | LOW | pure state/ref sync |
| community | `components/ptr/DibayPtrRevealAdLayer.tsx:99` | useDibayPtrRevealAd | Effect | calls signalAdVisible | N | LOW | pure state/ref sync |
| community | `components/ptr/DibayPtrRevealBand.tsx:58` | DibayPtrRevealBand | Effect | assign refs/state | N | LOW | pure state/ref sync |
| community | `components/ptr/DibayPtrSlot.tsx:77` | DibayPtrSlot | SyncExternalStore | useSyncExternalStore(store.subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| community | `components/ptr/DibayPtrSlot.tsx:89` | DibayPtrSlot | LayoutEffect | ResizeObserver -> frame width state | O | LOW | display:none reports 0 width; state churn only (feeds 110) |
| community | `components/trade/TradeLocationNationalPicker.tsx:48` | TradeLocationNationalPicker | Effect | calls focus | D | LOW | DOM measure/mutate own nodes |
| community | `components/trade/TradeLocationNationalPicker.tsx:52` | TradeLocationNationalPicker | Effect | debounced location search fetch | T,F | LOW | only while picker sheet open and typing |
| community | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:131` | DibayOverlayRoot | Effect | restore focus on close | D | LOW | only on close |
| community | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:89` | DibayOverlayRoot | Effect | assign refs/state | N | LOW | pure state/ref sync |
| community | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:93` | DibayOverlayRoot | Effect | enter animation rAF/timeout + save focused element | T,D | LOW | only on open change |
| community | `hooks/use-client-membership-state.ts:294` | useClientMembershipState | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| community | `hooks/use-client-membership-state.ts:296` | useClientMembershipState | Effect | bind global auth listener + ensureMembershipResolved(source) | F | LOW | deduped/resolved once; deps=source constant |
| community | `hooks/useRegionViewerUserId.ts:13` | useRegionViewerUserId | Effect | TEST_AUTH_CHANGED -> userId state | L | LOW | custom event; local state |
| community | `lib/business/use-owner-admin-url-search-params.ts:47` | useOwnerAdminUrlSearchParams | SyncExternalStore | useSyncExternalStore(subscribeOwnerAdminUrlSearch) | S | LOW | in-memory store; hidden tree re-renders on change only |
| community | `lib/chats/use-owner-hub-badge-total.ts:226` | useOwnerHubBadgeTabUnreadCount | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| community | `lib/chats/use-owner-hub-badge-total.ts:229` | useOwnerHubBadgeTabUnreadCount | Effect | perf/rerender trace bump on badge count change | N | LOW | local trace only (runs on each badge change while hidden) |
| community | `lib/device/use-dibay-app-shell.ts:29` | useDibayAppShellAuthority | LayoutEffect | resolve device class once | N | LOW | mount-only |
| community | `lib/layout/use-html-shell-flags-sync.ts:11` | useHtmlShellFlagsSync | LayoutEffect | request html shell flags sync on key change | D | LOW | one-shot |
| community | `lib/navigation/use-back-press-lock.ts:19` | useBackPressLock | Effect | reset back-press lock on pathname | N | LOW | local |
| community | `lib/navigation/use-back-press-lock.ts:27` | useBackPressLock | Effect | assign refs/state | N | LOW | pure state/ref sync |
| community | `lib/ui/overlay-back-stack.ts:118` | useOverlayHardwareBack | Effect | assign refs/state | N | LOW | pure state/ref sync |
| community | `lib/ui/ptr/use-dibay-ptr-gesture.ts:86` | useDibayPtrGesture | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| community | `lib/ui/use-form-keyboard-focus-visibility.ts:299` | useFormKeyboardFocusVisibility | Effect | scroll focused field into view when keyboard bottom changes | T,D | LOW | enabled sheets only |
| community | `lib/ui/use-mobile-horizontal-swipe-panel.ts:382` | useMobileHorizontalSwipePanel | Effect | notify settle key | N | LOW | local |
| community | `lib/ui/use-mobile-horizontal-swipe-panel.ts:98` | useMobileHorizontalSwipePanel | Effect | touch listeners on swipe target element | L,T,D | LOW | element-scoped; hidden element receives no touches |
| community | `lib/ui/use-scroll-selected-tab-into-view.ts:19` | useScrollSelectedTabIntoView | Effect | calls track.getBoundingClientRect, selected.getBoundingClientRect, track.scrollTo | D | LOW | DOM measure/mutate own nodes |
| community | `lib/ui/use-shell-hydrated.ts:18` | useShellHydrated | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |

Excluded from community (27 call sites in reached files):
- AppLanguageProvider ×3 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/i18n/AppLanguageProvider.tsx`)
- useClientMembershipRecoveryFailed ×1 — hook/component in reached file but not referenced by hub tree (`hooks/use-client-membership-state.ts`)
- useOwnerFabOrdersBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabStoreBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrderChatBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHeaderOpsAttentionCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHeaderOpsAttentionCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrdersBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabStoreBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrderChatBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHubBadgeStoreDeepLink ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerNavigationSummary ×1 — hook/component in reached file but not referenced by hub tree (`lib/delivery/owner/projections/use-owner-navigation-summary.ts`)
- useOwnerLiteHasPreferredStore ×1 — hook/component in reached file but not referenced by hub tree (`lib/stores/use-owner-lite-store.ts`)
- DibayPromptDialog ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayPromptDialog.tsx`)
- DibayAppDialogImperativeBridge ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayAppDialogImperativeBridge.tsx`)
- PhilifeWriteSheetProvider ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/PhilifeWriteSheetContext.tsx`)
- SearchParamsSync ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/LatestMenuNavigationContext.tsx`)
- LatestMenuNavigationProvider ×4 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/LatestMenuNavigationContext.tsx`)
- TradeWriteSheetProvider ×4 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/TradeWriteSheetContext.tsx`)

## delivery (228 effects, 52 HIGH)

| hub | file:line | component/hook | kind | what it does | category | risk | reason |
|---|---|---|---|---|---|---|---|
| delivery | `components/addresses/DeliveryRoutableAddressGate.tsx:95` | DeliveryRoutableAddressGate | Effect | run routable-address check + addresses-updated listener | L,F | **HIGH** | network check from hidden hub on address events |
| delivery | `components/common/media/PostImageViewer.tsx:148` | PostImageViewer | Effect | history push + popstate while viewer open | L | **HIGH** | global history/popstate if viewer left open |
| delivery | `components/common/media/PostImageViewer.tsx:180` | PostImageViewer | LayoutEffect | lock html/body scroll while open | D | **HIGH** | scroll lock persists if left open |
| delivery | `components/common/media/PostImageViewer.tsx:245` | PostImageViewer | Effect | window keydown Esc/arrows while open | L | **HIGH** | global keyboard while open |
| delivery | `components/delivery/launch/DeliveryRecruitingRouteGuard.tsx:73` | DeliveryRecruitingRouteGuard | Effect | router.replace('/stores') when blocked | N | **HIGH** | blocked derives from global launch state -> hidden hub can navigate visible app |
| delivery | `components/orders/customer-commerce/CommerceChildSlideShell.tsx:35` | CommerceChildSlideShell | Effect | window popstate -> mark back navigation | L | **HIGH** | fires on every back/forward in visible hub (ref only; cheap) — global listener |
| delivery | `components/ptr/DibayPtrRevealAdLayer.tsx:110` | useDibayPtrRevealAd | Effect | ensurePtrRevealAd(pathname, variant) — fetch PTR ad | F | **HIGH** | deps adsVersion/frameWidthPx/snap.phase change while hidden (ResizeObserver reports 0 then back) |
| delivery | `components/ptr/DibayPtrRevealAdLayer.tsx:118` | useDibayPtrRevealAd | Effect | PTR reveal ad exposure/impression bookkeeping per pull phase | F,O | **HIGH** | records ad impression if hidden hub's PTR store phase changes (gesture bound to shared scroll root) |
| delivery | `components/ptr/DibayPtrRevealAdLayer.tsx:185` | useDibayPtrRevealAd | Effect | mark PTR ad impressed when held past threshold | N | **HIGH** | ad impression analytics driven by shared-root PTR gesture |
| delivery | `components/stores/StoreDetailPublic.tsx:1291` | StoreDetailPublic | Effect | setInterval 60s open-status tick | T | **HIGH** | interval keeps running while hidden (storeActive) |
| delivery | `components/stores/StoreDetailPublic.tsx:1456` | StoreDetailPublic | Effect | distance-out-of-range check (geo/address fetch) + listeners | L,F | **HIGH** | network/geolocation from hidden hub on address change |
| delivery | `components/stores/StoreDetailPublic.tsx:426` | StoreDetailPublic | Effect | router.replace('/stores') when recruiting blocks viewer | N | **HIGH** | global launch state -> hidden hub navigates visible app |
| delivery | `components/stores/StoreMenuReviewFlowLink.tsx:93` | StoreMenuReviewFlowLink | Effect | setInterval review slide rotation | T | **HIGH** | interval keeps running while hidden |
| delivery | `components/stores/StoresHub.tsx:107` | StoresHub | LayoutEffect | prewarmStoresHomeRoute when feedReady/language/suffix | F | **HIGH** | prefetch on language change while hidden |
| delivery | `components/stores/StoresHub.tsx:176` | StoresHub | Effect | KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH -> loadBuyerHub | L,F | **HIGH** | network from hidden hub on global event |
| delivery | `components/stores/advertising/useDeliveryAdEvents.ts:45` | useDeliveryAdImpressionObserver | Effect | IntersectionObserver + dwell timer -> delivery ad IMPRESSION beacon | O,T,F | **HIGH** | ad impression analytics; verify hidden element never counts as visible |
| delivery | `components/stores/browse/BrowseSubtopicCollapseSentinel.tsx:16` | BrowseSubtopicCollapseSentinel | LayoutEffect | register global browse subtopic collapse sentinel | N | **HIGH** | global registration not cleared on hide; scroll logic uses hidden element |
| delivery | `components/stores/browse/StoreListFilterChips.tsx:100` | Sheet | Effect | window keydown Escape (filter sheet) | L | **HIGH** | global keyboard while sheet open |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:248` | StoresBrowsePrimaryView | Effect | resolve browse origin geolocation/address | L,F | **HIGH** | geolocation/address resolve if browseActive (parked browse) |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:428` | StoresBrowsePrimaryView | Effect | window popstate -> back-nav perf metric | L | **HIGH** | global popstate listener while browseActive |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:720` | StoresBrowsePrimaryView | Effect | loadRemote browse list when active and origin ready | F | **HIGH** | deps include origin/language -> fetch while hidden if browse parked |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:794` | StoresBrowsePrimaryView | Effect | refresh tick -> force reload browse list | F | **HIGH** | global browse-list-refresh store tick -> fetch while hidden |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:992` | StoresBrowsePrimaryView | LayoutEffect | setMainTier1Extras(browse header) | N | **HIGH** | shell header registration not cleared on hide |
| delivery | `components/stores/detail/use-deferred-menu-section-hydration.ts:114` | useDeferredMenuSectionHydration | Effect | window scroll -> rAF hydrate menu sections | L,T | **HIGH** | global scroll listener |
| delivery | `components/stores/home/hub/DeliveryHomeMenuBoard.tsx:107` | DeliveryHomeMenuBoard | LayoutEffect | fetch stores taxonomy for menu board | F | **HIGH** | language change while hidden -> fetch |
| delivery | `components/stores/home/hub/StoresHomeBeforeRestBanner.tsx:34` | StoresHomeBeforeRestBanner | LayoutEffect | fetch before-rest banners (revisit-gated) | F | **HIGH** | refreshKey change refetch |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:165` | StoresHomeHeroBanner | Effect | setInterval hero auto-advance | T | **HIGH** | interval runs if inView stays true (non-display:none hiding) |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:85` | StoresHomeHeroBanner | LayoutEffect | fetch stores home hero banners (revisit-gated) | F | **HIGH** | refreshKey change (PTR/language) refetch |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:197` | StoresHomeHub | LayoutEffect | predict/resolve delivery viewer gate (membership/address) | F | **HIGH** | membershipStatus change while hidden -> gate fetch |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:220` | StoresHomeHub | LayoutEffect | rAF loop checking main scroll root scrollable -> perf mark | T,D | **HIGH** | reads SHARED main scroll root; rAF loop until marked |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:414` | StoresHomeHub | LayoutEffect | load stores home feed (revisit-gated) | F | **HIGH** | feedRevisitKey includes language/region -> refetch while hidden |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:423` | StoresHomeHub | Effect | addresses-updated -> reset gate + reload feed | L,F | **HIGH** | network from hidden hub |
| delivery | `components/stores/home/hub/StoresHomeQuickCategories.tsx:103` | StoresHomeQuickCategories | LayoutEffect | fetch stores taxonomy (unless fresh) | F | **HIGH** | language change while hidden -> fetch |
| delivery | `components/stores/home/hub/StoresHomeQuickCategories.tsx:211` | StoresHomeQuickCategories | LayoutEffect | setStoresHomeCategoryChromeHandlers (global chrome store) | N | **HIGH** | global handler registration not cleared on hide |
| delivery | `components/stores/home/hub/StoresHomeQuickCategories.tsx:219` | StoresHomeQuickCategories | LayoutEffect | patchStoresHomeCategoryChrome (global chrome store) | N | **HIGH** | writes global chrome store from hidden hub on language/taxonomy change |
| delivery | `components/stores/store-detail/StoreDetailMenusSection.tsx:193` | StoreDetailMenusSection | LayoutEffect | focus-product landing: scroll SHARED scroll root to product | T,D | **HIGH** | scrolls store-detail/main scroll root while hidden if menus load after hide |
| delivery | `components/stores/store-detail/StoreReviewsSlidePanel.tsx:54` | StoreReviewsSlidePanel | Effect | body overflow hidden while reviews panel visible | D | **HIGH** | scroll lock persists if left open |
| delivery | `components/support/SupportContextProvider.tsx:36` | SupportContextProvider | Effect | publish support context to global store | N | **HIGH** | hidden hub's support context stays published (cleanup only on unmount) |
| delivery | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:113` | DibayOverlayRoot | Effect | window keydown Escape -> onClose | L | **HIGH** | global keyboard listener while sheet open (not cleaned on hide) |
| delivery | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:122` | DibayOverlayRoot | Effect | document.body overflow hidden while open | D | **HIGH** | scroll lock persists over visible hub if sheet open on hide |
| delivery | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:84` | DibayOverlayRoot | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay registry persists if sheet open on hide |
| delivery | `lib/delivery/launch/use-delivery-launch-state.ts:105` | useDeliveryLaunchState | Effect | subscribe launch state + fetch when enabled | S,F | **HIGH** | subscription + fetch kept alive while hidden |
| delivery | `lib/stores/use-browse-sub-all-canonical-url.ts:28` | useBrowseSubAllCanonicalUrl | Effect | router.replace to canonical ?sub=all URL | N | **HIGH** | subs (async taxonomy) can change while hidden -> navigates visible app |
| delivery | `lib/stores/use-store-detail-category-tabs-pin.ts:67` | useStoreDetailCategoryTabsPin | LayoutEffect | scroll listener on store-detail app scroll root -> pin state | L | **HIGH** | SHARED scroll root listener |
| delivery | `lib/stores/use-store-detail-scroll-root-scroll.ts:20` | useStoreDetailScrollRootScroll | Effect | window + store-detail scroll root scroll / visualViewport resize -> rAF state | L,T | **HIGH** | listens to SHARED scroll root; re-renders hidden detail on every scroll of visible hub |
| delivery | `lib/stores/use-stores-home-touch-release.ts:32` | useStoresHomeTouchRelease | Effect | touchend/touchcancel on main app scroll root -> blur/release | L,T | **HIGH** | binds to SHARED main scroll root |
| delivery | `lib/ui/overlay-back-stack.ts:121` | useOverlayHardwareBack | Effect | pushOverlayBackEntry while active | N | **HIGH** | hardware-back stack entry persists -> back press closes hidden sheet instead of navigating |
| delivery | `lib/ui/use-form-keyboard-focus-visibility.ts:154` | useFormKeyboardFocusVisibility | Effect | document focusin/focusout + visualViewport resize/scroll + ResizeObserver to keep focused input visible | L,O,T,D | **HIGH** | global focus/keyboard listeners while enabled (sheet open) |
| delivery | `lib/ui/use-form-keyboard-viewport.ts:220` | useFormKeyboardViewport | SyncExternalStore | subscribe visualViewport/keyboard store while enabled | S,L | **HIGH** | global keyboard listener while enabled |
| delivery | `lib/ui/use-refetch-on-page-show.ts:40` | useRefetchOnPageShowRestore | Effect | window pageshow/focus/visibilitychange -> scheduled refetch | L,T,F | **HIGH** | network refetch from hidden hub on app resume/focus |
| delivery | `lib/ui/use-register-open-overlay.ts:10` | useRegisterOpenOverlay | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay count persists if sheet left open on hide |
| delivery | `lib/ui/use-rubber-band-at-document-top.ts:78` | useRubberBandAtDocumentTop | Effect | window touch*/wheel + main scroll top -> rubber band stretch | L | **HIGH** | global touch listeners + SHARED main scroll root |
| delivery | `components/common/SamarketThumbnail.tsx:107` | SamarketThumbnail | LayoutEffect | calls probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| delivery | `components/common/SamarketThumbnail.tsx:114` | SamarketThumbnail | LayoutEffect | boot metric: thumbnail requested | N | LOW | mount-time metric only |
| delivery | `components/common/SamarketThumbnail.tsx:99` | SamarketThumbnail | Effect | calls isThumbnailUrlLoaded, probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| delivery | `components/common/media/PostImageViewer.tsx:117` | PostImageViewer | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/common/media/PostImageViewer.tsx:120` | PostImageViewer | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/common/media/PostImageViewer.tsx:131` | PostImageViewer | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/common/media/PostImageViewer.tsx:136` | PostImageViewer | Effect | calls resolveMessengerImageSaveMode | N | LOW | pure state/ref sync |
| delivery | `components/common/media/PostImageViewer.tsx:202` | PostImageViewer | Effect | calls measure, ResizeObserver, ro.observe, ro.disconnect | D,O | LOW | observer on hidden element (no intersection / 0 size) |
| delivery | `components/common/media/PostImageViewer.tsx:212` | PostImageViewer | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/community/HorizontalDragScroll.tsx:58` | HorizontalDragScroll | Effect | pointer/scroll listeners on own element | L | LOW | element-scoped |
| delivery | `components/delivery/launch/DeliveryRecruitingHeroLayout.tsx:21` | useWideLayout | LayoutEffect | ResizeObserver wide layout | O,D | LOW | DOM only |
| delivery | `components/delivery/launch/DeliveryRecruitingHeroLayout.tsx:37` | BannerImage | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/delivery/launch/DeliveryRecruitingRouteGuard.tsx:80` | DeliveryRecruitingRouteGuard | Effect | viewerMayEnterStore(subSlug) -> maybe router.replace | F | LOW | subSlug frozen while hidden |
| delivery | `components/delivery/launch/DeliveryRecruitingRouteGuard.tsx:93` | DeliveryRecruitingRouteGuard | SyncExternalStore | useSyncExternalStore(noopSubscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:206` | DeliveryPresentationShellInner | Effect | calls deliveryPresentationMarkUnmount | N | LOW | pure state/ref sync |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:226` | DeliveryPresentationShellInner | Effect | calls deliveryPresentationMarkUnmount, deliveryPresentationMarkEvent | N | LOW | pure state/ref sync |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:234` | DeliveryPresentationShellInner | LayoutEffect | slide transition on pathKey change | T,D | LOW | pathKey frozen while hidden |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:288` | DeliveryPresentationShellInner | LayoutEffect | calls isStoresBrowseSurfacePath, parseBrowsePathnamePrimary, toLowerCase, syncBrowsePrimaryNavSettled | N | LOW | pure state/ref sync |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:296` | DeliveryPresentationShellInner | LayoutEffect | hold browse until store ready (events/timeouts) | T,L | LOW | only during slide phase |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:381` | DeliveryPresentationShellInner | Effect | finish slide timeout | T | LOW | only during slide |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:491` | DeliveryPresentationShellInner | LayoutEffect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:594` | BrowseSurface | LayoutEffect | calls nextDeliveryBrowseInstanceId, deliveryPresentationMarkMount | N | LOW | pure state/ref sync |
| delivery | `components/delivery/presentation/DeliveryPresentationShell.tsx:620` | StoreSurface | LayoutEffect | calls nextDeliveryStoreInstanceId, deliveryPresentationMarkMount | N | LOW | pure state/ref sync |
| delivery | `components/dibay/DeliveryMediaImage.tsx:63` | DeliveryMediaImage | LayoutEffect | calls markDeliveryImageLcpCandidate | N | LOW | pure state/ref sync |
| delivery | `components/layout/BodyPortal.tsx:17` | BodyPortal | LayoutEffect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/layout/sector-header/SectorHeaderBar.tsx:37` | SectorHeaderBar | LayoutEffect | ResizeObserver to balance header side widths | O,D | LOW | DOM only |
| delivery | `components/orders/customer-commerce/CommerceChildSlideShell.tsx:43` | CommerceChildSlideShell | LayoutEffect | calls computeCommerceChildTransitionKind, stripCommerceChildTransitionClasses, el.getAnimations, a.cancel | D,T | LOW | DOM measure/mutate own nodes |
| delivery | `components/ptr/DibayPtrRevealAdLayer.tsx:105` | useDibayPtrRevealAd | Effect | note PTR reveal identity (auth/user/device) | N | LOW | in-memory |
| delivery | `components/ptr/DibayPtrRevealAdLayer.tsx:75` | useDibayPtrRevealAd | SyncExternalStore | useSyncExternalStore(subscribePtrRevealAds) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/ptr/DibayPtrRevealAdLayer.tsx:83` | useDibayPtrRevealAd | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/ptr/DibayPtrRevealAdLayer.tsx:99` | useDibayPtrRevealAd | Effect | calls signalAdVisible | N | LOW | pure state/ref sync |
| delivery | `components/ptr/DibayPtrRevealBand.tsx:58` | DibayPtrRevealBand | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/ptr/DibayPtrSlot.tsx:77` | DibayPtrSlot | SyncExternalStore | useSyncExternalStore(store.subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/ptr/DibayPtrSlot.tsx:89` | DibayPtrSlot | LayoutEffect | ResizeObserver -> frame width state | O | LOW | display:none reports 0 width; state churn only (feeds 110) |
| delivery | `components/stores/StoreDetailPublic.tsx:1297` | StoreDetailPublic | LayoutEffect | load store public detail for slug | F | LOW | slug frozen |
| delivery | `components/stores/StoreDetailPublic.tsx:1400` | StoreDetailPublic | LayoutEffect | calls dibayDeliveryDetailPhase2Log, dibayDeliveryDetailPhase2SinceMountOrNav | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:1410` | StoreDetailPublic | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:1417` | StoreDetailPublic | LayoutEffect | calls findMenuSectionIndexForProduct | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:1444` | StoreDetailPublic | Effect | calls resolveStoreFulfillmentModeForEntry, readStoreFulfillmentPref | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:1487` | StoreDetailPublic | Effect | fulfillment-pref-changed event -> mode state | L | LOW | custom event; local |
| delivery | `components/stores/StoreDetailPublic.tsx:1576` | StoreDetailPublic | Effect | calls writeStoreFulfillmentPref | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:1590` | StoreDetailPublic | Effect | ResizeObserver sticky menu measure | O,T,D | LOW | DOM only |
| delivery | `components/stores/StoreDetailPublic.tsx:1751` | StoreDetailPublic | Effect | open menu search from intent | T,D,N | LOW | slug frozen |
| delivery | `components/stores/StoreDetailPublic.tsx:1829` | StoreDetailPublic | Effect | calls resolveStoreDetailCtaEntryTarget, scrollStoreSectionIntoView, getElementById, scrollIntoView | D | LOW | DOM measure/mutate own nodes |
| delivery | `components/stores/StoreDetailPublic.tsx:1973` | StoreDetailPublic | LayoutEffect | dispatch STORE_DETAIL_DATA_READY event | N | LOW | one-shot |
| delivery | `components/stores/StoreDetailPublic.tsx:1982` | StoreDetailPublic | LayoutEffect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:1988` | StoreDetailPublic | Effect | calls shouldReleaseStoreMenuFocusEntry, clearStoreMenuFocusEntryIntent | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:2045` | StoreDetailPublic | LayoutEffect | calls markFeaturedO3Reservation | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:323` | StoreDetailPublic | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:327` | StoreDetailPublic | LayoutEffect | calls peekStoreMenuFocusEntryIntent, URLSearchParams, storeMenuFocusEntryNeedsPreparation | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:339` | StoreDetailPublic | Effect | calls peekStoreMenuFocusEntryIntent, storeMenuFocusEntryNeedsPreparation | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:350` | StoreDetailPublic | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:495` | StoreDetailPublic | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:499` | StoreDetailPublic | LayoutEffect | calls deliveryRenderTraceBump | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:503` | StoreDetailPublic | LayoutEffect | calls markMenusColdFillHydrationCommit, dibayDeliveryDetailPhase2Log, dibayDeliveryDetailPhase2SinceMountOrNav | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:516` | StoreDetailPublic | LayoutEffect | calls dibayDeliveryDetailPhase2Log, dibayDeliveryDetailPhase2SinceMountOrNav | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:527` | StoreDetailPublic | LayoutEffect | calls storeDetailPartialFromListSeed, deliveryShellEntryMark, dibayStoreDetailFlowV2Log, peekStoreSummaryPublicCache | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:565` | StoreDetailPublic | LayoutEffect | calls isStoreDetailListSeedId, markStoreDetailListSeedPass1Visible, deliveryPerfTraceLog | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:587` | StoreDetailPublic | LayoutEffect | calls isStoreDetailListSeedId, dibayPerfOnStoreDetailShellVisible, deliveryShellEntryMark, deliveryPerfTraceLog | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:603` | StoreDetailPublic | LayoutEffect | calls isStoreDetailListSeedId, dibayPerfOnStoreDetailShellVisible, deliveryShellEntryMark, deliveryPerfTraceLog | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreDetailPublic.tsx:923` | StoreDetailPublic | LayoutEffect | instant hydrate store detail from cache | F | LOW | slug frozen |
| delivery | `components/stores/StoreDetailQuickShell.tsx:66` | StoreDetailQuickShell | LayoutEffect | calls dibayPerfOnStoreDetailShellVisible, deliveryShellEntryMark, deliveryPerfTraceLog | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreMenuCategoryChips.tsx:46` | StoreMenuCategoryChips | Effect | calls row.getBoundingClientRect, shouldFollowActiveChip, chip.getBoundingClientRect, resolveChipRowScrollLeft | D | LOW | DOM measure/mutate own nodes |
| delivery | `components/stores/StoreMenuReviewFlowLink.tsx:51` | StoreMenuReviewFlowLink | Effect | fetch store review slides | F | LOW | slug frozen |
| delivery | `components/stores/StoreMenuReviewFlowLink.tsx:89` | StoreMenuReviewFlowLink | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreOwnerBannerCarousel.tsx:61` | StoreOwnerBannerCarousel | Effect | scroll listener on own carousel element | L | LOW | element-scoped |
| delivery | `components/stores/StoreReviewReportButton.tsx:32` | StoreReviewReportButton | Effect | calls window.setTimeout | T | LOW | one-shot timer/rAF |
| delivery | `components/stores/StoreReviewsSection.tsx:101` | StoreReviewsSection | LayoutEffect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoreReviewsSection.tsx:106` | StoreReviewsSection | Effect | fetch order-detail reviews | F | LOW | surface-specific |
| delivery | `components/stores/StoreReviewsSection.tsx:192` | StoreReviewsSection | LayoutEffect | load reviews | F | LOW | only when panel rendered |
| delivery | `components/stores/StoresHub.tsx:167` | StoresHub | LayoutEffect | register stores-home PTR handler | N | LOW | PTR host lives in shell for /stores only |
| delivery | `components/stores/StoresHub.tsx:171` | StoresHub | Effect | load buyer hub summary unless cache fresh | F | LOW | mount/loadBuyerHub identity |
| delivery | `components/stores/StoresHub.tsx:186` | StoresHub | Effect | calls abort | N | LOW | pure state/ref sync |
| delivery | `components/stores/StoresHub.tsx:84` | StoresHub | SyncExternalStore | useSyncExternalStore(subscribeAppBoot) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/stores/StoresHub.tsx:89` | StoresHub | SyncExternalStore | useSyncExternalStore(subscribeAppBoot) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/stores/StoresHub.tsx:95` | StoresHub | SyncExternalStore | useSyncExternalStore(subscribeAppBootProfileFetchCache) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:1023` | StoresBrowsePrimaryView | LayoutEffect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:1028` | StoresBrowsePrimaryView | LayoutEffect | calls consumeBrowseMenuTabDirection, el.animate, translate3d, bezier | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:161` | StoresBrowsePrimaryView | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:244` | StoresBrowsePrimaryView | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:308` | StoresBrowsePrimaryView | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:312` | StoresBrowsePrimaryView | SyncExternalStore | useSyncExternalStore(subscribeBrowseSubPendingNav) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:317` | StoresBrowsePrimaryView | SyncExternalStore | useSyncExternalStore(subscribeBrowseListRefresh) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:340` | StoresBrowsePrimaryView | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:385` | StoresBrowsePrimaryView | Effect | tab tap -> selection paint metric (rAF) | T | LOW | perf metric |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:407` | StoresBrowsePrimaryView | Effect | list paint metric | T | LOW | perf metric |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:538` | StoresBrowsePrimaryView | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:543` | StoresBrowsePrimaryView | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:702` | StoresBrowsePrimaryView | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:706` | StoresBrowsePrimaryView | LayoutEffect | calls peekBrowsePaintCache | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:802` | StoresBrowsePrimaryView | Effect | calls browseListSortScopeKey, shouldResetBrowseListSortOnScopeChange | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePrimaryView.tsx:834` | StoresBrowsePrimaryView | Effect | calls remoteCacheRef.current.clear, browseRowCardCacheRef.current.clear | N | LOW | pure state/ref sync |
| delivery | `components/stores/browse/StoresBrowsePullRefreshRegister.tsx:13` | StoresBrowsePullRefreshRegister | LayoutEffect | register browse PTR handler | N | LOW | shell host only on browse |
| delivery | `components/stores/browse/StoresBrowseTopBanner.tsx:43` | StoresBrowseTopBanner | Effect | fetch browse top banners (cached) | F | LOW | path frozen |
| delivery | `components/stores/commerce/StoreCommerceBottomActionShell.tsx:36` | StoreCommerceBottomActionShell | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/CategoryMenuSection.tsx:50` | CategoryMenuSection | LayoutEffect | calls onFirstProductPaint | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/CategoryStickyTabs.tsx:105` | CategoryStickyTabs | Effect | calls deliveryPresentationMarkEvent | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/CategoryStickyTabs.tsx:98` | CategoryStickyTabs | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/StoreDetailCartChrome.tsx:107` | StoreDetailCartChrome | LayoutEffect | calls deliveryRenderTraceBump | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/StoreDetailCartChrome.tsx:52` | StoreDetailBottomStripSheetGate | LayoutEffect | calls deliveryRenderTraceBump | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/VirtualizedMenuRows.tsx:46` | VirtualizedMenuRows | LayoutEffect | calls onFirstRowPaint | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/use-deferred-menu-section-hydration.ts:139` | useDeferredMenuSectionHydration | Effect | IntersectionObserver sentinel | O | LOW | display:none never intersects |
| delivery | `components/stores/detail/use-deferred-menu-section-hydration.ts:46` | useDeferredMenuSectionHydration | Effect | hydratedThrough state | N | LOW | local |
| delivery | `components/stores/detail/use-deferred-menu-section-hydration.ts:57` | useDeferredMenuSectionHydration | Effect | force hydrate through index | N | LOW | local |
| delivery | `components/stores/detail/use-deferred-menu-section-hydration.ts:64` | useDeferredMenuSectionHydration | Effect | calls deliveryPerfTraceLog | N | LOW | pure state/ref sync |
| delivery | `components/stores/detail/use-menu-subtree-cart-stability-guard.ts:17` | useMenuSubtreeCartStabilityGuard | LayoutEffect | calls deliveryPerfTraceEnabled, msSinceDeliveryCartPatch, deliveryTraceCartSubtreeImpact | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/hub/DeliveryHomeMenuBoard.tsx:127` | DeliveryHomeMenuBoard | LayoutEffect | register PTR handler | N | LOW | shell PTR host only on /stores |
| delivery | `components/stores/home/hub/StoresHomeDeferredViewport.tsx:26` | StoresHomeDeferredViewport | Effect | IntersectionObserver deferred section mount | O | LOW | display:none never intersects |
| delivery | `components/stores/home/hub/StoresHomeDeferredViewport.tsx:46` | StoresHomeDeferredViewport | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:134` | StoresHomeHeroBanner | Effect | transition end timeout | T | LOW | one-shot |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:140` | StoresHomeHeroBanner | Effect | matchMedia reduced motion | L | LOW | rare |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:149` | StoresHomeHeroBanner | Effect | document visibilitychange -> pageVisible | L | LOW | cheap |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:156` | StoresHomeHeroBanner | Effect | IntersectionObserver inView | O | LOW | display:none -> false |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:171` | StoresHomeHeroBanner | LayoutEffect | calls markStoresHomePerf (perf/metric mark) | N | LOW | local perf mark |
| delivery | `components/stores/home/hub/StoresHomeHeroBanner.tsx:59` | StoresHomeHeroBanner | LayoutEffect | calls readStoredHeroBannerCount | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:116` | StoresHomeHub | SyncExternalStore | useSyncExternalStore(subscribeAppBoot) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:135` | StoresHomeHub | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:139` | StoresHomeHub | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:143` | StoresHomeHub | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:147` | StoresHomeHub | LayoutEffect | paint cached feed snapshot before feedReady | N | LOW | local |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:192` | StoresHomeHub | LayoutEffect | markStoresHomePerf('shell') | N | LOW | mount metric |
| delivery | `components/stores/home/hub/StoresHomeHub.tsx:398` | StoresHomeHub | LayoutEffect | prewarm home banners (revisit-gated) | F | LOW | feedReady/key only |
| delivery | `components/stores/home/hub/StoresHomePerfBoot.tsx:8` | StoresHomePerfBoot | LayoutEffect | install stores-home perf observers (PerformanceObserver) | O | LOW | global perf observers stay installed; metrics only |
| delivery | `components/stores/home/hub/StoresHomePullRefreshRegister.tsx:13` | StoresHomePullRefreshRegister | LayoutEffect | register PTR handler | N | LOW | shell PTR host only on /stores |
| delivery | `components/stores/home/hub/StoresHomeQuickCategories.tsx:154` | StoresHomeQuickCategories | LayoutEffect | calls reconcileHomeCategoryPrimaries | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/hub/StoresHomeQuickCategories.tsx:63` | StoresHomeQuickCategories | SyncExternalStore | useSyncExternalStore(subscribeStoresHomeCategoryChrome) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `components/stores/home/hub/StoresHomeQuickCategories.tsx:69` | StoresHomeQuickCategories | LayoutEffect | register stores-home PTR taxonomy refresh | N | LOW | shell PTR host only on /stores |
| delivery | `components/stores/home/hub/StoresHomeQuickCategories.tsx:95` | StoresHomeQuickCategories | LayoutEffect | calls readStoresHomeTaxonomyFromClientCache | N | LOW | pure state/ref sync |
| delivery | `components/stores/home/presentation/StoresHomeFoodRailCard.tsx:64` | StoresHomeFoodRailCardInner | LayoutEffect | calls markStoresHomePerf (perf/metric mark) | N | LOW | local perf mark |
| delivery | `components/stores/store-detail/StoreDetailMenusSection.tsx:177` | StoreDetailMenusSection | Effect | sync ref | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-detail/StoreDetailMenusSection.tsx:183` | StoreDetailMenusSection | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-detail/StoreDetailMenusSection.tsx:187` | StoreDetailMenusSection | Effect | calls clearStoreMenuProductFocusRing | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-detail/StoreDetailMenusSection.tsx:381` | StoreDetailMenusSection | LayoutEffect | calls applyStoreMenuProductFocusRing | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-detail/StoreDetailMenusSection.tsx:396` | StoreDetailMenusSection | LayoutEffect | calls markMenusColdFillFirstInteractable | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-detail/StoreDetailMenusSection.tsx:409` | StoreDetailMenusSection | LayoutEffect | calls useStoreProductSheetUIStore.getState, deliveryRenderTraceBump, deliveryPerfTraceEnabled, deliveryPerfTraceLog | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-detail/StoreDetailSummarySection.tsx:129` | StoreDetailSummarySection | Effect | fetch checkout contact (deduped) | F | LOW | deps deliveryAvailable |
| delivery | `components/stores/store-detail/StoreDetailSummarySection.tsx:134` | StoreDetailSummarySection | Effect | fetch delivery ride-time source | F | LOW | mount |
| delivery | `components/stores/store-detail/StoreDetailSummarySection.tsx:153` | StoreDetailSummarySection | Effect | compute hero delivery time (may fetch) | F | LOW | deps local |
| delivery | `components/stores/store-detail/StoreReviewsSlidePanel.tsx:38` | StoreReviewsSlidePanel | LayoutEffect | calls clearTimer, window.setTimeout | T | LOW | one-shot timer/rAF |
| delivery | `components/stores/store-detail/StoreReviewsSlidePanel.tsx:63` | StoreReviewsSlidePanel | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-order-detail/StoreOrderStickyHeader.tsx:75` | StoreOrderStickyHeader | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/stores/store-order-detail/StoreOrderStickyHeader.tsx:86` | StoreOrderStickyHeader | Effect | calls deliveryPresentationMarkEvent | N | LOW | pure state/ref sync |
| delivery | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:131` | DibayOverlayRoot | Effect | restore focus on close | D | LOW | only on close |
| delivery | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:89` | DibayOverlayRoot | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:93` | DibayOverlayRoot | Effect | enter animation rAF/timeout + save focused element | T,D | LOW | only on open change |
| delivery | `hooks/use-client-membership-state.ts:294` | useClientMembershipState | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `hooks/use-client-membership-state.ts:296` | useClientMembershipState | Effect | bind global auth listener + ensureMembershipResolved(source) | F | LOW | deduped/resolved once; deps=source constant |
| delivery | `hooks/use-client-membership-state.ts:306` | useClientMembershipRecoveryFailed | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `hooks/useRegionViewerUserId.ts:13` | useRegionViewerUserId | Effect | TEST_AUTH_CHANGED -> userId state | L | LOW | custom event; local state |
| delivery | `lib/delivery/launch/use-delivery-store-owner-entry.ts:30` | useDeliveryStoreOwnerEntry | Effect | fetch /me stores list (revisit-gated) | F | LOW | enabled/mount |
| delivery | `lib/dibay/store-detail-render-guard.ts:46` | useStoreDetailRenderGuard | LayoutEffect | calls deliveryPerfTraceEnabled, deliveryPerfTraceLog | N | LOW | pure state/ref sync |
| delivery | `lib/dibay/use-delivery-store-detail-viewport-prefetch.ts:33` | useDeliveryStoreDetailViewportPrefetch | Effect | reset prefetch marker | N | LOW | local |
| delivery | `lib/dibay/use-delivery-store-detail-viewport-prefetch.ts:37` | useDeliveryStoreDetailViewportPrefetch | Effect | calls disconnect | N | LOW | pure state/ref sync |
| delivery | `lib/layout/use-html-shell-flags-sync.ts:11` | useHtmlShellFlagsSync | LayoutEffect | request html shell flags sync on key change | D | LOW | one-shot |
| delivery | `lib/navigation/use-back-press-lock.ts:19` | useBackPressLock | Effect | reset back-press lock on pathname | N | LOW | local |
| delivery | `lib/navigation/use-back-press-lock.ts:27` | useBackPressLock | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `lib/stores/use-browse-featured-items-hydration.ts:160` | useBrowseFeaturedItemsHydration | Effect | calls hydrationRevisitGate.isFresh, hydrationRevisitGate.markLoaded, resetHydrationState | N | LOW | pure state/ref sync |
| delivery | `lib/stores/use-browse-featured-items-hydration.ts:168` | useBrowseFeaturedItemsHydration | Effect | calls peekBrowseFeaturedItemsClient, bumpEpoch, flushVisibleBatch | N | LOW | pure state/ref sync |
| delivery | `lib/stores/use-browse-featured-items-hydration.ts:193` | useBrowseFeaturedItemsHydration | Effect | IntersectionObserver visible store cards -> hydrate featured items | O,F | LOW | display:none never intersects |
| delivery | `lib/stores/use-browse-taxonomy-snapshot.ts:14` | useBrowseTaxonomySnapshot | SyncExternalStore | useSyncExternalStore(subscribeBrowseTaxonomySnapshot) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `lib/stores/use-browse-taxonomy-snapshot.ts:19` | useBrowseTaxonomySnapshot | Effect | ensureBrowseTaxonomySnapshot | F | LOW | mount-only |
| delivery | `lib/stores/use-owner-management-href.ts:15` | useOwnerManagementHref | Effect | fetch /me stores list (deduped) | F | LOW | store frozen |
| delivery | `lib/stores/use-store-commerce-cart-selector.ts:185` | useStoreCommerceCartBucketStats | SyncExternalStore | useSyncExternalStore(subscribeCommerceCartSnapshot) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `lib/stores/use-store-commerce-cart-selector.ts:225` | useStoreCommerceCartHeaderBadgeCount | SyncExternalStore | useSyncExternalStore(subscribeCommerceCartSnapshot) | S | LOW | in-memory store; hidden tree re-renders on change only |
| delivery | `lib/stores/use-store-detail-category-tabs-pin.ts:79` | useStoreDetailCategoryTabsPin | LayoutEffect | menu-tabs-anchored event -> recapture | L | LOW | custom event |
| delivery | `lib/stores/use-store-detail-category-tabs-pin.ts:91` | useStoreDetailCategoryTabsPin | LayoutEffect | calls recapturePinThreshold, evaluatePin | N | LOW | pure state/ref sync |
| delivery | `lib/stores/use-store-detail-category-tabs-pin.ts:97` | useStoreDetailCategoryTabsPin | LayoutEffect | calls Math.ceil, tabs.getBoundingClientRect, measure, ResizeObserver | D,O | LOW | observer on hidden element (no intersection / 0 size) |
| delivery | `lib/stores/use-store-detail-menu-tabs-viewport.ts:106` | useStoreDetailMenuTabsViewport | LayoutEffect | anchor menu tabs viewport | D | LOW | slug frozen |
| delivery | `lib/stores/use-store-detail-menu-tabs-viewport.ts:129` | useStoreDetailMenuTabsViewport | LayoutEffect | calls consumeStoreDetailMenuTabsLanding, runAfterFrames, applyMenuTabsAnchor | N | LOW | pure state/ref sync |
| delivery | `lib/stores/use-store-detail-menu-tabs-viewport.ts:138` | useStoreDetailMenuTabsViewport | LayoutEffect | calls prefersReducedMotion | N | LOW | pure state/ref sync |
| delivery | `lib/stores/use-store-favorite-toggle.ts:25` | useStoreFavoriteToggle | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `lib/stores/use-store-favorite-toggle.ts:30` | useStoreFavoriteToggle | Effect | favorite-changed event -> count | L | LOW | custom event local |
| delivery | `lib/stores/use-store-public-slug-cache-invalidation.ts:11` | useStorePublicSlugCacheInvalidation | Effect | slug cache invalidation event | L | LOW | custom event local |
| delivery | `lib/ui/overlay-back-stack.ts:118` | useOverlayHardwareBack | Effect | assign refs/state | N | LOW | pure state/ref sync |
| delivery | `lib/ui/use-form-keyboard-focus-visibility.ts:299` | useFormKeyboardFocusVisibility | Effect | scroll focused field into view when keyboard bottom changes | T,D | LOW | enabled sheets only |
| delivery | `lib/ui/use-refetch-on-page-show.ts:36` | useRefetchOnPageShowRestore | Effect | sync ref | N | LOW | pure state/ref sync |

Excluded from delivery (23 call sites in reached files):
- AppLanguageProvider ×3 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/i18n/AppLanguageProvider.tsx`)
- DibayPromptDialog ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayPromptDialog.tsx`)
- DibayAppDialogImperativeBridge ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayAppDialogImperativeBridge.tsx`)
- RegionProvider ×10 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/RegionContext.tsx`)
- StoreCommerceCartProvider ×5 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/StoreCommerceCartContext.tsx`)
- useStoreCommerceCartLines ×1 — hook/component in reached file but not referenced by hub tree (`lib/stores/use-store-commerce-cart-selector.ts`)
- useStoreCommerceCartLinesBySlug ×1 — hook/component in reached file but not referenced by hub tree (`lib/stores/use-store-commerce-cart-selector.ts`)
- useStoreCommerceCartHydrated ×1 — hook/component in reached file but not referenced by hub tree (`lib/stores/use-store-commerce-cart-selector.ts`)

## mypage (93 effects, 35 HIGH)

| hub | file:line | component/hook | kind | what it does | category | risk | reason |
|---|---|---|---|---|---|---|---|
| mypage | `app/(main)/my/MyContent.tsx:96` | MyContent | Effect | document pointerdown capture -> prewarm/guard link taps | L | **HIGH** | global pointer listener: catches taps in visible hub |
| mypage | `components/my/MyHubHeaderActions.tsx:61` | MyHubHeaderInAppSoundInner | Effect | deferred load of notification sound settings (/api) | T,F | **HIGH** | network; re-runs if loadSound identity changes |
| mypage | `components/my/MyHubHeaderActions.tsx:71` | MyHubHeaderInAppSoundInner | Effect | settings-changed event -> reload sound settings | L,F | **HIGH** | network from hidden hub |
| mypage | `components/my/MySubpageHeader.tsx:130` | MySubpageHeader | LayoutEffect | setMainTier1Extras(tier1 header) for shell header | N | **HIGH** | shell header registration not cleared on hide -> hidden hub's title can leak to visible header |
| mypage | `components/mypage/home/MypageRequiredInfoSummary.tsx:256` | useRequiredInfoNowMs | Effect | setInterval 30s now tick while pending | T | **HIGH** | interval runs while hidden |
| mypage | `components/mypage/profile/PhoneVerificationBox.tsx:266` | PhoneVerificationBox | Effect | setInterval cooldown tick | T | **HIGH** | interval while cooldown active |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:417` | PhilifeHeaderNotificationInbox | SyncExternalStore | refcounted: first subscriber schedules badge fetch and poll interval | S | **HIGH** | poll interval stays armed while hidden hub mounted |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:496` | PhilifeHeaderNotificationInbox | Effect | dispatch tier1 header overlay open/close events | N | **HIGH** | if inbox left open on hide, global 'overlay open' state persists (no cleanup) |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:698` | PhilifeHeaderNotificationInbox | Effect | deferred load of notification sound settings (/api) | T,F | **HIGH** | runs once per mount; loadSound identity change refetches |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:710` | PhilifeHeaderNotificationInbox | Effect | startup-deferred inbox list prefetch (/api notifications) | T,F | **HIGH** | network; re-runs on deps change while hidden |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:731` | PhilifeHeaderNotificationInbox | Effect | window settings/inbox-changed events -> reload sound / mark inbox dirty | L,F | **HIGH** | network fetch from hidden hub on global events |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:772` | PhilifeHeaderNotificationInbox | Effect | body.classList overflow-hidden while panel visible | D | **HIGH** | if left open on hide, body scroll lock persists over visible hub |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:792` | PhilifeHeaderNotificationInbox | Effect | document keydown(Esc)/window resize/scroll -> layout panel | L,D | **HIGH** | only while visible=open; global keyboard+scroll listener if left open |
| mypage | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:113` | DibayOverlayRoot | Effect | window keydown Escape -> onClose | L | **HIGH** | global keyboard listener while sheet open (not cleaned on hide) |
| mypage | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:122` | DibayOverlayRoot | Effect | document.body overflow hidden while open | D | **HIGH** | scroll lock persists over visible hub if sheet open on hide |
| mypage | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:84` | DibayOverlayRoot | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay registry persists if sheet open on hide |
| mypage | `hooks/use-mypage-home-model.ts:161` | useMypageHomeModel | Effect | mypage home model hydrate (profile/address/owner-lite) | F | **HIGH** | re-runs on viewer/enabled change while hidden -> fetches |
| mypage | `hooks/use-mypage-home-model.ts:202` | useMypageHomeModel | Effect | profile/addresses updated events -> refresh | L,F | **HIGH** | network from hidden hub |
| mypage | `hooks/use-mypage-home-model.ts:218` | useMypageHomeModel | Effect | auth changed -> reset/refresh projection | L,F | **HIGH** | network from hidden hub |
| mypage | `hooks/use-mypage-home-summary.ts:43` | useMypageHomeSummary | Effect | fetch home summary + pageshow/visibilitychange refetch | L,F | **HIGH** | network refetch from hidden hub on resume |
| mypage | `hooks/use-representative-address-line.ts:179` | useRepresentativeAddressLine | Effect | load representative address line on pathname/load change | F | **HIGH** | load identity changes with auth; fetches address defaults |
| mypage | `hooks/use-representative-address-line.ts:183` | useRepresentativeAddressLine | Effect | window popstate -> reload address line (silent) | L,F | **HIGH** | fires on every back/forward in visible hub -> address fetch from hidden hub |
| mypage | `hooks/use-representative-address-line.ts:189` | useRepresentativeAddressLine | Effect | SAMARKET_ADDRESSES_UPDATED -> force reload address | L,F | **HIGH** | network fetch from hidden hub on address save |
| mypage | `hooks/use-representative-address-line.ts:201` | useRepresentativeAddressLine | Effect | auth changed -> force reload address / clear | L,F | **HIGH** | network fetch from hidden hub on auth change |
| mypage | `lib/addresses/use-address-defaults-boot-retry.ts:14` | useAddressDefaultsBootRetry | Effect | app-boot event -> retry address defaults load | L,F | **HIGH** | network fetch from hidden hub on boot events |
| mypage | `lib/auth/oauth/use-oauth-login.ts:417` | useOAuthLogin | Effect | pageshow/visibilitychange + custom clear while OAuth pending | L | **HIGH** | global listener while pending |
| mypage | `lib/chats/use-owner-hub-badge-total.ts:36` | useOwnerHubBadgeBreakdown | SyncExternalStore | useSyncExternalStore(subscribeOwnerHubBadge) | S | **HIGH** | refcounted: first subscriber starts owner hub badge pipeline (startHub); hidden hub keeps refcount>0 so it never stops |
| mypage | `lib/chats/use-owner-hub-badge-total.ts:41` | useOwnerHubBadgeBreakdownWhenEnabled | SyncExternalStore | useSyncExternalStore(subscribeOwnerHubBadge) | S | **HIGH** | refcounted: first subscriber starts owner hub badge pipeline (startHub); hidden hub keeps refcount>0 so it never stops |
| mypage | `lib/delivery/owner/projections/use-owner-navigation-summary.ts:58` | useOwnerNavigationHasPreferredStore | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| mypage | `lib/stores/use-owner-lite-store.ts:15` | useOwnerLiteStore | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| mypage | `lib/stores/use-owner-lite-store.ts:24` | useOwnerLitePreferredStoreRow | SyncExternalStore | useSyncExternalStore(subscribeOwnerLiteStore) | S | **HIGH** | refcounted: first subscriber auto-hydrates owner store (/api fetch); hidden hub keeps subscriber alive |
| mypage | `lib/ui/overlay-back-stack.ts:121` | useOverlayHardwareBack | Effect | pushOverlayBackEntry while active | N | **HIGH** | hardware-back stack entry persists -> back press closes hidden sheet instead of navigating |
| mypage | `lib/ui/use-form-keyboard-focus-visibility.ts:154` | useFormKeyboardFocusVisibility | Effect | document focusin/focusout + visualViewport resize/scroll + ResizeObserver to keep focused input visible | L,O,T,D | **HIGH** | global focus/keyboard listeners while enabled (sheet open) |
| mypage | `lib/ui/use-form-keyboard-viewport.ts:220` | useFormKeyboardViewport | SyncExternalStore | subscribe visualViewport/keyboard store while enabled | S,L | **HIGH** | global keyboard listener while enabled |
| mypage | `lib/ui/use-register-open-overlay.ts:10` | useRegisterOpenOverlay | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay count persists if sheet left open on hide |
| mypage | `app/(main)/my/MyContent.tsx:109` | MyContent | Effect | legacy info sheet -> router.replace settings | N | LOW | infoHubOpen from frozen params |
| mypage | `app/(main)/my/MyContent.tsx:117` | MyContent | Effect | legacy tab params -> router.replace | N | LOW | params frozen |
| mypage | `app/(main)/my/MyContent.tsx:141` | MyContent | Effect | calls dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal (perf/metric mark) | N | LOW | local perf mark |
| mypage | `app/(main)/my/MyContent.tsx:87` | MyContent | Effect | perf mark route start | N | LOW | metric |
| mypage | `app/(main)/my/MyContent.tsx:92` | MyContent | Effect | calls dibayMyInfoPerfMark (perf/metric mark) | N | LOW | local perf mark |
| mypage | `components/auth/AuthLoginPanel.tsx:101` | AuthLoginPanel | Effect | fetch login providers (revisit-gated) | F | LOW | active only |
| mypage | `components/auth/AuthLoginPanel.tsx:91` | AuthLoginPanel | Effect | calls resetPasswordLogin, resetOAuthOnClose | N | LOW | pure state/ref sync |
| mypage | `components/auth/login-provider-platform-filter.ts:97` | usePlatformFilteredLoginProviders | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `components/layout/sector-header/SectorHeaderBar.tsx:37` | SectorHeaderBar | LayoutEffect | ResizeObserver to balance header side widths | O,D | LOW | DOM only |
| mypage | `components/my/edit/ProfileDibayIdSection.tsx:138` | ProfileDibayIdSection | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `components/my/edit/ProfileDibayIdSection.tsx:154` | ProfileDibayIdSection | Effect | debounced Dibay ID availability check | T,F | LOW | typing only |
| mypage | `components/mypage/MyPageHomeDashboard.tsx:64` | MyPageHomeDashboard | Effect | register profile refresh callback | N | LOW | context-local |
| mypage | `components/mypage/ds/MyStickyCta.tsx:92` | MyStickyCta | LayoutEffect | ResizeObserver sticky CTA -> documentElement CSS var | O,D | LOW | writes documentElement var (stale value may persist) |
| mypage | `components/mypage/home/mypage-home-values-context.tsx:61` | useInstalledVersionLabel | Effect | read installed version label | N | LOW | mount |
| mypage | `components/mypage/myinfo/MyInfoHomeMenuSections.tsx:183` | useCustomerCenterUnreadTotal | Effect | fetch notices unread counts | F | LOW | mount-only |
| mypage | `components/mypage/profile-settings/EditDibayIdSheet.tsx:22` | EditDibayIdSheet | Effect | getMyProfile when open | F | LOW | open only |
| mypage | `components/mypage/profile-settings/EditPublicProfileSheet.tsx:112` | EditPublicProfileSheet | Effect | load profile when sheet open | F | LOW | open only |
| mypage | `components/mypage/profile-settings/MypageProfileEditQueryOpener.tsx:24` | MypageProfileEditQueryOpener | Effect | calls openSheet | N | LOW | pure state/ref sync |
| mypage | `components/mypage/profile-settings/MypageProfileEditQueryOpener.tsx:34` | MypageProfileEditQueryOpener | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `components/mypage/profile-settings/PhoneVerificationSheet.tsx:38` | PhoneVerificationSheet | Effect | load when sheet open | F | LOW | open only |
| mypage | `components/mypage/profile/PhoneVerificationBox.tsx:235` | PhoneVerificationBox | Effect | calls parseKoreaMobileTyping | N | LOW | pure state/ref sync |
| mypage | `components/mypage/profile/PhoneVerificationBox.tsx:248` | PhoneVerificationBox | Effect | calls resumePendingChallenge | N | LOW | pure state/ref sync |
| mypage | `components/mypage/profile/PhoneVerificationBox.tsx:255` | PhoneVerificationBox | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `components/mypage/profile/PhoneVerificationBox.tsx:394` | PhoneVerificationBox | Effect | calls verifyOtp | N | LOW | pure state/ref sync |
| mypage | `components/mypage/profile/PhoneVerificationBox.tsx:403` | PhoneVerificationBox | Effect | onDone timeout after verify | T | LOW | one-shot |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:340` | PhilifeHeaderNotificationInbox | Effect | sync ref | N | LOW | pure state/ref sync |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:358` | PhilifeHeaderNotificationInbox | Effect | sync ref | N | LOW | pure state/ref sync |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:452` | PhilifeHeaderNotificationInbox | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:512` | PhilifeHeaderNotificationInbox | Effect | window TIER1_HEADER_OVERLAY_CLOSE -> closePanel | L | LOW | custom event; local state only |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:524` | PhilifeHeaderNotificationInbox | Effect | enter/exit animation timeout on open change | T | LOW | one-shot timer |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:824` | PhilifeHeaderNotificationInbox | Effect | fetch owner-unread-by-store when open | F | LOW | only while open |
| mypage | `components/philife/PhilifeHeaderNotificationInbox.tsx:838` | PhilifeHeaderNotificationInbox | Effect | load inbox list on open | F | LOW | only while open |
| mypage | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:131` | DibayOverlayRoot | Effect | restore focus on close | D | LOW | only on close |
| mypage | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:89` | DibayOverlayRoot | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:93` | DibayOverlayRoot | Effect | enter animation rAF/timeout + save focused element | T,D | LOW | only on open change |
| mypage | `components/write/shared/AutoGrowTextarea.tsx:24` | AutoGrowTextarea | LayoutEffect | window resize -> textarea height | L,D | LOW | sheet only |
| mypage | `hooks/use-client-membership-state.ts:294` | useClientMembershipState | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `hooks/use-client-membership-state.ts:296` | useClientMembershipState | Effect | bind global auth listener + ensureMembershipResolved(source) | F | LOW | deduped/resolved once; deps=source constant |
| mypage | `hooks/use-client-membership-state.ts:306` | useClientMembershipRecoveryFailed | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `hooks/use-mypage-home-model.ts:237` | useMypageHomeModel | Effect | calls dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal (perf/metric mark) | N | LOW | local perf mark |
| mypage | `hooks/use-mypage-home-model.ts:82` | useMypageHomeModel | SyncExternalStore | useSyncExternalStore(subscribeMypageHomeStore) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `hooks/use-mypage-home-summary.ts:37` | useMypageHomeSummary | SyncExternalStore | useSyncExternalStore(subscribeMypageHomeSummary) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `lib/auth/oauth/use-oauth-login.ts:335` | useOAuthLogin | SyncExternalStore | useSyncExternalStore(subscribePending) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `lib/auth/oauth/use-oauth-login.ts:340` | useOAuthLogin | SyncExternalStore | useSyncExternalStore(subscribePending) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `lib/auth/oauth/use-oauth-login.ts:345` | useOAuthLogin | SyncExternalStore | useSyncExternalStore(subscribePending) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `lib/auth/oauth/use-oauth-login.ts:356` | useOAuthLogin | Effect | sync ref | N | LOW | pure state/ref sync |
| mypage | `lib/auth/oauth/use-oauth-login.ts:369` | useOAuthLogin | Effect | sync ref | N | LOW | pure state/ref sync |
| mypage | `lib/auth/oauth/use-oauth-login.ts:373` | useOAuthLogin | Effect | sync ref | N | LOW | pure state/ref sync |
| mypage | `lib/auth/use-member-discovery-settings.ts:38` | useMemberDiscoverySettings | SyncExternalStore | useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l);) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `lib/auth/use-member-discovery-settings.ts:46` | useMemberDiscoverySettings | Effect | load discovery settings once | F | LOW | module-cached |
| mypage | `lib/chats/use-owner-hub-badge-total.ts:226` | useOwnerHubBadgeTabUnreadCount | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| mypage | `lib/chats/use-owner-hub-badge-total.ts:229` | useOwnerHubBadgeTabUnreadCount | Effect | perf/rerender trace bump on badge count change | N | LOW | local trace only (runs on each badge change while hidden) |
| mypage | `lib/layout/use-html-shell-flags-sync.ts:11` | useHtmlShellFlagsSync | LayoutEffect | request html shell flags sync on key change | D | LOW | one-shot |
| mypage | `lib/mypage/use-mypage-submit-guard.ts:23` | useMypageSubmitGuard | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `lib/navigation/use-back-press-lock.ts:19` | useBackPressLock | Effect | reset back-press lock on pathname | N | LOW | local |
| mypage | `lib/navigation/use-back-press-lock.ts:27` | useBackPressLock | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `lib/ui/overlay-back-stack.ts:118` | useOverlayHardwareBack | Effect | assign refs/state | N | LOW | pure state/ref sync |
| mypage | `lib/ui/use-form-keyboard-focus-visibility.ts:299` | useFormKeyboardFocusVisibility | Effect | scroll focused field into view when keyboard bottom changes | T,D | LOW | enabled sheets only |

Excluded from mypage (25 call sites in reached files):
- AppLanguageProvider ×3 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/i18n/AppLanguageProvider.tsx`)
- useRepresentativeAddressPresentation ×5 — hook/component in reached file but not referenced by hub tree (`hooks/use-representative-address-line.ts`)
- useRepresentativeFullAddressLine ×4 — hook/component in reached file but not referenced by hub tree (`hooks/use-representative-address-line.ts`)
- useOwnerFabOrdersBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabStoreBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrderChatBadgeCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHeaderOpsAttentionCount ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHeaderOpsAttentionCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrdersBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabStoreBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerFabOrderChatBadgeCountWhenEnabled ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerHubBadgeStoreDeepLink ×1 — hook/component in reached file but not referenced by hub tree (`lib/chats/use-owner-hub-badge-total.ts`)
- useOwnerNavigationSummary ×1 — hook/component in reached file but not referenced by hub tree (`lib/delivery/owner/projections/use-owner-navigation-summary.ts`)
- useOwnerLiteHasPreferredStore ×1 — hook/component in reached file but not referenced by hub tree (`lib/stores/use-owner-lite-store.ts`)
- DibayPromptDialog ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayPromptDialog.tsx`)
- DibayAppDialogImperativeBridge ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayAppDialogImperativeBridge.tsx`)

## trade (105 effects, 29 HIGH)

| hub | file:line | component/hook | kind | what it does | category | risk | reason |
|---|---|---|---|---|---|---|---|
| trade | `app/(main)/market/MarketContent.tsx:132` | MarketContent | Effect | prewarm adjacent trade tabs | T,F | **HIGH** | network prefetch on tabs/activeIndex change |
| trade | `components/ads/FeedAdBannerCarousel.tsx:124` | FeedAdBannerCarousel | Effect | fetch feed ad banners (non-pool) + refresh | T,F | **HIGH** | network ad fetch/refresh while hidden |
| trade | `components/ads/FeedAdBannerCarousel.tsx:285` | FeedAdBannerCarouselView | Effect | IntersectionObserver >=50% visible (ad impression gate) | O | **HIGH** | impression gate; display:none should report false but verify (if hidden via visibility/opacity it stays true) |
| trade | `components/ads/FeedAdBannerCarousel.tsx:299` | FeedAdBannerCarouselView | Effect | 1s dwell timer -> sendFeedAdEvent impression | T | **HIGH** | AD IMPRESSION analytics; fires if halfVisible stays true while hidden |
| trade | `components/ads/FeedAdBannerCarousel.tsx:345` | FeedAdBannerCarouselView | Effect | setInterval auto-advance carousel | T | **HIGH** | interval keeps running if inView stays true (non-display:none hiding) |
| trade | `components/home/HomeProductList.tsx:531` | HomeProductList | LayoutEffect | load trade list for scope/filters | F | **HIGH** | deps include location scope / auth-driven state -> refetch while hidden |
| trade | `components/home/HomeProductList.tsx:683` | HomeProductList | Effect | TRADE_POST_LIST cache bust event -> reload list | L,F | **HIGH** | network from hidden hub |
| trade | `components/home/HomeProductList.tsx:696` | HomeProductList | Effect | prefetch details of visible posts | T,F | **HIGH** | network prefetch when posts change |
| trade | `components/home/HomeProductList.tsx:898` | HomeProductList | Effect | fetch trade feed ads + refresh timer | T,F | **HIGH** | ad fetch timer keeps running while hidden |
| trade | `components/home/HomeProductList.tsx:978` | HomeProductList | Effect | list reset event -> silent refresh | L,F | **HIGH** | network from hidden hub |
| trade | `components/market/MarketCategoryFeed.tsx:234` | MarketCategoryFeed | Effect | prewarm adjacent tabs | T,F | **HIGH** | network prefetch |
| trade | `components/market/MarketCategoryFeed.tsx:364` | MarketCategoryFeed | Effect | prewarm child categories | T,F | **HIGH** | network prefetch |
| trade | `components/post/PostListByCategory.tsx:582` | PostListByCategory | Effect | prefetch visible post details | F | **HIGH** | network prefetch on posts change |
| trade | `components/post/PostListByCategory.tsx:599` | PostListByCategory | LayoutEffect | load category feed | F | **HIGH** | deps may change with global state |
| trade | `components/post/PostListByCategory.tsx:735` | PostListByCategory | Effect | cache bust event -> reload | L,F | **HIGH** | network from hidden hub |
| trade | `components/post/PostListByCategory.tsx:858` | PostListByCategory | Effect | fetch trade feed ads + refresh timer | T,F | **HIGH** | ad refresh timer while hidden |
| trade | `components/stores/advertising/useDeliveryAdEvents.ts:45` | useDeliveryAdImpressionObserver | Effect | IntersectionObserver + dwell timer -> delivery ad IMPRESSION beacon | O,T,F | **HIGH** | ad impression analytics; verify hidden element never counts as visible |
| trade | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:113` | DibayOverlayRoot | Effect | window keydown Escape -> onClose | L | **HIGH** | global keyboard listener while sheet open (not cleaned on hide) |
| trade | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:122` | DibayOverlayRoot | Effect | document.body overflow hidden while open | D | **HIGH** | scroll lock persists over visible hub if sheet open on hide |
| trade | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:84` | DibayOverlayRoot | Effect | registerOpenOverlay while open | N | **HIGH** | global overlay registry persists if sheet open on hide |
| trade | `contexts/CategoryListHeaderContext.tsx:58` | useRegisterTradeSecondaryTabs | LayoutEffect | setTradeSecondaryTabs portal node into shell header | N | **HIGH** | shell header registration not cleared on hide |
| trade | `lib/addresses/use-address-defaults-boot-retry.ts:14` | useAddressDefaultsBootRetry | Effect | app-boot event -> retry address defaults load | L,F | **HIGH** | network fetch from hidden hub on boot events |
| trade | `lib/layout/use-register-main-tier1-header.ts:19` | useRegisterMainTier1Header | LayoutEffect | setMainTier1Extras(tier1) for shell header | N | **HIGH** | shell header registration not cleared on hide |
| trade | `lib/trade/location/use-trade-market-list-scroll-restore.ts:15` | useTradeMarketSelectedListingReturn | LayoutEffect | restore selected listing scroll position on SHARED scroll root | T,D | **HIGH** | scrolls main scroll root (could move visible hub) when ready flips |
| trade | `lib/trade/location/use-trade-marketplace-location-hydrate.ts:246` | useTradeMarketplaceLocationHydrate | Effect | addresses-updated -> rehydrate location | L,F | **HIGH** | network from hidden hub |
| trade | `lib/ui/overlay-back-stack.ts:121` | useOverlayHardwareBack | Effect | pushOverlayBackEntry while active | N | **HIGH** | hardware-back stack entry persists -> back press closes hidden sheet instead of navigating |
| trade | `lib/ui/use-form-keyboard-focus-visibility.ts:154` | useFormKeyboardFocusVisibility | Effect | document focusin/focusout + visualViewport resize/scroll + ResizeObserver to keep focused input visible | L,O,T,D | **HIGH** | global focus/keyboard listeners while enabled (sheet open) |
| trade | `lib/ui/use-form-keyboard-viewport.ts:220` | useFormKeyboardViewport | SyncExternalStore | subscribe visualViewport/keyboard store while enabled | S,L | **HIGH** | global keyboard listener while enabled |
| trade | `lib/ui/use-refetch-on-page-show.ts:40` | useRefetchOnPageShowRestore | Effect | window pageshow/focus/visibilitychange -> scheduled refetch | L,T,F | **HIGH** | network refetch from hidden hub on app resume/focus |
| trade | `app/(main)/market/MarketContent.tsx:127` | MarketContent | LayoutEffect | calls recordTradeListMetricOnce (perf/metric mark) | N | LOW | local perf mark |
| trade | `app/(main)/market/MarketContent.tsx:153` | MarketContent | Effect | warmMainShellData (cancel on unmount) | F | LOW | mount-only |
| trade | `app/(main)/market/MarketContent.tsx:160` | MarketContent | Effect | calls recordTradeListMetricOnce (perf/metric mark) | N | LOW | local perf mark |
| trade | `app/(main)/market/MarketContent.tsx:77` | MarketContent | Effect | matchMedia max-width listener | L | LOW | rare |
| trade | `components/ads/FeedAdBannerCarousel.tsx:265` | FeedAdBannerCarouselView | Effect | matchMedia reduced-motion listener | L | LOW | rare |
| trade | `components/ads/FeedAdBannerCarousel.tsx:274` | FeedAdBannerCarouselView | Effect | IntersectionObserver inView | O | LOW | display:none -> not intersecting (stops autoplay) |
| trade | `components/ads/FeedAdBannerCarousel.tsx:314` | FeedAdBannerCarouselView | Effect | document visibilitychange -> pageVisible | L | LOW | cheap listener |
| trade | `components/ads/FeedAdBannerCarousel.tsx:377` | FeedAdBannerCarouselView | LayoutEffect | calls window.requestAnimationFrame | T | LOW | one-shot timer/rAF |
| trade | `components/ads/FeedAdReportButton.tsx:24` | FeedAdReportButton | Effect | toast auto-dismiss timeout | T | LOW | one-shot |
| trade | `components/category/CategoryListLayout.tsx:131` | CategoryListLayout | Effect | sync ref | N | LOW | pure state/ref sync |
| trade | `components/category/CategoryListLayout.tsx:135` | CategoryListLayout | Effect | hydrate category peek cache | F | LOW | seed only |
| trade | `components/category/CategoryListLayout.tsx:323` | CategoryListLayout | Effect | load category bootstrap | F | LOW | search key frozen |
| trade | `components/common/SamarketThumbnail.tsx:107` | SamarketThumbnail | LayoutEffect | calls probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| trade | `components/common/SamarketThumbnail.tsx:114` | SamarketThumbnail | LayoutEffect | boot metric: thumbnail requested | N | LOW | mount-time metric only |
| trade | `components/common/SamarketThumbnail.tsx:99` | SamarketThumbnail | Effect | calls isThumbnailUrlLoaded, probeBrowserCachedImageComplete | N | LOW | pure state/ref sync |
| trade | `components/community/HorizontalDragScroll.tsx:58` | HorizontalDragScroll | Effect | pointer/scroll listeners on own element | L | LOW | element-scoped |
| trade | `components/favorites/PostFavoriteButton.tsx:42` | PostFavoriteButton | Effect | getFavoriteStatus (non-list mode) | F | LOW | postId frozen |
| trade | `components/home/HomeProductList.tsx:1017` | HomeProductList | Effect | sync ref | N | LOW | pure state/ref sync |
| trade | `components/home/HomeProductList.tsx:1027` | HomeProductList | Effect | favorite-changed -> update map | L | LOW | custom event local |
| trade | `components/home/HomeProductList.tsx:1091` | HomeProductList | LayoutEffect | list paint metrics | D | LOW | perf metric |
| trade | `components/home/HomeProductList.tsx:218` | HomeProductList | Effect | resolve city label (may fetch) | F | LOW | locationScope frozen |
| trade | `components/home/HomeProductList.tsx:668` | HomeProductList | Effect | calls rememberTradeListReturnHref | N | LOW | pure state/ref sync |
| trade | `components/home/HomeProductList.tsx:752` | HomeProductList | LayoutEffect | calls peekTradeListPresentationSessionForIdentity, retained.productIds.indexOf, listPagination.restoreVisibleCount | N | LOW | pure state/ref sync |
| trade | `components/home/HomeProductList.tsx:775` | HomeProductList | LayoutEffect | calls peekTradeListPresentationSessionForIdentity, posts.findIndex, commitTradeListPresentationSession | N | LOW | pure state/ref sync |
| trade | `components/home/HomeProductList.tsx:967` | HomeProductList | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| trade | `components/home/TradeListPageMountProbe.tsx:7` | TradeListPageMountProbe | LayoutEffect | calls recordTradeListMetricOnce (perf/metric mark) | N | LOW | local perf mark |
| trade | `components/market/MarketCategoryFeed.tsx:100` | MarketCategoryFeed | Effect | matchMedia listener | L | LOW | rare |
| trade | `components/market/MarketCategoryFeed.tsx:109` | MarketCategoryFeed | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `components/market/MarketCategoryFeed.tsx:113` | MarketCategoryFeed | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `components/market/MarketCategoryFeed.tsx:120` | MarketCategoryFeed | Effect | fetch category children | F | LOW | category frozen |
| trade | `components/market/MarketCategoryFeed.tsx:94` | MarketCategoryFeed | Effect | sync ref | N | LOW | pure state/ref sync |
| trade | `components/platform-events/EventPromotionHeroBanner.tsx:26` | EventPromotionHeroBanner | Effect | fetch hero banners (revisit-gated) | F | LOW | mount/placement only |
| trade | `components/post/PostCard.tsx:294` | PostCard | Effect | calls bumpTradeListProductCardRenderCount | N | LOW | pure state/ref sync |
| trade | `components/post/PostCard.tsx:298` | PostCard | LayoutEffect | calls recordTradeListMetricOnce (perf/metric mark) | N | LOW | local perf mark |
| trade | `components/post/PostCard.tsx:304` | PostCard | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `components/post/PostCard.tsx:308` | PostCard | Effect | first-card image request metric | T | LOW | first card only |
| trade | `components/post/PostListByCategory.tsx:534` | PostListByCategory | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| trade | `components/post/PostListByCategory.tsx:543` | PostListByCategory | Effect | calls rememberTradeListReturnHref | N | LOW | pure state/ref sync |
| trade | `components/post/PostListByCategory.tsx:720` | PostListByCategory | LayoutEffect | calls commitTradeListPresentationSession | N | LOW | pure state/ref sync |
| trade | `components/post/PostListByCategory.tsx:746` | PostListByCategory | LayoutEffect | sync ref | N | LOW | pure state/ref sync |
| trade | `components/post/PostListByCategory.tsx:751` | PostListByCategory | Effect | first-card paint metric | T | LOW | perf metric |
| trade | `components/post/PostListByCategory.tsx:771` | PostListByCategory | Effect | favorite-changed -> map | L | LOW | custom event local |
| trade | `components/post/PostListMenuBottomSheet.tsx:108` | PostListMenuBottomSheet | Effect | prefetch boost state when sheet open | F | LOW | open only |
| trade | `components/trade/TradeMarketPullRefreshRegister.tsx:18` | TradeMarketPullRefreshRegister | LayoutEffect | register trade PTR handler | N | LOW | shell PTR host keyed by route |
| trade | `components/trade/TradeShowcaseSection.tsx:37` | useTradeShowcaseItems | Effect | fetch showcase items (cached) | F | LOW | key frozen |
| trade | `components/trade/seller-ad/TradeAdQuickSheet.tsx:136` | TradeAdQuickSheet | Effect | load ad options when open | F | LOW | open only |
| trade | `components/trade/seller-ad/TradeAdQuickSheet.tsx:192` | TradeAdQuickSheet | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:131` | DibayOverlayRoot | Effect | restore focus on close | D | LOW | only on close |
| trade | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:89` | DibayOverlayRoot | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `components/ui/dibay-overlay/DibayOverlayRoot.tsx:93` | DibayOverlayRoot | Effect | enter animation rAF/timeout + save focused element | T,D | LOW | only on open change |
| trade | `lib/business/use-owner-admin-url-search-params.ts:47` | useOwnerAdminUrlSearchParams | SyncExternalStore | useSyncExternalStore(subscribeOwnerAdminUrlSearch) | S | LOW | in-memory store; hidden tree re-renders on change only |
| trade | `lib/community-messenger/trade-chat-list/use-trade-chat-list-client-pagination.ts:43` | useTradeChatListClientPagination | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `lib/community-messenger/trade-chat-list/use-trade-chat-list-client-pagination.ts:59` | useTradeChatListClientPagination | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `lib/layout/use-html-shell-flags-sync.ts:11` | useHtmlShellFlagsSync | LayoutEffect | request html shell flags sync on key change | D | LOW | one-shot |
| trade | `lib/navigation/use-back-press-lock.ts:19` | useBackPressLock | Effect | reset back-press lock on pathname | N | LOW | local |
| trade | `lib/navigation/use-back-press-lock.ts:27` | useBackPressLock | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `lib/reports/reported-posts-store.ts:89` | useReportedPostIds | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| trade | `lib/trade/category-form/use-trade-list-composition-map.ts:53` | useTradeListCompositionMap | Effect | getCategories (cached) | F | LOW | mount |
| trade | `lib/trade/hidden-posts-store.ts:187` | useIsTradePostHidden | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| trade | `lib/trade/listing-visibility/listing-visibility-client.ts:112` | useTradeListingRemoved | SyncExternalStore | useSyncExternalStore(subscribeStore) | S | LOW | in-memory store; hidden tree re-renders on change only |
| trade | `lib/trade/listing-visibility/listing-visibility-client.ts:88` | useTradeListingVisibilityRemoval | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `lib/trade/listing-visibility/listing-visibility-client.ts:91` | useTradeListingVisibilityRemoval | Effect | subscribe listing visibility removal | S | LOW | in-memory |
| trade | `lib/trade/location/use-trade-marketplace-location-hydrate.ts:209` | useTradeMarketplaceLocationHydrate | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `lib/trade/location/use-trade-marketplace-location-hydrate.ts:234` | useTradeMarketplaceLocationHydrate | Effect | hydrate marketplace location for scope | F | LOW | scope frozen |
| trade | `lib/trade/location/use-trade-marketplace-location-hydrate.ts:242` | useTradeMarketplaceLocationHydrate | LayoutEffect | runHydrate | F | LOW | scope frozen |
| trade | `lib/trade/marketplace/use-grid-column-count.ts:22` | useGridColumnCount | Effect | ResizeObserver grid columns | O | LOW | display:none -> 0 width state churn |
| trade | `lib/trade/marketplace/use-grid-column-count.ts:40` | useGridColumnCount | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `lib/trade/tabs/use-trade-tabs.ts:68` | useTradeTabs | Effect | load trade primary categories (cached) | F | LOW | mount |
| trade | `lib/trade/topic-badge-store.ts:56` | useTradeTopicBadge | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |
| trade | `lib/trade/topic-badge-store.ts:62` | useTradeTopicBadge | Effect | load topic badges if missing | F | LOW | module-cached |
| trade | `lib/ui/overlay-back-stack.ts:118` | useOverlayHardwareBack | Effect | assign refs/state | N | LOW | pure state/ref sync |
| trade | `lib/ui/use-form-keyboard-focus-visibility.ts:299` | useFormKeyboardFocusVisibility | Effect | scroll focused field into view when keyboard bottom changes | T,D | LOW | enabled sheets only |
| trade | `lib/ui/use-mobile-horizontal-swipe-panel.ts:382` | useMobileHorizontalSwipePanel | Effect | notify settle key | N | LOW | local |
| trade | `lib/ui/use-mobile-horizontal-swipe-panel.ts:98` | useMobileHorizontalSwipePanel | Effect | touch listeners on swipe target element | L,T,D | LOW | element-scoped; hidden element receives no touches |
| trade | `lib/ui/use-refetch-on-page-show.ts:36` | useRefetchOnPageShowRestore | Effect | sync ref | N | LOW | pure state/ref sync |
| trade | `lib/ui/use-shell-hydrated.ts:18` | useShellHydrated | SyncExternalStore | useSyncExternalStore(subscribe) | S | LOW | in-memory store; hidden tree re-renders on change only |

Excluded from trade (15 call sites in reached files):
- AppLanguageProvider ×3 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/i18n/AppLanguageProvider.tsx`)
- DibayPromptDialog ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayPromptDialog.tsx`)
- DibayAppDialogImperativeBridge ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`components/ui/dibay-overlay/DibayAppDialogImperativeBridge.tsx`)
- PhilifeWriteSheetProvider ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/PhilifeWriteSheetContext.tsx`)
- SearchParamsSync ×1 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/LatestMenuNavigationContext.tsx`)
- LatestMenuNavigationProvider ×4 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/LatestMenuNavigationContext.tsx`)
- TradeWriteSheetProvider ×4 — provider rendered by app shell (MainAppProviderTree/app/layout), only its hook is used in hub (`contexts/TradeWriteSheetContext.tsx`)

## Per-hub counts

Category counts are per letter (a row with `L,F` counts once in L and once in F).

| hub | effects | HIGH | R | T | L | O | F | S | D | N |
|---|---|---|---|---|---|---|---|---|---|---|
| home | 63 | 32 | 0 | 7 | 11 | 3 | 17 | 11 | 8 | 22 |
| community | 106 | 44 | 1 | 25 | 17 | 8 | 26 | 14 | 13 | 35 |
| delivery | 228 | 52 | 0 | 24 | 29 | 14 | 36 | 17 | 21 | 121 |
| mypage | 93 | 35 | 0 | 11 | 17 | 3 | 24 | 17 | 11 | 33 |
| trade | 105 | 29 | 0 | 20 | 17 | 5 | 32 | 8 | 9 | 39 |
