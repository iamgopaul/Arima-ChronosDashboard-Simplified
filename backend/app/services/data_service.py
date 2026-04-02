from __future__ import annotations

import io
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

DATE_HINTS = {'date', 'datadate', 'time', 'period', 'timestamp', 'ds'}
TARGET_HINTS = ['ROA', 'ROE', 'saleq', 'niq', 'atq']
ENTITY_HINTS = ['gvkey', 'tic', 'conm', 'cusip']
SINGLE_FIRM_ENTITY_PREFERENCE = ['tic', 'conm', 'gvkey', 'cusip']


def read_tabular_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    extension = filename.rsplit('.', 1)[-1].lower()
    buffer = io.BytesIO(file_bytes)

    if extension == 'csv':
        return pd.read_csv(buffer, low_memory=False)
    if extension == 'xls':
        return pd.read_excel(buffer, engine='xlrd')
    if extension == 'xlsx':
        return pd.read_excel(buffer, engine='openpyxl')
    raise ValueError(f'Unsupported file type: .{extension}')


def _looks_like_date(series: pd.Series) -> bool:
    parsed = pd.to_datetime(series, errors='coerce', format='mixed')
    return bool(len(series)) and parsed.notna().mean() >= 0.6


def _safe_preview_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, (pd.Timestamp, np.datetime64)):
        return str(pd.Timestamp(value))
    if isinstance(value, (np.floating, float)):
        return round(float(value), 6)
    if isinstance(value, (np.integer, int)):
        return int(value)
    return str(value)


def inspect_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    columns = [str(column) for column in df.columns]
    numeric_columns = [column for column in columns if pd.api.types.is_numeric_dtype(df[column])]
    date_columns = [column for column in columns if column.strip().lower() in DATE_HINTS or _looks_like_date(df[column])]
    entity_columns = [column for column in columns if column in ENTITY_HINTS or df[column].dtype == 'object']

    preferred_target = next((column for column in TARGET_HINTS if column in columns), numeric_columns[0] if numeric_columns else None)
    preferred_date = next((column for column in date_columns if column.strip().lower() in DATE_HINTS), date_columns[0] if date_columns else None)
    preferred_entity = next(
        (column for column in SINGLE_FIRM_ENTITY_PREFERENCE if column in entity_columns),
        entity_columns[0] if entity_columns else None,
    )

    preview = [
        {column: _safe_preview_value(value) for column, value in row.items()}
        for row in df.head(8).replace({np.nan: None}).to_dict(orient='records')
    ]

    entity_values: List[str] = []
    entity_value_options: Dict[str, List[str]] = {}
    entity_value_counts: Dict[str, Dict[str, int]] = {}
    for column in entity_columns:
        counts = df[column].dropna().astype(str).value_counts()
        values = sorted(str(value) for value in counts.index.tolist())
        entity_value_options[column] = values
        entity_value_counts[column] = {str(value): int(counts[value]) for value in counts.index.tolist()}

    entity_display_map: Dict[str, Dict[str, str]] = {}
    if {'tic', 'conm'}.intersection(columns):
        display_source_columns = [column for column in ['gvkey', 'tic', 'conm'] if column in columns]
        display_rows = (
            df[display_source_columns]
            .dropna(how='all')
            .astype(str)
            .drop_duplicates(subset=[column for column in ['gvkey', 'tic', 'conm'] if column in display_source_columns], keep='first')
        )

        if 'tic' in display_rows.columns:
            tic_map: Dict[str, str] = {}
            for _, row in display_rows.iterrows():
                tic = row.get('tic', '').strip()
                conm = row.get('conm', '').strip()
                gvkey = row.get('gvkey', '').strip()
                if not tic:
                    continue
                if conm:
                    tic_map[tic] = f'{tic} - {conm}'
                elif gvkey:
                    tic_map[tic] = f'{tic} - GVKEY {gvkey}'
                else:
                    tic_map[tic] = tic
            entity_display_map['tic'] = tic_map

        if 'conm' in display_rows.columns:
            conm_map: Dict[str, str] = {}
            for _, row in display_rows.iterrows():
                tic = row.get('tic', '').strip()
                conm = row.get('conm', '').strip()
                gvkey = row.get('gvkey', '').strip()
                if not conm:
                    continue
                if tic:
                    conm_map[conm] = f'{conm} - {tic}'
                elif gvkey:
                    conm_map[conm] = f'{conm} - GVKEY {gvkey}'
                else:
                    conm_map[conm] = conm
            entity_display_map['conm'] = conm_map

    if preferred_entity and preferred_entity in df.columns:
        entity_values = entity_value_options.get(preferred_entity, [])

    return {
        'rowCount': int(len(df)),
        'columns': columns,
        'numericColumns': numeric_columns,
        'dateColumns': date_columns,
        'entityColumns': entity_columns,
        'defaults': {
            'targetColumn': preferred_target,
            'dateColumn': preferred_date,
            'entityColumn': preferred_entity,
            'entityValue': entity_values[0] if entity_values else None,
        },
        'entityValues': entity_values,
        'entityValueOptions': entity_value_options,
        'entityValueCounts': entity_value_counts,
        'entityDisplayMap': entity_display_map,
        'preview': preview,
    }


def get_dataset_table(
    df: pd.DataFrame,
    *,
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    search_column: Optional[str] = None,
    sort_column: Optional[str] = None,
    sort_direction: str = 'asc',
) -> Dict[str, Any]:
    columns = [str(column) for column in df.columns]
    key_columns = [column for column in ['gvkey', 'tic', 'conm'] if column in columns]
    working = df.copy()

    if search:
        query = str(search).strip().lower()
        if query:
            if search_column and search_column in columns:
                search_columns = [search_column]
            else:
                search_columns = key_columns or columns

            mask = pd.Series(False, index=working.index)
            for column in search_columns:
                mask = mask | working[column].astype(str).str.lower().str.contains(query, na=False)
            working = working[mask]

    if sort_column and sort_column in columns:
        ascending = sort_direction.lower() != 'desc'
        if pd.api.types.is_numeric_dtype(working[sort_column]):
            working = working.assign(_sort_key=pd.to_numeric(working[sort_column], errors='coerce'))
        else:
            working = working.assign(_sort_key=working[sort_column].astype(str).str.lower())
        working = working.sort_values('_sort_key', ascending=ascending, na_position='last', kind='mergesort').drop(
            columns=['_sort_key']
        )

    safe_page_size = max(10, min(page_size, 100))
    total_rows = int(len(working))
    total_pages = max(1, (total_rows + safe_page_size - 1) // safe_page_size)
    safe_page = min(max(1, page), total_pages)

    start_idx = (safe_page - 1) * safe_page_size
    end_idx = start_idx + safe_page_size
    page_frame = working.iloc[start_idx:end_idx]

    rows = [
        {column: _safe_preview_value(value) for column, value in row.items()}
        for row in page_frame.replace({np.nan: None}).to_dict(orient='records')
    ]

    return {
        'columns': columns,
        'rows': rows,
        'page': safe_page,
        'pageSize': safe_page_size,
        'totalRows': total_rows,
        'totalPages': total_pages,
        'searchColumns': key_columns,
        'sortColumns': key_columns or columns,
    }


def extract_time_series(
    df: pd.DataFrame,
    *,
    target_column: str,
    holdout: int,
    date_column: Optional[str] = None,
    entity_column: Optional[str] = None,
    entity_value: Optional[str] = None,
) -> Dict[str, Any]:
    working = df.copy()

    if entity_column and entity_value is not None:
        working = working[working[entity_column].astype(str) == str(entity_value)]

    if working.empty:
        raise ValueError('No rows matched the selected entity filter.')

    if date_column:
        parsed_dates = pd.to_datetime(working[date_column], errors='coerce', format='mixed')
        working = working.assign(_parsed_date=parsed_dates).sort_values('_parsed_date', kind='stable')
    else:
        working = working.assign(_row_order=np.arange(len(working)))
        working = working.sort_values('_row_order', kind='stable')

    working[target_column] = pd.to_numeric(working[target_column], errors='coerce')
    working = working.dropna(subset=[target_column])

    if len(working) <= holdout:
        raise ValueError(f'Selected series has {len(working)} valid observations. Choose a smaller holdout or another series.')

    if date_column:
        labels = [str(value.date()) if not pd.isna(value) else f'Row {idx + 1}' for idx, value in enumerate(working['_parsed_date'])]
    else:
        labels = [f'P{idx + 1}' for idx in range(len(working))]

    values = working[target_column].astype(float).to_numpy()
    train = values[:-holdout]
    actual = values[-holdout:]

    return {
        'seriesName': target_column,
        'entity': str(entity_value) if entity_value is not None else None,
        'labels': labels,
        'history': values.tolist(),
        'train': train,
        'actual': actual,
        'holdoutLabels': labels[-holdout:],
    }


def extract_gretl_comparison(
    df: pd.DataFrame,
    *,
    actual_column: str,
    forecast_column: str,
    date_column: Optional[str] = None,
) -> Dict[str, Any]:
    working = df.copy()
    working[actual_column] = pd.to_numeric(working[actual_column], errors='coerce')
    working[forecast_column] = pd.to_numeric(working[forecast_column], errors='coerce')
    working = working.dropna(subset=[actual_column, forecast_column])

    if working.empty:
        raise ValueError('No valid actual/forecast rows were found in the Gretl file.')

    if date_column:
        parsed_dates = pd.to_datetime(working[date_column], errors='coerce', format='mixed')
        labels = [str(value.date()) if not pd.isna(value) else f'Point {idx + 1}' for idx, value in enumerate(parsed_dates)]
    else:
        labels = [f'Point {idx + 1}' for idx in range(len(working))]

    return {
        'labels': labels,
        'actual': working[actual_column].astype(float).to_numpy(),
        'forecast': working[forecast_column].astype(float).to_numpy(),
    }
