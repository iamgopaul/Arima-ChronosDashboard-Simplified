import type { DatasetInspectResponse } from '../types';

type Props = {
  file: File | null;
  metadata: DatasetInspectResponse | null;
  loading: boolean;
  tableReady: boolean;
  onFileSelect: (file: File | null) => void;
  onLoadData: () => void;
};

export function DataUploadPanel({ file, metadata, loading, tableReady, onFileSelect, onLoadData }: Props) {
  return (
    <section className="panel stack-gap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Data upload</p>
          <h2>1. Upload the dataset and inspect the raw table</h2>
        </div>
        <span className="status-chip">
          {loading ? 'Loading' : metadata ? (tableReady ? 'Loaded' : 'Preparing table') : 'Upload'}
        </span>
      </div>

      <label className="upload-box">
        <input
          type="file"
          accept=".csv,.xls,.xlsx"
          onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
        />
        <span className="upload-title">Choose a file to inspect</span>
        <span className="upload-subtitle">
          {file ? file.name : 'Supports .csv, .xls, and .xlsx uploads.'}
        </span>
      </label>

      <button className="primary-button compact-button" type="button" onClick={onLoadData} disabled={!file || loading}>
        {loading ? 'Loading dataset...' : 'Load Dataset'}
      </button>

      {metadata ? (
        <>
          <div className="success-banner">
            Dataset loaded successfully.
            {tableReady ? ' The table is ready below.' : ' Building the table view now...'}
          </div>

          <div className="subtle-grid">
            <div className="meta-card">
              <strong>{metadata.rowCount.toLocaleString()}</strong>
              <span>rows detected</span>
            </div>
            <div className="meta-card">
              <strong>{metadata.numericColumns.length}</strong>
              <span>numeric columns</span>
            </div>
            <div className="meta-card">
              <strong>{metadata.dateColumns.length}</strong>
              <span>date-like columns</span>
            </div>
            <div className="meta-card">
              <strong>{metadata.entityValues.length}</strong>
              <span>sample firm ids</span>
            </div>
          </div>
        </>
      ) : (
        <p className="helper-copy">Choose a file, then click Load Dataset. The other tabs will use this same uploaded file.</p>
      )}
    </section>
  );
}
