"""Vision detector abstraction for traffic understanding."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterable

import numpy as np

from traffic_ai.exceptions import DetectorError
from traffic_ai.models import Detection

logger = logging.getLogger(__name__)


LABEL_ALIASES = {
    "motorbike": "motorcycle",
    "motor": "motorcycle",
    "auto rickshaw": "auto-rickshaw",
    "autorickshaw": "auto-rickshaw",
    "rickshaw": "auto-rickshaw",
}


def normalize_label(label: str) -> str:
    normalized = label.strip().lower()
    return LABEL_ALIASES.get(normalized, normalized)


class BaseDetector:
    name = "base"

    def detect(self, frame: np.ndarray) -> list[Detection]:
        raise NotImplementedError


class MotionDetector(BaseDetector):
    """Fallback detector that tracks motion blobs when YOLO is unavailable."""

    name = "opencv-motion-fallback"

    def __init__(self, min_area: int = 900) -> None:
        import cv2

        self.cv2 = cv2
        self.min_area = min_area
        self.background = cv2.createBackgroundSubtractorMOG2(
            history=240,
            varThreshold=36,
            detectShadows=False,
        )

    def detect(self, frame: np.ndarray) -> list[Detection]:
        try:
            mask = self.background.apply(frame)
            kernel = np.ones((5, 5), dtype=np.uint8)
            mask = self.cv2.morphologyEx(mask, self.cv2.MORPH_OPEN, kernel)
            contours, _ = self.cv2.findContours(mask, self.cv2.RETR_EXTERNAL, self.cv2.CHAIN_APPROX_SIMPLE)
        except Exception as exc:
            raise DetectorError(f"Motion detector failed: {exc}") from exc

        detections: list[Detection] = []
        for contour in contours:
            area = self.cv2.contourArea(contour)
            if area < self.min_area:
                continue
            x, y, width, height = self.cv2.boundingRect(contour)
            detections.append(
                Detection(
                    label="vehicle",
                    confidence=0.35,
                    x1=int(x),
                    y1=int(y),
                    x2=int(x + width),
                    y2=int(y + height),
                )
            )
        return detections


class YoloDetector(BaseDetector):
    """Ultralytics YOLO detector for mixed-traffic scenes."""

    name = "ultralytics-yolo"

    def __init__(
        self,
        model_path: str,
        confidence: float,
        iou: float,
        classes_of_interest: Iterable[str],
    ) -> None:
        try:
            from ultralytics import YOLO
        except Exception as exc:
            raise DetectorError(f"Ultralytics is unavailable: {exc}") from exc

        try:
            self.model = YOLO(model_path)
        except Exception as exc:
            raise DetectorError(f"Unable to load YOLO model '{model_path}': {exc}") from exc

        self.name = f"ultralytics-yolo:{Path(str(model_path)).name}"
        self.confidence = confidence
        self.iou = iou
        self.classes_of_interest = {normalize_label(item) for item in classes_of_interest}
        raw_names = getattr(getattr(self.model, "model", None), "names", {})
        if isinstance(raw_names, dict):
            self.class_names = {int(key): str(value) for key, value in raw_names.items()}
        elif isinstance(raw_names, list):
            self.class_names = {index: str(value) for index, value in enumerate(raw_names)}
        else:
            self.class_names = {}

    def detect(self, frame: np.ndarray) -> list[Detection]:
        try:
            results = self.model.predict(
                source=frame,
                conf=self.confidence,
                iou=self.iou,
                verbose=False,
            )
        except Exception as exc:
            raise DetectorError(f"YOLO inference failed: {exc}") from exc

        detections: list[Detection] = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                cls_index = int(box.cls[0].item())
                label = normalize_label(self.class_names.get(cls_index, str(cls_index)))
                if self.classes_of_interest and label not in self.classes_of_interest:
                    continue
                x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
                confidence = float(box.conf[0].item())
                detections.append(
                    Detection(
                        label=label,
                        confidence=confidence,
                        x1=x1,
                        y1=y1,
                        x2=x2,
                        y2=y2,
                    )
                )
        return detections


def _detector_candidates(config: object) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def add(value: str | None) -> None:
        if value is None:
            return
        item = str(value).strip()
        if not item:
            return
        key = item.lower()
        if key in seen:
            return
        seen.add(key)
        candidates.append(item)

    add(getattr(config, "detector_model_path", ""))

    fallback_env = os.getenv("VISION_MODEL_FALLBACKS", "").strip()
    if fallback_env:
        for item in fallback_env.split(","):
            add(item)

    project_root = Path(getattr(config, "project_root", Path.cwd()))
    for local_name in ("yolo26n.pt", "yolo26s.pt", "yolov8n.pt"):
        local_path = project_root / local_name
        if local_path.exists():
            add(str(local_path.resolve()))

    for name in ("yolo26n.pt", "yolo26s.pt", "yolov8n.pt"):
        add(name)

    return candidates


def build_detector(config: object) -> BaseDetector:
    """Build the best available detector for the runtime."""
    confidence = float(getattr(config, "detector_confidence"))
    iou = float(getattr(config, "detector_iou"))
    classes_of_interest = getattr(config, "classes_of_interest")
    errors: list[str] = []

    for model_path in _detector_candidates(config):
        try:
            return YoloDetector(
                model_path=model_path,
                confidence=confidence,
                iou=iou,
                classes_of_interest=classes_of_interest,
            )
        except Exception as exc:
            errors.append(f"{model_path}: {exc}")
            logger.warning("Detector candidate failed (%s). Trying next fallback.", model_path)

    if errors:
        logger.warning("Falling back to OpenCV motion detector after model failures: %s", errors[0])
    return MotionDetector()
