"""Supabase Realtime listener for session control."""
import asyncio
import logging
from typing import Callable, Optional

from supabase import Client

logger = logging.getLogger(__name__)


class RealtimeController:
    """Manages Realtime subscription to capture_sessions table."""

    def __init__(self):
        self.subscription = None
        self.task = None

    async def listen_session_changes(
        self,
        client: Client,
        session_id: str,
        on_pause: Callable[[], None],
        on_stop: Callable[[], None],
    ) -> None:
        """
        Subscribe to capture_sessions changes for a specific session.

        Listens for status updates:
        - status='paused' → calls on_pause()
        - status='stopped' → calls on_stop()

        If Realtime connection fails, logs error once and exits gracefully.

        Args:
            client: Supabase client
            session_id: Session ID to listen for
            on_pause: Callback when session is paused
            on_stop: Callback when session is stopped
        """
        try:
            # Subscribe to changes in capture_sessions for this session
            def handle_change(payload):
                """Handle Realtime event payload."""
                if payload.get("eventType") == "UPDATE":
                    new_data = payload.get("new")
                    if new_data:
                        status = new_data.get("status")
                        if status == "paused":
                            logger.info(f"Realtime: session {session_id} paused")
                            on_pause()
                        elif status == "stopped":
                            logger.info(f"Realtime: session {session_id} stopped")
                            on_stop()

            self.subscription = (
                client.realtime.on(
                    "postgres_changes",
                    {
                        "event": "UPDATE",
                        "schema": "public",
                        "table": "capture_sessions",
                        "filter": f"id=eq.{session_id}",
                    },
                    handle_change,
                )
                .subscribe()
            )

            logger.info(f"Realtime listener started for session {session_id}")

            # Keep the subscription alive
            while True:
                await asyncio.sleep(60)

        except Exception as exc:
            logger.error(f"Realtime connection failed: {exc}")
            # Don't retry, just exit gracefully

    def stop(self) -> None:
        """Stop the Realtime listener."""
        if self.subscription:
            try:
                self.subscription.unsubscribe()
                logger.info("Realtime listener stopped")
            except Exception as exc:
                logger.error(f"Error stopping Realtime listener: {exc}")
