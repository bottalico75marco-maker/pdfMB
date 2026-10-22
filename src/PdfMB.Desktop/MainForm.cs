using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using PdfMB.Desktop.Bridge;
using PdfMB.Desktop.Services;

namespace PdfMB.Desktop;

internal sealed class MainForm : Form
{
    private static readonly string AppTitle = $"PDF MB {Application.ProductVersion.Split('+')[0]}";
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly ToolStripButton _open = new("Apri PDF") { ToolTipText = "Apri documento (Ctrl+O)" };
    private readonly ToolStripButton _new = new("Nuovo") { ToolTipText = "Nuovo documento vuoto (Ctrl+N)" };
    private readonly ToolStripButton _save = new("Salva") { ToolTipText = "Salva (Ctrl+S)" };
    private readonly ToolStripButton _saveAs = new("Salva con nome…") { ToolTipText = "Salva con nome (Ctrl+Maiusc+S)" };
    private readonly ToolStripButton _protect = new("Proteggi con password") { ToolTipText = "Proteggi il PDF con password", Overflow = ToolStripItemOverflow.Never };
    private readonly ToolStripMenuItem _protectMenu = new("Proteggi con password…") { Tag = "protect" };
    private readonly Image _protectIcon;
    private readonly Image _unprotectIcon = CommandIcons.Create("unprotect");
    private bool _passwordProtected;
    private readonly ToolStripButton _manage = new("Gestisci pagine") { ToolTipText = "Mostra o nascondi Gestisci pagine" };
    private readonly ToolStripButton _highlight = new("Evidenziatore") { ToolTipText = "Attiva il pennarello sul testo del PDF (Esc per uscire)", Overflow = ToolStripItemOverflow.Never };
    private readonly ToolStripComboBox _highlightColor = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList, AutoSize = false, Width = 94,
        ToolTipText = "Colore evidenziatore", AccessibleName = "Colore evidenziatore", Overflow = ToolStripItemOverflow.Never
    };
    private static readonly string[] HighlightColors = ["#ffff00", "#92e897", "#86d6ff", "#ffabc8", "#ffc078"];
    private readonly ToolStripButton _text = new("Testo") { ToolTipText = "Modifica le caselle di testo direttamente sulla pagina" };
    private readonly ToolStripDropDownButton _tools = new("Strumenti");
    private readonly ToolStripButton _print = new("Stampa…");
    private readonly ToolStripButton _forms = new("Progetta modulo") { ToolTipText = "Progetta modulo", AccessibleName = "Progetta modulo", DisplayStyle = ToolStripItemDisplayStyle.ImageAndText, Overflow = ToolStripItemOverflow.Never };
    private ToolStrip _mainToolbar = null!;
    private bool _formMode, _canFormDesign;
    private bool _untitled;
    private bool _canContent, _canPrint;
    private readonly ToolStripButton _undo = new("Annulla") { ToolTipText = "Annulla (Ctrl+Z)" };
    private readonly ToolStripButton _redo = new("Ripeti") { ToolTipText = "Ripeti (Ctrl+Y)" };
    private readonly ToolStripButton _close = new("Chiudi documento");
    private readonly ToolStripDropDownButton _recent = new("Recenti");
    private readonly ToolStripDropDownButton _help = new("Aiuto") { Alignment = ToolStripItemAlignment.Right, Overflow = ToolStripItemOverflow.Never };
    private readonly ToolStripStatusLabel _status = new("Avvio del visualizzatore…") { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    private readonly ToolStripStatusLabel _pages = new();
    private bool? _captionModified;
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly string[] _args;
    private readonly string _dataDirectory;
    private readonly RecentFiles _recentFiles;
    private readonly StampLibrary _stampLibrary;
    private ViewerBridge? _bridge;
    private PdfFile? _document;
    private string? _openedPath, _token;
    private bool _hostBusy = true, _editorBusy, _viewerFaulted, _initialized, _closeApproved;
    private bool _dirty, _readOnly, _canEdit, _canText, _textEditing, _canUndo, _canRedo;
    private bool IsBusy => _hostBusy || _editorBusy || _viewerFaulted;

    public MainForm(string[] args)
    {
        AppIcon.Apply(this);
        _args = args;
        _dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PdfMB");
        _recentFiles = new RecentFiles(_dataDirectory);
        _stampLibrary = new StampLibrary(Path.Combine(_dataDirectory, "Stamps"));
        _recentFiles.Load();
        Text = AppTitle;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1400, 860);
        MinimumSize = new Size(960, 600);
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(246, 248, 251);
        var toolbar = new ToolStrip
        {
            GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(12, 8, 12, 8),
            BackColor = Color.White, Renderer = new ToolStripProfessionalRenderer()
        };
        _mainToolbar = toolbar;
        toolbar.Items.AddRange([new ToolStripLabel(AppTitle) { Font = new Font("Segoe UI", 12, FontStyle.Bold) },
            new ToolStripSeparator(), _new, _open, _recent, _save, _protect, _saveAs, new ToolStripSeparator(),
            _manage, _text, _forms, _highlight, _highlightColor, _tools, _print, _undo, _redo, new ToolStripSeparator(), _close, _help]);
        var statusBar = new StatusStrip { BackColor = Color.White, SizingGrip = false };
        statusBar.Items.AddRange([_status, _pages]);
        Controls.Add(_webView);
        Controls.Add(toolbar);
        Controls.Add(statusBar);
        RegisterFileDrop(this);
        _open.Click += async (_, _) => await OpenDialogAsync();
        _new.Click += async (_, _) => await RunHostAsync(NewDocumentCoreAsync);
        _save.Click += async (_, _) => await RunHostAsync(async () => { await SaveCoreAsync(false); });
        _saveAs.Click += async (_, _) => await RunHostAsync(async () => { await SaveCoreAsync(true); });
        _protect.Click += async (_, _) => await RunHostAsync(ProtectCoreAsync);
        _manage.Click += async (_, _) => await EditorCommandAsync("editor.toggle");
        _highlightColor.Items.AddRange(["Giallo", "Verde", "Azzurro", "Rosa", "Arancione"]);
        _highlightColor.SelectedIndex = 0;
        _highlightColor.SelectedIndexChanged += async (_, _) => await RunHostAsync(async () =>
        {
            int index = _highlightColor.SelectedIndex;
            if (_document is not null && index >= 0)
                ReadEditorState(await _bridge!.RequestAsync("editor.highlightColor", new { color = HighlightColors[index] }));
        });
        _highlight.Click += async (_, _) => await EditorCommandAsync("editor.highlight");
        _text.Click += async (_, _) => await EditorCommandAsync("editor.text");
        foreach (var tool in new (string Name, string Mode)[] { ("Nota adesiva", "note"), ("Rettangolo", "square"), ("Ellisse", "circle"), ("Linea", "line"), ("Penna", "ink"), ("Timbri", "stamp"), ("Immagine", "image"), ("Modifica testo e oggetti", "objects"), ("Oscuramento effettivo", "redact") })
        {
            var item = new ToolStripMenuItem(tool.Name) { Tag = tool.Mode };
            item.Click += async (_, _) => await RunHostAsync(async () =>
            {
                if (_document is not null) ReadEditorState(await _bridge!.RequestAsync("editor.tools", new { mode = (string)item.Tag! }));
            });
            _tools.DropDownItems.Add(item);
        }
        _forms.Click += async (_, _) => await EditorCommandAsync("editor.forms");
        _protectMenu.Click += async (_, _) => await RunHostAsync(ProtectCoreAsync);
        _tools.DropDownItems.Add(_protectMenu);
        _print.Click += async (_, _) => await RunHostAsync(PrintCoreAsync);
        _undo.Click += async (_, _) => await EditorCommandAsync("editor.undo");
        _redo.Click += async (_, _) => await EditorCommandAsync("editor.redo");
        _close.Click += async (_, _) => await RunHostAsync(CloseDocumentCoreAsync);
        _recent.DropDownOpening += (_, _) => PopulateRecentFiles();
        var guide = new ToolStripMenuItem("Guida Windows") { ShortcutKeyDisplayString = "F1" };
        guide.Click += (_, _) => OpenWindowsGuide();
        _help.DropDownItems.Add(guide);
        var defaultPdf = new ToolStripMenuItem("Imposta come lettore PDF predefinito…");
        defaultPdf.Click += (_, _) =>
        {
            try { PdfAssociation.OpenDefaultSettings(); }
            catch (Exception ex) { ShowError(ex); }
        };
        _help.DropDownItems.Add(defaultPdf);
        Shown += async (_, _) => await StartAsync();
        FormClosing += OnFormClosing;
        FormClosed += (_, _) => _bridge?.Dispose();
        CommandIcons.ConfigureStrip(_mainToolbar);
        _protectIcon = _protect.Image!;
        Disposed += (_, _) => _unprotectIcon.Dispose();
        UpdateControls();
    }

    private async Task StartAsync()
    {
        try
        {
            try { PdfAssociation.Register(); }
            catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
            { /* Restricted Windows profiles can still open PDFs from the app. */ }
            string webDirectory = Path.Combine(AppContext.BaseDirectory, "Web");
            if (!File.Exists(Path.Combine(webDirectory, "vendor", "pdfium-api.js")))
                throw new FileNotFoundException("Asset EmbedPDF mancanti. Eseguire npm ci e npm run assets, poi ricompilare.");
            Directory.CreateDirectory(_dataDirectory);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(_dataDirectory, "WebView2"));
            await _webView.EnsureCoreWebView2Async(environment);
            var core = _webView.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsWebMessageEnabled = true;
            core.SetVirtualHostNameToFolderMapping("pdfmb.example", webDirectory, CoreWebView2HostResourceAccessKind.Deny);
            core.NavigationStarting += (_, e) => { if (e.Uri != ViewerBridge.Origin + "/index.html") e.Cancel = true; };
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.DownloadStarting += (_, e) => e.Cancel = true;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.ProcessFailed += (_, e) => FaultViewer($"Processo WebView2 terminato: {e.ProcessFailedKind}");
            _bridge = new ViewerBridge(core);
            _bridge.Attach();
            _bridge.EventReceived += OnViewerEvent;
            _bridge.FileDropped += async path => await OpenDroppedPdfAsync(path);
            core.Navigate(ViewerBridge.Origin + "/index.html");
            await _ready.Task.WaitAsync(TimeSpan.FromSeconds(45));
            await _bridge.RequestAsync("stamps.set", new { items = _stampLibrary.List() });
            _initialized = true;
            _hostBusy = false;
            _status.Text = "Pronto · Apri un documento PDF";
            UpdateControls();
            if (_args.Length == 1) await RunHostAsync(() => OpenPathCoreAsync(_args[0]));
        }
        catch (Exception ex)
        {
            _status.Text = "Avvio non riuscito";
            MessageBox.Show(this, ex.Message + "\n\nÈ richiesto Microsoft Edge WebView2 Runtime.", "PDF MB", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async void OnViewerEvent(string type, JsonElement payload)
    {
        try
        {
            switch (type)
            {
                case "viewer.ready": _ready.TrySetResult(); break;
                case "viewer.error":
                    var error = new InvalidOperationException(payload.GetProperty("message").GetString());
                    if (!_initialized) _ready.TrySetException(error); else ShowError(error);
                    break;
                case "editor.state": ReadEditorState(payload); break;
                case "host.open": await OpenDialogAsync(); break;
                case "host.new": await RunHostAsync(NewDocumentCoreAsync); break;
                case "host.insertBlank": await RunHostAsync(InsertBlankPageCoreAsync); break;
                case "host.save": await RunHostAsync(async () => { await SaveCoreAsync(false); }); break;
                case "host.saveAs": await RunHostAsync(async () => { await SaveCoreAsync(true); }); break;
                case "host.protect": await RunHostAsync(ProtectCoreAsync); break;
                case "host.formEmail": await RunHostAsync(() => FormEmailCoreAsync(payload)); break;
                case "host.insert": await RunHostAsync(InsertPagesCoreAsync); break;
                case "host.guide": OpenWindowsGuide(); break;
                case "host.print": await RunHostAsync(PrintCoreAsync); break;
                case "host.stampImport":
                    try
                    {
                        string id = _stampLibrary.Import(payload.GetProperty("name").GetString()!, payload.GetProperty("base64").GetString()!);
                        await _bridge!.RequestAsync("stamps.set", new { items = _stampLibrary.List(), selectedId = id });
                    }
                    catch (Exception ex)
                    {
                        await _bridge!.RequestAsync("stamps.error", new { message = ex.Message });
                    }
                    break;
                case "host.extract": await RunHostAsync(ExtractPagesCoreAsync); break;
                case "viewer.state":
                    int count = payload.GetProperty("pageCount").GetInt32();
                    _pages.Text = count == 0 ? "" : $"Pagina {payload.GetProperty("page").GetInt32()} / {count}   ·   " +
                        $"{payload.GetProperty("zoom").GetDouble():P0}   ·   " +
                        $"{payload.GetProperty("widthMm").GetInt32()} × {payload.GetProperty("heightMm").GetInt32()} mm";
                    break;
            }
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private void ReadEditorState(JsonElement state, bool acceptNew = false)
    {
        string? token = state.GetProperty("token").GetString();
        if (!acceptNew && token != _token) return;
        _token = token;
        _dirty = state.GetProperty("dirty").GetBoolean();
        _readOnly = state.GetProperty("readOnly").GetBoolean();
        _canEdit = state.GetProperty("canEdit").GetBoolean();
        _passwordProtected = state.TryGetProperty("passwordProtected", out var passwordProtected) && passwordProtected.GetBoolean();
        _canText = state.GetProperty("canText").GetBoolean();
        _canContent = state.TryGetProperty("canContent", out var content) && content.GetBoolean();
        _canPrint = state.TryGetProperty("canPrint", out var print) && print.GetBoolean();
        _formMode = state.TryGetProperty("formMode", out var formMode) && formMode.GetBoolean();
        _canFormDesign = state.TryGetProperty("canFormDesign", out var canForm) && canForm.GetBoolean();
        _textEditing = state.GetProperty("textEditing").GetBoolean();
        _text.Checked = state.GetProperty("textMode").GetBoolean();
        _highlight.Checked = state.GetProperty("highlightMode").GetBoolean();
        _canUndo = state.GetProperty("canUndo").GetBoolean();
        _canRedo = state.GetProperty("canRedo").GetBoolean();
        _editorBusy = state.GetProperty("busy").GetBoolean();
        _manage.Checked = state.GetProperty("editorOpen").GetBoolean();
        string reason = state.GetProperty("blockedReason").GetString() ?? "";
        if (reason.Length > 0 && _document is not null) _status.Text = reason;
        UpdateControls();
    }

    private void UpdateControls()
    {
        if (IsDisposed) return;
        bool available = !IsBusy && _initialized;
        bool hasDocument = available && _document is not null;
        _new.Enabled = _open.Enabled = _recent.Enabled = available;
        _save.Enabled = hasDocument && !_readOnly && _dirty;
        _protect.Enabled = hasDocument && _canEdit;
        string protectionAction = _passwordProtected ? "Rimuovi password" : "Proteggi con password";
        _protect.Text = _protect.ToolTipText = _protect.AccessibleName = protectionAction;
        _protect.Image = _passwordProtected ? _unprotectIcon : _protectIcon;
        _protectMenu.Text = protectionAction + (_passwordProtected ? "" : "…");
        _protectMenu.ToolTipText = _protectMenu.AccessibleName = protectionAction;
        _protectMenu.Image = _protect.Image;
        _saveAs.Enabled = _manage.Enabled = _close.Enabled = hasDocument;
        _saveAs.Text = _readOnly ? "Salva copia…" : "Salva con nome…";
        _saveAs.ToolTipText = _saveAs.AccessibleName = _saveAs.Text;
        _undo.Enabled = hasDocument && _canUndo;
        _forms.Enabled = hasDocument && _canFormDesign;
        _mainToolbar.Visible = !_formMode;
        _text.Enabled = hasDocument && _canText;
        _print.Enabled = hasDocument && _canPrint;
        _tools.Enabled = hasDocument && (_canText || _canContent || _canEdit);
        foreach (ToolStripMenuItem item in _tools.DropDownItems)
            item.Enabled = (string)item.Tag! switch { "objects" or "redact" or "image" => _canContent, "protect" => _canEdit, _ => _canText };
        _highlight.Enabled = _highlightColor.Enabled = hasDocument && _canText;
        _text.ToolTipText = _canText ? "Modifica le caselle di testo direttamente sulla pagina" : "Testo non disponibile: controllare i permessi del documento";
        _redo.Enabled = hasDocument && _canRedo;
        Text = _document is null ? AppTitle : $"{(_dirty ? "* " : "")}{_document.Name} — {AppTitle}";
        ApplyCaptionColor();
        UseWaitCursor = _hostBusy || _editorBusy;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        _captionModified = null;
        ApplyCaptionColor();
    }

    private void ApplyCaptionColor()
    {
        if (!IsHandleCreated || _captionModified == _dirty) return;
        WindowCaption.SetModifiedColor(Handle, _dirty);
        _captionModified = _dirty;
    }

    private async Task RunHostAsync(Func<Task> action)
    {
        if (IsBusy || !_initialized) return;
        _hostBusy = true;
        UpdateControls();
        try
        {
            ReadEditorState(await _bridge!.RequestAsync("editor.lock"));
            await action();
        }
        catch (Exception ex) { ShowError(ex); }
        finally
        {
            if (!_viewerFaulted && !IsDisposed)
            {
                try { ReadEditorState(await _bridge!.RequestAsync("editor.unlock")); }
                catch (Exception ex) { FaultViewer(ex.Message); }
            }
            _hostBusy = false;
            UpdateControls();
        }
    }

    private void OpenWindowsGuide()
    {
        try
        {
            string path = Path.Combine(AppContext.BaseDirectory, "GUIDA-WINDOWS.html");
            if (!File.Exists(path)) throw new FileNotFoundException("Guida non trovata. Estrarre tutta la cartella di PDF MB, compreso GUIDA-WINDOWS.html.", path);
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private Task EditorCommandAsync(string command) => RunHostAsync(async () =>
    {
        if (_document is not null) ReadEditorState(await _bridge!.RequestAsync(command));
    });

    private async Task PrintCoreAsync()
    {
        if (_document is null || !_canPrint) return;
        var result = await _bridge!.RequestAsync("output.print");
        if (result.GetProperty("token").GetString() != _token) throw new InvalidOperationException("Il documento è cambiato.");
        using var preview = new PrintPreviewForm(result.GetProperty("pages"), Path.Combine(_dataDirectory, "WebView2"));
        preview.ShowDialog(this);
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (_formMode && (keyData == (Keys.Control | Keys.O) || keyData == (Keys.Control | Keys.P) || keyData == (Keys.Control | Keys.N))) return true;
        if (keyData == Keys.F1) { OpenWindowsGuide(); return true; }
        if (keyData == (Keys.Control | Keys.P)) { _ = RunHostAsync(PrintCoreAsync); return true; }
        // The text field keeps its own clipboard and local undo/redo shortcuts.
        if (_textEditing) return base.ProcessCmdKey(ref msg, keyData);
        switch (keyData)
        {
            case Keys.Control | Keys.N: _ = RunHostAsync(NewDocumentCoreAsync); return true;
            case Keys.Control | Keys.O: _ = OpenDialogAsync(); return true;
            case Keys.Control | Keys.S: _ = RunHostAsync(async () => { await SaveCoreAsync(false); }); return true;
            case Keys.Control | Keys.Shift | Keys.S: _ = RunHostAsync(async () => { await SaveCoreAsync(true); }); return true;
            case Keys.Control | Keys.Z: _ = EditorCommandAsync("editor.undo"); return true;
            case Keys.Control | Keys.Y: _ = EditorCommandAsync("editor.redo"); return true;
            default: return base.ProcessCmdKey(ref msg, keyData);
        }
    }

    private Task OpenDialogAsync() => RunHostAsync(async () =>
    {
        using var dialog = new OpenFileDialog { Filter = "Documento PDF (*.pdf)|*.pdf", Title = "Apri PDF", CheckFileExists = true };
        if (dialog.ShowDialog(this) == DialogResult.OK) await OpenPathCoreAsync(dialog.FileName);
    });

    private void RegisterFileDrop(Control control)
    {
        // The embedded browser receives File objects through its DOM drop
        // events. The remaining WinForms controls use Windows file drops.
        if (control == _webView) return;
        control.AllowDrop = true;
        control.DragEnter += OnFileDrag;
        control.DragOver += OnFileDrag;
        control.DragDrop += async (_, e) =>
        {
            if (PdfDropFiles.GetPath(e.Data) is string path) await OpenDroppedPdfAsync(path);
        };
        foreach (Control child in control.Controls) RegisterFileDrop(child);
    }

    private void OnFileDrag(object? sender, DragEventArgs e)
    {
        e.Effect = !IsBusy && _initialized && (e.AllowedEffect & DragDropEffects.Copy) != 0 && PdfDropFiles.GetPath(e.Data) is not null
            ? DragDropEffects.Copy : DragDropEffects.None;
    }

    private Task OpenDroppedPdfAsync(string path)
    {
        if (!string.Equals(Path.GetExtension(path), ".pdf", StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
            return Task.CompletedTask;
        return RunHostAsync(() => OpenPathCoreAsync(path));
    }

    private async Task OpenPathCoreAsync(string path)
    {
        if (!await ConfirmUnsavedAsync()) return;
        // Read after a possible save: reopening the same path must see the
        // newly saved bytes rather than a snapshot from before the dialog.
        var candidate = await PdfFile.ReadAsync(path);
        _status.Text = "Apertura e controllo documento…";
        JsonElement state;
        string password = "";
        while (true)
        {
            try { state = await _bridge!.RequestAsync("document.open", new { name = candidate.Name, base64 = Convert.ToBase64String(candidate.Bytes), password }); break; }
            catch (InvalidOperationException ex) when (ex.Message.Contains("[PASSWORD]", StringComparison.Ordinal))
            {
                using var prompt = new PasswordDialog(create: false, ex.Message.Replace("[PASSWORD] ", ""));
                if (prompt.ShowDialog(this) != DialogResult.OK) return;
                password = prompt.Password;
            }
        }
        _document = candidate;
        _untitled = false;
        _openedPath = candidate.Path;
        _status.Text = candidate.Name;
        ReadEditorState(state, acceptNew: true);
        _recentFiles.Add(candidate.Path);
    }

    private async Task NewDocumentCoreAsync()
    {
        using var options = new BlankPageDialog(insert: false);
        if (options.ShowDialog(this) != DialogResult.OK || !await ConfirmUnsavedAsync()) return;
        var result = await _bridge!.RequestAsync("document.create", new { format = options.PaperFormat, landscape = options.Landscape });
        byte[] bytes = Convert.FromBase64String(result.GetProperty("base64").GetString()!);
        PdfFile.Validate(bytes);
        _document = new PdfFile("Nuovo documento.pdf", bytes);
        _openedPath = null;
        _untitled = true;
        _status.Text = $"Nuovo documento {options.PaperFormat} · da salvare";
        ReadEditorState(result.GetProperty("state"), acceptNew: true);
    }

    private async Task InsertBlankPageCoreAsync()
    {
        if (_document is null || !_canEdit) return;
        var state = await _bridge!.RequestAsync("editor.blankOptions");
        if (state.GetProperty("token").GetString() != _token) throw new InvalidOperationException("Il documento è cambiato.");
        using var options = new BlankPageDialog(insert: true, state.GetProperty("pageCount").GetInt32(), state.GetProperty("page").GetInt32());
        if (options.ShowDialog(this) != DialogResult.OK) return;
        ReadEditorState(await _bridge.RequestAsync("editor.insertBlank", new { token = _token, format = options.PaperFormat, landscape = options.Landscape, position = options.Position }));
        _status.Text = $"Inserita pagina vuota {options.PaperFormat} alla posizione {options.Position}";
    }

    private async Task InsertPagesCoreAsync()
    {
        if (_document is null || !_canEdit) return;
        using var picker = new OpenFileDialog
        {
            Filter = "Documento PDF (*.pdf)|*.pdf", Title = "Scegli il PDF da cui inserire le pagine", CheckFileExists = true
        };
        if (picker.ShowDialog(this) != DialogResult.OK) return;
        var source = await PdfFile.ReadAsync(picker.FileName);
        _status.Text = "Controllo PDF di origine…";
        string? importToken = null;
        try
        {
            var prepared = await _bridge!.RequestAsync("editor.prepareInsert", new
            {
                token = _token, name = source.Name, base64 = Convert.ToBase64String(source.Bytes)
            });
            if (prepared.GetProperty("documentToken").GetString() != _token)
                throw new InvalidOperationException("Il documento di destinazione è cambiato.");
            importToken = prepared.GetProperty("importToken").GetString();
            using var options = new InsertPagesDialog(source.Name,
                prepared.GetProperty("sourcePages").GetInt32(), prepared.GetProperty("destinationPages").GetInt32(),
                prepared.GetProperty("position").GetInt32());
            if (options.ShowDialog(this) != DialogResult.OK) { _status.Text = _document.Name; return; }
            _status.Text = "Inserimento pagine…";
            ReadEditorState(await _bridge.RequestAsync("editor.insert", new
            {
                token = _token, importToken, pageIndexes = options.PageIndexes, position = options.Position
            }));
            _status.Text = $"Inserite {options.PageIndexes.Length} pagine · {_document.Name}";
        }
        finally
        {
            if (importToken is not null && !_viewerFaulted)
                ReadEditorState(await _bridge!.RequestAsync("editor.cancelInsert", new { token = _token, importToken }));
        }
    }

    private async Task ExtractPagesCoreAsync()
    {
        if (_document is null || !_canEdit) return;
        using var dialog = new SaveFileDialog
        {
            Filter = "Documento PDF (*.pdf)|*.pdf", DefaultExt = "pdf", AddExtension = true,
            FileName = Path.GetFileNameWithoutExtension(_document.Name) + " - estratto.pdf",
            Title = "Estrai pagine selezionate", OverwritePrompt = true
        };
        int pageCount = 0;
        byte[]? bytes = null;
        while (true)
        {
            if (dialog.ShowDialog(this) != DialogResult.OK) { _status.Text = _document.Name; return; }
            string destination = Path.GetFullPath(dialog.FileName);
            if ((!_untitled && SamePath(destination, _document.Path)) || SamePath(destination, _openedPath))
            {
                MessageBox.Show(this, "Scegliere un percorso diverso dal documento corrente e dal file originale.",
                    "Estrai pagine", MessageBoxButtons.OK, MessageBoxIcon.Information);
                continue;
            }
            var expected = await PdfFile.GetStampAsync(destination);
            _status.Text = "Estrazione pagine…";
            if (bytes is null)
            {
                var exported = await _bridge!.RequestAsync("editor.extract", new { token = _token });
                if (exported.GetProperty("token").GetString() != _token)
                    throw new InvalidOperationException("Documento di estrazione non corrispondente.");
                pageCount = exported.GetProperty("pageCount").GetInt32();
                if (pageCount < 1) throw new InvalidDataException("Nessuna pagina estratta.");
                string base64 = exported.GetProperty("base64").GetString()!;
                if (base64.Length > ((PdfFile.MaximumBytes + 2L) / 3) * 4)
                    throw new InvalidDataException("Il risultato supera il limite di 64 MB.");
                bytes = Convert.FromBase64String(base64);
            }
            try { await PdfFile.WriteAtomicAsync(destination, bytes, expected); }
            catch (FileChangedException)
            {
                MessageBox.Show(this, "Il file di destinazione è cambiato durante l’estrazione. Scegliere un altro percorso.",
                    "Estrai pagine", MessageBoxButtons.OK, MessageBoxIcon.Information);
                continue;
            }
            // This export neither saves nor replaces the open document.
            _status.Text = $"{(pageCount == 1 ? "Estratta 1 pagina" : $"Estratte {pageCount} pagine")}: {Path.GetFileName(destination)}";
            return;
        }
    }

    private async Task<bool> SaveCoreAsync(bool saveAs)
    {
        if (_document is null) return true;
        if (_readOnly || _untitled) saveAs = true;
        if (!saveAs && !_dirty) return true;
        while (true)
        {
            string destination = _document.Path;
            if (saveAs)
            {
                using var dialog = new SaveFileDialog
                {
                    Filter = "Documento PDF (*.pdf)|*.pdf", DefaultExt = "pdf", AddExtension = true,
                    FileName = Path.GetFileNameWithoutExtension(_document.Name) + (_untitled ? ".pdf" : _readOnly ? " - copia.pdf" : " - modificato.pdf"),
                    Title = _readOnly ? "Salva copia originale" : "Salva con nome", OverwritePrompt = true
                };
                if (dialog.ShowDialog(this) != DialogResult.OK) return false;
                destination = Path.GetFullPath(dialog.FileName);
            }
            bool samePath = !_untitled && SamePath(destination, _document.Path);
            if (_readOnly && (samePath || SamePath(destination, _openedPath)))
            {
                MessageBox.Show(this, "Questo documento è in sola lettura. Scegliere un percorso diverso dall’originale.", "Salva copia", MessageBoxButtons.OK, MessageBoxIcon.Information);
                saveAs = true;
                continue;
            }
            var expected = samePath ? new FileStamp(true, _document.Fingerprint) : await PdfFile.GetStampAsync(destination);
            _status.Text = "Salvataggio documento…";
            var exported = await _bridge!.RequestAsync("document.export");
            if (exported.GetProperty("token").GetString() != _token) throw new InvalidOperationException("Documento di salvataggio non corrispondente.");
            string base64 = exported.GetProperty("base64").GetString()!;
            if (base64.Length > ((PdfFile.MaximumBytes + 2L) / 3) * 4)
                throw new InvalidDataException("Il risultato supera il limite di 64 MB.");
            byte[] bytes = Convert.FromBase64String(base64);
            try { await PdfFile.WriteAtomicAsync(destination, bytes, expected); }
            catch (FileChangedException ex)
            {
                MessageBox.Show(this, ex.Message, "File modificato esternamente", MessageBoxButtons.OK, MessageBoxIcon.Information);
                saveAs = true;
                continue;
            }
            // Commit native bytes/path after disk success, then acknowledge the exact revision.
            _document = new PdfFile(destination, bytes);
            _untitled = false;
            var state = await _bridge.RequestAsync("document.markSaved", new
            {
                token = _token, revision = exported.GetProperty("revision").GetInt32(), name = _document.Name
            });
            ReadEditorState(state);
            _recentFiles.Add(destination);
            _status.Text = $"Salvato: {_document.Name}";
            return true;
        }
    }

    private async Task ProtectCoreAsync()
    {
        if (_document is null || _readOnly) return;
        if (_passwordProtected)
        {
            ReadEditorState(await _bridge!.RequestAsync("document.protect", new { password = "" }));
            _status.Text = "Rimozione password da confermare con Salva";
            return;
        }
        using var dialog = new PasswordDialog(create: true);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        ReadEditorState(await _bridge!.RequestAsync("document.protect", new { password = dialog.Password }));
        _status.Text = dialog.Password.Length == 0 ? "Rimozione password da confermare con Salva" : "Protezione password da confermare con Salva";
    }

    private async Task FormEmailCoreAsync(JsonElement payload)
    {
        if (_document is null || _readOnly || payload.GetProperty("token").GetString() != _token) return;
        var exported = await _bridge!.RequestAsync("document.email", new { token = _token, fieldId = payload.GetProperty("fieldId").GetString() });
        if (exported.GetProperty("token").GetString() != _token) throw new InvalidOperationException("Il documento è cambiato.");
        var base64 = exported.GetProperty("base64").GetString()!;
        if (base64.Length > ((PdfFile.MaximumBytes + 2L) / 3) * 4) throw new InvalidDataException("Il PDF supera 64 MB.");
        FormEmail.Compose(Handle, Convert.FromBase64String(base64), exported.GetProperty("email").GetString()!);
        _status.Text = "Bozza email aperta con il PDF compilato allegato";
    }

    private async Task<bool> ConfirmUnsavedAsync()
    {
        if (!_dirty || _document is null) return true;
        return UnsavedChangesDialog.Show(this, _document.Name) switch
        {
            DialogResult.Yes => await SaveCoreAsync(false),
            DialogResult.No => true,
            _ => false
        };
    }

    private async Task CloseDocumentCoreAsync()
    {
        if (_document is null || !await ConfirmUnsavedAsync()) return;
        await _bridge!.RequestAsync("document.close");
        _document = null;
        _untitled = false;
        _openedPath = _token = null;
        _dirty = _readOnly = _canEdit = _canText = _textEditing = _canUndo = _canRedo = _passwordProtected = false;
        _canContent = _canPrint = false;
        _manage.Checked = false;
        _text.Checked = _highlight.Checked = false;
        _status.Text = "Pronto · Apri un documento PDF";
        _pages.Text = "";
    }

    private async void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_closeApproved || !_initialized) return;
        e.Cancel = true;
        if (_viewerFaulted)
        {
            if (_dirty && MessageBox.Show(this, "Il visualizzatore non risponde. Chiudere perdendo le modifiche non salvate?",
                "Chiudi PDF MB", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            _closeApproved = true;
            Close();
            return;
        }
        if (IsBusy) return;
        bool approved = false;
        await RunHostAsync(async () => { approved = await ConfirmUnsavedAsync(); });
        if (approved) { _closeApproved = true; Close(); }
    }

    private void PopulateRecentFiles()
    {
        _recent.DropDownItems.Clear();
        foreach (string path in _recentFiles.Items)
        {
            var item = new ToolStripMenuItem(Path.GetFileName(path)) { ToolTipText = path };
            item.Click += async (_, _) => await RunHostAsync(() => OpenPathCoreAsync(path));
            CommandIcons.Configure(item, "file", menuEntry: true);
            _recent.DropDownItems.Add(item);
        }
        if (_recent.DropDownItems.Count == 0) _recent.DropDownItems.Add(new ToolStripMenuItem("Nessun file recente") { Enabled = false });
    }

    private static bool SamePath(string path, string? other) => other is not null &&
        string.Equals(Path.GetFullPath(path), Path.GetFullPath(other), StringComparison.OrdinalIgnoreCase);

    private void FaultViewer(string message)
    {
        _ready.TrySetException(new InvalidOperationException(message));
        _viewerFaulted = true;
        _status.Text = "Il visualizzatore si è arrestato. Chiudere e riaprire PDF MB.";
        UpdateControls();
    }

    private void ShowError(Exception ex)
    {
        if (ex is TimeoutException) FaultViewer(ex.Message);
        else _status.Text = _document?.Name ?? "Nessun documento aperto";
        MessageBox.Show(this, ex.Message, "PDF MB", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}

