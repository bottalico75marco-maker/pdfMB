using System.Text;
using System.Text.Json;
using PdfMB.Desktop.Services;

namespace PdfMB.Desktop;

internal sealed partial class MainForm
{
    private readonly ToolStripButton _markdownButton = new("Confronta Markdown") { ToolTipText = "Converti PDF in Markdown e confronta affiancati" };
    private readonly ToolStripButton _ocrButton = new("OCR e descrivi foto") { ToolTipText = "OCR disattivato: Ollama e modello visivo locale da verificare" };
    private readonly OllamaOcr _ocr = new();
    private readonly System.Windows.Forms.Timer _ocrTimer = new() { Interval = 15000 };
    private bool _ocrAvailable, _ocrChecking, _markdownConverting, _markdownDirty, _markdownEditing;
    private string _markdownModel = "qwen3-vl:2b-instruct";
    private string? _markdownToken, _markdownPath;
    private FileStamp _markdownStamp = new(false, null);
    private CancellationTokenSource? _markdownCancellation;

    private void InitializeMarkdown()
    {
        _markdownButton.Click += async (_, _) => await RunHostAsync(OpenMarkdownCoreAsync);
        _ocrButton.Click += async (_, _) =>
        {
            await RunHostAsync(OpenMarkdownCoreAsync);
            await ConvertMarkdownAsync(true);
        };
        _ocrTimer.Tick += async (_, _) => { if (_initialized && !_markdownConverting) await CheckOcrAsync(_markdownModel); };
        _ocrTimer.Start();
        Disposed += (_, _) => { _ocrTimer.Dispose(); _markdownCancellation?.Cancel(); _ocr.Dispose(); };
    }

    private async Task CheckOcrAsync(string model)
    {
        _markdownModel = model;
        if (_ocrChecking || _markdownConverting || _bridge is null || IsDisposed) return;
        _ocrChecking = true;
        _ocrAvailable = false; UpdateControls();
        try
        {
            var result = await _ocr.CheckAsync(model);
            if (IsDisposed || model != _markdownModel) return;
            _ocrAvailable = result.Available;
            _ocrButton.ToolTipText = result.Message;
            await _bridge.RequestAsync("markdown.availability", new { available = result.Available, message = result.Message });
        }
        catch (Exception ex) when (ex is InvalidOperationException or TimeoutException or TaskCanceledException)
        { _ocrAvailable = false; }
        finally
        {
            _ocrChecking = false; UpdateControls();
            if (!IsDisposed && model != _markdownModel) await CheckOcrAsync(_markdownModel);
        }
    }

    private async Task OpenMarkdownCoreAsync()
    {
        if (_document is null || _token is null) return;
        string text = "";
        if (_markdownToken != _token)
        {
            _markdownPath = _untitled ? null : _document.Path + ".md";
            var existing = _markdownPath is null ? (Text: "", Stamp: new FileStamp(false, null)) : await MarkdownFile.ReadAsync(_markdownPath);
            text = existing.Text; _markdownStamp = existing.Stamp; _markdownToken = _token;
        }
        ReadEditorState(await _bridge!.RequestAsync("markdown.open", new { token = _token, text, path = _markdownPath ?? "" }));
    }

    private async Task ConvertMarkdownAsync(bool vision)
    {
        if (IsBusy || _document is null || _token is null || !_canCopy) return;
        bool prepared = false;
        int pdfRevision = 0;
        await RunHostAsync(async () =>
        {
            await OpenMarkdownCoreAsync();
            var current = await _bridge!.RequestAsync("markdown.export");
            if (!string.IsNullOrEmpty(current.GetProperty("text").GetString()) &&
                MessageBox.Show(this, "Riconvertire il PDF sostituendo il testo Markdown corrente? Le modifiche non salvate al Markdown verranno scartate.",
                    "Riconverti Markdown", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            if (vision)
            {
                var available = await _ocr.CheckAsync(_markdownModel);
                _ocrAvailable = available.Available;
                await _bridge.RequestAsync("markdown.availability", new { available = available.Available, message = available.Message });
                if (!available.Available) { _status.Text = available.Message; return; }
            }
            var state = await _bridge.RequestAsync("editor.lock");
            pdfRevision = state.GetProperty("revision").GetInt32();
            _markdownConverting = prepared = true;
        });
        if (!prepared) return;
        using var cancellation = new CancellationTokenSource();
        _markdownCancellation = cancellation;
        bool complete = false;
        string message = "Conversione interrotta. Il risultato parziale può essere modificato e salvato.";
        try
        {
            var started = await _bridge!.RequestAsync("markdown.begin", new { pdfRevision });
            int pageCount = started.GetProperty("pageCount").GetInt32();
            int images = 0;
            for (int pageIndex = 0; pageIndex < pageCount; pageIndex++)
            {
                cancellation.Token.ThrowIfCancellationRequested();
                var page = await _bridge.RequestAsync("markdown.page", new { token = _token, revision = pdfRevision, pageIndex });
                int imageCount = page.GetProperty("imageCount").GetInt32();
                string markdown = vision && imageCount > 0 && !page.GetProperty("hasText").GetBoolean() ? "" : page.GetProperty("markdown").GetString()!;
                await _bridge.RequestAsync("markdown.append", new { page = pageIndex + 1, pageCount, markdown });
                // Each bitmap is extracted only when needed and disposed before moving to the next one.
                // No page screenshot, image batch or parallel inference is sent to Ollama.
                for (int imageIndex = 0; imageIndex < imageCount; imageIndex++)
                {
                    cancellation.Token.ThrowIfCancellationRequested();
                    if (!vision)
                    {
                        await _bridge.RequestAsync("markdown.image", new { index = imageIndex, description = "> Descrizione da completare: usare OCR e descrivi foto oppure scrivere una descrizione manuale." });
                        continue;
                    }
                    _status.Text = $"OCR · pagina {pageIndex + 1}/{pageCount} · immagine {imageIndex + 1}/{imageCount}…";
                    await _bridge.RequestAsync("markdown.progress", new { message = _status.Text });
                    var image = await _bridge.RequestAsync("markdown.page", new { token = _token, revision = pdfRevision, pageIndex, imageIndex });
                    string description = await _ocr.DescribeAsync(_markdownModel, image.GetProperty("base64").GetString()!,
                        page.GetProperty("hasText").GetBoolean(), cancellation.Token);
                    cancellation.Token.ThrowIfCancellationRequested();
                    await _bridge.RequestAsync("markdown.image", new { index = imageIndex, description }); images++;
                }
                var progress = await _bridge.RequestAsync("markdown.export");
                if (Encoding.UTF8.GetByteCount(progress.GetProperty("text").GetString()!) > MarkdownFile.MaximumBytes)
                    throw new InvalidDataException("Il Markdown supera 8 MB. Salvare il risultato parziale e convertire un intervallo più piccolo.");
            }
            complete = true;
            message = vision ? $"Conversione completata · {images} immagini elaborate singolarmente. Verifica la trascrizione prima di condividere." :
                "Testo convertito. Le immagini rilevate hanno uno spazio per la descrizione; usare OCR e descrivi foto per completarle automaticamente.";
        }
        catch (OperationCanceledException)
        { message = cancellation.IsCancellationRequested ? message : "Tempo massimo OCR superato. Il risultato parziale è disponibile."; }
        catch (Exception ex)
        { message = $"Conversione incompleta: {ex.Message} Il risultato parziale può essere salvato."; }
        finally
        {
            _markdownCancellation = null;
            try { if (!IsDisposed) ReadEditorState(await _bridge!.RequestAsync("markdown.finish", new { message })); }
            finally { _markdownConverting = false; UpdateControls(); }
        }
        _status.Text = message;
        if (complete) await RunHostAsync(async () => { await SaveMarkdownCoreAsync(false); });
        else await CheckOcrAsync(_markdownModel);
    }

    private async Task<bool> SaveMarkdownCoreAsync(bool saveAs)
    {
        if (_document is null || _markdownToken != _token) return true;
        var exported = await _bridge!.RequestAsync("markdown.export");
        if (exported.GetProperty("token").GetString() != _token) throw new InvalidOperationException("Il documento Markdown è cambiato.");
        string text = exported.GetProperty("text").GetString()!;
        string? destination = _markdownPath;
        if (saveAs || destination is null)
        {
            using var dialog = new SaveFileDialog
            {
                Filter = "Documento Markdown (*.md)|*.md", DefaultExt = "md", AddExtension = true, OverwritePrompt = true,
                FileName = destination is null ? _document.Name + ".md" : Path.GetFileName(destination), Title = "Salva Markdown"
            };
            if (dialog.ShowDialog(this) != DialogResult.OK) return false;
            destination = Path.GetFullPath(dialog.FileName);
        }
        FileStamp expected = SamePath(destination, _markdownPath) ? _markdownStamp : await PdfFile.GetStampAsync(destination);
        try { await MarkdownFile.WriteAsync(destination, text, expected); }
        catch (FileChangedException ex)
        {
            MessageBox.Show(this, ex.Message, "Markdown modificato esternamente", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return false;
        }
        _markdownPath = destination;
        _markdownStamp = new FileStamp(true, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(text))));
        ReadEditorState(await _bridge.RequestAsync("markdown.saved", new { revision = exported.GetProperty("revision").GetInt32(), path = destination }));
        _status.Text = $"Markdown salvato: {Path.GetFileName(destination)}";
        return true;
    }

    private async Task<bool> ConfirmMarkdownUnsavedAsync() => UnsavedChangesDialog.Show(this,
        Path.GetFileName(_markdownPath ?? (_document!.Name + ".md"))) switch
    {
        DialogResult.Yes => await SaveMarkdownCoreAsync(false),
        DialogResult.No => true,
        _ => false
    };
}
