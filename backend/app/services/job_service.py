from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from threading import Lock, Thread
from typing import Any, Dict
from uuid import uuid4

from app.services.data_service import read_tabular_file
from app.services.forecast_service import run_all_firms_forecast_suite

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = Lock()


def _timestamp() -> str:
    return datetime.now().strftime('%I:%M:%S %p')


def _append_log(job_id: str, step_index: int, message: str) -> None:
    with _jobs_lock:
        job = _jobs[job_id]
        job['currentStepIndex'] = step_index
        job['logs'].append(
            {
                'stepIndex': step_index,
                'timestamp': _timestamp(),
                'message': message,
            }
        )


def _set_status(job_id: str, status: str) -> None:
    with _jobs_lock:
        _jobs[job_id]['status'] = status


def _set_result(job_id: str, result: Dict[str, Any]) -> None:
    with _jobs_lock:
        job = _jobs[job_id]
        job['status'] = 'completed'
        job['currentStepIndex'] = 5
        job['result'] = result
        job['completedAt'] = _timestamp()


def _set_error(job_id: str, message: str) -> None:
    with _jobs_lock:
        job = _jobs[job_id]
        job['status'] = 'failed'
        job['error'] = message
        job['completedAt'] = _timestamp()


def get_job(job_id: str) -> Dict[str, Any] | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return None
        return deepcopy(job)


def start_all_firms_job(
    *,
    contents: bytes,
    filename: str,
    target_column: str,
    holdout: int,
    entity_column: str,
    date_column: str | None = None,
) -> Dict[str, str]:
    job_id = uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {
            'jobId': job_id,
            'kind': 'all-firms',
            'status': 'queued',
            'currentStepIndex': 0,
            'logs': [],
            'result': None,
            'error': None,
            'createdAt': _timestamp(),
            'completedAt': None,
        }

    def _runner() -> None:
        _set_status(job_id, 'running')
        _append_log(job_id, 0, f"Accepted all-firms job for '{filename}'.")
        try:
            frame = read_tabular_file(contents, filename)
            _append_log(job_id, 0, f"Loaded dataset with {len(frame)} row(s).")
            result = run_all_firms_forecast_suite(
                frame,
                target_column=target_column,
                holdout=holdout,
                entity_column=entity_column,
                date_column=date_column,
                log_callback=lambda step_index, message: _append_log(job_id, step_index, message),
            )
            _set_result(job_id, result)
        except Exception as exc:
            _append_log(job_id, 5, f'Job failed: {exc}')
            _set_error(job_id, str(exc))

    Thread(target=_runner, daemon=True).start()
    return {'jobId': job_id}
