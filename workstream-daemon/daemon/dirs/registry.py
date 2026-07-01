import json
import uuid
from datetime import datetime, timezone
from pathlib import Path


def _load(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _save(path: Path, dirs: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dirs, indent=2, default=str), encoding="utf-8")


def list_dirs(registry_path: Path) -> list[dict]:
    return _load(registry_path)


def add_dir(registry_path: Path, dir_path: str, description: str) -> dict:
    dirs = _load(registry_path)
    if any(d["path"] == dir_path for d in dirs):
        raise ValueError(f"Already registered: {dir_path}")
    if not Path(dir_path).is_dir():
        raise FileNotFoundError(f"Directory not found: {dir_path}")
    entry = {
        "id": str(uuid.uuid4()),
        "path": dir_path,
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    dirs.append(entry)
    _save(registry_path, dirs)
    return entry


def update_dir(registry_path: Path, dir_id: str, **kwargs) -> dict:
    dirs = _load(registry_path)
    for d in dirs:
        if d["id"] == dir_id:
            for k, v in kwargs.items():
                if v is not None:
                    d[k] = v
            _save(registry_path, dirs)
            return d
    raise KeyError(f"Directory not found: {dir_id}")


def remove_dir(registry_path: Path, dir_id: str) -> None:
    dirs = _load(registry_path)
    remaining = [d for d in dirs if d["id"] != dir_id]
    if len(remaining) == len(dirs):
        raise KeyError(f"Directory not found: {dir_id}")
    _save(registry_path, remaining)
