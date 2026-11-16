import UIKit

/**
 * FD1 DeviceClass authority — iOS native SSOT.
 * Idiom contract is unchanged. Plugin and app-orientation both consume this.
 */
enum DibayDeviceClassClassifier {
  struct Result {
    let deviceClass: String
    let source: String
    let reason: String?

    func asDictionary() -> [String: Any] {
      var out: [String: Any] = [
        "deviceClass": deviceClass,
        "source": source,
      ]
      if let reason {
        out["reason"] = reason
      }
      return out
    }
  }

  /**
   * S2 (docs/audit/mac-ipad-iphone-device-layout-audit-2026-11-16.md §7) — Apple Silicon Mac 에서 도는 iPad 앱은
   * idiom 이 항상 `.pad` 라 idiom 만으로는 iPad 와 구분할 수 없다. Mac 여부는 통화와 같은 단일 정의
   * `DibayCallPlatformCapability.isIOSAppOnMac` 을 읽기만 한다(통화 파일은 바꾸지 않음).
   * Mac = `DESKTOP_MAC` → 웹 기기 프로필 표에서 데스크톱(Windows 와 같은 왼쪽 세로 메뉴).
   */
  static func classify(
    idiom: UIUserInterfaceIdiom = UIDevice.current.userInterfaceIdiom,
    isIOSAppOnMac: Bool = DibayCallPlatformCapability.isIOSAppOnMac
  ) -> Result {
    if isIOSAppOnMac {
      return Result(deviceClass: "DESKTOP_MAC", source: "ios_app_on_mac", reason: nil)
    }
    switch idiom {
    case .phone:
      return Result(deviceClass: "PHONE_IOS", source: "userInterfaceIdiom", reason: nil)
    case .pad:
      return Result(deviceClass: "TABLET_IPAD", source: "userInterfaceIdiom", reason: nil)
    default:
      return Result(deviceClass: "UNKNOWN", source: "unsupported_idiom", reason: "unsupported_idiom")
    }
  }
}

/**
 * S3 — 기기 프로필 표(`lib/device/dibay-device-profile.ts`)의 네이티브 값. 계약 시험이 표와 같은지 검사한다.
 * Mac 에서 iPad 앱은 77% 로 그려진다(2026-11-16 실측: CSS 1056 → 814pt). 웹뷰 배율 1 ÷ 0.77 로 되돌려
 * CSS 1px = Mac 1pt = Windows·PC 브라우저와 같은 크기로 만든다. 창 최소 크기는 Mac pt 로 정하고,
 * 장면(scene) 좌표는 iPad 점 단위라 0.77 로 나눠 넣는다.
 */
enum DibayDeviceProfileNative {
  /// Mac 에서 iPad 앱이 그려지는 배율 (실측)
  static let macIpadAppScale: CGFloat = 0.77
  /// 창 최소 크기 (Mac pt) — v3: 왼쪽 세로 메뉴 72 + 가장 작은 휴대폰 화면 375×667 (본문이 휴대폰보다 좁아 가려지지 않게)
  static let macMinimumWindowPt = CGSize(width: 447, height: 667)

  /// v7 수정안 C (Owner 2026-11-17 시안 v7 승인) — 웹뷰 `pageZoom` 은 쓰지 않는다(1 = 그대로).
  /// iOS WebKit 은 배치 폭을 웹뷰 크기 그대로 쓰고(WKWebViewIOS.mm activeViewLayoutSize) pageZoom 은 그림만 키워,
  /// Mac 에서 오른쪽 23% 가 잘렸다(11-17 실측: 배치 1869 · 보임 1439pt). 확대는 아래 화면 폭 메타로 한다.
  static func webViewPageZoom(deviceClass: String) -> CGFloat {
    1.0
  }

  /// Mac 글자·화면 확대 배율 (1 ÷ 0.77 → CSS 1px = Mac 1pt). Mac 외 기기는 nil.
  static func macContentScale(deviceClass: String) -> CGFloat? {
    deviceClass == "DESKTOP_MAC" ? 1.0 / macIpadAppScale : nil
  }

  /// 문서 시작 때 넣는 스크립트 — 화면 폭 메타를 `width = 웹뷰 폭 ÷ 배율, initial = minimum = maximum = 배율` 로 고정한다.
  /// 웹뷰 폭(iPad 좌표)은 네이티브가 `setViewWidth` 로 준다(처음: 스크립트의 요청에 응답 · 그 뒤: 창 크기 변경마다).
  /// 웹(Next)이 메타를 다시 쓰면 바로 되돌린다. iPad 시뮬 Safari 실험(11-17): 이 방식만 innerWidth·clientWidth·100vw·
  /// 화면 폭 조건이 모두 같은 폭(넘침 0).
  static func macViewportScript(scale: CGFloat) -> String {
    let s = String(format: "%.4f", Double(scale))
    return """
    (function(){
      var S=\(s), W=0;
      function want(){ return 'width='+Math.max(1,Math.round(W/S))+', initial-scale='+S+', minimum-scale='+S+', maximum-scale='+S+', viewport-fit=cover, interactive-widget=resizes-content'; }
      function apply(){
        if(!W) return;
        var m=document.querySelector('meta[name="viewport"]');
        if(!m){ if(!document.head) return; m=document.createElement('meta'); m.setAttribute('name','viewport'); document.head.appendChild(m); }
        var c=want(); if(m.getAttribute('content')!==c) m.setAttribute('content',c);
      }
      window.__dibayMacViewport={scale:S,setViewWidth:function(w){ if(w>0){ W=w; apply(); } }};
      new MutationObserver(apply).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['content']});
      document.addEventListener('DOMContentLoaded',apply);
      try{ window.webkit.messageHandlers.DibayMacViewport.postMessage('ready'); }catch(e){}
    })();
    """
  }

  /// v6 R6 (Owner 2026-11-17 시안 v6 승인) — 창 최대 폭 (Mac pt). 높이는 화면까지. LOUNGE 카드 3열이 끝까지 차는 폭.
  static let macMaximumWindowWidthPt: CGFloat = 1440

  /// 장면 좌표(iPad 점) 기준 최대 크기 — 폭만 제한. Mac 외 기기는 nil(제한 없음).
  static func maximumSceneSize(deviceClass: String) -> CGSize? {
    guard deviceClass == "DESKTOP_MAC" else { return nil }
    return CGSize(
      width: (macMaximumWindowWidthPt / macIpadAppScale).rounded(.down),
      height: CGFloat.greatestFiniteMagnitude
    )
  }

  /// 장면 좌표(iPad 점) 기준 최소 크기. Mac 외 기기는 nil(제한 없음).
  static func minimumSceneSize(deviceClass: String) -> CGSize? {
    guard deviceClass == "DESKTOP_MAC" else { return nil }
    return CGSize(
      width: (macMinimumWindowPt.width / macIpadAppScale).rounded(.up),
      height: (macMinimumWindowPt.height / macIpadAppScale).rounded(.up)
    )
  }
}
