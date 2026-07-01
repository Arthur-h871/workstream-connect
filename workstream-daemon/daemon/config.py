from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    anthropic_api_key: str
    port: int = 7432
    screenshot_interval_seconds: int = 30
    data_dir: Path = Path.home() / ".workstream-daemon"

    @property
    def bases_dir(self) -> Path:
        return self.data_dir / "bases"

    @property
    def registry_path(self) -> Path:
        return self.data_dir / "directories.json"

settings = Settings()
