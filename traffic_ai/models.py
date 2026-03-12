"""Data models shared across the application."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Detection:
    label: str
    confidence: float
    x1: int
    y1: int
    x2: int
    y2: int
    track_id: int | None = None

    @property
    def center(self) -> tuple[int, int]:
        return ((self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2)

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "box": [self.x1, self.y1, self.x2, self.y2],
            "track_id": self.track_id,
        }


@dataclass(slots=True)
class Track:
    track_id: int
    label: str
    x: int
    y: int
    speed_px_per_s: float
    age_frames: int
    last_seen: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "track_id": self.track_id,
            "label": self.label,
            "center": [self.x, self.y],
            "speed_px_per_s": round(self.speed_px_per_s, 2),
            "age_frames": self.age_frames,
            "last_seen": self.last_seen,
        }


@dataclass(slots=True)
class CorridorState:
    name: str
    vehicle_count: int = 0
    pedestrian_count: int = 0
    weighted_count: float = 0.0
    average_motion: float = 0.0
    pressure: float = 0.0
    heavy_vehicle_count: int = 0
    two_wheeler_count: int = 0
    label_breakdown: dict[str, int] = field(default_factory=dict)
    dominant_labels: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "vehicle_count": self.vehicle_count,
            "pedestrian_count": self.pedestrian_count,
            "weighted_count": round(self.weighted_count, 2),
            "average_motion": round(self.average_motion, 2),
            "pressure": round(self.pressure, 1),
            "heavy_vehicle_count": self.heavy_vehicle_count,
            "two_wheeler_count": self.two_wheeler_count,
            "label_breakdown": dict(sorted(self.label_breakdown.items(), key=lambda item: item[0])),
            "dominant_labels": self.dominant_labels,
        }


@dataclass(slots=True)
class SuggestionPacket:
    suggestions: list[str] = field(default_factory=list)
    source: str = "system"
    generated_at_iso: str = ""
    status: str = "idle"
    warning: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "suggestions": self.suggestions,
            "source": self.source,
            "generated_at_iso": self.generated_at_iso,
            "status": self.status,
            "warning": self.warning,
        }


@dataclass(slots=True)
class TrafficSnapshot:
    captured_at_iso: str
    source_type: str
    source_value: str
    source_status: str
    vision_backend: str
    fps: float
    vehicle_count: int
    class_breakdown: dict[str, int]
    corridors: dict[str, CorridorState]
    congestion_index: float
    mobility_score: float
    throughput_per_min: float
    recommended_corridor: str
    controller_note: str
    alerts: list[str] = field(default_factory=list)
    suggestions: SuggestionPacket = field(default_factory=SuggestionPacket)
    timeline: list[dict[str, Any]] = field(default_factory=list)
    recent_detections: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "captured_at_iso": self.captured_at_iso,
            "source_type": self.source_type,
            "source_value": self.source_value,
            "source_status": self.source_status,
            "vision_backend": self.vision_backend,
            "fps": round(self.fps, 2),
            "vehicle_count": self.vehicle_count,
            "class_breakdown": dict(sorted(self.class_breakdown.items(), key=lambda item: item[0])),
            "corridors": {name: corridor.to_dict() for name, corridor in self.corridors.items()},
            "congestion_index": round(self.congestion_index, 1),
            "mobility_score": round(self.mobility_score, 1),
            "throughput_per_min": round(self.throughput_per_min, 1),
            "recommended_corridor": self.recommended_corridor,
            "controller_note": self.controller_note,
            "alerts": self.alerts,
            "suggestions": self.suggestions.to_dict(),
            "timeline": self.timeline,
            "recent_detections": self.recent_detections,
        }
