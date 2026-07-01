import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock


def test_status(client):
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["running"] is True
    assert "version" in data
    assert data["active_session"] is None


def test_list_dirs_empty(client):
    resp = client.get("/directories")
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_directory(client, tmp_path):
    project = tmp_path / "myproject"
    project.mkdir()
    resp = client.post("/directories", json={"path": str(project), "description": "Test"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["path"] == str(project)
    assert data["description"] == "Test"


def test_add_missing_directory_returns_404(client, tmp_path):
    resp = client.post("/directories", json={"path": "/does/not/exist", "description": ""})
    assert resp.status_code == 404


def test_delete_directory(client, tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    add_resp = client.post("/directories", json={"path": str(project), "description": ""})
    dir_id = add_resp.json()["id"]
    del_resp = client.delete(f"/directories/{dir_id}")
    assert del_resp.status_code == 204
    assert client.get("/directories").json() == []


def test_session_start_no_dirs(client):
    resp = client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["snapshots"] == []


def test_session_start_with_dir(client, tmp_path):
    project = tmp_path / "proj"
    (project / "src").mkdir(parents=True)
    (project / "src" / "main.py").write_text("print()")

    client.post("/directories", json={"path": str(project), "description": ""})

    resp = client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})

    assert resp.status_code == 200
    snaps = resp.json()["snapshots"]
    assert len(snaps) == 1
    assert snaps[0]["ok"] is True
    assert snaps[0]["files_count"] == 1


def test_stop_without_start_returns_400(client):
    resp = client.post("/session/stop", json={"session_id": "s1"})
    assert resp.status_code == 400


def test_stop_returns_dirs_and_screenshots(client, tmp_path, monkeypatch):
    """Stop should return dirs+screenshots without calling AI."""
    from daemon import server as srv

    project = tmp_path / "proj"
    (project / "src").mkdir(parents=True)
    (project / "src" / "main.py").write_text("print()")

    client.post("/directories", json={"path": str(project), "description": "P"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})

    (project / "src" / "new.py").write_text("# new")

    from unittest.mock import MagicMock
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    resp = client.post("/session/stop", json={"session_id": "s1"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "dirs" in data
    assert "screenshots" in data
    assert "results" not in data


def test_stop_does_not_call_ai_generator(client, tmp_path, monkeypatch):
    """Stop must not call generate_directory_apontamento."""
    from daemon import server as srv

    project = tmp_path / "proj"
    project.mkdir()
    (project / "file.py").write_text("x = 1")

    client.post("/directories", json={"path": str(project), "description": "P"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})
    (project / "file.py").write_text("x = 2")

    from unittest.mock import MagicMock, patch
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    with patch("daemon.server.generate_directory_apontamento", create=True) as mock_gen:
        resp = client.post("/session/stop", json={"session_id": "s1"})

    assert resp.status_code == 200
    mock_gen.assert_not_called()


def test_generate_returns_results(client, tmp_path, monkeypatch):
    """POST /session/generate calls AI for dirs with changes and returns results."""
    from daemon import server as srv

    project = tmp_path / "proj"
    project.mkdir()
    (project / "file.py").write_text("x = 1")

    client.post("/directories", json={"path": str(project), "description": "Meu projeto"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})
    (project / "file.py").write_text("x = 2")

    from unittest.mock import MagicMock, patch
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    # Stop the session first (no AI)
    client.post("/session/stop", json={"session_id": "s1"})

    mock_draft = {"content": "Modificou file.py", "hours_worked": 1.0}

    with patch("daemon.server.generate_directory_apontamento", return_value=mock_draft) as mock_gen:
        resp = client.post(
            "/session/generate",
            json={"session_id": "s1", "dir_notes": {}, "screenshot_ids": [], "linked_task_context": ""},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert len(data["results"]) == 1
    assert data["results"][0]["draft"]["content"] == "Modificou file.py"
    mock_gen.assert_called_once()


def test_generate_503_without_supabase_client(client):
    """Generate should return 503 if Supabase client is not initialized."""
    resp = client.post(
        "/session/generate",
        json={"session_id": "s1", "dir_notes": {}, "screenshot_ids": [], "linked_task_context": ""},
    )
    assert resp.status_code == 503


def test_generate_skips_dirs_without_changes(client, tmp_path, monkeypatch):
    """Dirs with no file changes produce no entry in results."""
    from daemon import server as srv

    project = tmp_path / "proj"
    project.mkdir()
    (project / "file.py").write_text("x = 1")

    client.post("/directories", json={"path": str(project), "description": "P"})
    client.post("/session/start", json={"session_id": "s1", "user_id": "u1", "org_id": "o1"})
    # Do NOT modify any file — no changes

    from unittest.mock import MagicMock
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(srv, "_supabase_client", mock_supabase)

    client.post("/session/stop", json={"session_id": "s1"})

    resp = client.post(
        "/session/generate",
        json={"session_id": "s1", "dir_notes": {}, "screenshot_ids": [], "linked_task_context": ""},
    )
    assert resp.status_code == 200
    assert resp.json()["results"] == []
