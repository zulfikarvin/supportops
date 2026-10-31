# HR upload diagnostic service

Implemented FastAPI/Pandas validation for approved synthetic or sanitized CSV samples. Checks cover required columns, missing/duplicate employee IDs, strict YYYY-MM-DD hire dates, employment status codes, and baseline schema differences. Responses contain rule outcomes, counts, safe CSV row references (header is row 1), recommended steps and an explicit root-cause limitation; they never contain employee values.

Install the tested Python 3.13 dependencies with `python -m venv services/diagnostics/.venv` and `services/diagnostics/.venv/Scripts/python.exe -m pip install -r services/diagnostics/requirements.lock.txt`. The root `npm.cmd run dev:full` script starts the service and web app with a generated matching local token. Alternatively, set a random `DIAGNOSTICS_API_TOKEN` of at least 32 characters in the service environment and run `python -m uvicorn app:app --host 127.0.0.1 --port 8001` from this directory. Configure the same token and `DIAGNOSTICS_URL` on the Next.js server.

`POST /diagnose` requires a bearer token and JSON containing `csv_base64` and optional `baseline` column names. CSV bytes are limited to 5 MB, the request to 7.1 MB, and data to 100000 rows/100 columns. The web app authorizes the ticket and technical role before calling it. CSMs and customers cannot invoke diagnostics. `/health` returns only liveness. Interactive API documentation is disabled.

Run `services/diagnostics/.venv/Scripts/python.exe -m pytest services/diagnostics -q` from the repository root. Malformed CSV, duplicate headers, ragged rows, invalid UTF-8, oversized files and unauthorized API calls are tested. No remediation is performed. No n8n dependency exists.
