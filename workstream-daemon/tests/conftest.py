import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture
def client(tmp_path, monkeypatch):
    from daemon import config
    monkeypatch.setattr(config.settings, "data_dir", tmp_path)
    monkeypatch.setattr(config.settings, "supabase_url", "http://fake")
    monkeypatch.setattr(config.settings, "supabase_service_role_key", "fake")
    monkeypatch.setattr(config.settings, "anthropic_api_key", "fake")

    import daemon.server as srv
    monkeypatch.setattr(srv, "_session", None)
    monkeypatch.setattr(srv, "_supabase_client", None)

    with patch("daemon.server._screenshot_loop", new_callable=AsyncMock):
        from fastapi.testclient import TestClient
        yield TestClient(srv.app)
        srv._session = None
        srv._supabase_client = None
