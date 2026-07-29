# Delivery Phase 3 — home-feed prewarm suffix fan-out

## 원인 1개

Phase 0: 매 `/stores` cycle 마다

- `/api/stores/home-feed` (empty) **n=2**
- `/api/stores/home-feed?region=Manila` **n=1–2**
- `/api/stores/home-feed?region=Manila&district=1234` **n=1**

코드: `prewarmStoresHomeRoute` 가 region suffix가 있어도 **항상 `""` 를 union**.

```ts
// before
Array.from(new Set(["", ...(opts.storeHomeFeedSuffixes ?? [])]))
```

## 수정

`resolveStoresHomePrewarmFeedSuffixes` — regional suffixes만 warm; 없으면 root `""`만.

## Verify / test

- `lib/stores/__tests__/stores-home-route-prewarm-suffixes.test.ts`
- `verify:stores-home-hub-contract` — forced empty+region union 금지

## 재측정

Production 재실측은 **이 HEAD deploy 후**. 코드 계약으로 empty+region 동시 prewarm 제거.

남은 키 분열(`?region=Manila` vs `region+district`)은 별도 라운드(호출자 정규화).

## H. 판정

```text
DELIVERY CODE PASS (Phase 3 scope)
RUNTIME UNVERIFIED until Production/APK match this HEAD
```
