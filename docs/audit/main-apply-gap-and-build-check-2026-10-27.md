# main 반영 미흡점 · APK·iOS 빌드 확인 (2026-10-27 11:35~11:45 PHT)

> 확인만 했다. 코드·운영 DB 는 바꾸지 않았다.

## 1. main ↔ Production ↔ 설치본

| 항목 | 결과 |
|---|---|
| main | `2dd46b3ca`(문서) · 마지막 코드 `ae0d0e9e6` |
| Production | main 과 같음(Vercel READY 확인) |
| 오늘 수정 커밋 | 모두 main 포함 |
| Android 네이티브 | 빌드 번호 증가 `ce7b962f4` 이후 android 변경 0건 → Samsung·Xiaomi 1.2.4 (13) = main |
| iOS 네이티브 | `7250c5c2a` 이후 ios 변경 0건 → iPhone 1.2 (15) = main |

## 2. main 에 없는 브랜치 작업

| 브랜치 | 판정 |
|---|---|
| `step9/*` · `android/d16-recent-photos` · `feature/messenger-bundle7-wave-abc` | 내용이 main 에 다른 커밋으로 반영됨(`576627614`·`02081f7fe`·`b58070ca6`·`015e7c368`·`6eaf9d82e`). 차이는 그 뒤 보정분이고, main 쪽이 실기기 통과본 |
| `claude/keen-ramanujan-1iwx5z`(40) · `claude/funny-gates-n4odv2`(6) | 10-20~22 다른 세션 작업. 「main 반영 금지」 WIP 포함 — 반영 대상 아님(Owner 판단) |
| 원본 작업 폴더 `/Users/bkkim/projects/samarket` | `feature/messenger-bundle7-wave-abc` 브랜치 · 미커밋 `lib/push/dispatch/apns-sender-impl.ts`·`ios/App/App.xcodeproj/project.pbxproj` 등. 이 세션이 만든 변경이 아님 — 손대지 않음 |

## 3. 운영 DB 에 적용되지 않은 마이그레이션 (미흡점)

- 저장소 마이그레이션(10-01 이후 403개) 중 적용 이력이 없는 45개를 대표 객체로 다시 확인했다.
- 대부분은 이력 없이 이미 적용돼 있었다. 그러나 **4개 객체는 운영 DB 에 없다.**

| 파일 | 없는 객체 | 코드 사용 | 영향 |
|---|---|---|---|
| `20270414200000_wp8_new08_call_log_user_hides.sql` | `community_messenger_call_log_user_hides` | `lib/community-messenger/service.ts` 4239·4692 | **통화 기록 삭제(내 목록에서 숨김)가 실패**, 목록 조회의 숨김 제외도 작동 안 함 |
| `20270414210000_wp8_new08_bootstrap_exclude_call_log_hides.sql` | (위 테이블을 쓰는 부트스트랩 함수 변경) | — | 위와 같은 묶음 |
| `20261201270000_delivery_ads_product_recovery_browse_cash.sql` | `delivery_ad_business_cash_charge_requests` | `app/api/admin/delivery-ads/business-cash/charge-requests/route.ts` | 관리자 배달 광고 비즈니스 캐시 충전 요청 API 실패 가능 |
| `20270403120000_app_system_start_config.sql` · `20270404180000_…_live_content_class.sql` | `app_system_start_config` · `app_system_start_live` | 코드 사용 없음 | 영향 없음(정리 대상) |

- 운영 DB 적용은 Owner 승인 사항이다(AGENTS.md 개발 프로세스 2번). 적용 전에 각 파일이 현재 스키마와 충돌하지 않는지 검토가 필요하다.

## 4. 빌드

| 대상 | 결과 |
|---|---|
| Android debug (Samsung) | 08:23 `assembleDebug` 성공 → 설치 1.2.4 (13) |
| Android release (Xiaomi, 업로드 키) | 11:30 `native:prepare` READY → `assembleRelease` 성공 → `adb install -r` 성공 |
| iOS | 11:44 현재 main(`2dd46b3ca`) **시뮬레이터 컴파일 BUILD SUCCEEDED**(서명 없음). 실기기 Xcode Run 은 Cursor 확인 대상 |
| 웹 | Vercel Production READY(빌드 성공) |

- 참고: `xcode-select` 가 Command Line Tools 를 가리켜 `xcodebuild` 가 바로 실행되지 않는다(Xcode 앱 Run 에는 영향 없음, 명령은 `DEVELOPER_DIR` 지정으로 실행).
- 참고: 커밋된 `local-runtime/index.html` 3개(android·ios·capacitor-www)가 원본 `lib/startup/local-runtime-markup.ts` 보다 옛 값이다(`--safe-bottom`). 빌드 때 `cap sync` 가 다시 만들어 설치본에는 최신이 들어간다.

## 5. Cursor 확인 요청

- Android Studio·Xcode **Run 버튼** 덮어 설치: `docs/audit/cursor-prompt-studio-xcode-run-verify-2026-10-27.md`
