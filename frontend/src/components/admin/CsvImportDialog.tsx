import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (registers: any[], mode: 'replace' | 'append') => void;
}

function parseCSV(text: string): any[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const reg: any = {};
    headers.forEach((h, i) => {
      if (h === 'address' || h === 'scale' || h === 'offset') {
        reg[h] = parseFloat(values[i]) || 0;
      } else {
        reg[h] = values[i] || '';
      }
    });
    // Apply defaults
    if (!reg.type) reg.type = 'holding';
    if (!reg.data_type) reg.data_type = 'float32';
    if (!reg.byte_order) reg.byte_order = 'big';
    if (!reg.scale) reg.scale = 1.0;
    return reg;
  });
}

export function CsvImportDialog({ open, onClose, onImport }: CsvImportDialogProps) {
  const { t } = useTranslation();
  const [parsed, setParsed] = useState<any[]>([]);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [parseError, setParseError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setParsed([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error('JSON must be an array');
          setParsed(data);
        } else {
          const rows = parseCSV(text);
          setParsed(rows);
        }
      } catch (err: any) {
        setParseError(err.message || 'Parse error');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    onImport(parsed, mode);
  };

  const handleClose = () => {
    setParsed([]);
    setParseError('');
    setMode('replace');
    onClose();
  };

  const preview = parsed.slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('admin.importCsv')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File input */}
          <div className="space-y-1">
            <Label htmlFor="csv-file-input">CSV / JSON</Label>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,.json"
              onChange={handleFileChange}
              className="block text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-input file:bg-muted file:text-sm file:cursor-pointer"
            />
          </div>

          {parseError && (
            <p className="text-sm text-red-500">{parseError}</p>
          )}

          {/* Parsed count */}
          {parsed.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('admin.parsedRows', { count: parsed.length })}
            </p>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="overflow-x-auto rounded border border-border max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {['name', 'address', 'type', 'data_type', 'unit', 'scale', 'offset', 'byte_order'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => {
                    const isInvalid = !row.name || row.address === undefined || row.address === '';
                    return (
                      <tr
                        key={i}
                        className={`border-b border-border last:border-0 ${isInvalid ? 'border border-red-500/50 bg-red-500/5' : ''}`}
                      >
                        {['name', 'address', 'type', 'data_type', 'unit', 'scale', 'offset', 'byte_order'].map(h => (
                          <td
                            key={h}
                            className={`px-2 py-1 whitespace-nowrap ${(h === 'name' || h === 'address') && !row[h] && row[h] !== 0 ? 'border border-red-500 rounded' : ''}`}
                          >
                            {row[h] ?? ''}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Mode selection */}
          {parsed.length > 0 && (
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                {t('admin.replaceAll')}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="import-mode"
                  value="append"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                />
                {t('admin.appendExisting')}
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            {t('admin.cancel')}
          </Button>
          <Button onClick={handleImport} disabled={parsed.length === 0}>
            {t('admin.importCsv')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
