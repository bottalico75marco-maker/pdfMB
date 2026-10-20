using System.Globalization;
using System.Text;
using System.Text.Json;
using PdfMB.Desktop.Services;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PdfMB.Desktop;

internal sealed class PrintPreviewForm : Form
{
    private const string Origin = "https://print.pdfmb.example";
    private readonly WebView2 _view = new() { Dock = DockStyle.Fill };
    private readonly Dictionary<string, byte[]> _resources = [];
    private readonly List<Stream> _streams = [];
    private readonly string _profile;
    private readonly Button _print = new() { Text = "Stampa…", AutoSize = true, Enabled = false };

    public PrintPreviewForm(JsonElement pages, string profile)
    {
        _profile = profile;
        Text = "PDF MB · Anteprima di stampa";
        ClientSize = new Size(1050, 800);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(8) };
        bar.Controls.Add(_print);
        bar.Controls.Add(new Label { Text = "Controlla anteprima, stampante, intervallo e orientamento prima di stampare.", AutoSize = true, Padding = new Padding(8) });
        Controls.Add(_view); Controls.Add(bar);
        if (pages.ValueKind != JsonValueKind.Array || pages.GetArrayLength() is < 1 or > 500)
            throw new InvalidDataException("Numero di pagine di stampa non valido (massimo 500).");
        var html = new StringBuilder("<!doctype html><html><head><meta charset='utf-8'><style>body{margin:0;background:#ddd}img{display:block;margin:12px auto;background:white;max-width:95%}@media print{body{background:white}img{margin:0;max-width:100%;max-height:100vh;object-fit:contain;break-after:page}img:last-child{break-after:auto}@page{margin:0;size:auto}}</style></head><body>");
        long total = 0;
        int index = 0;
        foreach (var page in pages.EnumerateArray())
        {
            byte[] bytes = PngFile.Decode(page.GetProperty("base64").GetString()!);
            total += bytes.Length;
            if (total > 36 * 1024 * 1024) throw new InvalidDataException("Anteprima di stampa troppo grande.");
            double width = page.GetProperty("widthMm").GetDouble(), height = page.GetProperty("heightMm").GetDouble();
            if (!double.IsFinite(width + height) || width <= 0 || height <= 0 || width > 5000 || height > 5000)
                throw new InvalidDataException("Dimensioni di stampa non valide.");
            string path = $"/page-{index++}.png";
            _resources[path] = bytes;
            html.Append($"<img src='{Origin}{path}' style='width:{width.ToString(CultureInfo.InvariantCulture)}mm;height:{height.ToString(CultureInfo.InvariantCulture)}mm' alt='Pagina {index}'>");
        }
        html.Append("</body></html>");
        _resources["/index.html"] = Encoding.UTF8.GetBytes(html.ToString());
        Shown += async (_, _) => await StartAsync();
        _print.Click += (_, _) => _view.CoreWebView2.ShowPrintUI(CoreWebView2PrintDialogKind.Browser);
        FormClosed += (_, _) => { _view.Dispose(); foreach (var stream in _streams) stream.Dispose(); };
    }

    private async Task StartAsync()
    {
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: _profile);
            await _view.EnsureCoreWebView2Async(environment);
            var core = _view.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) =>
            {
                var uri = new Uri(e.Request.Uri);
                if (uri.GetLeftPart(UriPartial.Authority) != Origin || !_resources.TryGetValue(uri.AbsolutePath, out var bytes))
                {
                    e.Response = environment.CreateWebResourceResponse(null, 404, "Not Found", ""); return;
                }
                var stream = new MemoryStream(bytes, writable: false); _streams.Add(stream);
                e.Response = environment.CreateWebResourceResponse(stream, 200, "OK",
                    $"Content-Type: {(uri.AbsolutePath.EndsWith(".png") ? "image/png" : "text/html; charset=utf-8")}\r\nContent-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'\r\nCache-Control: no-store");
            };
            core.NavigationStarting += (_, e) => e.Cancel = e.Uri != Origin + "/index.html";
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.DownloadStarting += (_, e) => e.Cancel = true;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.NavigationCompleted += (_, e) => _print.Enabled = e.IsSuccess;
            core.Navigate(Origin + "/index.html");
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Anteprima non disponibile", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
