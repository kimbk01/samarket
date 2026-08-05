# App Customer Center SSOT (LOCKED)

**Locked:** 2026-08-06  
**Status:** App Slice 1 implementation baseline  
**Evidence:** iOS Karrot/Baemin/DeliveryK captures under `docs/customer-platform/_ios-cs-captures/` + Kakao Android full-page CS

## Product IA (fixed)

```text
/mypage  (full-page scroll hub)
├─ Profile
├─ Points asset summary (Member Point SSOT → /mypage/points, /charge)
└─ 고객지원 section (card rows: icon + label + accessory + >)
   ├─ 공지사항 → /mypage/section/settings/notices
   ├─ 고객센터 → /mypage/customer-center  (NEW full-page hub)
   ├─ 1:1 문의 → /mypage/inquiries
   ├─ 받은 쪽지 → /mypage/inbox
   └─ 이용약관 → /mypage/section/settings/terms

/mypage/customer-center
├─ greeting + 「이전 대화」→ inquiries
└─ entries (existing originals only):
   inquiries | inbox | points | charge | notices
```

Child routes opened from the hub use `?from=customer-center` so Back returns to the hub.

## First Break (PROVEN)

내정보 「고객센터」가 stub(`/mypage/section/settings/support`)이라 공지·문의·쪽지·포인트가 하나의 CS 문맥으로 연결되지 않음.

## Adopted

- Karrot-style My page section cards + full-screen push
- Baemin/DeliveryK: points/asset on My home; CS under My (not headset-only)

## Forbidden

- Bottom sheet Customer Center
- Empty hub that only lists dead links
- Fake FAQ / Event menus
- Duplicating inquiry/inbox/points originals
- Baemin headset-only CS entry
- Guessing unopened Baemin FAQ / DeliveryK CS internals
- Admin CP structure in this App Slice

## Discarded

- Mobile sheet Customer Center direction (Kakao was full WebView; iOS triad = full page)

## Bell

Unchanged deep links to `/mypage/notices/{id}`, `/mypage/inquiries/{id}`, `/mypage/inbox/{id}` (full-screen detail).

## Runtime exit (this Slice)

Android + iOS: My → 고객지원 → 고객센터 hub → each entry → back to hub → back to My; Bell → detail.
