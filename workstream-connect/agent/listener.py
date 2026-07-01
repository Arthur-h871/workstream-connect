from supabase import Client


class SessionListener:
    """
    Escuta mudanças em capture_sessions para o usuário autenticado.
    Chama callbacks quando o status muda.
    """

    def __init__(self, client: Client, user_id: str):
        self._client = client
        self._user_id = user_id
        self._current_session: dict | None = None
        self._channel = None
        self._on_start_callbacks: list = []
        self._on_pause_callbacks: list = []
        self._on_resume_callbacks: list = []
        self._on_stop_callbacks: list = []

    def on_start(self, fn):
        self._on_start_callbacks.append(fn)

    def on_pause(self, fn):
        self._on_pause_callbacks.append(fn)

    def on_resume(self, fn):
        self._on_resume_callbacks.append(fn)

    def on_stop(self, fn):
        self._on_stop_callbacks.append(fn)

    def _handle_change(self, payload):
        record = payload.get("new", {})
        status = record.get("status")
        session_id = record.get("id")
        event_type = payload.get("eventType")

        if event_type == "INSERT" and status == "active":
            self._current_session = record
            for cb in self._on_start_callbacks:
                cb(session_id, record)

        elif event_type == "UPDATE":
            prev_status = (self._current_session or {}).get("status")
            self._current_session = record

            if status == "paused":
                for cb in self._on_pause_callbacks:
                    cb(session_id)
            elif status == "active" and prev_status == "paused":
                for cb in self._on_resume_callbacks:
                    cb(session_id)
            elif status == "stopped":
                for cb in self._on_stop_callbacks:
                    cb(session_id)

        elif event_type == "DELETE":
            self._current_session = None
            for cb in self._on_stop_callbacks:
                cb(session_id)

    def start(self):
        self._channel = (
            self._client.realtime.channel("session-control")
            .on_postgres_changes(
                event="*",
                schema="public",
                table="capture_sessions",
                filter=f"user_id=eq.{self._user_id}",
                callback=self._handle_change,
            )
            .subscribe()
        )
