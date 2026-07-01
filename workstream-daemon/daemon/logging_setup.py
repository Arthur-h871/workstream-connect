"""Logging configuration for daemon."""
import logging


def get_logger(name: str) -> logging.Logger:
    """
    Get a configured logger for the daemon.

    Sets up structured logging with timestamps and level indicators.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured logger instance
    """
    # Only configure once
    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    return logging.getLogger(name)
