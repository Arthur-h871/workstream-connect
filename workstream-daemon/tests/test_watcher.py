import pytest
from pathlib import Path
from daemon.dirs import watcher


def make_file(path: Path, content: str = "x") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_take_snapshot_copies_files(tmp_path):
    src = tmp_path / "src"
    make_file(src / "a.py", "hello")
    make_file(src / "sub" / "b.py", "world")
    dest = tmp_path / "snap"
    count = watcher.take_snapshot(src, dest)
    assert count == 2
    assert (dest / "a.py").read_text() == "hello"
    assert (dest / "sub" / "b.py").read_text() == "world"


def test_take_snapshot_ignores_node_modules(tmp_path):
    src = tmp_path / "src"
    make_file(src / "index.js", "")
    make_file(src / "node_modules" / "lodash" / "index.js", "")
    dest = tmp_path / "snap"
    count = watcher.take_snapshot(src, dest)
    assert count == 1
    assert not (dest / "node_modules").exists()


def test_take_snapshot_missing_source_raises(tmp_path):
    with pytest.raises(NotADirectoryError):
        watcher.take_snapshot(tmp_path / "missing", tmp_path / "snap")


def test_diff_created(tmp_path):
    base = tmp_path / "base"
    current = tmp_path / "current"
    make_file(base / "old.py", "old")
    make_file(current / "old.py", "old")
    make_file(current / "new.py", "new")
    diff = watcher.diff_directories(base, current)
    assert diff["created"] == ["new.py"]
    assert diff["deleted"] == []
    assert diff["modified"] == []


def test_diff_deleted(tmp_path):
    base = tmp_path / "base"
    current = tmp_path / "current"
    make_file(base / "gone.py", "x")
    make_file(current / "other.py", "y")
    diff = watcher.diff_directories(base, current)
    assert diff["deleted"] == ["gone.py"]


def test_diff_modified(tmp_path):
    base = tmp_path / "base"
    current = tmp_path / "current"
    make_file(base / "file.py", "v1")
    make_file(current / "file.py", "v2")
    diff = watcher.diff_directories(base, current)
    assert diff["modified"] == ["file.py"]


def test_diff_no_snapshot_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        watcher.diff_directories(tmp_path / "missing", tmp_path / "current")
