# DIBAY Overlay Inventory Ledger

Repository row-level inventory for Overlay SSOT migration.

**TOTAL = 128**

| OVERLAY_ID | DOMAIN | SOURCE_FILE | DISPOSITION | STATUS | MIGRATION_TARGET |
|---|---|---|---|---|---|
| `addressdesignationdupconfirmmodal` | addresses | `components/addresses/AddressDesignationDupConfirmModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `adminformsheet` | admin | `components/admin/AdminFormSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `categoryeditmodal` | admin | `components/admin/categories/CategoryEditModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `categoryformmodal` | admin | `components/admin/categories/CategoryFormModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `deliveryreasonmodal` | admin | `components/admin/delivery-orders/DeliveryReasonModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `holdreasonmodal` | admin | `components/admin/delivery-orders/HoldReasonModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `refunddecisionmodal` | admin | `components/admin/delivery-orders/RefundDecisionModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `categorysubtopicformmodal` | admin | `components/admin/menus/CategorySubtopicFormModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `categorysubtopicsmodal` | admin | `components/admin/menus/CategorySubtopicsModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `mainbottomnaviconpickermodal` | admin | `components/admin/menus/MainBottomNavIconPickerModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `postadproposalmodal` | ads | `components/ads/PostAdProposalModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `appmodal` | app-shell | `components/app-shell/AppModal.tsx` | ABSORB | DONE | delegate → Dibay Overlay SSOT |
| `authgateoverlay` | auth | `components/auth/AuthGateOverlay.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `authmodal` | auth | `components/auth/AuthModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `authprovideremailconflictmodal` | auth | `components/auth/AuthProviderEmailConflictModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `dibayonboardingoverlayshell` | auth | `components/auth/DibayOnboardingOverlayShell.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `loginrequiredsheet` | auth | `components/auth/LoginRequiredSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `logoutconfirmmodal` | auth | `components/auth/LogoutConfirmModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `phoneverificationrequiredsheet` | auth | `components/auth/PhoneVerificationRequiredSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `profilegatealertdialog` | auth | `components/auth/ProfileGateAlertDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storebusinessblockedmodal` | business | `components/business/StoreBusinessBlockedModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `ownermobileopsmenudrawer` | business | `components/business/owner/OwnerMobileOpsMenuDrawer.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `ownerorderacceptsheet` | business | `components/business/owner/OwnerOrderAcceptSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `ownerorderrejectsheet` | business | `components/business/owner/OwnerOrderRejectSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `ownerorderstepconfirmdialog` | business | `components/business/owner/OwnerOrderStepConfirmDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `ownerstoreadminconfirmmodal` | business | `components/business/owner/OwnerStoreAdminConfirmModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `ownerstoreadminleavepromptmodal` | business | `components/business/owner/OwnerStoreAdminLeavePromptModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `ownerstoreordermodalsellertoolbar` | business | `components/business/owner/OwnerStoreOrderModalSellerToolbar.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `chatmobileattachsheet` | chats | `components/chats/ChatMobileAttachSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `chatmobileimagepickersheet` | chats | `components/chats/ChatMobileImagePickerSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `tradechatentrycreatingoverlay` | chats | `components/chats/TradeChatEntryCreatingOverlay.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `incomingcalloverlay` | community-messenger | `components/community-messenger/IncomingCallOverlay.tsx` | NATIVE_REQUIRED | KEEP | OS native (do not fake) |
| `messengerblockpeerconfirmmodal` | community-messenger | `components/community-messenger/MessengerBlockPeerConfirmModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengercalllogdeleteconfirmdialog` | community-messenger | `components/community-messenger/MessengerCallLogDeleteConfirmDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerchatfiltersheet` | community-messenger | `components/community-messenger/MessengerChatFilterSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerchatroomactionsheet` | community-messenger | `components/community-messenger/MessengerChatRoomActionSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerfriendaddsheet` | community-messenger | `components/community-messenger/MessengerFriendAddSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerfriendprofilesheet` | community-messenger | `components/community-messenger/MessengerFriendProfileSheet.tsx` | MIGRATE | DONE | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerfriendrowquickpopup` | community-messenger | `components/community-messenger/MessengerFriendRowQuickPopup.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerfriendsprivacysheet` | community-messenger | `components/community-messenger/MessengerFriendsPrivacySheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerincominggroupinvitepopup` | community-messenger | `components/community-messenger/MessengerIncomingGroupInvitePopup.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengernewconversationsheet` | community-messenger | `components/community-messenger/MessengerNewConversationSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengernotificationcentersheet` | community-messenger | `components/community-messenger/MessengerNotificationCenterSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengeroutgoingcallconfirmdialog` | community-messenger | `components/community-messenger/MessengerOutgoingCallConfirmDialog.tsx` | MIGRATE | DONE | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengersearchsheet` | community-messenger | `components/community-messenger/MessengerSearchSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengersettingssheet` | community-messenger | `components/community-messenger/MessengerSettingsSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengersheetui` | community-messenger | `components/community-messenger/MessengerSheetUi.tsx` | ABSORB | DONE | delegate → Dibay Overlay SSOT |
| `communitymessengercallavataroverlay` | community-messenger | `components/community-messenger/call-history/CommunityMessengerCallAvatarOverlay.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `callkindbottomsheetactions` | community-messenger | `components/community-messenger/call-ui/CallKindBottomSheetActions.tsx` | MIGRATE | DONE | DibayDialog / Confirm / BottomSheet / FullSheet |
| `grouproomcalloverlay` | community-messenger | `components/community-messenger/call-ui/GroupRoomCallOverlay.tsx` | NATIVE_REQUIRED | KEEP | OS native (do not fake) |
| `callv4incomingsheet` | community-messenger | `components/community-messenger/call-v4/CallV4IncomingSheet.tsx` | NATIVE_REQUIRED | KEEP | OS native (do not fake) |
| `communitymessengerroomopeningoverlayhost` | community-messenger | `components/community-messenger/room/CommunityMessengerRoomOpeningOverlayHost.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `messengerroome2esnapshotdiagtradeoverlay` | community-messenger | `components/community-messenger/room/MessengerRoomE2eSnapshotDiagTradeOverlay.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `messagereactionrostersheet` | community-messenger | `components/community-messenger/room/message/MessageReactionRosterSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `communitymessengerroomfriendprofilesheethost` | community-messenger | `components/community-messenger/room/phase2/CommunityMessengerRoomFriendProfileSheetHost.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `communitymessengerroomphase2memberactionmodal` | community-messenger | `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `communitymessengerroomphase2messageoverlays` | community-messenger | `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageOverlays.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `communitymessengerroomphase2roomsheets` | community-messenger | `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storeorderbuyerroomsheet` | community-messenger | `components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `messengerstickersheet` | community-messenger | `components/community-messenger/stickers/MessengerStickerSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `communitycomposesheet` | community | `components/community/CommunityComposeSheet.tsx` | MIGRATE | DONE | DibayDialog / Confirm / BottomSheet / FullSheet |
| `meetingjoinrequestmodal` | community | `components/community/MeetingJoinRequestModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `meetingpasswordonlymodal` | community | `components/community/MeetingPasswordOnlyModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `communitysharesheet` | community | `components/community/share/CommunityShareSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `deliverydomainswitcheroverlay` | delivery | `components/delivery/navigation/DeliveryDomainSwitcherOverlay.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `deliverymodal` | delivery | `components/delivery/ui/DeliveryModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `deliveryorderconfirmmodal` | delivery | `components/delivery/ui/DeliveryOrderConfirmModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `deliverysheet` | delivery | `components/delivery/ui/DeliverySheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `hometradehistorysheetcontent` | home | `components/home/HomeTradeHistorySheetContent.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `incomingcalloverlaychunkboundary` | layout | `components/layout/providers/IncomingCallOverlayChunkBoundary.tsx` | NATIVE_REQUIRED | KEEP | OS native (do not fake) |
| `meetingreportmodal` | meetings | `components/meetings/MeetingReportModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `cancelorderrequestmodal` | member-orders | `components/member-orders/CancelOrderRequestModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `tradebuyerpickermodal` | mypage | `components/mypage/products/TradeBuyerPickerModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `editdibayidsheet` | mypage | `components/mypage/profile-settings/EditDibayIdSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `editpublicprofilesheet` | mypage | `components/mypage/profile-settings/EditPublicProfileSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `mypagebottomsheetshell` | mypage | `components/mypage/profile-settings/MypageBottomSheetShell.tsx` | ABSORB | DONE | delegate → Dibay Overlay SSOT |
| `mypageprofilesheetshost` | mypage | `components/mypage/profile-settings/MypageProfileSheetsHost.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `phoneverificationsheet` | mypage | `components/mypage/profile-settings/PhoneVerificationSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `profilesettingssheet` | mypage | `components/mypage/profile-settings/ProfileSettingsSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `buyerreviewreadsheet` | mypage | `components/mypage/purchases/BuyerReviewReadSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `purchasereviewsheet` | mypage | `components/mypage/purchases/PurchaseReviewSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `notificationdeleteconfirmdialog` | notifications | `components/notifications/NotificationDeleteConfirmDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `offerlistsellermodal` | offers | `components/offers/OfferListSellerModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `offermodal` | offers | `components/offers/OfferModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `philifewritebottomsheet` | philife | `components/philife/PhilifeWriteBottomSheet.tsx` | MIGRATE | DONE | DibayDialog / Confirm / BottomSheet / FullSheet |
| `memberpostpromotesheet` | post | `components/post/MemberPostPromoteSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `postdetailmorebottomsheet` | post | `components/post/PostDetailMoreBottomSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `postdetailsellermoresheet` | post | `components/post/PostDetailSellerMoreSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `postlistmenubottomsheet` | post | `components/post/PostListMenuBottomSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `reportreasonmodal` | post | `components/post/ReportReasonModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `missingprofileinfomodal` | profile | `components/profile/MissingProfileInfoModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `blockactionsheet` | reports | `components/reports/BlockActionSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `reportactionsheet` | reports | `components/reports/ReportActionSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storecartotherstoreconflictdialog` | stores | `components/stores/StoreCartOtherStoreConflictDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storeproductaddsheet` | stores | `components/stores/StoreProductAddSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storecartclearconfirmdialog` | stores | `components/stores/cart/StoreCartClearConfirmDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storecheckoutsubmitconfirmdialog` | stores | `components/stores/cart/StoreCheckoutSubmitConfirmDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storecommercecartbottomsheet` | stores | `components/stores/cart/StoreCommerceCartBottomSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storecommercecartcenterpopup` | stores | `components/stores/cart/StoreCommerceCartCenterPopup.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `soldoutoverlay` | stores | `components/stores/detail/SoldOutOverlay.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `storeshomesearchmodal` | stores | `components/stores/home/hub/StoresHomeSearchModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storeproductsheetaddtocartbar` | stores | `components/stores/product-sheet/StoreProductSheetAddToCartBar.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storeproductsheetheader` | stores | `components/stores/product-sheet/StoreProductSheetHeader.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storeproductsheetportal` | stores | `components/stores/product-sheet/StoreProductSheetPortal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storeproductsheetshell` | stores | `components/stores/product-sheet/StoreProductSheetShell.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storeproductsheetskeleton` | stores | `components/stores/product-sheet/StoreProductSheetSkeleton.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `storecartpreviewsheet` | stores | `components/stores/store-order-detail/StoreCartPreviewSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `tradewritebottomsheet` | trade | `components/trade/TradeWriteBottomSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `mobileconfirmbottomsheet` | ui | `components/ui/MobileConfirmBottomSheet.tsx` | ABSORB | DONE | delegate → Dibay Overlay SSOT |
| `tumblertimepickerdialog` | ui | `components/ui/TumblerTimePickerDialog.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `dibayactionsheet` | ui | `components/ui/dibay-overlay/DibayActionSheet.tsx` | KEEP | DONE | canonical SSOT (keep) |
| `dibaybottomsheet` | ui | `components/ui/dibay-overlay/DibayBottomSheet.tsx` | KEEP | DONE | canonical SSOT (keep) |
| `dibayconfirmdialog` | ui | `components/ui/dibay-overlay/DibayConfirmDialog.tsx` | KEEP | DONE | canonical SSOT (keep) |
| `dibaydialog` | ui | `components/ui/dibay-overlay/DibayDialog.tsx` | KEEP | DONE | canonical SSOT (keep) |
| `dibayfullsheet` | ui | `components/ui/dibay-overlay/DibayFullSheet.tsx` | KEEP | DONE | canonical SSOT (keep) |
| `dibayoverlayactions` | ui | `components/ui/dibay-overlay/DibayOverlayActions.tsx` | KEEP | DONE | canonical SSOT (keep) |
| `dibayoverlayroot` | ui | `components/ui/dibay-overlay/DibayOverlayRoot.tsx` | KEEP | DONE | canonical SSOT (keep) |
| `writelauncheroverlay` | write-launcher | `components/write-launcher/WriteLauncherOverlay.tsx` | NOT_AN_OVERLAY | KEEP | exclude from overlay family |
| `writesheetflowinner` | write | `components/write/WriteSheetFlowInner.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `imageeditormodal` | write | `components/write/shared/ImageEditorModal.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `tradefrequentphrasessheet` | write | `components/write/shared/TradeFrequentPhrasesSheet.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `philifewritesheetcontext` | contexts | `contexts/PhilifeWriteSheetContext.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `tradewritesheetcontext` | contexts | `contexts/TradeWriteSheetContext.tsx` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `main-bottom-nav-domain-transition` | navigation | `lib/navigation/main-bottom-nav-domain-transition-dialog.tsx` | MIGRATE | DONE | DibayDialog / Confirm / BottomSheet / FullSheet |
| `window-confirm-member-hotpath` | browser | `member app window.confirm call sites` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `window-alert-member-hotpath` | browser | `member app window.alert call sites` | MIGRATE | TODO | DibayDialog / Confirm / BottomSheet / FullSheet |
| `callkit-os-incoming` | native | `ios/App CallKit / VoIP bridge` | NATIVE_REQUIRED | KEEP | OS native (do not fake) |
| `os-permission-mic-cam` | native | `lib/call/permissions/call-permission-gate.ts` | NATIVE_REQUIRED | KEEP | OS native (do not fake) |

## Count match

- TOTAL: 128
- MIGRATE: 101
- ABSORB: 4
- KEEP: 7
- NATIVE_REQUIRED: 6
- NOT_AN_OVERLAY: 10
- SUM: 128

**COUNT MATCH: PASS**

## Wave status

| Wave | Scope | Status |
|---|---|---|
| 1 | OverlayRoot / Dialog / Confirm / Actions / tokens | DONE |
| 2 | User-reported 4 screens | DONE |
| 3 | MobileConfirm / AppModal / Messenger / Mypage shells | DONE |
| 4 | Trade write / Store / Delivery / Post sheets | TODO |
| 5 | Member window.confirm/alert | TODO |
| 6 | Remaining business/admin visual | TODO |
