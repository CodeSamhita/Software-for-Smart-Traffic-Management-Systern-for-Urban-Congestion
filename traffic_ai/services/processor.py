"""Main processing loop for live traffic monitoring."""

from __future__ import annotations

from collections import deque
import logging
import threading
import time

import numpy as np

from traffic_ai.config import AppConfig
from traffic_ai.models import SuggestionPacket, TrafficSnapshot
from traffic_ai.services.advisors import AdvisoryOrchestrator, OllamaAdvisor, OpenAIAdvisor, RuleBasedAdvisor
from traffic_ai.services.analytics import TrafficAnalyticsEngine
from traffic_ai.services.source_manager import FrameSourceManager
from traffic_ai.vision.detector import build_detector
from traffic_ai.vision.tracker import CentroidTracker

logger = logging.getLogger(__name__)


class TrafficProcessor:
    """Coordinates vision, analytics, advice, and video streaming."""

    def __init__(self, config: AppConfig) -> None:
        import cv2

        self.cv2 = cv2
        self.config = config
        self.source_manager = FrameSourceManager(config.frame_width, config.frame_height)
        self.detector = build_detector(config)
        self.tracker = CentroidTracker()
        self.analytics = TrafficAnalyticsEngine(history_limit=config.history_limit)
        self.advisors = self._build_advisors(config)

        self._lock = threading.RLock()
        self._source_lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._advisor_thread: threading.Thread | None = None
        self._latest_frame: bytes = self._encode_frame(self._placeholder_frame("Starting traffic AI pipeline..."))
        self._latest_snapshot = self.analytics.idle_snapshot(
            fps=0.0,
            source_meta={"source_type": config.source_type, "source_value": config.source_value, "status": "Starting"},
            vision_backend=self.detector.name,
            suggestion_packet=self._default_suggestions(),
            reason="Loading detector, source, and advisor services.",
        )
        self._suggestions = self._latest_snapshot.suggestions
        self._last_frame_timestamp = time.perf_counter()
        self._fps_samples: deque[float] = deque(maxlen=24)
        self._last_advisor_at = 0.0

    def start(self) -> None:
        if self._running:
            return
        self._running = True

        try:
            with self._source_lock:
                self.source_manager.open(self.config.source_type, self.config.source_value)
        except Exception as exc:
            logger.warning("Initial source open failed: %s", exc)

        self._thread = threading.Thread(target=self._run_loop, name="traffic-processor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        with self._source_lock:
            self.source_manager.close()

    def switch_source(self, source_type: str, source_value: str) -> None:
        with self._source_lock:
            self.source_manager.open(source_type, source_value)
        self.config.source_type = source_type
        self.config.source_value = source_value

    def current_state(self) -> dict[str, object]:
        with self._lock:
            return self._latest_snapshot.to_dict()

    def mjpeg_generator(self):
        while True:
            with self._lock:
                frame_bytes = self._latest_frame
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            time.sleep(0.08)

    def _run_loop(self) -> None:
        target_delay = 1.0 / max(self.config.target_fps, 1.0)

        while self._running:
            loop_started = time.perf_counter()
            try:
                with self._source_lock:
                    ok, frame = self.source_manager.read()
                    source_meta = self.source_manager.describe()

                fps = self._record_fps()
                if not ok or frame is None:
                    reason = source_meta.get("last_error") or "Waiting for frames from the selected source."
                    placeholder = self._placeholder_frame(reason)
                    snapshot = self.analytics.idle_snapshot(
                        fps=fps,
                        source_meta=source_meta,
                        vision_backend=self.detector.name,
                        suggestion_packet=self._suggestions,
                        reason=reason,
                    )
                    self._store(placeholder, snapshot)
                    time.sleep(0.4)
                    continue

                raw_frame = frame.copy()
                detections = self.detector.detect(frame)
                tracks = self.tracker.update(detections)
                exited_count = self.tracker.consume_exits()
                snapshot = self.analytics.analyze(
                    frame_shape=frame.shape,
                    detections=detections,
                    tracks=tracks,
                    exited_count=exited_count,
                    fps=fps,
                    source_meta=source_meta,
                    vision_backend=self.detector.name,
                    suggestion_packet=self._suggestions,
                )
                annotated = self._annotate_frame(frame, snapshot)
                self._store(annotated, snapshot)
                self._maybe_refresh_advice(snapshot, raw_frame)
            except Exception as exc:
                logger.exception("Processing loop error")
                source_meta = self.source_manager.describe()
                error_frame = self._placeholder_frame(f"Processing error: {exc}")
                snapshot = self.analytics.error_snapshot(
                    fps=self._record_fps(),
                    source_meta=source_meta,
                    vision_backend=self.detector.name,
                    suggestion_packet=self._suggestions,
                    reason=f"Processing error: {exc}",
                )
                self._store(error_frame, snapshot)
                time.sleep(1.0)

            elapsed = time.perf_counter() - loop_started
            if elapsed < target_delay:
                time.sleep(target_delay - elapsed)

    def _build_advisors(self, config: AppConfig) -> AdvisoryOrchestrator:
        advisors: list[object] = []
        if config.openai_enabled:
            try:
                advisors.append(
                    OpenAIAdvisor(
                        api_key=config.openai_api_key,
                        model=config.openai_model,
                        timeout_seconds=config.openai_timeout_seconds,
                        use_image_context=config.openai_use_image_context,
                    )
                )
            except Exception as exc:
                logger.warning("OpenAI advisor disabled: %s", exc)
        if config.ollama_enabled:
            advisors.append(OllamaAdvisor(host=config.ollama_host, model=config.ollama_model))
        advisors.append(RuleBasedAdvisor())
        return AdvisoryOrchestrator(advisors)

    def _maybe_refresh_advice(self, snapshot: TrafficSnapshot, frame: np.ndarray) -> None:
        now = time.time()
        if now - self._last_advisor_at < self.config.advisor_interval_seconds:
            return
        if self._advisor_thread and self._advisor_thread.is_alive():
            return

        self._last_advisor_at = now
        self._advisor_thread = threading.Thread(
            target=self._refresh_advice,
            args=(snapshot, frame.copy()),
            name="traffic-advisor",
            daemon=True,
        )
        self._advisor_thread.start()

    def _refresh_advice(self, snapshot: TrafficSnapshot, frame: np.ndarray) -> None:
        try:
            packet = self.advisors.suggest(snapshot, frame)
        except Exception as exc:
            logger.exception("Unexpected advisor failure")
            packet = SuggestionPacket(
                suggestions=[
                    "Advisor refresh failed, but live detection and analytics are still running.",
                    "Check the OpenAI key, local model service, or network availability.",
                    "Continue using the corridor pressure cards until the advisor recovers.",
                ],
                source="advisor-error",
                generated_at_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                status="degraded",
                warning=f"Risk: Advisor refresh failed with error: {exc}",
            )

        with self._lock:
            self._suggestions = packet
            self._latest_snapshot.suggestions = packet

    def _store(self, frame: np.ndarray, snapshot: TrafficSnapshot) -> None:
        encoded = self._encode_frame(frame)
        with self._lock:
            self._latest_frame = encoded
            snapshot.suggestions = self._suggestions
            self._latest_snapshot = snapshot

    def _record_fps(self) -> float:
        now = time.perf_counter()
        delta = max(now - self._last_frame_timestamp, 0.001)
        fps = 1.0 / delta
        self._fps_samples.append(fps)
        self._last_frame_timestamp = now
        return sum(self._fps_samples) / len(self._fps_samples)

    def _annotate_frame(self, frame: np.ndarray, snapshot: TrafficSnapshot) -> np.ndarray:
        height, width = frame.shape[:2]
        overlay = frame.copy()
        self.cv2.rectangle(overlay, (0, 0), (width, 96), (6, 20, 30), -1)
        frame = self.cv2.addWeighted(overlay, 0.72, frame, 0.28, 0)

        self.cv2.line(frame, (width // 2, 0), (width // 2, height), (48, 74, 94), 1)
        self.cv2.line(frame, (0, height // 2), (width, height // 2), (48, 74, 94), 1)

        corridor_colors = {
            "north": (56, 189, 248),
            "east": (45, 212, 191),
            "south": (249, 115, 22),
            "west": (244, 114, 182),
        }
        anchors = {
            "north": (24, 126),
            "east": (width - 250, 126),
            "south": (24, height - 28),
            "west": (width - 250, height - 28),
        }

        for name, corridor in snapshot.corridors.items():
            color = corridor_colors[name]
            self.cv2.putText(
                frame,
                f"{name.upper()}  P {corridor.pressure:.0f}  V {corridor.vehicle_count}",
                anchors[name],
                self.cv2.FONT_HERSHEY_SIMPLEX,
                0.62,
                color,
                2,
                self.cv2.LINE_AA,
            )

        self.cv2.putText(
            frame,
            f"Vehicles {snapshot.vehicle_count}",
            (18, 30),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.72,
            (226, 232, 240),
            2,
            self.cv2.LINE_AA,
        )
        self.cv2.putText(
            frame,
            f"Congestion {snapshot.congestion_index:.1f}",
            (18, 58),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.62,
            (96, 165, 250),
            2,
            self.cv2.LINE_AA,
        )
        self.cv2.putText(
            frame,
            f"Advisor {snapshot.suggestions.source}",
            (18, 84),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            (94, 234, 212),
            1,
            self.cv2.LINE_AA,
        )

        if snapshot.alerts:
            self.cv2.putText(
                frame,
                snapshot.alerts[0][:80],
                (width - 420, 32),
                self.cv2.FONT_HERSHEY_SIMPLEX,
                0.56,
                (248, 113, 113),
                2,
                self.cv2.LINE_AA,
            )

        return frame

    def _encode_frame(self, frame: np.ndarray) -> bytes:
        ok, encoded = self.cv2.imencode(".jpg", frame)
        if not ok:
            fallback = self._placeholder_frame("Frame encoding failed.")
            ok, encoded = self.cv2.imencode(".jpg", fallback)
            if not ok:
                return b""
        return encoded.tobytes()

    def _placeholder_frame(self, message: str) -> np.ndarray:
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        frame[:, :] = (7, 19, 28)
        self.cv2.putText(
            frame,
            "Smart Traffic AI",
            (48, 90),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            1.6,
            (226, 232, 240),
            3,
            self.cv2.LINE_AA,
        )
        self.cv2.putText(
            frame,
            message[:100],
            (48, 150),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (148, 163, 184),
            2,
            self.cv2.LINE_AA,
        )
        self.cv2.putText(
            frame,
            "The dashboard stays available even when the video source or network is unstable.",
            (48, 210),
            self.cv2.FONT_HERSHEY_SIMPLEX,
            0.68,
            (94, 234, 212),
            2,
            self.cv2.LINE_AA,
        )
        return frame

    @staticmethod
    def _default_suggestions() -> SuggestionPacket:
        return SuggestionPacket(
            suggestions=[
                "Live AI suggestions will appear here once the first traffic summary is ready.",
                "If OpenAI is unavailable, the system automatically falls back to local offline rules.",
                "You can switch among camera, image, and video sources from the dashboard.",
            ],
            source="system",
            generated_at_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            status="booting",
            warning="Risk: Suggestions may stay in offline mode until the network path is available.",
        )
