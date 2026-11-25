# 채팅 영상 미리보기 사진 검은 화면 — 결함·설계 (2026-11-25)

## 1. 결함 (FAIL)

| 항목 | 내용 |
|---|---|
| 확인 조건 | iPhonebk(14 Pro Max) · BK THE 계정 · 빌드 1.2.7 (62) · 운영 067a31b · q테스트1 방 · 11:22 PHT |
| 재현 | 최근 줄에서 1:12 영상(검은 화면에서 글자가 나타나는 영상) 선택 → 전송 |
| 고를 때 보인 사진 | 최근 줄 칸: 내용이 보이는 사진(OS 사진 앱이 만든 대표 사진) |
| 말풍선 사진 | 검은 화면 — 업로드 전·후 모두 |
| 운영 증거 | 메시지 `2c833a49-5f6e-46e6-898b-81f4a9566c11` · 저장 `…/80e3b804-….thumb.jpg` 3,655바이트(검은 JPEG) |

**고객이 고른 사진과 받은 사람이 보는 사진이 다르다** → FAIL.

## 2. 원인 (코드로 확인)

세 경로 모두 「영상 0.1초 지점 한 장」을 그대로 쓴다. 그 장면이 검으면 검은 사진이 된다.

| 경로 | 위치 | 방식 |
|---|---|---|
| iOS 고를 때(말풍선 자리) | `ios/App/App/Plugins/MessengerPhotoLibraryPlugin.swift:891` `frame(asset, maxEdge: 256)` | 0.1초 장면 |
| iOS 보낼 사진(저장) | 같은 파일 `:1182` `writeThumb` → `frame(…, 480)` | 압축본 0.1초 장면 |
| Android 고를 때 | `android/…/MessengerVideoPrep.java:154` `getFrameAtTime(100_000, CLOSEST_SYNC)` | 0.1초 근처 키프레임 |
| Android 보낼 사진 | 같은 파일 `:324` `writeThumb` | 압축본 0.1초 근처 키프레임 |
| 웹(구 바이너리·파일 선택) | `lib/community-messenger/attachment/messenger-video-web.ts:105` `seek(min(0.1, 길이/100))` | 0.1초 장면 |

반면 최근 줄 칸 사진은 OS 대표 사진이다 — iOS `PHImageManager.requestImage`(`:645`), Android `ContentResolver.loadThumbnail`(`MessengerPhotoLibraryPlugin.java:215`). 그래서 고를 때와 보낸 뒤가 다르다.

## 3. 레거시 앱 확인

**텔레그램 Android** (DrKLO/Telegram `SendMessagesHelper.java`, 2026-11-25 master):
- 기본: `createVideoThumbnailAtTime(videoPath, startTime)`(:12162). `startTime` 은 자르기 시작점이고, 자르지 않으면 0 → **첫 장면**.
- 실패하면 `MINI_KIND` OS 썸네일(:12165).
- 사용자가 고른 표지가 있으면 그것을 쓴다(`coverPath` :638, `video_cover` :3171·3215).
- 결론: 텔레그램도 기본은 첫 장면이라 이 영상이면 검게 나온다. 대신 표지 고르기 화면이 따로 있다.

**카카오톡**: 소스가 공개되지 않았다. 기기에서 측정해야 하는데 Samsung 카카오톡이 로그인돼 있지 않아 **확인 못 함**.

**권장**: 표지 고르기 화면은 2단계 R4(보내기 전 확인 화면)와 함께 다룬다. 이번 결함은 「고른 사진 = 보낸 사진」 원칙으로 고친다. OS 대표 사진이 그 기준이다.

## 4. 설계

### 4-1. 규칙 (세 경로 공통)

1. **사진첩에서 고른 영상**(iOS PHAsset · Android MediaStore id/사진 선택기 URI)
   - 말풍선·저장 사진 모두 **OS 대표 사진**을 쓴다. 최근 줄·사진 선택기에서 고객이 본 것과 같은 사진이다.
   - iOS: `PHImageManager.requestImage(for: asset, targetSize: 480×480, contentMode: .aspectFit, deliveryMode: .highQualityFormat, isNetworkAccessAllowed: true, isSynchronous: true)`
   - Android: `ContentResolver.loadThumbnail(uri, Size(480, 480), signal)`
2. **OS 대표 사진이 없을 때**(카메라로 바로 찍은 파일 · 웹 파일 선택 · OS 응답 실패)
   - 「어둡지 않은 첫 장면」을 고른다.
   - 후보 시점: 0.1초 → 1초 → 길이의 10% → 길이의 50% (길이를 넘는 시점은 건너뜀). 순서대로 최대 4장을 본다.
   - 각 장면을 16×16 으로 줄여 평균 밝기(0~255)를 잰다. **24 이상**이면 그 장면을 쓴다.
   - 4장이 모두 어두우면 가장 밝은 장면을 쓴다. 완전히 검은 영상도 실패하지 않게 하기 위해서다.
3. **크기·용량은 지금 그대로**: 긴 변 480 이하 · 512KB 이하 JPEG(`MESSENGER_VIDEO_THUMB_MAX_LONG_EDGE_PX`, `thumbMaxBytes`). 저장 파일 수(영상 1 + 사진 1)도 그대로다.
4. **회전**:
   - OS 대표 사진은 이미 바로 선 방향이다.
   - 장면을 직접 뽑을 때는 지금처럼 방향을 반영한다(iOS `appliesPreferredTrackTransform`, Android `getFrameAtTime` 의 회전 반영).

### 4-2. 바뀌는 파일·함수

| 파일 | 변경 |
|---|---|
| `ios/App/App/Plugins/MessengerPhotoLibraryPlugin.swift` | `register(asset:)`(최근 줄)와 PHPicker 결과(`assetIdentifier`, 사진 권한이 이미 있을 때만 조회)에서 PHAsset 대표 사진(480)을 받아 `Entry.poster`(UIImage)에 두고 고를 때 사진(256)을 만든다. `writeThumb` 는 `poster` 가 있으면 그것을 쓰고, 없으면 새 `bestFrame(asset, maxEdge:)`(4-1 의 2번)를 쓴다. 기존 `frame` 은 `bestFrame` 안으로 들어간다 |
| `android/app/src/main/java/com/dibay/app/MessengerVideoPrep.java` | `register(uri)` 에서 `loadThumbnail(uri, 480)`(Android 10+)를 먼저 시도해 `Entry.poster` 에 둔다. `writeThumb` 는 `poster` 가 있으면 그것을 쓰고, 없으면 `bestFrame(retriever, 길이, 긴 변)`(4-1 의 2번)를 쓴다. 선택기 콜백이 화면 스레드라 장면은 Android 8.1+ 에서 축소본(`getScaledFrameAtTime`)으로 꺼낸다 |
| `lib/community-messenger/attachment/messenger-video-web.ts` | `seek(0.1)` 1회를 후보 4개 순회로 바꾼다. 캔버스 16×16 평균 밝기로 판정한다 |
| `lib/community-messenger/attachment/__tests__/…` | 웹 장면 고르기 단위 테스트(밝기 판정·후보 순서·모두 어두울 때) |
| `android/app/build.gradle`, iOS `CURRENT_PROJECT_VERSION` 4곳 | 설치용 빌드 때 1회 증가(Android 84 · iOS 63) |

서버·DB·저장 경로·메시지 형식·업로드 API 는 **바꾸지 않는다**. 사진 파일 내용만 바뀐다.

### 4-3. 영향받는 화면·경로

| 화면·경로 | 영향 |
|---|---|
| 첨부 시트 최근 줄 → 전송(새 바이너리) | 말풍선 자리·저장 사진 = 최근 줄 칸 사진 |
| 「사진·동영상」·「전체」 시스템 선택기 → 전송(새 바이너리) | iOS PHPicker 결과에 PHAsset id 가 있으면 대표 사진, 없으면 어둡지 않은 장면 |
| 카메라 촬영 영상 | 어둡지 않은 장면 |
| 구 바이너리(Android 82·83 · iOS 60~62) 「동영상」 웹 경로 | 웹 코드라 배포 즉시 어둡지 않은 장면이 적용된다 |
| 구 바이너리 네이티브 경로(82·83 / 61·62) | 새 바이너리를 설치하기 전까지 지금처럼 0.1초 장면 |
| 받는 쪽 말풍선·전체 보기 | 받은 사진 파일만 다르다. 코드 변경 없음 |
| 이미 보낸 메시지(`2c833a49…` 등) | 다시 만들지 않는다. 시험 메시지이고, 다시 만들면 저장소 쓰기가 추가로 생긴다 |

### 4-4. 깨질 수 있는 것과 대응

| 위험 | 대응 |
|---|---|
| iCloud 원본만 있는 iPhone 영상은 대표 사진을 받을 때 네트워크가 필요하다 | 지금도 `requestAVAsset` 에서 원본을 받으므로 같은 단계다. 실패하면 4-1 의 2번으로 넘어간다 |
| Android 사진 선택기 URI(`content://media/picker/…`)에서 `loadThumbnail` 이 되는지 | **실기로 확인할 항목.** 안 되면 예외를 잡고 4-1 의 2번으로 넘어간다(전송은 막지 않는다) |
| 장면을 최대 4장 뽑느라 시간이 늘어난다 | 대표 사진이 없을 때만 그렇다. 1장당 수십 ms 수준이며 압축 시간(초 단위)에 비해 작다. 실기에서 잰다 |
| 웹에서 `seek` 를 여러 번 하면 iOS WKWebView 가 느려질 수 있다 | 시점마다 기존 3초 제한을 둔다. 제한에 걸리면 그때까지 본 장면 중 가장 밝은 것을 쓴다 |

### 4-5. 반영 순서

1. **PR 1개** — 웹·iOS·Android 를 한 번에. 같은 결함·같은 원인이다.
2. 웹은 병합하면 바로 적용된다. 네이티브는 설치용 빌드 Android 84 · iOS 63 을 만든다.
3. **되돌리기**
   - 웹: Vercel Instant Rollback.
   - 네이티브: 구 바이너리(83/62)를 다시 설치하면 지금 방식으로 돌아간다. 저장 형식이 같아서 되돌려도 깨지는 화면이 없다.

### 4-6. 실기 검증 (각각 운영 DB·저장 파일 크기·화면 캡처로 판정)

| # | 기기·경로 | 영상 | 기대 |
|---|---|---|---|
| V1 | iPhone 62→63 · 최근 줄 | 검은 시작 영상(이번 1:12) | 말풍선 사진 = 최근 줄 칸 사진, thumb.jpg 가 검은 화면이 아님 |
| V2 | iPhone 63 · 「전체」 선택기 | 일반 영상 | 대표 사진과 같음 |
| V3 | Samsung 84 · 최근 줄 | 검은 시작 영상 | 위와 같음 |
| V4 | Samsung 84 · 「전체」 사진 선택기 | 일반 영상 | `loadThumbnail` 성공 여부 기록 |
| V5 | 구 바이너리 웹 「동영상」(iPhone 60) | 검은 시작 영상 | 어둡지 않은 장면 |
| V6 | 받는 쪽(Samsung) | V1 메시지 | 같은 사진이 보이고 재생됨 |

앱 실행은 실기 상한 10회 안에서 센다.
