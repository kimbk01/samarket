using System.Text.Json;
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
/// - 웹이 보내는 메시지는 W0 에서 「app.info」 하나만 받는다 (auth.open = W2, push.register = W3).
/// </summary>
public sealed partial class MainWindow : Window
{
    private const string BoundsSettingKey = "window.bounds";
    private const int DefaultWidth = 1280;
    private const int DefaultHeight = 820;
    private const int MinRestoreSize = 480;

    public MainWindow()
    {
        InitializeComponent();
        Title = AppConfig.WindowTitle;
        RestoreWindowBounds();
        Closed += (_, _) => SaveWindowBounds();
        _ = InitializeWebAsync();
    }

    private async Task InitializeWebAsync()
    {
        await Web.EnsureCoreWebView2Async();
        var core = Web.CoreWebView2;
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
