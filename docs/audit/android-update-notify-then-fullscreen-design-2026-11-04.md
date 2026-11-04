# Android 앱 업데이트 — 무음 감지 → 1회 푸시·인앱 → 앱 진입 후 전체화면(사용자 선택) (2026-11-04)

- **상태:** Owner 조건부 구현 승인 · **서버 감지·알림만 구현** (시안·Host·Screen·네이티브 비변경)
- **화면 시안(유지):** `docs/audit/android-update-fullscreen-progress-mockup-2026-11-03.html` · 구현 `255c23a9d` / `AndroidPlayUpdateScreen`
- **근거 계약:** `docs/dibay-android-play-update-hard-lock.md` · 기존 알림 dedupe·push handoff

---

## §6 구현 전 확인 (코드·설정 증거)

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | Play API 출시 확정 | **부분 PASS / 제한** | `collectPlayReleases` = **production 트랙만**. `status` 를 `rollout_status` 로 저장. 자동 발송은 **`completed`만**. `inProgress`(단계적)·draft·halted·**closed testing/알파 트랙**은 API로 자동 확정 **불가** → **자동 발송 금지**, 관리자 「발송 확정」만. 운영 키·실측 쿼터 = **NOT_PROVEN**(이 세션에서 Play 실호출 없음). |
| 2 | `user_devices` versionCode·last_seen | **코드 PASS / 운영값 NOT_PROVEN** | 보고 형식 `1.2.5 (24)` 파싱 코드 존재(`parseAppVersionLabel`). 대상은 `is_active` + **90일 `last_seen_at`** + Android **versionCode 필수**. 운영 분포 조회 없음 → 대수 NOT_PROVEN. |
| 3 | dedupe·공지 OFF·채널 | **PASS (계약)** | fan-out: `appendUserNotification` + `push_kind: notice` → `admin_notice` → 채널 `dibay_admin_notice_v1`(신규 채널 없음). `dedupeKey=app_release:{platform}:{versionCode}:{userId}`. 공지 OFF → `sendPush=false`(인앱 이벤트 생성은 기존 파이프 유지 — 인앱까지 OFF 계약은 **없음**). |
| 4 | 6h cron / Vercel | **코드 PASS / 플랜 한도 NOT_PROVEN** | `vercel.json`에 `0 */6 * * *` 추가(기존 `17 */6` 패턴과 동일 주기族). 현재 cron 20개. Hobby 한도 초과 여부는 대시보드 미확인 → NOT_PROVEN. |
| 5 | Host ↔ 알림 진입 충돌 | **코드 PASS** | 알림 `link_url` = 기존 `/mypage/app-updates`(신규 상세 화면 없음). Host/Screen/`confirmStart` **미수정**. 알림만으로 다운로드·설치 시작 경로 없음. |

---

## Owner 결정 반영

| ID | 결정 | 구현 |
|---|---|---|
| D-N1 | 6h + 관리자 수동 동기화 | cron + `POST /api/admin/app-releases/sync` |
| D-N2 | 공지 기본 채널음 | `push_kind: notice` 재사용 · 신규 채널 없음 |
| D-N3 | 공지 OFF → 푸시 없음 | 기존 preference gate · 인앱은 기존 계약(쓰기 유지) |
| D-N4 | 90일 활성 Android | `APP_RELEASE_ACTIVE_DEVICE_DAYS=90` + versionCode 신뢰 게이트 |
| D-N5 | 알림 → 앱 오픈 → 기존 전체화면 | history 링크 + Host 비변경 · 새 상세 화면 없음 |

---

## 흐름 (목표 = 구현)

```
[서버 6h / 관리자 Sync]
  Play production 조회 → app_releases upsert
  status===completed 이고 versionCode 상승 시에만 fan-out
  (inProgress·closed testing → upsert만 또는 관리자 Confirm)
       ↓
  구버전·90일 활성 Android 회원
    인앱 1 + 푸시 시도 1 (dedupe · 회원당 1행 · 기기 여럿이어도 회원 1)
  실행당 최대 100명 · 미완료 시 notified_at 미표시 → 다음 실행 재개
       ↓
[사용자] 알림 탭 또는 나중에 앱 실행
       ↓
[기존 Host · U1 · Play Core] 페이스북형 전체화면 · 사용자 「업데이트/나중에」
```

동일 `version_name` 에서 **versionCode만 증가**(1.2.5 24→37)하면 `notified_at` 을 비워 재알림 허용.

---

## 부하 상한

| 항목 | 상한 |
|---|---|
| Play API | cron/수동 실행당 플랫폼 1회 (앱 오픈마다 호출 금지) |
| 회원 스캔 | **새 자격 출시 fan-out 시에만** · 페이지 500 |
| 알림/실행 | **최대 100** (`APP_RELEASE_NOTIFY_MAX_PER_RUN`) · 순차 append |
| FCM | 기존 notice 파이프 1회/유저 · 대량 단일 트랜잭션 INSERT 없음 |
| 운영 처리량 실측 | **NOT_PROVEN** (이 세션 미측정) — 상한은 보수적 코드 가드 |

---

## 수정 파일 (이번)

- `lib/app-releases/app-release-notify-policy.ts` (신규)
- `lib/app-releases/app-release-sync.ts` (신규)
- `lib/app-releases/app-release-sources.ts` (주석·계약 명시)
- `app/api/cron/app-releases-sync/route.ts` (신규)
- `app/api/admin/app-releases/{route,sync,notify}` 
- `components/admin/app/AdminAppReleasesStatus.tsx`
- `vercel.json` (6h cron)
- 단위 테스트

**비변경:** mockup HTML · `AndroidPlayUpdateScreen` · Host · screen-model · 네이티브

---

## 검증 상태

| 층 | 상태 |
|---|---|
| 단위(정책) | 로컬 vitest 대상 |
| 격리 fan-out 시나리오 | 코드 경로 + 단위 · DB 통합은 운영 승인 후 |
| 운영 DB 적용 | 스키마 기존(`app_releases.notified_at`) · **신규 마이그레이션 없음** |
| main / Production | **미반영** — Owner 승인 후 |
| 실기기 | **NOT_PROVEN** |
| 네이티브 재빌드 | **하지 않음** (별도 승인 필요 없음 = 안 함) |

---

## 별도 Owner 승인 필요

1. **main 반영 · Production 배포**
2. closed testing(예: vc37)에서 자동 감지 불가 시 **관리자 「발송 확정」** 실행 여부
3. Vercel cron 슬롯/플랜 한도 확인 후 이상 시 스케줄 조정
4. 실기기 행렬 (푸시 1 · 전체화면 선택 · 설치 후 읽음)
5. 네이티브 변경이 생기는 후속 작업(이번 범위 밖)
