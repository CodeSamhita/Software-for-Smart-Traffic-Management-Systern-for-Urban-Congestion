"""Multi-camera presentation feeds for lane-level display."""

from __future__ import annotations

import logging
import threading
import time

import numpy as np

from traffic_ai.services.source_manager import FrameSourceManager

logger = logging.getLogger(__name__)


class PresentationFeedService:
    """Maintains up to four live preview feeds for presentation."""

    SLOT_NAMES = ("north", "south", "east", "west")
    DEFAULT_LABELS = {
        "north": "North",
        "south": "South",
        "east": "East",
        "west": "West",
    }

    def __init__(self, frame_width: int, frame_height: int) -> None:
        import cv2

        self.cv2 = cv2
        self.frame_width = frame_width
        self.frame_height = frame_height
        self._lock = threading.RLock()
        self._sources = {
            slot: FrameSourceManager(frame_width=frame_width, frame_height=frame_height)
            for slot in self.SLOT_NAMES
        }
        self._configs = {
            slot: {"source_type": "camera", "source_value": "", "label": self.DEFAULT_LABELS[slot]}
            for slot in self.SLOT_NAMES
        }

    def set_slot_source(self, slot: str, source_type: str, source_value: str, label: str = "") -> dict[str, str]:
        if slot not in self._sources:
            raise ValueError(f"Unknown presentation slot: {slot}")

        with self._lock:
            self._sources[slot].open(source_type, source_value)
            self._configs[slot] = {
                "source_type": source_type,
                "source_value": source_value,
                "label": label.strip()[:40] or self._configs[slot]["label"],
            }
            status = self._sources[slot].describe()
            return {**self._configs[slot], **status}

    def clear_slot_source(self, slot: str) -> dict[str, str]:
        if slot not in self._sources:
            raise ValueError(f"Unknown presentation slot: {slot}")

        with self._lock:
            self._sources[slot].close()
            self._configs[slot] = {
                "source_type": "camera",
                "source_value": "",
                "label": self.DEFAULT_LABELS[slot],
            }
            return {**self._configs[slot], **self._sources[slot].describe()}

    def get_slot_state(self, slot: str) -> dict[str, str]:
        with self._lock:
            return {**self._configs[slot], **self._sources[slot].describe()}

    def all_states(self) -> dict[str, dict[str, str]]:
        with self._lock:
            return {slot: self.get_slot_state(slot) for slot in self.SLOT_NAMES}

    def composite_frame(self) -> tuple[bool, np.ndarray, dict[str, dict[str, str]]]:
        frames: list[np.ndarray] = []
        states: dict[str, dict[str, str]] = {}

        with self._lock:
            for slot in self.SLOT_NAMES:
                frame, state = self._read_frame_and_state(slot)
                frames.append(frame)
                states[slot] = state

        height = max(frame.shape[0] for frame in frames)
        width = max(frame.shape[1] for frame in frames)
        normalized = [self.cv2.resize(frame, (width, height)) for frame in frames]
        top = np.hstack((normalized[0], normalized[2]))
        bottom = np.hstack((normalized[1], normalized[3]))
        composite = np.vstack((top, bottom))
        any_live = any(state.get("status") not in {"Idle", "Source not ready"} and not state.get("last_error") for state in states.values())
        return any_live, composite, states

    def stream_slot(self, slot: str):
        if slot not in self._sources:
            raise ValueError(f"Unknown presentation slot: {slot}")

        while True:
            frame_bytes = self._read_encoded(slot)
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            time.sleep(0.08)

    def _read_encoded(self, slot: str) -> bytes:
        with self._lock:
            frame, _ = self._read_frame_and_state(slot)

        ok, encoded = self.cv2.imencode(".jpg", frame)
        return encoded.tobytes() if ok else b""

    def _read_frame_and_state(self, slot: str) -> tuple[np.ndarray, dict[str, str]]:
        source = self._sources[slot]
        state = self._configs[slot]
        ok, frame = source.read()
        meta = source.describe()
        merged_state = {**state, **meta}

        if not ok or frame is None:
            frame = self._placeholder_frame(
                title=state["label"],
                message=meta.get("last_error") or meta.get("status") or "Add a feed manually",
            )
        else:
            frame = self._annotate_frame(frame, state["label"], meta.get("status", "Streaming"))

        return frame, merged_state

    def _annotate_frame(self, frame: np.ndarray, title: str, status: str) -> np.ndarray:
        annotated = frame.copy()
        self.cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 54), (7, 19, 28), -1)
        self.cv2.putText(
            annotated,
            title,
            (18, 24),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.72,
            (226, 232, 240),
            2,
            self.cv2.LINE_AA,
        )
        self.cv2.putText(
            annotated,
            status[:48],
            (18, 46),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (94, 234, 212),
            1,
            self.cv2.LINE_AA,
        )
        return annotated

    def _placeholder_frame(self, title: str, message: str) -> np.ndarray:
        frame = np.zeros((360, 640, 3), dtype=np.uint8)
        frame[:, :] = (7, 19, 28)
        self.cv2.putText(
            frame,
            title,
            (24, 64),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (226, 232, 240),
            2,
            self.cv2.LINE_AA,
        )
        self.cv2.putText(
            frame,
            message[:70],
            (24, 112),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.64,
            (148, 163, 184),
            2,
            self.cv2.LINE_AA,
        )
        return frame
