# DIBAY 기기 저장공간 — 레거시 앱 구조 대조 · 설계 (2026-11-19)

- Owner 지시: 「캐시·임시 데이터는 자동 삭제 안 되는가? 레거시 어플 기준으로 정확한 설계 — DIBAY 감사 + 레거시 분석 → 동일 형태로 구현」
- 상태: **감사 완료 · 설계 · 승인 요청.** 코드 변경은 내정보 문구 정정(#490)만.
- 증거: CODE(file:line) · 공개 자료(레거시) · NOT_PROVEN(실기기 용량 측정 없음)

---

## 1. 레거시 앱 저장공간 관리 (확인한 사실)

| 앱 | 기능 | 출처 |
|---|---|---|
| 텔레그램 | **Keep Media**: 정한 기간 동안 열지 않은 미디어는 캐시에서 **자동 삭제** · 종류별 캐시 삭제 · 대화방별 삭제 · 다시 열면 클라우드에서 즉시 다시 받음 · 최대 캐시 크기(넘으면 오래된 것부터 정리) | [공식 블로그](https://telegram.org/blog/cache-and-stickers) · [Guiding Tech](https://www.guidingtech.com/top-ways-to-free-up-space-in-telegram) |
| 왓츠앱 | 저장공간 관리: 5MB 넘는 항목·대화방별 미디어를 보고 골라 삭제(내 기기에서만) | [MacRumors](https://www.macrumors.com/how-to/review-delete-whatsapp-media/) · [Android Central](https://www.androidcentral.com/new-whatsapp-feature-will-help-you-manage-your-storage-better) |
| 카카오톡 | 저장공간 관리: 캐시 용량 표시 · 캐시 삭제(기기에 저장한 사진은 그대로) | [NordVPN](https://nordvpn.com/ko/blog/clear-kakaotalk-cache/) · [jab-guyver](https://jab-guyver.co.kr/1533) |

공통 구조: ① **용량을 보여 준다** ② **사진·미디어 캐시를 실제로 지운다** ③ **오래 안 쓴 것은 자동으로 지운다(기간·최대 용량)** ④ 로그인·대화 내용·사용자가 저장한 사진은 지키지 않는다(=보존).

---

## 2. DIBAY 현황 (CODE · 전수 감사)

### 2-1. 자동 삭제되는가
| 저장소 | 자동 삭제 | 근거 |
|---|---|---|
| **사진·음성(WebView 디스크 캐시)** | 브라우저가 용량 한도로만 정리. **앱에는 보기·지우기·기간 설정 없음.** 대부분 1년 캐시 | `canonical-image-upload.server.ts:120` · `messenger-media-access.ts:23-27` · 네이티브에 `clearCache`/`WKWebsiteDataStore.removeData` 없음 |
| **Android 카메라 촬영 임시 사진** | **안 됨 — 촬영할 때마다 원본이 영구히 쌓임** | Capacitor `BridgeWebChromeClient.java:459-465` `getExternalFilesDir(Pictures)/JPEG_*.jpg` · 삭제 코드 없음(직접 확인) |
| 거래 목록 사본 `samarket:home-posts:local:v1:*` | **만료돼도 같은 키를 다시 읽을 때만 삭제** → 안 읽은 키 영구 | `getPostsForHome.ts:187-189`(직접 확인) |
| 메신저 방 사본(IndexedDB) | 7일·방 200개로 정리, **바이트 상한 없음** | `roomSnapshotDb.ts:44-63` |
| 가격 제안 신호 키 · 닫은 알림 id 배열 | **없음** — 계속 늘어남 | `normalize-offer-product-id.ts:31` · `community-messenger-home-notification-dismiss-storage.ts:19` |
| iOS 발신 연결음 임시 파일 | 앱이 지우지 않음(OS 임시 폴더 정리에 의존) | `NativeOutgoingRingbackOwner.swift:124-127` |
| 인트로 미디어 · 장바구니 · 필라이프 피드 · 최근 목록들 | **됨**(7일·24h·개수 상한) | `launch-intro/cache.ts:43-62` 등 |
| 로그아웃 | 웹 저장소 일괄 삭제(사진 캐시·네이티브 파일은 안 지움) | `client-session-wipe.ts` |

### 2-2. 「임시 데이터 삭제」 버튼이 지우는 것
목록·화면 저장 키 일부 + 인트로 미디어뿐. **사진·채팅 사본·카메라 임시 파일은 안 지움.** 인트로 색인은 남겨 자산과 어긋남(다음 실행 때 다시 받음 · UNVERIFIED). → #490 으로 문구만 정정.

### 2-3. 결론
**레거시 구조가 아니다.** ①용량 표시 없음 ②사진 캐시 삭제 불가 ③사진 자동 정리 기간·최대 용량 없음 ④카메라 임시 사진·일부 키가 영구히 쌓임.

---

## 3. 요청 수와의 관계 (Supabase)
- 사진 다운로드는 Supabase 요청으로 센다(11-18 저장소 요청 14,475건/일 · CDN 적중 96%).
- **많이 지울수록 다시 받는 요청이 늘어난다** → 설계 원칙: 레거시처럼 「**오래 안 연 것·용량 초과분만**」 자동 정리, 자주 보는 사진은 유지. 기본값을 짧게 잡지 않는다.

---

## 4. 설계 (레거시 동일 형태 · 3단계)

### S1 — 웹만 · 즉시 가능 (기능 영향 없음, 요청 증가 없음)
| 항목 | 내용 |
|---|---|
| 시작 시 자동 정리(하루 1회) | 만료된 `home-posts:local:*` 일괄 삭제 · `price-offers-bump:*` 7일 지난 키 삭제 · 닫은 알림 id 배열 최근 500개 상한 |
| 방 사본 상한 | IndexedDB 방 사본에 바이트 상한(예: 방당·전체) — 넘으면 오래된 방부터 |
| 버튼 범위 | 「임시 데이터 삭제」에 거래 목록 사본·방 사본(다시 받음)·인트로 색인(자산과 짝) 추가 |

### S2 — 네이티브 · 다음 앱 빌드 (용량 표시·실제 삭제)
| 항목 | Android | iOS |
|---|---|---|
| 용량 측정 | WebView 캐시 폴더·카메라 임시 사진 폴더 크기 | `WKWebsiteDataStore` 디스크 캐시 크기(UNVERIFIED API — 구현 시 확인) · tmp |
| 사진 캐시 삭제 | `WebView.clearCache(true)` | `removeData([DiskCache, MemoryCache])` — 쿠키·로컬 저장소 제외(로그인 유지) |
| 카메라 임시 사진 | 업로드 완료 후 삭제 + 시작 시 1일 지난 `JPEG_*` 정리 | 해당 없음 |
| 연결음 임시 파일 | — | 통화 종료 시 삭제 |
| 저장공간 화면 | 「사진·영상 n MB / 채팅 사본 n MB / 목록 n MB / 기타」 + 항목별 삭제. 「사진첩에 저장한 사진은 지우지 않아요」 표시 | 같음 |
| 구 바이너리 | 플러그인 없으면 지금 화면 그대로(앱 버전 판정) | 같음 |

### S3 — 사진 보관 기간·최대 용량 (텔레그램 Keep Media 동일 형태)
- WebView 캐시는 항목별 마지막 사용 시각을 앱이 다룰 수 없다 → 레거시 수준(「1주/1개월/영구」 · 최대 용량)을 하려면 **사진을 앱이 관리하는 캐시로** 옮겨야 한다(네이티브 이미지 캐시 또는 앱 저장소 + 사용 시각 기록·LRU).
- 기본값 제안: **보관 1개월 · 최대 1GB** — 짧게 잡으면 다시 받는 요청이 늘어난다(§3).
- 범위가 크다(사진 표시 경로 전체) → S2 실측(실제 캐시 용량) 뒤 설계 확정.

---

## 5. 지키는 것 (모든 단계)
로그인·세션 · 언어·동의·기기 설정 · 작성 중 초안(글·사진 DB) · 전송 실패 글 · **사용자가 사진첩에 저장한 사진**(앱 소유 아님 — 삭제 금지, 화면에서 별도 표시).

## 6. NOT_PROVEN
- 실제 기기별 사진 캐시 용량(S2 측정 기능으로 확인).
- WebView·WKWebView 디스크 캐시 기본 상한값.
- 레거시 앱 세부 메뉴는 버전별로 다를 수 있음(공개 자료 기준).
