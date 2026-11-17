import Capacitor
import CryptoKit
import Foundation
import UIKit

/**
 * 진입 감사 5단계 IN-1·IN-2·IN-3·IN-8 (2026-11-17 · Owner 「설계안대로 진행」) — 로딩 시간 안의 인트로 (Android `DibayNativeIntro` 와 같은 계약).
 *
 * 앱 시작 직후(웹이 뜨기 전) 기기에 받아 둔 인트로 소재(그림 1장 + 배경색 + 고정 브랜드 줄)를 네이티브 화면으로 그린다.
 * 걷히는 때 = max(어드민 표시 시간(첫 그림부터), 홈 준비(웹 dismissSplash)). 건너뛰기 = 홈 준비 뒤 즉시. 시작 고장이면 즉시.
 * 소재 목록·그림은 웹이 발견 후 `sync` 로 넘긴다(네이티브가 받고 sha256 검사 · 목록 원자 교체 · 목록 밖 그림 삭제).
 * 진입마다 다음 소재. 노출·건너뛰기·누름·완료는 웹으로 보내 서버 기록.
 *
 * CAPBridgedPlugin — registered natively in DibayRootBridgeViewController.makeAppTargetPlugins().
 */
@objc(DibayNativeIntroPlugin)
public class DibayNativeIntroPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayNativeIntroPlugin"
  public let jsName = "DibayNativeIntro"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
  ]

  override public func load() {
    DibayNativeIntro.shared.attachPlugin(self)
  }

  func send(_ data: [String: Any]) {
    notifyListeners("introEvent", data: data, retainUntilConsumed: true)
  }

  @objc func sync(_ call: CAPPluginCall) {
    let options = call.options as? [String: Any] ?? [:]
    DispatchQueue.global(qos: .utility).async {
      let ok = DibayNativeIntro.shared.sync(options)
      call.resolve(["ok": ok])
    }
  }

  @objc func getState(_ call: CAPPluginCall) {
    let s = DibayNativeIntro.shared
    call.resolve([
      "supported": true,
      "active": s.selected != nil && !s.finished,
      "creativeId": s.selected?.id as Any,
      "exposureId": s.exposureId as Any,
    ])
  }
}

final class DibayNativeIntro {
  static let shared = DibayNativeIntro()

  struct Entry {
    let id: String
    let file: String
    let sha256: String
    let bgColor: UIColor
    let durationMs: Int
    let ctaHref: String?
    let showAdLabel: Bool
    let startAtMs: Double
    let endAtMs: Double
    let sortOrder: Int
  }

  private let dirName = "native-intro"
  private let manifestName = "manifest.json"
  private let lastIdKey = "dibay_native_intro_last_shown_id"

  private(set) var selected: Entry?
  private(set) var exposureId: String?
  private(set) var finished = false
  private var overlay: UIView?
  private var drawnAt: Date?
  private var homeReady = false
  private var skipRequested = false
  private weak var plugin: DibayNativeIntroPlugin?
  private var pending: [[String: Any]] = []

  private var dir: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(dirName, isDirectory: true)
  }

  // MARK: 선택

  /** restoreHint: fresh | restore | unknown */
  func selectForLaunch(restoreHint: String) {
    selected = nil
    exposureId = nil
    finished = false
    homeReady = false
    skipRequested = false
    drawnAt = nil
    guard let m = readManifest(), m["enabled"] as? Bool == true else { return }
    if restoreHint == "restore" && (m["showOnOsRestore"] as? Bool) != true { return }
    let now = Date().timeIntervalSince1970 * 1000
    var eligible: [Entry] = []
    for raw in (m["entries"] as? [[String: Any]]) ?? [] {
      guard let e = parse(raw) else { continue }
      if e.startAtMs > 0 && now < e.startAtMs { continue }
      if e.endAtMs > 0 && now >= e.endAtMs { continue }
      guard FileManager.default.fileExists(atPath: dir.appendingPathComponent(e.file).path) else { continue }
      eligible.append(e)
    }
    guard !eligible.isEmpty else { return }
    eligible.sort { $0.sortOrder != $1.sortOrder ? $0.sortOrder < $1.sortOrder : $0.id < $1.id }
    var idx = 0
    if let last = UserDefaults.standard.string(forKey: lastIdKey),
      let i = eligible.firstIndex(where: { $0.id == last })
    {
      idx = (i + 1) % eligible.count
    }
    let pick = eligible[idx]
    UserDefaults.standard.set(pick.id, forKey: lastIdKey)
    selected = pick
    exposureId = UUID().uuidString.lowercased()
    NSLog("[DibayNativeIntro] selected id=%@ restore_hint=%@ eligible=%d", pick.id, restoreHint, eligible.count)
  }

  var documentStartValue: String { (selected != nil && !finished) ? selected!.id : "" }

  // MARK: 그리기

  func attach(to host: UIView) {
    guard let e = selected else { return }
    guard let image = UIImage(contentsOfFile: dir.appendingPathComponent(e.file).path) else {
      NSLog("[DibayNativeIntro] decode_failed id=%@", e.id)
      selected = nil
      return
    }
    let root = UIView(frame: host.bounds)
    root.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    root.backgroundColor = e.bgColor

    let imageView = UIImageView(image: image)
    imageView.contentMode = .scaleAspectFit
    imageView.translatesAutoresizingMaskIntoConstraints = false
    imageView.isUserInteractionEnabled = e.ctaHref != nil
    if e.ctaHref != nil {
      imageView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(onCta)))
    }
    root.addSubview(imageView)

    // 고정 브랜드 줄 — 앱 아이콘 + dibaY
    let brand = UIStackView()
    brand.axis = .horizontal
    brand.spacing = 8
    brand.alignment = .center
    brand.translatesAutoresizingMaskIntoConstraints = false
    if let icon = Self.appIcon() {
      let iv = UIImageView(image: icon)
      iv.layer.cornerRadius = 7
      iv.clipsToBounds = true
      iv.widthAnchor.constraint(equalToConstant: 28).isActive = true
      iv.heightAnchor.constraint(equalToConstant: 28).isActive = true
      brand.addArrangedSubview(iv)
    }
    let word = UILabel()
    let text = NSMutableAttributedString(
      string: "dibaY",
      attributes: [.font: UIFont.systemFont(ofSize: 22, weight: .heavy), .foregroundColor: UIColor.white])
    text.addAttribute(.foregroundColor, value: UIColor(red: 0xE0 / 255, green: 0xA8 / 255, blue: 0, alpha: 1), range: NSRange(location: 4, length: 1))
    word.attributedText = text
    brand.addArrangedSubview(word)
    root.addSubview(brand)

    let skip = Self.pill(Self.localized(ko: "건너뛰기", en: "Skip"))
    skip.addTarget(self, action: #selector(onSkip), for: .touchUpInside)
    root.addSubview(skip)

    let g = root.safeAreaLayoutGuide
    var cs: [NSLayoutConstraint] = [
      imageView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      imageView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      imageView.topAnchor.constraint(equalTo: g.topAnchor, constant: 56),
      imageView.bottomAnchor.constraint(equalTo: brand.topAnchor, constant: -16),
      brand.centerXAnchor.constraint(equalTo: root.centerXAnchor),
      brand.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -30),
      skip.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
      skip.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -12),
    ]
    if e.showAdLabel {
      let ad = Self.pill(Self.localized(ko: "광고", en: "Ad"))
      ad.isUserInteractionEnabled = false
      root.addSubview(ad)
      cs += [
        ad.topAnchor.constraint(equalTo: g.topAnchor, constant: 16),
        ad.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
      ]
    }
    NSLayoutConstraint.activate(cs)
    root.layer.zPosition = 10_000
    host.addSubview(root)
    overlay = root
    // 표시 시간 = 첫 그림이 화면에 나간 다음부터(IN-2)
    DispatchQueue.main.async { [weak self] in
      CATransaction.setCompletionBlock { [weak self] in self?.markDrawn() }
      CATransaction.begin()
      CATransaction.commit()
    }
  }

  /** 다른 덮개(시작 화면 이어 보이기)보다 위에 둔다 */
  func bringToFront() {
    guard let v = overlay, let p = v.superview else { return }
    p.bringSubviewToFront(v)
  }

  private func markDrawn() {
    guard drawnAt == nil, let e = selected, !finished else { return }
    drawnAt = Date()
    NSLog("[DibayNativeIntro] drawn id=%@", e.id)
    emit("impression", href: nil)
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(e.durationMs)) { [weak self] in
      self?.maybeFinish()
    }
  }

  private static func pill(_ title: String) -> UIButton {
    let b = UIButton(type: .custom)
    b.setTitle(title, for: .normal)
    b.setTitleColor(.white, for: .normal)
    b.titleLabel?.font = .systemFont(ofSize: 12, weight: .bold)
    b.backgroundColor = UIColor(white: 0, alpha: 0.55)
    b.contentEdgeInsets = UIEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
    b.layer.cornerRadius = 13
    b.translatesAutoresizingMaskIntoConstraints = false
    return b
  }

  private static func localized(ko: String, en: String) -> String {
    if let stored = DibayAppLanguagePlugin.storedLanguage() { return stored == "ko" ? ko : en }
    let first = Locale.preferredLanguages.first ?? "en"
    return first.hasPrefix("ko") ? ko : en
  }

  private static func appIcon() -> UIImage? {
    guard
      let icons = Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any],
      let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
      let files = primary["CFBundleIconFiles"] as? [String],
      let name = files.last
    else { return UIImage(named: "AppIcon") }
    return UIImage(named: name)
  }

  // MARK: 걷기

  func onHomeReady() {
    homeReady = true
    DispatchQueue.main.async { [weak self] in self?.maybeFinish() }
  }

  func onStartupFault() {
    DispatchQueue.main.async { [weak self] in self?.finish(reason: "fault", href: nil) }
  }

  private func maybeFinish() {
    guard !finished, let e = selected, let drawnAt else { return }
    let elapsed = Date().timeIntervalSince(drawnAt) * 1000 >= Double(e.durationMs)
    if homeReady && (elapsed || skipRequested) { finish(reason: skipRequested ? "skip" : "complete", href: nil) }
  }

  @objc private func onSkip() {
    skipRequested = true
    maybeFinish()
  }

  @objc private func onCta() {
    guard let e = selected, !finished else { return }
    finish(reason: "click", href: e.ctaHref)
  }

  private func finish(reason: String, href: String?) {
    guard !finished else { return }
    finished = true
    overlay?.removeFromSuperview()
    overlay = nil
    NSLog("[DibayNativeIntro] finished reason=%@", reason)
    if reason != "fault" { emit(reason, href: href) }
    emit("done", href: nil)
  }

  // MARK: 웹으로 보내기

  func attachPlugin(_ p: DibayNativeIntroPlugin) {
    DispatchQueue.main.async {
      self.plugin = p
      let drain = self.pending
      self.pending.removeAll()
      for d in drain { p.send(d) }
    }
  }

  private func emit(_ type: String, href: String?) {
    guard let e = selected else { return }
    var d: [String: Any] = ["type": type, "creativeId": e.id, "exposureId": exposureId ?? ""]
    if let href { d["href"] = href }
    DispatchQueue.main.async {
      if let p = self.plugin { p.send(d) } else { self.pending.append(d) }
    }
  }

  // MARK: 저장소

  private func readManifest() -> [String: Any]? {
    let url = dir.appendingPathComponent(manifestName)
    guard let data = try? Data(contentsOf: url),
      let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      o["schema"] as? Int == 1
    else { return nil }
    return o
  }

  private func parse(_ o: [String: Any]) -> Entry? {
    guard let id = o["id"] as? String, let sha = o["sha256"] as? String, let file = o["file"] as? String,
      sha.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
      file.range(of: "^[0-9a-f]{64}\\.(png|jpg|webp)$", options: .regularExpression) != nil
    else { return nil }
    let href = (o["ctaHref"] as? String) ?? ""
    let dur = (o["durationMs"] as? NSNumber)?.intValue ?? 2000
    return Entry(
      id: id, file: file, sha256: sha,
      bgColor: Self.color(o["bgColor"] as? String) ?? UIColor(red: 7 / 255, green: 87 / 255, blue: 64 / 255, alpha: 1),
      durationMs: max(1000, min(5000, dur)),
      ctaHref: href.hasPrefix("/") || href.hasPrefix("https://") ? href : nil,
      showAdLabel: (o["showAdLabel"] as? Bool) ?? true,
      startAtMs: (o["startAtMs"] as? NSNumber)?.doubleValue ?? 0,
      endAtMs: (o["endAtMs"] as? NSNumber)?.doubleValue ?? 0,
      sortOrder: (o["sortOrder"] as? NSNumber)?.intValue ?? 0)
  }

  private static func color(_ hex: String?) -> UIColor? {
    guard let hex, hex.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil,
      let v = UInt32(hex.dropFirst(), radix: 16)
    else { return nil }
    return UIColor(
      red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255,
      alpha: 1)
  }

  private func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private func download(_ urlString: String, sha256: String) -> Data? {
    guard let url = URL(string: urlString), url.scheme == "https" else { return nil }
    let sem = DispatchSemaphore(value: 0)
    var out: Data?
    var req = URLRequest(url: url)
    req.timeoutInterval = 30
    URLSession.shared.dataTask(with: req) { data, resp, _ in
      if let data, (resp as? HTTPURLResponse)?.statusCode == 200, data.count <= 5 * 1024 * 1024 { out = data }
      sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + 45)
    guard let d = out, sha256Hex(d) == sha256 else { return nil }
    return d
  }

  /** 웹이 넘긴 목록으로 저장소를 맞춘다. 모두 성공해야 목록 교체 · 교체 뒤 목록 밖 그림 삭제(저장 누수 방지). */
  func sync(_ req: [String: Any]) -> Bool {
    let fm = FileManager.default
    do { try fm.createDirectory(at: dir, withIntermediateDirectories: true) } catch { return false }
    let enabled = req["enabled"] as? Bool == true
    var out: [[String: Any]] = []
    var keep = Set<String>()
    if enabled {
      for o in ((req["entries"] as? [[String: Any]]) ?? []).prefix(20) {
        guard let id = o["id"] as? String, let sha = o["sha256"] as? String, let url = o["url"] as? String,
          sha.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil
        else { continue }
        let ext: String
        switch o["mime"] as? String {
        case "image/png": ext = "png"
        case "image/jpeg": ext = "jpg"
        case "image/webp": ext = "webp"
        default: continue
        }
        let file = "\(sha).\(ext)"
        let dest = dir.appendingPathComponent(file)
        let existing = try? Data(contentsOf: dest)
        if existing == nil || sha256Hex(existing!) != sha {
          guard let data = download(url, sha256: sha) else { return false }
          do { try data.write(to: dest, options: .atomic) } catch { return false }
        }
        out.append([
          "id": id, "sha256": sha, "file": file,
          "bgColor": o["bgColor"] as? String ?? "#075740",
          "durationMs": o["durationMs"] as? NSNumber ?? 2000,
          "ctaHref": o["ctaHref"] as? String ?? "",
          "showAdLabel": o["showAdLabel"] as? Bool ?? true,
          "startAtMs": o["startAtMs"] as? NSNumber ?? 0,
          "endAtMs": o["endAtMs"] as? NSNumber ?? 0,
          "sortOrder": o["sortOrder"] as? NSNumber ?? 0,
        ])
        keep.insert(file)
      }
    }
    let manifest: [String: Any] = [
      "schema": 1,
      "enabled": enabled && !out.isEmpty,
      "showOnOsRestore": req["showOnOsRestore"] as? Bool == true,
      "revision": req["revision"] as? String ?? "",
      "entries": out,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: manifest) else { return false }
    do { try data.write(to: dir.appendingPathComponent(manifestName), options: .atomic) } catch { return false }
    let showing = (!finished ? selected?.file : nil)
    for name in (try? fm.contentsOfDirectory(atPath: dir.path)) ?? [] {
      if name == manifestName || keep.contains(name) || name == showing { continue }
      try? fm.removeItem(at: dir.appendingPathComponent(name))
    }
    NSLog("[DibayNativeIntro] synced entries=%d", out.count)
    return true
  }
}
