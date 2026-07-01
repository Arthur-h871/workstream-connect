import pytest
from pathlib import Path
from daemon.dirs import registry

def test_empty_registry(tmp_path):
    reg = tmp_path / "dirs.json"
    assert registry.list_dirs(reg) == []

def test_add_and_list(tmp_path):
    reg = tmp_path / "dirs.json"
    source = tmp_path / "project"
    source.mkdir()
    entry = registry.add_dir(reg, str(source), "Test project")
    assert entry["path"] == str(source)
    assert entry["description"] == "Test project"
    assert "id" in entry
    dirs = registry.list_dirs(reg)
    assert len(dirs) == 1

def test_add_duplicate_raises(tmp_path):
    reg = tmp_path / "dirs.json"
    source = tmp_path / "project"
    source.mkdir()
    registry.add_dir(reg, str(source), "")
    with pytest.raises(ValueError):
        registry.add_dir(reg, str(source), "duplicate")

def test_add_missing_path_raises(tmp_path):
    reg = tmp_path / "dirs.json"
    with pytest.raises(FileNotFoundError):
        registry.add_dir(reg, "/does/not/exist", "")

def test_update_dir(tmp_path):
    reg = tmp_path / "dirs.json"
    source = tmp_path / "project"
    source.mkdir()
    entry = registry.add_dir(reg, str(source), "old")
    updated = registry.update_dir(reg, entry["id"], description="new")
    assert updated["description"] == "new"

def test_remove_dir(tmp_path):
    reg = tmp_path / "dirs.json"
    source = tmp_path / "project"
    source.mkdir()
    entry = registry.add_dir(reg, str(source), "")
    registry.remove_dir(reg, entry["id"])
    assert registry.list_dirs(reg) == []

def test_remove_missing_raises(tmp_path):
    reg = tmp_path / "dirs.json"
    with pytest.raises(KeyError):
        registry.remove_dir(reg, "nonexistent-id")
