/**
 * Community Messenger — transient UI (peek swipes, row menu ids, sheets, friends quick menu)
 *
 * ## Full reset — `resetMessengerTransientUi()` in `CommunityMessengerHome`
 * When: primary tab change, chat filter chip change, opening privacy/profile/join from home chrome,
 * and section-level outside taps that call this helper.
 * Clears: `openedSwipeItemId`, `openedMenuItemId`, `roomActionSheet`, and bumps `messengerOverlayGeneration` (friends tab: closes the local quick menu).
 *
 * ## List scroll — `notifyMessengerListScroll()` only
 * `onScrollCapture` on chat/archive/open lists runs very often during momentum scrolling.
 * It must not call the full reset: closing the room action sheet or bumping overlay generation
 * would re-run large subtree work far too frequently.
 * Instead: debounce `isScrolling` for `data-messenger-scrolling`, and at most once per frame
 * clear only `openedSwipeItemId` and `openedMenuItemId` when they were open.
 *
 * ## Friends quick menu vs tab swipe
 * Whether the quick menu is open is stored only under `MessengerFriendsScreen` and mirrored with
 * `friendQuickMenuBlocksTabSwipeRef` (no `setState` in `CommunityMessengerHome`) so opening/closing
 * the menu does not re-render the whole messenger home.
 */
export const MESSENGER_SCROLL_OVERLAY_IDLE_MS = 120;
