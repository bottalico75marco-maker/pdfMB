using System.Diagnostics;
using PdfMB.Desktop.Services;

namespace PdfMB.Desktop;

internal sealed partial class MainForm
{
    private readonly ToolStripMenuItem _checkUpdates = new("Verifica aggiornamenti…");
    private readonly ToolStripMenuItem _automaticUpdates = new("Controlla aggiornamenti all’avvio") { CheckOnClick = true };
    private readonly UpdateChecker _updates = new(typeof(MainForm).Assembly.GetName().Version!);
    private readonly CancellationTokenSource _updateLifetime = new();
    private UpdatePreferences _updatePreferences = new();
    private bool _updateChecking;
    private UpdateResult? _availableUpdate;
    private string UpdatePreferencesPath => Path.Combine(_dataDirectory, "update-settings.json");

    private void InitializeUpdates()
    {
        _updatePreferences = UpdatePreferences.Load(UpdatePreferencesPath);
        _automaticUpdates.Checked = _updatePreferences.Automatic;
        _checkUpdates.Click += async (_, _) =>
        {
            if (_availableUpdate is not null) ShowUpdate(_availableUpdate);
            else await CheckForUpdatesAsync(true);
        };
        _automaticUpdates.CheckedChanged += (_, _) =>
        {
            _updatePreferences.Automatic = _automaticUpdates.Checked;
            _updatePreferences.Save(UpdatePreferencesPath);
        };
        _help.DropDownItems.Add(new ToolStripSeparator());
        _help.DropDownItems.Add(_checkUpdates);
        _help.DropDownItems.Add(_automaticUpdates);
        Disposed += (_, _) => { _updateLifetime.Cancel(); _updates.Dispose(); _updateLifetime.Dispose(); };
    }

    private async Task CheckForUpdatesAsync(bool manual)
    {
        if (_updateChecking || IsDisposed || (!manual && !_updatePreferences.ShouldCheck(DateTimeOffset.UtcNow))) return;
        _updateChecking = true; _checkUpdates.Enabled = false;
        try
        {
            var result = await _updates.CheckAsync(_updateLifetime.Token);
            if (IsDisposed || _updateLifetime.IsCancellationRequested) return;
            if (result.State != UpdateState.Unavailable)
            {
                _updatePreferences.LastCheckedUtc = DateTimeOffset.UtcNow;
                _updatePreferences.Save(UpdatePreferencesPath);
            }
            if (result.State == UpdateState.Available)
            {
                _availableUpdate = result;
                _checkUpdates.Text = $"Aggiornamento {result.Version} disponibile…";
                _checkUpdates.AccessibleName = _checkUpdates.ToolTipText = _checkUpdates.Text;
                _help.ToolTipText = result.Message + " Aprire Aiuto per scaricare.";
                if (!IsBusy) _status.Text = result.Message + " Aprire Aiuto per scaricare.";
                if (manual || (_document is null && !IsBusy)) ShowUpdate(result);
            }
            else if (manual)
                MessageBox.Show(this, result.Message, "Aggiornamenti PDF MB", MessageBoxButtons.OK,
                    result.State == UpdateState.Unavailable ? MessageBoxIcon.Information : MessageBoxIcon.None);
        }
        catch (OperationCanceledException) { /* Closing the application cancels the background request. */ }
        finally
        {
            _updateChecking = false;
            if (!IsDisposed) _checkUpdates.Enabled = true;
        }
    }

    private void ShowUpdate(UpdateResult update)
    {
        if (IsDisposed || IsBusy || update.DownloadUrl is null || update.ReleaseUrl is null) return;
        using var dialog = new Form
        {
            Text = "Aggiornamento PDF MB", ClientSize = new Size(640, 440), MinimumSize = new Size(500, 350),
            StartPosition = FormStartPosition.CenterParent, ShowInTaskbar = false, MinimizeBox = false, MaximizeBox = false,
            Font = Font, BackColor = Color.White
        };
        AppIcon.Apply(dialog);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), RowCount = 4, ColumnCount = 1 };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(new Label { Text = update.Message, AutoSize = true, MaximumSize = new Size(590, 0), Margin = new Padding(0, 0, 0, 12) });
        layout.Controls.Add(new TextBox { Text = update.Notes.ReplaceLineEndings("\r\n"), ReadOnly = true, Multiline = true,
            ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill, BackColor = Color.White, AccessibleName = "Note di rilascio" });
        layout.Controls.Add(new Label { Text = "Scarica lo ZIP, estrailo in una cartella e avvia la nuova versione. Chiudi PDF MB prima di sostituire la cartella attuale.",
            AutoSize = true, MaximumSize = new Size(590, 0), Margin = new Padding(0, 12, 0, 8) });
        var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var close = new Button { Text = "Più tardi", AutoSize = true, DialogResult = DialogResult.Cancel };
        var download = new Button { Text = "Scarica aggiornamento", AutoSize = true };
        var notes = new Button { Text = "Note su GitHub", AutoSize = true };
        void Open(Uri url)
        {
            try { Process.Start(new ProcessStartInfo(url.AbsoluteUri) { UseShellExecute = true }); }
            catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
            { MessageBox.Show(dialog, "Impossibile aprire il browser: " + ex.Message, "Aggiornamento PDF MB", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        }
        download.Click += (_, _) => Open(update.DownloadUrl);
        notes.Click += (_, _) => Open(update.ReleaseUrl);
        buttons.Controls.AddRange([close, download, notes]); layout.Controls.Add(buttons);
        dialog.Controls.Add(layout); dialog.CancelButton = close; dialog.AcceptButton = download;
        dialog.Shown += (_, _) => download.Focus();
        dialog.ShowDialog(this);
    }
}
