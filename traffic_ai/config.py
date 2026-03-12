"""Configuration loading for the traffic AI system."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


def _try_load_dotenv() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except Exception:
        # The bootstrap layer installs dotenv when available, but config loading
        # should still work if it is missing.
        return


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _env_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    parts = [part.strip().lower() for part in raw.split(",")]
    return tuple(part for part in parts if part)


@dataclass(slots=True)
class AppConfig:
    project_root: Path
    runtime_dir: Path
    upload_dir: Path
    host: str
    port: int
    debug: bool
    source_type: str
    source_value: str
    frame_width: int
    frame_height: int
    target_fps: float
    history_limit: int
    advisor_interval_seconds: float
    detector_model_path: str
    detector_confidence: float
    detector_iou: float
    classes_of_interest: tuple[str, ...]
    openai_enabled: bool
    openai_api_key: str
    openai_model: str
    openai_timeout_seconds: float
    openai_use_image_context: bool
    ollama_enabled: bool
    ollama_host: str
    ollama_model: str


def load_config(project_root: Path) -> AppConfig:
    """Load configuration from environment variables and sensible defaults."""
    _try_load_dotenv()

    runtime_dir = project_root / "runtime"
    upload_dir = runtime_dir / "uploads"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    upload_dir.mkdir(parents=True, exist_ok=True)

    return AppConfig(
        project_root=project_root,
        runtime_dir=runtime_dir,
        upload_dir=upload_dir,
        host=os.getenv("HOST", "127.0.0.1"),
        port=_env_int("PORT", 8501),
        debug=_env_bool("DEBUG", False),
        source_type=os.getenv("SOURCE_TYPE", "camera").strip().lower() or "camera",
        source_value=os.getenv("SOURCE_VALUE", "0").strip() or "0",
        frame_width=_env_int("FRAME_WIDTH", 1280),
        frame_height=_env_int("FRAME_HEIGHT", 720),
        target_fps=_env_float("TARGET_FPS", 12.0),
        history_limit=_env_int("HISTORY_LIMIT", 180),
        advisor_interval_seconds=_env_float("ADVISOR_INTERVAL_SECONDS", 6.0),
        detector_model_path=os.getenv("VISION_MODEL_PATH", "yolov8n.pt"),
        detector_confidence=_env_float("VISION_CONFIDENCE", 0.35),
        detector_iou=_env_float("VISION_IOU", 0.5),
        classes_of_interest=_env_list(
            "VISION_CLASSES",
            (
                "car",
                "motorcycle",
                "bicycle",
                "bus",
                "truck",
                "person",
                "tractor",
                "auto-rickshaw",
                "rickshaw",
                "vehicle",
            ),
        ),
        openai_enabled=_env_bool("OPENAI_ENABLED", True),
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini",
        openai_timeout_seconds=_env_float("OPENAI_TIMEOUT_SECONDS", 15.0),
        openai_use_image_context=_env_bool("OPENAI_USE_IMAGE_CONTEXT", False),
        ollama_enabled=_env_bool("OLLAMA_ENABLED", True),
        ollama_host=os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").strip()
        or "http://127.0.0.1:11434",
        ollama_model=os.getenv("OLLAMA_MODEL", "llama3.2").strip() or "llama3.2",
    )
