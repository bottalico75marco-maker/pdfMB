using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using PdfMB.Desktop.Services;

internal static class MarkdownChecks
{
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellation) => respond(request);
    }
    private static HttpResponseMessage Json(string text) => new(HttpStatusCode.OK) { Content = new StringContent(text, Encoding.UTF8, "application/json") };
    private static void Check(bool valid, string message) { if (!valid) throw new Exception(message); }
    public static async Task RunAsync()
    {
        using (var missing = new OllamaOcr(new Handler(_ => throw new HttpRequestException("offline"))))
            Check(!(await missing.CheckAsync("vision:test")).Available, "Offline Ollama enabled OCR");
        using (var absent = new OllamaOcr(new Handler(_ => Task.FromResult(Json("{\"models\":[]}")))))
            Check(!(await absent.CheckAsync("vision:test")).Available, "Absent model enabled OCR");
        foreach (string detail in new[] { "{\"capabilities\":[\"completion\"]}", "{\"capabilities\":[\"vision\"],\"remote_model\":\"cloud\"}" })
        {
            using var invalid = new OllamaOcr(new Handler(request => Task.FromResult(Json(request.RequestUri!.AbsolutePath == "/api/tags" ? "{\"models\":[{\"name\":\"vision:test\"}]}" : detail))));
            Check(!(await invalid.CheckAsync("vision:test")).Available, "Nonvisual or cloud model enabled local OCR");
        }
        int images = 0;
        using (var installed = new OllamaOcr(new Handler(async request =>
        {
            Check(request.RequestUri!.Host == "127.0.0.1", "OCR did not stay local");
            if (request.RequestUri.AbsolutePath == "/api/tags") return Json("{\"models\":[{\"name\":\"vision:test\"}]}");
            if (request.RequestUri.AbsolutePath == "/api/show") return Json("{\"capabilities\":[\"vision\",\"completion\"]}");
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            Check(body.RootElement.GetProperty("images").GetArrayLength() == 1, "More than one image sent in a request");
            Check(body.RootElement.GetProperty("images")[0].GetString() == $"image-{images++}", "Images arrived out of order");
            Check(!body.RootElement.GetProperty("stream").GetBoolean(), "Unexpected streaming protocol");
            return Json("{\"response\":\"Una foto di prova.\",\"done\":true}");
        })))
        {
            Check((await installed.CheckAsync("vision:test")).Available, "Installed vision model disabled");
            for (int i = 0; i < 2; i++)
                Check(await installed.DescribeAsync("vision:test", $"image-{i}", true, CancellationToken.None) == "Una foto di prova.", "Description lost");
        }
        Check(images == 2, "Missing image inference");
        string directory = Path.Combine(Path.GetTempPath(), "pdfmb-markdown-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            string path = Path.Combine(directory, "nomefile.pdf.md"), text = "# Caffè\n\nUna città e una foto.\n";
            await MarkdownFile.WriteAsync(path, text, new FileStamp(false, null));
            var loaded = await MarkdownFile.ReadAsync(path); Check(loaded.Text == text, "Markdown UTF-8 roundtrip failed");
            await File.WriteAllTextAsync(path, "Modifica esterna");
            bool conflict = false;
            try { await MarkdownFile.WriteAsync(path, "Sovrascrittura", loaded.Stamp); }
            catch (FileChangedException) { conflict = true; }
            Check(conflict && await File.ReadAllTextAsync(path) == "Modifica esterna", "External edits were overwritten");
            Check(Directory.GetFiles(directory, ".pdfmb-*.tmp").Length == 0, "Atomic save left a temporary file");
        }
        finally { foreach (string file in Directory.GetFiles(directory)) File.Delete(file); Directory.Delete(directory); }
        Console.WriteLine("Markdown: UTF-8 sidecar, atomic conflicts, offline/absent/nonvisual/cloud OCR disabled, one image per request: OK");
    }
}
