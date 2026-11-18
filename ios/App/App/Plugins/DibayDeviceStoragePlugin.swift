import Capacitor
import Foundation
import WebKit

/**
 * 기기 저장공간 S2 (docs/audit/device-storage-legacy-design-2026-11-19.md §4 S2) — 레거시 앱 「저장공간 관리」 동일 형태.
 *
 * - getUsage: 사진·영상 등 캐시(Library/Caches — WebKit 디스크 캐시 포함) · 임시 사진(tmp 의 이미지 파일) 바이트
 * - clearWebCache: WKWebsiteDataStore 디스크·메모리 캐시만 삭제. 쿠키·로컬 저장소(로그인)는 지우지 않는다.
 * - clearCameraTemp: tmp 의 이미지 파일 삭제(10분 안에 만든 파일은 업로드 중일 수 있어 남김). 통화 연결음 등 다른 임시 파일은 건드리지 않는다.
 * - load(): 앱 시작 시 하루 지난 임시 이미지 자동 정리
 * 사용자가 사진첩에 저장한 사진은 앱 소유가 아니므로 건드리지 않는다.
 */
@objc(DibayDeviceStoragePlugin)
public class DibayDeviceStoragePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayDeviceStoragePlugin"
  public let jsName = "DibayDeviceStorage"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getUsage", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearWebCache", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearCameraTemp", returnType: CAPPluginReturnPromise),
  ]

  static let inUseGuardSeconds: TimeInterval = 10 * 60
  static let autoCleanAgeSeconds: TimeInterval = 24 * 60 * 60
  static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "heif"]

  override public func load() {
    DispatchQueue.global(qos: .utility).async {
      _ = DibayDeviceStoragePlugin.deleteTempImages(minAge: DibayDeviceStoragePlugin.autoCleanAgeSeconds)
    }
  }

  @objc func getUsage(_ call: CAPPluginCall) {
    DispatchQueue.global(qos: .userInitiated).async {
      call.resolve(DibayDeviceStoragePlugin.usage())
    }
  }

  @objc func clearWebCache(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
      WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: Date(timeIntervalSince1970: 0)) {
        DispatchQueue.global(qos: .userInitiated).async {
          call.resolve(DibayDeviceStoragePlugin.usage())
        }
      }
    }
  }

  @objc func clearCameraTemp(_ call: CAPPluginCall) {
    DispatchQueue.global(qos: .userInitiated).async {
      _ = DibayDeviceStoragePlugin.deleteTempImages(minAge: DibayDeviceStoragePlugin.inUseGuardSeconds)
      call.resolve(DibayDeviceStoragePlugin.usage())
    }
  }

  static func usage() -> [String: Any] {
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    return [
      "webCacheBytes": caches.map { directoryBytes($0) } ?? 0,
      "cameraTempBytes": tempImageBytes(),
      "platform": "ios",
    ]
  }

  static func tempImageFiles() -> [URL] {
    let tmp = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    guard let items = try? FileManager.default.contentsOfDirectory(
      at: tmp, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
    ) else { return [] }
    return items.filter { imageExtensions.contains($0.pathExtension.lowercased()) }
  }

  static func tempImageBytes() -> Int {
    tempImageFiles().reduce(0) { sum, url in
      sum + ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
    }
  }

  static func deleteTempImages(minAge: TimeInterval) -> Int {
    let now = Date()
    var deleted = 0
    for url in tempImageFiles() {
      let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? now
      if now.timeIntervalSince(modified) < minAge { continue }
      if (try? FileManager.default.removeItem(at: url)) != nil { deleted += 1 }
    }
    return deleted
  }

  static func directoryBytes(_ url: URL) -> Int {
    guard let enumerator = FileManager.default.enumerator(
      at: url, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey], options: [], errorHandler: nil
    ) else { return 0 }
    var total = 0
    for case let file as URL in enumerator {
      let values = try? file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
      if values?.isRegularFile == true { total += values?.fileSize ?? 0 }
    }
    return total
  }
}
