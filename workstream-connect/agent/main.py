import threading
import time
import signal
import sys

from supabase import create_client
from config import (
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    AGENT_EMAIL,
    AGENT_PASSWORD,
    CAPTURE_INTERVAL_SECONDS,
)
from capture import capture_screenshot
from uploader import upload_screenshot
from listener import SessionListener


def main():
    print("[marco-agent] Iniciando...")

    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    auth_response = client.auth.sign_in_with_password(
        {"email": AGENT_EMAIL, "password": AGENT_PASSWORD}
    )
    user = auth_response.user
    if not user:
        print(
            "[marco-agent] Falha na autenticação. Verifique AGENT_EMAIL e AGENT_PASSWORD."
        )
        sys.exit(1)

    profile = (
        client.table("profiles")
        .select("id, organization_id")
        .eq("id", user.id)
        .single()
        .execute()
        .data
    )
    user_id = profile["id"]
    org_id = profile["organization_id"]

    print(f"[marco-agent] Autenticado como {AGENT_EMAIL} (org: {org_id})")

    capturing = threading.Event()
    current_session_id: list[str | None] = [None]

    def capture_loop():
        while True:
            capturing.wait()
            if current_session_id[0] is None:
                time.sleep(1)
                continue
            try:
                image_bytes = capture_screenshot()
                upload_screenshot(
                    client, image_bytes, user_id, org_id, current_session_id[0]
                )
                print(
                    f"[marco-agent] Screenshot capturado para sessão {current_session_id[0]}"
                )
            except Exception as e:
                print(f"[marco-agent] Erro ao capturar: {e}")
            time.sleep(CAPTURE_INTERVAL_SECONDS)

    def on_start(session_id, _record):
        print(f"[marco-agent] Sessão iniciada: {session_id}")
        current_session_id[0] = session_id
        capturing.set()

    def on_pause(session_id):
        print(f"[marco-agent] Sessão pausada: {session_id}")
        capturing.clear()

    def on_resume(session_id):
        print(f"[marco-agent] Sessão retomada: {session_id}")
        capturing.set()

    def on_stop(session_id):
        print(f"[marco-agent] Sessão encerrada: {session_id}")
        capturing.clear()
        current_session_id[0] = None

    listener = SessionListener(client, user_id)
    listener.on_start(on_start)
    listener.on_pause(on_pause)
    listener.on_resume(on_resume)
    listener.on_stop(on_stop)
    listener.start()

    capture_thread = threading.Thread(target=capture_loop, daemon=True)
    capture_thread.start()

    def shutdown(signum, frame):
        print("\n[marco-agent] Encerrando...")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("[marco-agent] Aguardando sessões...")
    client.realtime.listen()


if __name__ == "__main__":
    main()
