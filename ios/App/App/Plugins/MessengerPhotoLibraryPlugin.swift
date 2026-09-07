import Capacitor
import Foundation
import Photos
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/**
 * Messenger attachment photo library — recent strip + PHPicker multi-select.
 * JS: MessengerPhotoLibrary
 */
@objc(MessengerPhotoLibraryPlugin)
public class MessengerPhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
  public let identifier = "MessengerPhotoLibraryPlugin"
  public let jsName = "MessengerPhotoLibrary"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getPermissionState", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getRecentPhotos", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pickPhotos", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolvePhotos", returnType: CAPPluginReturnPromise),
  ]

  private var pendingPickCall: CAPPluginCall?
  private let thumbMaxPx: CGFloat = 256
  private let fullMaxEdge: CGFloat = 1920

  @objc func getPermissionState(_ call: CAPPluginCall) {
    call.resolve(["state": permissionStateJs()])
  }

  @objc func requestPermission(_ call: CAPPluginCall) {
    if #available(iOS 14, *) {
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] _ in
        DispatchQueue.main.async {
          call.resolve(["state": self?.permissionStateJs() ?? "denied"])
        }
      }
    } else {
      PHPhotoLibrary.requestAuthorization { [weak self] _ in
        DispatchQueue.main.async {
          call.resolve(["state": self?.permissionStateJs() ?? "denied"])
        }
      }
    }
  }

  @objc func getRecentPhotos(_ call: CAPPluginCall) {
    let limit = max(1, min(call.getInt("limit") ?? 24, 40))
    let state = permissionStateJs()
    if state == "denied" || state == "prompt" {
      call.resolve(["photos": [], "state": state])
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      let photos = self.fetchRecentThumbs(limit: limit)
      DispatchQueue.main.async {
        call.resolve(["photos": photos, "state": self.permissionStateJs()])
      }
    }
  }

  @objc func pickPhotos(_ call: CAPPluginCall) {
    let maxCount = max(1, min(call.getInt("max") ?? 10, 10))
    DispatchQueue.main.async {
      if self.pendingPickCall != nil {
        call.reject("picker_busy")
        return
      }
      self.pendingPickCall = call
      var config = PHPickerConfiguration(photoLibrary: .shared())
      config.filter = .images
      config.selectionLimit = maxCount
      if #available(iOS 15, *) {
        config.selection = .ordered
      }
      let picker = PHPickerViewController(configuration: config)
      picker.delegate = self
      guard let vc = self.bridge?.viewController else {
        self.pendingPickCall = nil
        call.reject("no_view_controller")
        return
      }
      vc.present(picker, animated: true)
    }
  }

  @objc func resolvePhotos(_ call: CAPPluginCall) {
    guard let ids = call.getArray("ids", String.self), !ids.isEmpty else {
      call.resolve(["photos": []])
      return
    }
    let state = permissionStateJs()
    if state == "denied" {
      call.reject("permission_denied")
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      var photos: [[String: Any]] = []
      for (idx, id) in ids.enumerated() {
        if let localId = id.hasPrefix("phasset:") ? String(id.dropFirst("phasset:".count)) : Optional(id),
           let asset = PHAsset.fetchAssets(withLocalIdentifiers: [localId], options: nil).firstObject,
           let payload = self.encodeFullAsset(asset, fileName: "recent-\(idx).jpg")
        {
          var row = payload
          row["id"] = id
          photos.append(row)
        }
      }
      DispatchQueue.main.async {
        call.resolve(["photos": photos])
      }
    }
  }

  public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let call = pendingPickCall else { return }
    pendingPickCall = nil
    if results.isEmpty {
      call.resolve(["photos": [], "cancelled": true])
      return
    }
    let group = DispatchGroup()
    var ordered: [(Int, [String: Any])] = []
    let lock = NSLock()
    for (idx, result) in results.enumerated() {
      group.enter()
      let provider = result.itemProvider
      if provider.canLoadObject(ofClass: UIImage.self) {
        provider.loadObject(ofClass: UIImage.self) { object, _ in
          defer { group.leave() }
          guard let image = object as? UIImage,
                let payload = self.encodeFullUIImage(image, id: "pick-\(idx)", fileName: "pick-\(idx).jpg")
          else { return }
          lock.lock()
          ordered.append((idx, payload))
          lock.unlock()
        }
      } else {
        group.leave()
      }
    }
    group.notify(queue: .main) {
      let photos = ordered.sorted { $0.0 < $1.0 }.map { $0.1 }
      call.resolve(["photos": photos, "cancelled": photos.isEmpty])
    }
  }

  private func permissionStateJs() -> String {
    let status: PHAuthorizationStatus
    if #available(iOS 14, *) {
      status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    } else {
      status = PHPhotoLibrary.authorizationStatus()
    }
    switch status {
    case .authorized:
      return "authorized"
    case .limited:
      return "limited"
    case .denied, .restricted:
      return "denied"
    case .notDetermined:
      return "prompt"
    @unknown default:
      return "denied"
    }
  }

  private func fetchRecentThumbs(limit: Int) -> [[String: Any]] {
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = limit
    let assets = PHAsset.fetchAssets(with: .image, options: options)
    var photos: [[String: Any]] = []
    let target = CGSize(width: thumbMaxPx, height: thumbMaxPx)
    let requestOptions = PHImageRequestOptions()
    requestOptions.isSynchronous = true
    requestOptions.deliveryMode = .fastFormat
    requestOptions.resizeMode = .fast
    requestOptions.isNetworkAccessAllowed = true
    assets.enumerateObjects { asset, _, stop in
      if photos.count >= limit {
        stop.pointee = true
        return
      }
      var outImage: UIImage?
      PHImageManager.default().requestImage(
        for: asset,
        targetSize: target,
        contentMode: .aspectFill,
        options: requestOptions
      ) { image, _ in
        outImage = image
      }
      guard let image = outImage, let data = image.jpegData(compressionQuality: 0.7) else { return }
      let b64 = data.base64EncodedString()
      photos.append([
        "id": "phasset:\(asset.localIdentifier)",
        "thumbnailDataUrl": "data:image/jpeg;base64,\(b64)",
        "width": asset.pixelWidth,
        "height": asset.pixelHeight,
      ])
    }
    return photos
  }

  private func encodeFullAsset(_ asset: PHAsset, fileName: String) -> [String: Any]? {
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .exact
    options.isNetworkAccessAllowed = true
    let w = CGFloat(asset.pixelWidth)
    let h = CGFloat(asset.pixelHeight)
    let edge = max(w, h)
    let scale = edge > fullMaxEdge ? fullMaxEdge / edge : 1
    let target = CGSize(width: max(1, w * scale), height: max(1, h * scale))
    var outImage: UIImage?
    PHImageManager.default().requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFit,
      options: options
    ) { image, _ in
      outImage = image
    }
    guard let image = outImage else { return nil }
    return encodeFullUIImage(image, id: "phasset:\(asset.localIdentifier)", fileName: fileName)
  }

  private func encodeFullUIImage(_ image: UIImage, id: String, fileName: String) -> [String: Any]? {
    let scaled = scaleImage(image, maxEdge: fullMaxEdge)
    guard let data = scaled.jpegData(compressionQuality: 0.85) else { return nil }
    return [
      "id": id,
      "fileName": fileName,
      "mimeType": "image/jpeg",
      "base64": data.base64EncodedString(),
    ]
  }

  private func scaleImage(_ image: UIImage, maxEdge: CGFloat) -> UIImage {
    let size = image.size
    let edge = max(size.width, size.height)
    guard edge > maxEdge, edge > 0 else { return image }
    let scale = maxEdge / edge
    let newSize = CGSize(width: size.width * scale, height: size.height * scale)
    UIGraphicsBeginImageContextWithOptions(newSize, true, 1)
    image.draw(in: CGRect(origin: .zero, size: newSize))
    let out = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    return out ?? image
  }
}
