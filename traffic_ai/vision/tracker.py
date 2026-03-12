"""Simple centroid tracker for lightweight traffic analytics."""

from __future__ import annotations

from dataclasses import dataclass, field
import math
import time

from traffic_ai.models import Detection, Track


@dataclass(slots=True)
class _TrackState:
    track_id: int
    label: str
    centroid: tuple[int, int]
    last_seen: float
    speed_px_per_s: float = 0.0
    missed_frames: int = 0
    age_frames: int = 1
    history: list[tuple[float, tuple[int, int]]] = field(default_factory=list)


class CentroidTracker:
    """Greedy centroid tracker that keeps IDs stable enough for live dashboards."""

    def __init__(self, max_distance: float = 95.0, max_missed: int = 10, exit_margin: int = 48) -> None:
        self.max_distance = max_distance
        self.max_missed = max_missed
        self.exit_margin = exit_margin
        self._tracks: dict[int, _TrackState] = {}
        self._next_id = 1
        self._pending_exits = 0

    def update(self, detections: list[Detection], timestamp: float | None = None) -> list[Track]:
        now = timestamp or time.time()
        unmatched = list(detections)

        for track_id, state in list(self._tracks.items()):
            best_index = -1
            best_distance = float("inf")
            for index, detection in enumerate(unmatched):
                if state.label != "vehicle" and detection.label != state.label and detection.label != "vehicle":
                    continue
                distance = self._distance(state.centroid, detection.center)
                if distance < best_distance:
                    best_distance = distance
                    best_index = index

            if best_index >= 0 and best_distance <= self.max_distance:
                detection = unmatched.pop(best_index)
                delta_seconds = max(now - state.last_seen, 0.001)
                instant_speed = best_distance / delta_seconds
                state.speed_px_per_s = (state.speed_px_per_s * 0.6) + (instant_speed * 0.4)
                state.centroid = detection.center
                state.last_seen = now
                state.missed_frames = 0
                state.age_frames += 1
                state.history.append((now, detection.center))
                detection.track_id = track_id
            else:
                state.missed_frames += 1
                if state.missed_frames > self.max_missed:
                    if state.age_frames >= 2 or self._is_exit_point(state.centroid):
                        self._pending_exits += 1
                    del self._tracks[track_id]

        for detection in unmatched:
            track_id = self._next_id
            self._next_id += 1
            self._tracks[track_id] = _TrackState(
                track_id=track_id,
                label=detection.label,
                centroid=detection.center,
                last_seen=now,
                history=[(now, detection.center)],
            )
            detection.track_id = track_id

        return [
            Track(
                track_id=state.track_id,
                label=state.label,
                x=state.centroid[0],
                y=state.centroid[1],
                speed_px_per_s=state.speed_px_per_s,
                age_frames=state.age_frames,
                last_seen=state.last_seen,
            )
            for state in self._tracks.values()
        ]

    def consume_exits(self) -> int:
        count = self._pending_exits
        self._pending_exits = 0
        return count

    @staticmethod
    def _distance(left: tuple[int, int], right: tuple[int, int]) -> float:
        return math.hypot(left[0] - right[0], left[1] - right[1])

    def _is_exit_point(self, centroid: tuple[int, int]) -> bool:
        x, y = centroid
        return x <= self.exit_margin or y <= self.exit_margin
