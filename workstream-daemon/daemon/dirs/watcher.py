import hashlib
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

IGNORE_NAMES = {".git", "__pycache__", ".venv", "venv", "node_modules", ".DS_Store"}
_IGNORE_PATTERNS = shutil.ignore_patterns(
    ".git", "__pycache__", ".venv", "venv", "node_modules", ".DS_Store",
    "*.pyc", "*.pyo", "ALTERACOES.md",
)


def _should_ignore(path: Path) -> bool:
    return any(part in IGNORE_NAMES for part in path.parts)


def _collect_files(root: Path) -> dict[str, Path]:
    result: dict[str, Path] = {}
    if not root.exists():
        return result
    for abs_path in root.rglob("*"):
        if not abs_path.is_file():
            continue
        rel = abs_path.relative_to(root)
        if _should_ignore(rel):
            continue
        result[rel.as_posix()] = abs_path
    return result


def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def take_snapshot(source: Path, dest: Path) -> int:
    if not source.is_dir():
        raise NotADirectoryError(str(source))
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, dest, ignore=_IGNORE_PATTERNS)
    count = sum(1 for p in dest.rglob("*") if p.is_file())
    logger.debug(f"Snapshot created: {source} → {dest} ({count} files)")
    return count


def _files_differ(base_path: Path, current_path: Path) -> bool:
    try:
        return _file_hash(base_path) != _file_hash(current_path)
    except OSError:
        return True  # treat unreadable as modified


def diff_directories(base_root: Path, current_root: Path) -> dict[str, list[str]]:
    if not base_root.exists():
        raise FileNotFoundError(f"Snapshot not found: {base_root}")
    base_files = _collect_files(base_root)
    current_files = _collect_files(current_root)
    base_keys = set(base_files)
    current_keys = set(current_files)
    created = sorted(current_keys - base_keys)
    deleted = sorted(base_keys - current_keys)
    modified = sorted(
        k for k in base_keys & current_keys
        if _files_differ(base_files[k], current_files[k])
    )
    logger.debug(f"Diff: created={len(created)}, modified={len(modified)}, deleted={len(deleted)}")
    return {"created": created, "deleted": deleted, "modified": modified}
