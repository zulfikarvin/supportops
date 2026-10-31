from pathlib import Path
import base64
import pytest
from fastapi.testclient import TestClient
from app import app
from engine import diagnose

FIXTURES = Path(__file__).parent / "fixtures"


def test_valid_and_missing_column():
    assert diagnose((FIXTURES / "valid.csv").read_bytes())["failed_checks"] == 0
    result = diagnose((FIXTURES / "missing-column.csv").read_bytes())
    assert result["checks"][0]["status"] == "failed"
    assert "employee_id" in result["checks"][0]["finding"]
    assert "DEMO-001" not in str(result)


def test_invalid_rules_and_baseline():
    result = diagnose((FIXTURES / "invalid.csv").read_bytes(), ["employee_id", "hire_date", "employment_status", "department"])
    checks = {item["check_id"]: item for item in result["checks"]}
    assert checks["duplicate_employee_ids"]["row_references"] == [2, 3]
    assert checks["missing_employee_ids"]["row_references"] == [4]
    assert checks["invalid_dates"]["affected_records"] == 2
    assert checks["invalid_statuses"]["affected_records"] == 1
    assert checks["schema_change"]["status"] == "failed"


@pytest.mark.parametrize("raw", [b"", b"a,a\n1,2", b"a,b\n1", b"a\n\xff", b'x' * (5 * 1024 * 1024 + 1), b'a\n"unterminated'])
def test_malformed_samples(raw):
    with pytest.raises(ValueError):
        diagnose(raw)


def test_authorization_and_safe_errors(monkeypatch):
    monkeypatch.setenv("DIAGNOSTICS_API_TOKEN", "test-token-" * 4)
    client = TestClient(app)
    assert client.post("/diagnose", json={}).status_code == 401
    headers = {"Authorization": "Bearer " + "test-token-" * 4}
    assert client.post("/diagnose", headers=headers, json={"csv_base64": "!!!"}).status_code == 400
    response = client.post("/diagnose", headers=headers, json={"csv_base64": base64.b64encode((FIXTURES / "valid.csv").read_bytes()).decode()})
    assert response.status_code == 200
    assert response.json()["failed_checks"] == 0
