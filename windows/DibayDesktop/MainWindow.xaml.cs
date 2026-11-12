using System.Text.Json;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.Web.WebView2.Core;
using Windows.ApplicationModel;
using Windows.Graphics;
using Windows.Storage;
using Windows.System;

namespace DibayDesktop;

/// <summary>
/// W0 셸 창 — WebView2 1개가 운영 웹을 연다.
/// - 창 위치·크기를 기억한다.
/// - 앱 밖 주소(새 창·외부 링크)는 기본 브라우저로 연다.
/// - 웹 메시지: app.info(W0) · auth.open · auth.return.request(W2). push.register 는 W3.
/// - W2 로그인 복귀: dibay://auth/callback 을 보관 → 「auth.return.available」 알림 → 웹이 요청하면 한 번만 보내고 지운다
///   (같은 인가 코드를 두 번 교환하지 않게).
/// </summary>
public sealed partial class MainWindow : Window
{
    private const string BoundsSettingKey = "window.bounds";
    private const int DefaultWidth = 1280;
    private const int DefaultHeight = 820;
    private const int MinRestoreSize = 480;

    /// <summary>W2: 아직 웹에 넘기지 않은 로그인 복귀 주소 (한 번 보내면 지운다).</summary>
    private string? _pendingAuthReturn;

    public MainWindow()
    {
        InitializeComponent();
        Title = AppConfig.WindowTitle;
        RestoreWindowBounds();
        ApplyLightTitleBar();
        Closed += (_, _) => SaveWindowBounds();
        _ = InitializeWebAsync();
    }

    private async Task InitializeWebAsync()
    {
        await Web.EnsureCoreWebView2Async();
        var core = Web.CoreWebView2;
        // 다크 모드 없음 (Owner 2026-11-12) — Windows 다크 테마여도 웹(prefers-color-scheme)·WebView2 대화상자 라이트 고정.
        core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Light;
#if DEBUG
        core.Settings.AreDevToolsEnabled = true;
#else
        core.Settings.AreDevToolsEnabled = false;
#endif
        core.Settings.IsStatusBarEnabled = false;
        core.NewWindowRequested += OnNewWindowRequested;
        core.NavigationStarting += OnNavigationStarting;
        core.WebMessageReceived += OnWebMessageReceived;
        Web.Source = new Uri(AppConfig.StartUrl);
    }

    /// <summary>
    /// 다크 모드 없음 (Owner 2026-11-13) — Windows 다크 테마여도 제목 표시줄을 라이트로 고정.
    /// 테마 고정 속성 AppWindowTitleBar.PreferredTheme 는 Windows App SDK 1.7 부터라(이 프로젝트 1.6) 색을 직접 지정한다.
    /// </summary>
    private void ApplyLightTitleBar()
    {
        if (!AppWindowTitleBar.IsCustomizationSupported()) return;
        var bar = AppWindow.TitleBar;
        var background = ColorHelper.FromArgb(0xFF, 0xFF, 0xFF, 0xFF);
        var foreground = ColorHelper.FromArgb(0xFF, 0x36, 0x24, 0x15);
        var inactiveForeground = ColorHelper.FromArgb(0xFF, 0x8A, 0x8A, 0x8A);
        bar.BackgroundColor = background;
        bar.ForegroundColor = foreground;
        bar.InactiveBackgroundColor = background;
        bar.InactiveForegroundColor = inactiveForeground;
        bar.ButtonBackgroundColor = background;
        bar.ButtonForegroundColor = foreground;
        bar.ButtonHoverBackgroundColor = ColorHelper.FromArgb(0xFF, 0xF2, 0xF2, 0xF2);
        bar.ButtonHoverForegroundColor = foreground;
        bar.ButtonPressedBackgroundColor = ColorHelper.FromArgb(0xFF, 0xE6, 0xE6, 0xE6);
        bar.ButtonPressedForegroundColor = foreground;
        bar.ButtonInactiveBackgroundColor = background;
        bar.ButtonInactiveForegroundColor = inactiveForeground;
    }

    /// <summary>target=_blank · window.open — 앱 주소면 같은 창, 아니면 기본 브라우저.</summary>
    private void OnNewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) return;
        if (AppConfig.IsAppOrigin(uri))
        {
            sender.Navigate(uri.ToString());
            return;
        }
        _ = Launcher.LaunchUriAsync(uri);
    }

    /// <summary>앱 안에서 열 수 없는 주소(외부 사이트·mailto·tel 등)는 기본 브라우저·OS 로 넘긴다.</summary>
    private void OnNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) return;
        if (uri.Scheme == "about" || uri.Scheme == "data" || uri.Scheme == "blob") return;
        if (AppConfig.IsInAppHost(uri)) return;
        e.Cancel = true;
        _ = Launcher.LaunchUriAsync(uri);
    }

    /// <summary>웹 → 셸 메시지. 앱 주소에서 온 것만 받는다.</summary>
    private void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!Uri.TryCreate(e.Source, UriKind.Absolute, out var source) || !AppConfig.IsAppOrigin(source)) return;
        string? type = null;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty("type", out var typeProp) &&
                typeProp.ValueKind == JsonValueKind.String)
            {
                type = typeProp.GetString();
            }
        }
        catch (JsonException)
        {
            return;
        }

        if (type == "app.info")
        {
            var reply = JsonSerializer.Serialize(new
            {
                type = "app.info",
                shell = "windows",
                bridgeVersion = AppConfig.BridgeVersion,
                appVersion = ReadPackageVersion(),
            });
            sender.PostWebMessageAsJson(reply);
            return;
        }

        if (type == "auth.open")
        {
            // W2: 로그인 인가 주소를 기본 브라우저로 — 우리 Supabase 인가 주소만.
            var url = ReadStringProperty(e.WebMessageAsJson, "url");
            if (url is not null && Uri.TryCreate(url, UriKind.Absolute, out var authUri) && AppConfig.IsAuthOpenAllowed(authUri))
            {
                _ = Launcher.LaunchUriAsync(authUri);
            }
            return;
        }

        if (type == "auth.return.request")
        {
            // W2: 웹이 준비됐다 — 보관한 복귀 주소를 한 번만 보내고 지운다.
            SendPendingAuthReturn(sender);
        }
    }

    /// <summary>App — dibay://auth/callback 로 활성화됨 (콜드 스타트·이미 켜진 창 모두).</summary>
    public void ReceiveAuthReturn(string url)
    {
        _pendingAuthReturn = url;
        var core = Web.CoreWebView2;
        if (core is null) return; // 웹이 뜨면 리스너가 auth.return.request 로 받아 간다.
        core.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "auth.return.available" }));
    }

    public void BringToFront()
    {
        if (AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } presenter)
        {
            presenter.Restore();
        }
        Activate();
    }

    private void SendPendingAuthReturn(CoreWebView2 core)
    {
        var url = _pendingAuthReturn;
        if (url is null) return;
        _pendingAuthReturn = null;
        core.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "auth.return", url }));
    }

    private static string? ReadStringProperty(string json, string name)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object &&
                   doc.RootElement.TryGetProperty(name, out var prop) &&
                   prop.ValueKind == JsonValueKind.String
                ? prop.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string ReadPackageVersion()
    {
        try
        {
            var v = Package.Current.Id.Version;
            return $"{v.Major}.{v.Minor}.{v.Build}.{v.Revision}";
        }
        catch (InvalidOperationException)
        {
            return "0.0.0.0";
        }
    }

    private void RestoreWindowBounds()
    {
        try
        {
            if (ApplicationData.Current.LocalSettings.Values[BoundsSettingKey] is string saved)
            {
                var parts = saved.Split(',');
                if (parts.Length == 4 &&
                    int.TryParse(parts[0], out var x) && int.TryParse(parts[1], out var y) &&
                    int.TryParse(parts[2], out var w) && int.TryParse(parts[3], out var h) &&
                    w >= MinRestoreSize && h >= MinRestoreSize &&
                    DisplayArea.GetFromPoint(new PointInt32(x + 40, y + 40), DisplayAreaFallback.None) is not null)
                {
                    AppWindow.MoveAndResize(new RectInt32(x, y, w, h));
                    return;
                }
            }
        }
        catch (InvalidOperationException)
        {
            // 패키지 신원 없이 실행된 경우 — 기본 크기로.
        }
        AppWindow.Resize(new SizeInt32(DefaultWidth, DefaultHeight));
    }

    private void SaveWindowBounds()
    {
        try
        {
            if (AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized }) return;
            var p = AppWindow.Position;
            var s = AppWindow.Size;
            ApplicationData.Current.LocalSettings.Values[BoundsSettingKey] = $"{p.X},{p.Y},{s.Width},{s.Height}";
        }
        catch (InvalidOperationException)
        {
            // 패키지 신원 없이 실행된 경우 — 저장하지 않는다.
        }
    }
}
