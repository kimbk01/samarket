# prod_same_region 실측 (Round E)

**목적:** linked local dev PostgREST RTT 오염을 제거하고, production build·동일 리전 배포 기준으로 hub / order-counts / notifications / owner dashboard waterfall 을 검증한다.

**금지:** SQL·RPC·캐시·unread·waterfall·UI 최적화 — **측정·관측만**.

---

## 1. 환경 준비

### A. 로컬 production build (linked DB — RTT는 여전히 linked일 수 있음)

```bash
npm run build
# 로그 파일 권장
set SAMARKET_PROD_PERF_LOG_FILE=.perf-prod-measure.log
npm run start:prod-measure
```

### B. Vercel preview / production (권장)

```bash
set SAMARKET_BASE_URL=https://your-preview.vercel.app
set OWNER_DASHBOARD_PERF_ENV=prod_same_region
set SAMARKET_CLIENT_REGION=ap-northeast-2
npm run measure:prod-same-region
```

Vercel 프로젝트에 `SAMARKET_PROD_PERF_MEASURE=1` 은 **측정 세션에만** 설정 (상시 prod 로그 비권장).

---

## 2. 리전 확인

측정 스크립트가 `GET /api/perf/prod-region-context` 를 호출하고 `[prod-region-context]` 를 출력한다.

| 필드 | 의미 |
|------|------|
| `vercel_region` | `VERCEL_REGION` / `AWS_REGION` |
| `supabase_region` | `SUPABASE_REGION` 또는 pooler URL |
| `client_region` | `SAMARKET_CLIENT_REGION` 또는 measure 헤더 |
| `same_region` | vercel ≈ supabase |
| `edge_or_node` | API route `nodejs` |
| `deployment_type` | `vercel` · `local_prod` · … |

---

## 3. 측정 실행

```bash
npm run measure:prod-same-region
```

- cold 1회: hub · order-counts · notifications (measure 헤더로 캐시 무효화)
- warm 2회
- Playwright: `/stores/owner` → `first_shell_paint_ms` · `critical_done_ms`

**dev:measure 사용 금지.**

---

## 4. 수집 로그 (prod measure 시)

| 태그 | 용도 |
|------|------|
| `[prod-region-context]` | 리전·same_region |
| `[perf-real-api-cost]` | `actual_handler_ms` (판정 SSOT) |
| `[owner-dashboard-perf-v2]` | route·cache_hit·worst_stage |
| `[cm-unread-deep-breakdown]` | cm_unread cold transport/db |
| `[order-counts-cold-breakdown]` | order-counts cold |
| `[owner-dashboard-waterfall]` | shell / critical (브라우저, `NEXT_PUBLIC_SAMARKET_PROD_PERF_MEASURE=1` 빌드) |

`[dev-api-perf]` · `[perf-measurement-context]` · `[dev-memory-*]` 는 production measure 에서 **출력하지 않음**.

---

## 5. 판정 (prod_same_region)

| API | cold | warm |
|-----|------|------|
| hub | ≤ **400ms** `actual_handler_ms` | ≤ **30ms** |
| order-counts | ≤ **120ms** | ≤ **30ms** |
| notifications | (참고) | ≤ **30ms** |

미달 시 다음 후보(코드 변경 없이 인프라/구조 검토): Edge runtime · Realtime counter · unread mirror · RPC consolidation · region migration · direct PG driver.

linked dev 대비 감소율은 스크립트 `linked_dev_reduction_pct` 참고 (Round B/D baseline).

---

## 6. linked dev 와의 차이

| | linked dev | prod_same_region |
|--|------------|------------------|
| 서버 | `npm run dev:measure` | `npm run start:prod-measure` 또는 Vercel |
| compile | HMR·compile noise | 없음 |
| RTT | dev ↔ remote Supabase | 배포 리전 ↔ DB 리전 |
| 판정 필드 | `actual_handler_ms` | 동일 |
