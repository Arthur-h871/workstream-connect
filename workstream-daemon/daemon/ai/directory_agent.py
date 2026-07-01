# workstream-daemon/daemon/ai/directory_agent.py
"""Thin wrapper that delegates to the configured apontamento generator."""
import logging

from daemon.ai.apontamento_generator import create_generator

logger = logging.getLogger(__name__)


def generate_directory_apontamento(
    dir_path: str,
    description: str,
    diff: dict,
    note: str = "",
    screenshots: list = [],
) -> dict:
    """Generate a directory apontamento using the configured generator."""
    logger.info(
        "Analyzing %s: %s created, %s modified",
        dir_path,
        len(diff.get("created", [])),
        len(diff.get("modified", [])),
    )
    generator = create_generator()
    result = generator.generate(dir_path, description, diff, note, screenshots)
    logger.info("Apontamento generated: %sh", result["hours_worked"])
    return result
