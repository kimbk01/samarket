# DIBAY PTR Reveal — FINAL SSOT

**Status:** FINAL SSOT (Production-aligned)  
**Locked with:** `docs/dibay-ptr-reveal-hard-lock.md` · `.cursor/rules/dibay-ptr-reveal-hard-lock.mdc`  
**Production SHA:** `12d58a582387226ef75d2ef99fd90776ee2499dc`  
**Written:** 2026-10-15  

이 문서는 **현재 Production 구현과 일치하는 계약만** 기록한다. 미래 계획·미구현 기능을 완료된 것처럼 쓰지 않는다.

---

## 1. 시스템 구성 및 데이터 흐름

```text
Admin (PTR UI)
  → platform_popup_campaigns (presentation_type=ptr_reveal)
  → platform_popup_creatives (creative_mode=ptr_band, variant=default|tablet|logo)
  → platform_popup_campaign_surfaces
  → Storage bucket platform-popup-creatives (public URL)

Client idle prefetch
  → GET /api/platform-popup/ptr-reveal?pathname&sessionKey&deviceKey
  → buildPtrRevealAdPayload (bands.default required)
  → decodeImage → in-memory cache (surface key, TTL 5m)

Pull-to-refresh (DibayPtrSlot)
  → holding + pullPx≥58 + image shown + visibility=visible
  → impression → (CTA) click + landing_* → dismiss on band collapse
  → finishPtrRevealExposure (frequency / close_onlyHeld)
```

**권위 경로**

| Concern | Owner path |
|---|---|
| Band geometry / zones | `lib/platform-popup/ptr-reveal-contract.ts` (`computePtrBandLayout`) |
| PTR physics | `lib/ui/ptr/dibay-ptr-ssot.ts` |
| Audience gate | `lib/platform-popup/ptr-reveal-audience.ts` |
| Resolve payload | `lib/platform-popup/ptr-reveal-payload.ts` |
| Client cache / close_only | `lib/platform-popup/ptr-reveal-client.ts` |
| Runtime UI | `components/ptr/DibayPtrSlot.tsx` · `DibayPtrRevealAdLayer.tsx` · `DibayPtrRevealBand.tsx` |
| Admin ops | `components/admin/ptr-reveal/*` · `ptr-reveal-admin-patch.ts` · `admin-campaign-writer.ts` |
| HTTP resolve | `GET /api/platform-popup/ptr-reveal` |

Interruptive 팝업 resolve(`/api/platform-popup/resolve`)와 **경로·presentation 스코프가 분리**된다.

---

## 2. 관리자 메뉴·기능·상태 전이

- **메뉴:** `/admin/ptr-reveal-ads` · `/admin/ptr-reveal-ads/[campaignId]`
- **기능:** 생성 · 수정(변경분만 저장) · 복사 · 소재 업로드/교체/변형 삭제 · 미리보기 · 승인 · 활성화 · 일시중지 · 예약(start/end) · allowlist/all · 우선순위 · 빈도
- **캠페인 삭제 UI:** PTR 전용 UI에 노출되지 않음. draft 삭제는 공유 draft-delete API 경로에 존재 (운영 UX 잔여 — HARD LOCK 범위 밖 IMPROVEMENT)
- **신규 PTR 기본 공개 범위:** `audience_mode=allowlist` + `audience_user_ids=[]` (빈 allowlist = 누구에게도 미노출)
- **복사:** PTR 복사 시 audience_mode / audience_user_ids **유지** (all로 뒤집지 않음)
- **라이브 소재 변경:** 승인 재검토(`pending_review`)로 전이

**서빙 가능 상태 (필수 동시 충족)**

- `approval_status = approved`
- `status ∈ { active, scheduled }`
- 일정 창 내 · surface 매칭 · audience 통과 · default `ptr_band` ready · CTA 유효 · 빈도 억제 미해당

`paused` / `pending_review` / `draft` / `ended` / `rejected` → **미서빙**.

---

## 3. 이미지 규격과 기기별 표시 정책

| Variant | 소스 픽셀 | Aspect | 최소 원본 | 역할 |
|---|---|---|---|---|
| `default` | **1280×320** | 4:1 | ≥960×240 | 휴대폰 띠 (**필수**) |
| `tablet` | **2560×320** | 8:1 | ≥1920×240 | 태블릿 띠 (선택) |
| `logo` | **256×256** | 1:1 | ≥96×96 | 크롬 로고 (선택) |

- 슬롯 높이 상한 **106px** (`DIBAY_PTR_MAX_PX`) · 임계 **58px** (`DIBAY_PTR_THRESHOLD_PX`)
- 기기 판정: 슬롯 폭 **≥ 600px** → tablet, 아니면 default (`PTR_BAND_TABLET_MIN_VIEWPORT_PX`)
- 태블릿에 tablet 띠 없으면 **미노출** (phone 띠 확대 금지)
- 앱·관리자 미리보기는 `computePtrBandLayout` **단일 권위**

---

## 4. 광고 대상·승인·노출 조건

| Gate | 규칙 |
|---|---|
| Audience `all` | 로그인·비로그인 포함 전원 (명시적 공개) |
| Audience `allowlist` | UID 목록만 · **빈 목록 = nobody** · anon = nobody (fail-closed) |
| Surface | 캠페인 surfaces ∩ pathname→`resolveDibaySurface` (광고 표면만) |
| 광고 표면 | COMMUNITY · TRADE · DELIVERY · DELIVERY_OWNER · ADMIN · MYPAGE |
| 비광고 | MESSENGER · CALL · PAYMENT · ORDER_CRITICAL 등 — PTR 광고 미조회 |

QA 캠페인 `5f811614-b537-4603-908b-972f16591ba6`: **paused + allowlist(aaaa만)** — Owner 승인 없이 `all` 전환 금지.

---

## 5. PTR 동작 및 광고 표시 조건

1. 표면 진입 후 idle에 resolve + image decode 성공한 광고만 캐시(`ready`)
2. 당김 사이클에서 exposure 고정 (당김 중 교체 금지)
3. **표시:** 슬롯에 디코드된 band 렌더 (`DibayPtrRevealBand`)
4. **Impression:** `REFRESHING|SUCCESS|ERROR` 유지 + `pullPx ≥ 58` + 해당 image onLoad + `document.visibilityState=visible`
5. PTR 엔진(새로고침)은 광고 모듈을 **기다리지 않음** — 광고 실패가 새로고침을 막지 않음

---

## 6. 빈도·캐시·화면 복귀 정책

| Mode | 동작 |
|---|---|
| `close_only` | DB 억제 행 없음 · 같은 표면에서 노출 종료 후 `closeOnlyHeld`로 재노출 금지 · **다른 표면 이동 시 해제** |
| `once_per_session` / `once_per_day` / `once_campaign` | dismiss 시 suppress API (SESSION / TODAY / CAMPAIGN) |

- 클라이언트 캐시 TTL **5분** · fetch timeout **4초**
- 캐시 `none`/`ready`는 메모리 — 앱 완전 종료 시 소멸
- paused 캠페인은 서버가 미서빙 → 캐시 만료 후 재조회 시 무광고

---

## 7. CTA 및 이벤트·통계 계약

**CTA**

- 서버 페이로드 `href` · 클라이언트 `isHrefSafe` / CTA validate
- 내부 `/admin` 등 금지 · 외부는 https 등 허용 규칙 준수
- QA 캠페인 예: `cta_target=/philife`

**이벤트** (`platform_popup_campaign_events`)

| Type | 출처(계약) |
|---|---|
| `impression` | renderer (표시 조건 충족 시) |
| `click` | click_handler |
| `landing_success` / `landing_failure` | CTA 이후 |
| `dismiss` | band_collapse 등 |
| `suppress` | 빈도 억제 |

관리자 통계는 동일 이벤트 테이블 집계(캠페인 스코프).

---

## 8. 보안·권한·실패 처리

- Admin 페이지/API: `requireAdminApiUser` / AdminGuard
- 신규·복사 시 공개 범위 누수 방지 (기본 allowlist-empty · copy audience 보존)
- Resolve: paused/pending 미서빙 · allowlist fail-closed
- 광고 실패·타임아웃·디코드 실패 → 조용히 무광고 (목록/PTR 새로고침 유지)
- Storage creative URL: public bucket 경로 · 위험 scheme 차단

**공유 platform-popup events API** (`POST /api/platform-popup/events`, suppress 포함)는 캠페인 존재/자격 재검증 없이 actor+deviceKey로 insert 가능하다. 이는 **서빙/allowlist 우회가 아니며**, PTR HARD LOCK 서빙 계약 밖 공유 인프라 잔여(IMPROVEMENT)로 격리한다.

**명시:** PTR Reveal HARD LOCK **PASS는 공유 platform-popup events/suppress API 전체의 보안·무결성 보증을 의미하지 않는다.** 해당 개선은 별도 작업으로만 다룬다.

---

## 9. 기존 광고 시스템과의 경계

| System | Boundary |
|---|---|
| Interruptive popup | `presentation_type` ≠ `ptr_reveal` · 별도 resolve · PTR audience gate 미적용 |
| Feed Banner | 별도 제품 HARD LOCK · PTR와 무관 |
| PTR creative | `ptr_band` only · popup card/artwork와 mode mismatch 시 거부 |
| Messenger PTR chrome | 슬롯 UI만 · MESSENGER 표면 광고 미서빙 |

---

## 10. 검증 증거와 남은 제약

### PASS (검증됨)

| Item | Evidence |
|---|---|
| tip = origin/main | `12d58a582387226ef75d2ef99fd90776ee2499dc` |
| Unit (audience/admin-ops/client/contract) | 45 tests PASS @ tip |
| Anon resolve | `hasAd=false` (`no_eligible_campaign`) |
| aaaa + paused | `hasAd=false` |
| QA paused + allowlist only | DB `00-baseline.json` |
| Android expose/CTA/metrics | Owner prior PASS |
| iPhone expose/CTA/metrics | `tests/e2e/.artifacts/ptr-ios-live3-20261015/IPHONE-FINAL.json` (Δimp/Δclick, landing `/philife`) |
| close_only 1회/표면 | Owner 실측 + client `closeOnlyHeld` |

### NOT_PROVEN (HARD LOCK에 포함하지 않음)

- iPad 실측
- iPhone Safe Area **정밀 계측** (시각 확인만)
- audience=`all` Production 공개 롤아웃
- tip 소스 주석 중 “iPhone NOT_PROVEN” 문구 갱신 (문서 SSOT가 우선)

### 운영 제약

- QA 캠페인 **paused + allowlist** 유지
- Owner 승인 없는 전체 공개(`all`) 금지
- tip SHA 외 무단 재배포·기능 재설계 금지 (재개는 Owner reopen)
