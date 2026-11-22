# R4 운영 DB 적용 기록 — 2026-11-22

- 승인: Owner 2026-11-22 「운영 DB 적용 승인」
- 대상: 운영 Supabase `public.trade_list_page(p jsonb)` — 마이그레이션 `20271122140000_trade_list_page_rent_price_field.sql`
- 방법: Supabase MCP `apply_migration` (이름 `trade_list_page_rent_price_field`)

| 항목 | 적용 전 (16:18 PHT) | 적용 후 (16:19 PHT) |
|---|---|---|
| 본문 md5 | `99770b73ade2067be45467b19ba81176` (= `20271103160000` 본문) | `bcaa252224238667347e41e2ae972014` (= `20271122140000` 본문, 저장소 계산값과 일치) |
| 본문 길이 | 7490 | 8030 |
| 권한 | postgres·anon·authenticated·service_role 실행 | 같음 |
| SECURITY DEFINER · STABLE · search_path=public | 예 | 같음 |

## 적용 뒤 읽기 전용 호출 (begin read only … rollback)

| 호출 | 결과 행 | 구간 |
|---|---|---|
| 기본 `{"limit":50}` | 7 | 일반 · `state:sold` |
| 가격 1~100 | 7 | `price:out` 포함 (가격 판정 = posts.price) |
| 가격 1~100 + `price_field=meta_monthly` | 7 | 모두 `price:out` (운영에 보이는 부동산 임대 글 0건 → 월세 값 없음 = 조건과 다른 글) |
| 가격 1~100 + 알 수 없는 `price_field` | 7 | 가격 판정과 같음 (알려진 값만 받음) |

## 되돌리기

`supabase/migrations/20271103160000_trade_sold_visible_window.sql` 의 `trade_list_page` 정의를 다시 적용한다(적용 전 운영 본문과 md5 일치).

## 남은 확인 (NOT_PROVEN)

- 화면 반영은 PR 병합(운영 배포) 뒤.
- 부동산 임대·판매 글로 실기 확인: 운영에 보이는 부동산 글 0건 — Owner 계정 시험 글 필요(설계 R4-2).
