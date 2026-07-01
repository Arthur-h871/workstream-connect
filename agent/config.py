import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
AGENT_EMAIL = os.environ["AGENT_EMAIL"]
AGENT_PASSWORD = os.environ["AGENT_PASSWORD"]
CAPTURE_INTERVAL_SECONDS = int(os.getenv("CAPTURE_INTERVAL_SECONDS", "30"))
