import type { UIEvent } from 'react';

import type { DatasetTableResponse } from '../types';

type Props = {
  tableData: DatasetTableResponse | null;
  search: string;
  searchColumn: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  loading: boolean;
  onSearchChange: (value: string) => void;
  onSearchColumnChange: (value: string) => void;
  onSortColumnChange: (value: string) => void;
  onSortDirectionChange: (value: 'asc' | 'desc') => void;
  onLoadMore: () => void;
};

export function PreviewTable({
  tableData,
  search,
  searchColumn,
  sortColumn,
  sortDirection,
  loading,
  onSearchChange,
  onSearchColumnChange,
  onSortColumnChange,
  onSortDirectionChange,
  onLoadMore,
}: Props) {
  if (!tableData) return null;
  const currentTableData = tableData;

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 80;
    if (nearBottom && !loading && currentTableData.page < currentTableData.totalPages) {
      onLoadMore();
    }
  }

  return (
    <section className="panel stack-gap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Dataset browser</p>
          <h2>2. Explore the full uploaded table</h2>
        </div>
        <span className="status-chip">{currentTableData.totalRows.toLocaleString()} rows</span>
      </div>

      <div className="control-grid dataset-browser-grid">
        <label>
          <span>Search</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by ticker, company name, or gvkey"
          />
        </label>
        <label>
          <span>Filter field</span>
          <select value={searchColumn} onChange={(event) => onSearchColumnChange(event.target.value)}>
            <option value="all">All key fields</option>
            {currentTableData.searchColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort by</span>
          <select value={sortColumn} onChange={(event) => onSortColumnChange(event.target.value)}>
            {currentTableData.sortColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Direction</span>
          <select value={sortDirection} onChange={(event) => onSortDirectionChange(event.target.value as 'asc' | 'desc')}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>

      <div className="table-toolbar">
        <span>
          Showing {tableData.rows.length.toLocaleString()} of {tableData.totalRows.toLocaleString()} rows
        </span>
        <span>{loading ? 'Loading more rows...' : 'Scroll inside the table to browse more'}</span>
      </div>

      <div className="table-wrap dataset-table-wrap" onScroll={handleScroll}>
        <table>
          <thead>
            <tr>
              {currentTableData.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentTableData.rows.map((row, rowIndex) => (
              <tr key={`${currentTableData.page}-${rowIndex}`}>
                {currentTableData.columns.map((column) => (
                  <td key={column}>{row[column] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
