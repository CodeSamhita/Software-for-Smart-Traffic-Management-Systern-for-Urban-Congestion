"""Frame source management for cameras, videos, and still images."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from traffic_ai.exceptions import SourceError

logger = logging.getLogger(__name__)


class FrameSourceManager:
    """OpenCV-backed source manager with easy source switching."""

    def __init__(self, frame_width: int, frame_height: int) -> None:
        import cv2

        self.cv2 = cv2
        self.frame_width = frame_width
        self.frame_height = frame_height
        self._capture = None
        self._static_frame: np.ndarray | None = None
        self._source_type = "camera"
        self._source_value = "0"
        self._status = "Idle"
        self._last_error = ""

    def open(self, source_type: str, source_value: str) -> None:
        source_type = (source_type or "camera").strip().lower()
        source_value = (source_value or "0").strip() or "0"
        self._source_type = source_type
        self._source_value = source_value
        self.close()

        try:
            if source_type == "camera":
                self._open_camera(source_value)
            elif source_type == "video":
                self._open_video(source_value)
            elif source_type == "image":
                self._open_image(source_value)
            else:
                raise SourceError(f"Unsupported source type: {source_type}")
        except Exception as exc:
            self._status = "Error"
            self._last_error = str(exc)
            raise

        self._last_error = ""
        logger.info("Source switched to %s (%s)", self._source_type, self._source_value)

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self._source_type == "image" and self._static_frame is not None:
            self._status = "Static image loaded"
            return True, self._static_frame.copy()

        if self._capture is None:
            self._status = "Source not ready"
            return False, None

        ok, frame = self._capture.read()
        if ok and frame is not None:
            self._status = "Streaming"
            return True, frame

        if self._source_type == "video":
            try:
                self._capture.set(self.cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self._capture.read()
                if ok and frame is not None:
                    self._status = "Streaming loop"
                    return True, frame
            except Exception as exc:
                self._last_error = f"Unable to loop video source: {exc}"

        self._status = "Waiting for frames"
        return False, None

    def describe(self) -> dict[str, str]:
        return {
            "source_type": self._source_type,
            "source_value": self._source_value,
            "status": self._status,
            "last_error": self._last_error,
        }

    def close(self) -> None:
        try:
            if self._capture is not None:
                self._capture.release()
        except Exception:
            logger.debug("Ignoring source release error.", exc_info=True)
        self._capture = None
        self._static_frame = None

    def _open_camera(self, source_value: str) -> None:
        index = int(source_value)
        backend = getattr(self.cv2, "CAP_DSHOW", self.cv2.CAP_ANY)
        capture = self.cv2.VideoCapture(index, backend)
        capture.set(self.cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
        capture.set(self.cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
        if not capture.isOpened():
            capture.release()
            raise SourceError(f"Camera {index} could not be opened.")
        self._capture = capture
        self._status = f"Camera {index} ready"

    def _open_video(self, source_value: str) -> None:
        path = Path(source_value)
        if not path.exists():
            raise SourceError(f"Video file not found: {path}")
        capture = self.cv2.VideoCapture(str(path))
        if not capture.isOpened():
            capture.release()
            raise SourceError(f"Video file could not be opened: {path}")
        self._capture = capture
        self._status = f"Video loaded: {path.name}"

    def _open_image(self, source_value: str) -> None:
        path = Path(source_value)
        if not path.exists():
            raise SourceError(f"Image file not found: {path}")
        frame = self.cv2.imread(str(path))
        if frame is None:
            raise SourceError(f"Image file could not be decoded: {path}")
        self._static_frame = frame
        self._status = f"Image loaded: {path.name}"
