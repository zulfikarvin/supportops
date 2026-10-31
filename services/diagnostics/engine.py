"""Deterministic file validation. No employee values are returned or logged."""
import csv
import io
import re
import pandas as pd

MAX_BYTES = 5 * 1024 * 1024
REQUIRED = ["employee_id", "hire_date", "employment_status"]


def diagnose(raw: bytes, baseline: list[str] | None = None) -> dict:
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("Provide a non-empty CSV sample smaller than 5 MB.")
    try:
        text = raw.decode("utf-8-sig", errors="strict")
        rows = list(csv.reader(io.StringIO(text), strict=True))
    except (UnicodeError, csv.Error):
        raise ValueError("Malformed CSV or invalid UTF-8 encoding.") from None
    if not rows or len(rows) < 2 or len(rows) > 100001:
        raise ValueError("CSV needs a header and 1–100000 data rows.")
    header = rows[0]
    if len(header) > 100 or any(not col.strip() or len(col) > 100 for col in header) or len(set(header)) != len(header):
        raise ValueError("Column names must be non-empty, unique and limited to 100 characters.")
    if any(len(row) != len(header) for row in rows[1:]):
        raise ValueError("CSV rows do not match the header width.")
    if "\x00" in text:
        raise ValueError("CSV contains invalid control characters.")
    frame = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
    checks = []

    def add(check_id, indices, finding, steps, missing=False):
        refs = [int(i) + 2 for i in indices]
        checks.append({"check_id": check_id, "status": "failed" if refs or missing else "passed", "affected_records": len(refs), "row_references": refs[:100], "references_truncated": len(refs) > 100, "finding": finding if refs or missing else "No validation failure found by this check.", "possible_cause": "Unverified: review the source export and agreed import mapping.", "recommended_steps": steps})

    missing = [name for name in REQUIRED if name not in header]
    add("required_columns", [], "Missing required columns: " + ", ".join(missing), "Confirm required fields and request a corrected synthetic export.", bool(missing))
    if "employee_id" in frame:
        values = frame.employee_id.str.strip()
        add("missing_employee_ids", frame.index[values.eq("")], "Empty employee identifiers detected.", "Check whether source identifiers were omitted.")
        add("duplicate_employee_ids", frame.index[values.ne("") & values.duplicated(keep=False)], "Duplicate non-empty employee identifiers detected.", "Confirm the business key and export deduplication rules.")
    if "hire_date" in frame:
        values = frame.hire_date
        invalid = ~values.str.fullmatch(r"\d{4}-\d{2}-\d{2}") | pd.to_datetime(values, format="%Y-%m-%d", errors="coerce").isna()
        add("invalid_dates", frame.index[invalid], "Invalid hire dates detected; expected YYYY-MM-DD.", "Review the date format and calendar validity.")
    if "employment_status" in frame:
        add("invalid_statuses", frame.index[~frame.employment_status.isin(["active", "inactive", "on_leave", "terminated"])], "Unexpected employment status codes detected.", "Check mappings against the approved status list.")
    if baseline is not None:
        added = len(set(header) - set(baseline)); removed = len(set(baseline) - set(header))
        add("schema_change", [], f"Schema differs from baseline: {added} added and {removed} removed columns.", "Compare the approved schema and source mapping; renames are hypotheses.", bool(added or removed))
    return {"record_count": len(frame), "checks": checks, "conclusion": "These results confirm validation failures in the submitted sample only. Incident root cause requires independent verification.", "failed_checks": sum(item["status"] == "failed" for item in checks)}
