"""Analytics and scoring logic for live traffic monitoring."""

from __future__ import annotations

from collections import Counter, deque
from datetime import datetime, timezone
import math
import statistics

from traffic_ai.models import CorridorState, Detection, SuggestionPacket, Track, TrafficSnapshot
from traffic_ai.vision.detector import normalize_label


CORRIDOR_ORDER = ("north", "east", "south", "west")
HEAVY_VEHICLES = {"bus", "truck", "tractor"}
TWO_WHEELERS = {"motorcycle", "bicycle"}
COUNTED_VEHICLES = {"car", "motorcycle", "bicycle", "bus", "truck", "tractor", "vehicle", "auto-rickshaw"}
VEHICLE_WEIGHTS = {
    "car": 1.0,
    "motorcycle": 0.7,
    "bicycle": 0.45,
    "bus": 2.5,
    "truck": 2.8,
    "tractor": 2.6,
    "vehicle": 1.0,
    "auto-rickshaw": 0.9,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clone_suggestion(packet: SuggestionPacket | None) -> SuggestionPacket:
    if packet is None:
        return SuggestionPacket()
    return SuggestionPacket(
        suggestions=list(packet.suggestions),
        source=packet.source,
        generated_at_iso=packet.generated_at_iso,
        status=packet.status,
        warning=packet.warning,
    )


class TrafficAnalyticsEngine:
    """Derives corridor pressure and controller recommendations from detections."""

    def __init__(self, history_limit: int = 180) -> None:
        self.timeline: deque[dict[str, object]] = deque(maxlen=history_limit)
        self._throughput_events: deque[float] = deque()

    def analyze(
        self,
        frame_shape: tuple[int, ...],
        detections: list[Detection],
        tracks: list[Track],
        exited_count: int,
        fps: float,
        source_meta: dict[str, str],
        vision_backend: str,
        suggestion_packet: SuggestionPacket | None,
    ) -> TrafficSnapshot:
        height, width = int(frame_shape[0]), int(frame_shape[1])
        corridors = {name: CorridorState(name=name) for name in CORRIDOR_ORDER}
        track_map = {track.track_id: track for track in tracks}
        motion_samples = {name: [] for name in CORRIDOR_ORDER}
        class_breakdown: Counter[str] = Counter()

        for detection in detections:
            label = normalize_label(detection.label)
            class_breakdown[label] += 1
            corridor_name = self._resolve_corridor(detection.center, width, height)
            corridor = corridors[corridor_name]

            if label in COUNTED_VEHICLES:
                corridor.vehicle_count += 1
                corridor.weighted_count += VEHICLE_WEIGHTS.get(label, 1.0)
            if label == "person":
                corridor.pedestrian_count += 1
            if label in HEAVY_VEHICLES:
                corridor.heavy_vehicle_count += 1
            if label in TWO_WHEELERS:
                corridor.two_wheeler_count += 1
            corridor.label_breakdown[label] = corridor.label_breakdown.get(label, 0) + 1

            if detection.track_id is not None and detection.track_id in track_map:
                motion_samples[corridor_name].append(track_map[detection.track_id].speed_px_per_s)

        diagonal = max(math.hypot(width, height), 1.0)
        target_motion = diagonal * 0.055
        mobility_samples: list[float] = []

        for corridor in corridors.values():
            dominant = sorted(
                corridor.label_breakdown.items(),
                key=lambda item: item[1],
                reverse=True,
            )[:2]
            corridor.dominant_labels = [item[0] for item in dominant]
            corridor.average_motion = (
                statistics.fmean(motion_samples[corridor.name]) if motion_samples[corridor.name] else 0.0
            )

            density_score = min(100.0, corridor.weighted_count * 14.0)
            motion_score = (
                min(100.0, (corridor.average_motion / target_motion) * 100.0)
                if corridor.vehicle_count
                else 100.0
            )
            mobility_samples.append(motion_score)
            heavy_penalty = min(16.0, corridor.heavy_vehicle_count * 5.5)
            two_wheeler_penalty = 8.0 if corridor.two_wheeler_count >= 6 else 0.0
            pedestrian_penalty = min(10.0, corridor.pedestrian_count * 1.8)
            corridor.pressure = min(
                100.0,
                (density_score * 0.68)
                + ((100.0 - motion_score) * 0.32)
                + heavy_penalty
                + two_wheeler_penalty
                + pedestrian_penalty,
            )

        vehicle_count = sum(corridor.vehicle_count for corridor in corridors.values())
        pedestrian_count = sum(corridor.pedestrian_count for corridor in corridors.values())
        weighted_total = sum(corridor.weighted_count for corridor in corridors.values())
        average_mobility = statistics.fmean(mobility_samples) if mobility_samples else 100.0
        congestion_index = min(
            100.0,
            (min(100.0, weighted_total * 9.5) * 0.65)
            + ((100.0 - average_mobility) * 0.35)
            + min(8.0, pedestrian_count * 1.2),
        )
        throughput_per_min = self._throughput_per_min(exited_count)
        recommended_corridor = self._recommended_corridor(corridors)
        controller_note = self._controller_note(corridors, recommended_corridor, congestion_index, pedestrian_count)
        alerts = self._build_alerts(corridors, congestion_index, pedestrian_count)

        captured_at_iso = _now_iso()
        self.timeline.append(
            {
                "timestamp": captured_at_iso,
                "vehicles": vehicle_count,
                "congestion": round(congestion_index, 1),
                "mobility": round(average_mobility, 1),
                "throughput": round(throughput_per_min, 1),
                "pressure": round(corridors[recommended_corridor].pressure, 1) if recommended_corridor != "none" else 0.0,
                "hotCorridor": recommended_corridor,
            }
        )

        return TrafficSnapshot(
            captured_at_iso=captured_at_iso,
            source_type=source_meta.get("source_type", "unknown"),
            source_value=source_meta.get("source_value", ""),
            source_status=source_meta.get("status", "Unknown"),
            vision_backend=vision_backend,
            fps=fps,
            vehicle_count=vehicle_count,
            class_breakdown=dict(class_breakdown),
            corridors=corridors,
            congestion_index=congestion_index,
            mobility_score=average_mobility,
            throughput_per_min=throughput_per_min,
            recommended_corridor=recommended_corridor,
            controller_note=controller_note,
            alerts=alerts,
            suggestions=clone_suggestion(suggestion_packet),
            timeline=list(self.timeline),
            recent_detections=[detection.to_dict() for detection in detections[:12]],
        )

    def idle_snapshot(
        self,
        fps: float,
        source_meta: dict[str, str],
        vision_backend: str,
        suggestion_packet: SuggestionPacket | None,
        reason: str,
    ) -> TrafficSnapshot:
        throughput_per_min = self._throughput_per_min(0)
        return TrafficSnapshot(
            captured_at_iso=_now_iso(),
            source_type=source_meta.get("source_type", "unknown"),
            source_value=source_meta.get("source_value", ""),
            source_status=source_meta.get("status", "Idle"),
            vision_backend=vision_backend,
            fps=fps,
            vehicle_count=0,
            class_breakdown={},
            corridors={name: CorridorState(name=name) for name in CORRIDOR_ORDER},
            congestion_index=0.0,
            mobility_score=0.0,
            throughput_per_min=throughput_per_min,
            recommended_corridor="none",
            controller_note=reason,
            alerts=[reason],
            suggestions=clone_suggestion(suggestion_packet),
            timeline=list(self.timeline),
            recent_detections=[],
        )

    def error_snapshot(
        self,
        fps: float,
        source_meta: dict[str, str],
        vision_backend: str,
        suggestion_packet: SuggestionPacket | None,
        reason: str,
    ) -> TrafficSnapshot:
        snapshot = self.idle_snapshot(fps, source_meta, vision_backend, suggestion_packet, reason)
        snapshot.source_status = "Error"
        return snapshot

    def _throughput_per_min(self, exited_count: int) -> float:
        now = datetime.now(timezone.utc).timestamp()
        for _ in range(max(0, exited_count)):
            self._throughput_events.append(now)
        while self._throughput_events and now - self._throughput_events[0] > 60.0:
            self._throughput_events.popleft()
        return float(len(self._throughput_events))

    @staticmethod
    def _resolve_corridor(center: tuple[int, int], width: int, height: int) -> str:
        x, y = center
        dx = x - (width / 2.0)
        dy = y - (height / 2.0)
        if abs(dy) >= abs(dx):
            return "north" if dy < 0 else "south"
        return "west" if dx < 0 else "east"

    @staticmethod
    def _recommended_corridor(corridors: dict[str, CorridorState]) -> str:
        active = [corridor for corridor in corridors.values() if corridor.vehicle_count or corridor.pedestrian_count]
        if not active:
            return "none"
        return max(active, key=lambda corridor: corridor.pressure).name

    @staticmethod
    def _controller_note(
        corridors: dict[str, CorridorState],
        recommended_corridor: str,
        congestion_index: float,
        pedestrian_count: int,
    ) -> str:
        if recommended_corridor == "none":
            return "Traffic is light. Keep short adaptive cycles and continue passive monitoring."

        corridor = corridors[recommended_corridor]
        dominant = ", ".join(corridor.dominant_labels) or "mixed traffic"
        if congestion_index >= 75:
            return (
                f"{recommended_corridor.title()} corridor is critical. Extend green time, meter cross-flow, "
                f"and manually discipline {dominant} clusters if field staff are available."
            )
        if corridor.two_wheeler_count >= 6:
            return (
                f"{recommended_corridor.title()} corridor is motorcycle-heavy. Favor smoother release waves "
                "and keep a protected buffer near the stop line."
            )
        if pedestrian_count >= 6:
            return "Pedestrian activity is rising. Keep a safer crossing gap before restoring full green."
        return (
            f"{recommended_corridor.title()} corridor carries the highest pressure. Favor a slightly longer green "
            f"window while monitoring {dominant} buildup."
        )

    @staticmethod
    def _build_alerts(
        corridors: dict[str, CorridorState],
        congestion_index: float,
        pedestrian_count: int,
    ) -> list[str]:
        alerts: list[str] = []
        if congestion_index >= 75:
            alerts.append("System congestion is high and needs intervention.")
        elif congestion_index >= 55:
            alerts.append("Traffic is building up and should be watched closely.")

        if pedestrian_count >= 6:
            alerts.append("Pedestrian spillover detected near the carriageway.")

        for corridor in corridors.values():
            if corridor.heavy_vehicle_count >= 2 and corridor.pressure >= 55:
                alerts.append(f"Heavy vehicles are clustering on the {corridor.name} approach.")
            if corridor.two_wheeler_count >= 8:
                alerts.append(f"High two-wheeler density on the {corridor.name} corridor.")

        return alerts[:5]
