namespace PdfMB.Desktop;

internal sealed class BlankPageDialog : Form
{
    private readonly ComboBox _format = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly CheckBox _landscape = new() { Text = "Orizzontale", AutoSize = true };
    private readonly NumericUpDown _position = new() { Minimum = 1, DecimalPlaces = 0 };
    public string PaperFormat => new[] { "A4", "A5", "A3" }[_format.SelectedIndex];
    public bool Landscape => _landscape.Checked;
    public int Position => decimal.ToInt32(_position.Value);

    public BlankPageDialog(bool insert, int pageCount = 0, int currentPage = 1)
    {
        AppIcon.Apply(this);
        Text = insert ? "Inserisci pagina vuota" : "Nuovo documento";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = MaximizeBox = false;
        ShowInTaskbar = false;
        Font = new Font("Segoe UI", 10);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(410, insert ? 290 : 190);
        var label = new Label { Text = "Formato della pagina", AutoSize = true, Location = new Point(20, 18) };
        _format.Items.AddRange(["A4 · 210 × 297 mm", "A5 · 148 × 210 mm", "A3 · 297 × 420 mm"]);
        _format.SelectedIndex = 0;
        _format.SetBounds(20, 45, 370, 30);
        _format.AccessibleName = "Formato pagina";
        _landscape.Location = new Point(20, 88);
        Controls.AddRange([label, _format, _landscape]);
        if (insert)
        {
            _position.Maximum = pageCount + 1M;
            _position.Value = Math.Clamp((long)currentPage + 1, 1, pageCount + 1L);
            _position.SetBounds(20, 153, 100, 30);
            _position.AccessibleName = "Posizione di inserimento";
            Controls.AddRange([
                new Label { Text = "Posizione di inserimento", AutoSize = true, Location = new Point(20, 126) },
                _position,
                new Label { Text = $"Prima della pagina indicata.\n{pageCount + 1L} = dopo l’ultima pagina.", Location = new Point(140, 150), Size = new Size(250, 48) }
            ]);
        }
        var accept = new Button { Text = insert ? "Inserisci" : "Crea", DialogResult = DialogResult.OK, Size = new Size(104, 34) };
        var cancel = new Button { Text = "Annulla", DialogResult = DialogResult.Cancel, Size = new Size(104, 34) };
        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, Location = new Point(20, ClientSize.Height - 54), Size = new Size(370, 40) };
        buttons.Controls.AddRange([cancel, accept]);
        Controls.Add(buttons);
        AcceptButton = accept;
        CancelButton = cancel;
        CommandIcons.ConfigureDialog(this);
    }
}
