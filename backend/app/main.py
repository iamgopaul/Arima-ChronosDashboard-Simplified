from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.services.data_service import (
    extract_gretl_comparison,
    extract_time_series,
    get_dataset_table,
    inspect_dataset,
    read_tabular_file,
)
from app.services.environment_service import get_environment_summary
from app.services.forecast_service import run_all_firms_forecast_suite, run_forecast_suite, summarize_gretl
from app.services.job_service import get_job, start_all_firms_job

app = FastAPI(
    title='Arima Chronos Forecast Dashboard API',
    version='0.1.0',
    description='Upload, inspect, forecast, and compare ARIMA, Chronos, naive, and Gretl outputs.',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/api/health')
def healthcheck() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/api/environment')
def environment() -> dict:
    return get_environment_summary()


@app.post('/api/datasets/inspect')
async def datasets_inspect(file: UploadFile = File(...)) -> dict:
    try:
        contents = await file.read()
        frame = read_tabular_file(contents, file.filename or 'upload.csv')
        return inspect_dataset(frame)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Failed to inspect dataset: {exc}') from exc


@app.post('/api/datasets/table')
async def datasets_table(
    file: UploadFile = File(...),
    page: int = Form(1),
    page_size: int = Form(25),
    search: Optional[str] = Form(None),
    search_column: Optional[str] = Form(None),
    sort_column: Optional[str] = Form(None),
    sort_direction: str = Form('asc'),
) -> dict:
    try:
        contents = await file.read()
        frame = read_tabular_file(contents, file.filename or 'upload.csv')
        return get_dataset_table(
            frame,
            page=page,
            page_size=page_size,
            search=search,
            search_column=search_column,
            sort_column=sort_column,
            sort_direction=sort_direction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Failed to build dataset table: {exc}') from exc


@app.post('/api/forecasts/run')
async def forecasts_run(
    file: UploadFile = File(...),
    target_column: str = Form(...),
    holdout: int = Form(...),
    date_column: Optional[str] = Form(None),
    entity_column: Optional[str] = Form(None),
    entity_value: Optional[str] = Form(None),
) -> dict:
    try:
        contents = await file.read()
        frame = read_tabular_file(contents, file.filename or 'upload.csv')
        series_payload = extract_time_series(
            frame,
            target_column=target_column,
            holdout=holdout,
            date_column=date_column,
            entity_column=entity_column,
            entity_value=entity_value,
        )
        return run_forecast_suite(series_payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Forecast run failed: {exc}') from exc


@app.post('/api/forecasts/run-all')
async def forecasts_run_all(
    file: UploadFile = File(...),
    target_column: str = Form(...),
    holdout: int = Form(...),
    entity_column: str = Form(...),
    date_column: Optional[str] = Form(None),
) -> dict:
    try:
        contents = await file.read()
        frame = read_tabular_file(contents, file.filename or 'upload.csv')
        return run_all_firms_forecast_suite(
            frame,
            target_column=target_column,
            holdout=holdout,
            entity_column=entity_column,
            date_column=date_column,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'All-firm forecast run failed: {exc}') from exc


@app.post('/api/forecasts/run-all/start')
async def forecasts_run_all_start(
    file: UploadFile = File(...),
    target_column: str = Form(...),
    holdout: int = Form(...),
    entity_column: str = Form(...),
    date_column: Optional[str] = Form(None),
) -> dict:
    try:
        contents = await file.read()
        return start_all_firms_job(
            contents=contents,
            filename=file.filename or 'upload.csv',
            target_column=target_column,
            holdout=holdout,
            entity_column=entity_column,
            date_column=date_column,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Failed to start all-firm forecast job: {exc}') from exc


@app.get('/api/forecasts/jobs/{job_id}')
def forecasts_job_status(job_id: str) -> dict:
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail='Forecast job not found.')
    return job


@app.post('/api/gretl/inspect')
async def gretl_inspect(file: UploadFile = File(...)) -> dict:
    try:
        contents = await file.read()
        frame = read_tabular_file(contents, file.filename or 'gretl.csv')
        return inspect_dataset(frame)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Failed to inspect Gretl file: {exc}') from exc


@app.post('/api/gretl/compare')
async def gretl_compare(
    file: UploadFile = File(...),
    actual_column: str = Form(...),
    forecast_column: str = Form(...),
    date_column: Optional[str] = Form(None),
) -> dict:
    try:
        contents = await file.read()
        frame = read_tabular_file(contents, file.filename or 'gretl.csv')
        comparison = extract_gretl_comparison(
            frame,
            actual_column=actual_column,
            forecast_column=forecast_column,
            date_column=date_column,
        )
        return summarize_gretl(comparison['actual'], comparison['forecast'], comparison['labels'])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Failed to compare Gretl results: {exc}') from exc
