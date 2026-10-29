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
        foreach (string detail in new[] { "{\"capabilities\":[\"completion\"]}", "{\"capabilities\":[\"vision\"],\"remote_model\":\"cloud\"}", "{\"capabilities\":[\"vision\"],\"remote_host\":\"https://ollama.com\"}" })
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
            var availability = await installed.CheckAsync("vision:test");
            Check(availability.Available && availability.Models.SequenceEqual(["vision:test"]), "Installed model missing from availability or selection");
            for (int i = 0; i < 2; i++)
                Check(await installed.DescribeAsync("vision:test", $"image-{i}", true, CancellationToken.None) == "Una foto di prova.", "Description lost");
        }
        Check(images == 2, "Missing image inference");
        foreach (string malformed in new[] { "{}", "{\"models\":null}", "{\"models\":[{\"name\":4}]}" })
        {
            using var invalid = new OllamaOcr(new Handler(_ => Task.FromResult(Json(malformed))));
            Check(!(await invalid.CheckAsync("vision:test")).Available, "Malformed model list enabled OCR");
        }
        using (var truncated = new OllamaOcr(new Handler(_ => Task.FromResult(Json("{\"response\":\"Trascrizione parziale\",\"done_reason\":\"length\"}")))))
            Check((await truncated.DescribeAsync("vision:test", "image", false, CancellationToken.None)).Contains("limite di lunghezza"), "Truncated OCR was not reported");
        using (var empty = new OllamaOcr(new Handler(_ => Task.FromResult(Json("{}")))))
        {
            bool rejected = false;
            try { await empty.DescribeAsync("vision:test", "image", false, CancellationToken.None); }
            catch (InvalidDataException) { rejected = true; }
            Check(rejected, "Malformed inference response accepted");
        }
        using (var cancelled = new OllamaOcr(new Handler(_ => throw new OperationCanceledException())))
        {
            bool interrupted = false;
            try { await cancelled.DescribeAsync("vision:test", "image", false, CancellationToken.None); }
            catch (OperationCanceledException) { interrupted = true; }
            Check(interrupted, "Inference cancellation was swallowed");
        }
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
            bool tooLarge = false;
            try { await MarkdownFile.WriteAsync(Path.Combine(directory, "oversize.md"), new string('è', MarkdownFile.MaximumBytes / 2 + 1), new FileStamp(false, null)); }
            catch (InvalidDataException) { tooLarge = true; }
            Check(tooLarge && !File.Exists(Path.Combine(directory, "oversize.md")), "UTF-8 size limit did not reject before writing");
        }
        finally { foreach (string file in Directory.GetFiles(directory)) File.Delete(file); Directory.Delete(directory); }
        Console.WriteLine("Markdown: UTF-8 sidecar/size limit, atomic conflicts, model discovery, offline/nonvisual/cloud OCR disabled, cancellation, one image per request: OK");
        if (Environment.GetEnvironmentVariable("PDFMB_OLLAMA_MODEL") is { Length: > 0 } liveModel)
        {
            using var live = new OllamaOcr();
            var availability = await live.CheckAsync(liveModel);
            Check(availability.Available, availability.Message);
            using var bitmap = new Bitmap(640, 160);
            using (var graphics = Graphics.FromImage(bitmap))
            using (var font = new Font("Arial", 32, FontStyle.Bold))
            {
                graphics.Clear(Color.White);
                graphics.DrawString("PDF MB TEST 123", font, Brushes.Black, 20, 50);
            }
            using var image = new MemoryStream();
            bitmap.Save(image, System.Drawing.Imaging.ImageFormat.Png);
            string description = await live.DescribeAsync(liveModel, Convert.ToBase64String(image.ToArray()), false, CancellationToken.None);
            Check(description.Contains("123") && description.Contains("PDF", StringComparison.OrdinalIgnoreCase), "Live model did not transcribe the synthetic image: " + description);
            Console.WriteLine($"Live Ollama ({liveModel}): synthetic image transcription OK · {description}");
        }
    }
}
