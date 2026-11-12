# 고아 스크립트·미참조 public 파일 정리 D6 결과 (2026-11-12)

- 감사 문서: `docs/audit/dead-code-cleanup-audit-2026-11-12.md` §7 · 브랜치 `chore/dead-scripts-assets-d6` · 기준 origin/main 7be1f6b68
- **통화 관련은 Owner 지시(2026-11-12 「통화 부분은 지금 건드리지 마라」)로 전부 제외**

## 삭제
- **스크립트 100개 · 14,714줄**: package.json·CI·git 훅·vercel.json·코드·문서 어디에서도 부르거나 가리키지 않는 스크립트 + 이름부터 임시인 `_tmp-*` 13개. 대부분 이미 적용 끝난 일회성 `apply-*` 마이그레이션 실행기와 지난 측정·검증 스크립트 (마이그레이션 SQL 자체는 `supabase/migrations` 에 그대로).
- **public 파일 61개 (7.5MB)**: create-next-app 기본 svg 5개(`next`·`vercel`·`globe`·`window`·`file`) · `exchange-default.svg` · `public/icons/**` 55개
  - 코드(웹·Android·iOS·CSS·manifest)에서 경로 참조 0, 코드상 「정적 아이콘 폴백 금지」(`resolveStoreTaxonomyImageSrc` 는 업로드 URL 만 사용)
  - **운영 DB 읽기 전용 조회**: 이미지·아이콘·썸네일·로고·배너 열과 매장·카테고리·앱·홈·메뉴·설정 테이블의 config·value·payload·url·path 열에서 `/icons/` 값 0건 (2026-11-12 PHT)

## 남김
- 통화 스크립트 7개: `scripts/apply-call-terminal-writer-ssot-cut1-migration.mjs` · `scripts/apply-cm-call-session-rls-recursion-cut-r1-migration.mjs` · `scripts/apply-p4-call-heartbeat-via-dashboard.mjs` · `scripts/run-active-call-lifecycle-smoke.sh` · `scripts/run-incoming-call-revert-smoke.sh` · `scripts/verify-apply-p4-call-heartbeat-migrations.mjs` · `scripts/verify-native-admin-call-ringtone-contract.cjs`
- 문서·규칙이 절차로 가리키는 스크립트 69개 (`_tmp-*` 제외)
- `apply-gift-promo-economics-migration.mjs` · `apply-r16-os-entry-abandon-zero.mjs`: QA 스크립트 안내문·적용된 마이그레이션 주석이 이름으로 가리킴
- `public/stickers/ATTRIBUTION.md`: 스티커 라이선스 고지

## 같이 고친 것
- `test-db-write-production-guard`: 지운 `scripts/_verify-mark-read-warm-10x.mjs` 가 QA 쓰기 가드 대상 1개였음 → 하한 105→104, 110→109

## 삭제한 스크립트
```
scripts/_verify-mark-read-warm-10x.mjs
scripts/apply-ads-legacy-ad-products-catalog-deactivate.mjs
scripts/apply-business-cash-conversion-rate-history-privilege-harden.mjs
scripts/apply-cm-bootstrap-snapshot-rpc.mjs
scripts/apply-cm-bootstrap-snapshot-watermark-fence-rpc.mjs
scripts/apply-cm-d1-scrub-reply-on-delete-for-everyone-migration.mjs
scripts/apply-cm-social-relations-migrations.mjs
scripts/apply-commerce-notification-push-handoff-migration.mjs
scripts/apply-community-operator-import-drafts-migration.mjs
scripts/apply-community-operator-import-inbox-sources-migration.mjs
scripts/apply-community-post-view-unique-forever-migration.mjs
scripts/apply-community-posts-display-date-migration.mjs
scripts/apply-delivery-ads-cut-b-migration.mjs
scripts/apply-delivery-ads-cut3-r2-migrations.mjs
scripts/apply-delivery-summary-snapshot-rpc.mjs
scripts/apply-drop-external-import-crawling-product.mjs
scripts/apply-finance-f07-guard-auth-role-service-detection.mjs
scripts/apply-free-coupon-offer-snapshot.mjs
scripts/apply-free-coupon-v32-migration.mjs
scripts/apply-gift-certificate-offer-peer-uuid-min-fix.mjs
scripts/apply-gift-financial-snapshot-cut1-migration.mjs
scripts/apply-gift-offer-messenger-atomic-migration.mjs
scripts/apply-gift-offer-room-peer-bind-migration.mjs
scripts/apply-gift-one-time-full-consumption-migration.mjs
scripts/apply-gift-revenue-recognition-migration.mjs
scripts/apply-gift-scope-platform-migration.mjs
scripts/apply-gift-u1-application-columns.mjs
scripts/apply-group-rejoin-unread-baseline.mjs
scripts/apply-hub-badge-nt-bundle-migration.mjs
scripts/apply-hub-badge-store-attention-rpc.mjs
scripts/apply-hub-badge-unread-counter-table.mjs
scripts/apply-owner-dashboard-notifications-snapshot-rpc.mjs
scripts/apply-owner-orders-list-snapshot-rpc.mjs
scripts/apply-r15-startup-presentation-abandon-zero.mjs
scripts/apply-r6-admin-staff-permissions-membership-rls.mjs
scripts/apply-room-unread-v1.1-harden.mjs
scripts/apply-security-lints-admin-banner-change-logs-rls.mjs
scripts/apply-security-lints-gift-certificate-advisor.mjs
scripts/apply-security-lints-rls-disabled-in-public-close.mjs
scripts/apply-store-completed-order-counts-rpc.mjs
scripts/apply-store-orders-serviceability-snapshot.mjs
scripts/apply-stores-a-campaign-migrations.mjs
scripts/apply-stores-discovery-scale-cut5.mjs
scripts/apply-stores-discovery-scale-cut6.mjs
scripts/apply-stores-one-owner-one-store-unique.mjs
scripts/apply-support-notification-event-types-migration.mjs
scripts/apply-support-phase3a-semantic-authority-migration.mjs
scripts/apply-user-auth-identity-email-conflicts-security-invoker.mjs
scripts/badge-explain-matrix-runtime.ts
scripts/badge-writer-authority-runtime.ts
scripts/bell-explain-matrix-runtime.ts
scripts/bell-lifecycle-transition-runtime.ts
scripts/bell-writer-authority-runtime.ts
scripts/bench-stop-source-stack-capture.mjs
scripts/delivery-financial-reconciliation-gate.ts
scripts/delivery-financial-schema-probe.ts
scripts/delivery-viewport-overflow-scan.mjs
scripts/encoding-audit.mjs
scripts/feed-ad-end-invalid-creatives.ts
scripts/fix-privacy-consent-published.ts
scripts/gate3-live-production-cutover-dry-run.ts
scripts/measure-bottom-nav-new-only-enter.mjs
scripts/measure-browse-deferred-perf.mjs
scripts/measure-chat-rooms-snapshot-perf.mjs
scripts/measure-dibay-api-perf-patch.mjs
scripts/measure-dibay-cold-start-adb.mjs
scripts/measure-dibay-perf-patch-3endpoint.mjs
scripts/measure-main-hub-intent-transition.mjs
scripts/measure-owner-dashboard-api.mjs
scripts/measure-store-menus-swr.mjs
scripts/normalize-fb-ui-colors.mjs
scripts/publish-dibay-privacy-policy-cms.ts
scripts/r2-m5-capture-once.mjs
scripts/realign-privacy-consent-version.ts
scripts/refresh-owner-hub-badge-snapshot-user.mjs
scripts/room-unread-authority-projection-apply.mjs
scripts/runtime-business-control-center-proof.ts
scripts/seed-platform-default-fee-policy.ts
scripts/strip-catalog-zh-cn.mjs
scripts/verify-cm-realtime-rebind-runtime-extended.mjs
scripts/verify-cm-realtime-rebind-runtime.mjs
scripts/verify-delivery-waterfall-final.mjs
scripts/verify-dibay-perf-cache.mjs
scripts/verify-dibay-perf-patch-2-cache.mjs
scripts/verify-hub-badge-nt-bundle-post-migrate.mjs
scripts/verify-member-avatar-guard-local-pg.sh
scripts/verify-p4-pg-cron-via-dashboard.mjs
scripts/_tmp-audit-owner-i18n.mjs
scripts/_tmp-audit-stores-home-i18n.mjs
scripts/_tmp-audit-stores-i18n.mjs
scripts/_tmp-cm-auto-i18n.mjs
scripts/_tmp-cm-hardcoded-report.mjs
scripts/_tmp-extract-i18n-keys.mjs
scripts/_tmp-parse-tsc-errors.mjs
scripts/_tmp-phase-i18n-count.mjs
scripts/_tmp-phase4-files.mjs
scripts/_tmp-phase7-check-client.mjs
scripts/_tmp-phase7-find-missing-t-hook.mjs
scripts/_tmp-phase7-migrate.mjs
scripts/_tmp-phase7-scan.mjs
```

## 삭제한 public 파일
```
public/exchange-default.svg
public/file.svg
public/globe.svg
public/icons/academy/academy_0_0.png
public/icons/academy/academy_0_1.png
public/icons/academy/academy_0_2.png
public/icons/academy/academy_0_3.png
public/icons/beauty/beauty_0_0.png
public/icons/beauty/beauty_0_1.png
public/icons/beauty/beauty_0_2.png
public/icons/beauty/beauty_0_3.png
public/icons/cafe/cafe_0_0.png
public/icons/cafe/cafe_0_1.png
public/icons/cafe/cafe_0_2.png
public/icons/cafe/cafe_0_3.png
public/icons/category/category_0_1.png
public/icons/category/category_0_10.png
public/icons/category/category_0_2.png
public/icons/category/category_0_3.png
public/icons/category/category_0_4.png
public/icons/category/category_0_5.png
public/icons/category/category_0_6.png
public/icons/category/category_0_7.png
public/icons/category/category_0_8.png
public/icons/category/category_0_9.png
public/icons/food/icon_0_0.png
public/icons/food/icon_0_2.png
public/icons/food/icon_0_3.png
public/icons/food/icon_1_0.png
public/icons/food/icon_1_1.png
public/icons/food/icon_1_2.png
public/icons/food/icon_1_3.png
public/icons/food/icon_2_0.png
public/icons/food/icon_2_1.png
public/icons/food/icon_2_2.png
public/icons/food/icon_2_3.png
public/icons/hardware/hardware_0_0.png
public/icons/hardware/hardware_0_1.png
public/icons/hardware/hardware_0_2.png
public/icons/hardware/hardware_0_3.png
public/icons/hardware/hardware_0_4.png
public/icons/hardware/hardware_0_5.png
public/icons/life/life_0_0.png
public/icons/life/life_0_1.png
public/icons/life/life_0_2.png
public/icons/life/life_0_3.png
public/icons/mart/mart_0_0.png
public/icons/mart/mart_0_2.png
public/icons/mart/mart_0_3.png
public/icons/mart/mart_0_4.png
public/icons/mart/mart_0_5.png
public/icons/mart/mart_0_6.png
public/icons/pet/pet_0_0.png
public/icons/pet/pet_0_1.png
public/icons/pet/pet_0_2.png
public/icons/pet/pet_0_3.png
public/icons/pet/pet_0_4.png
public/icons/pet/pet_0_5.png
public/next.svg
public/vercel.svg
public/window.svg
```
