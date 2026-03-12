"""Advisory providers for online and offline traffic recommendations."""

from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
import logging
from typing import Iterable

import requests

from traffic_ai.exceptions import AdvisorError
from traffic_ai.models import CorridorState, SuggestionPacket, TrafficSnapshot

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_lines(text: str) -> tuple[list[str], str]:
    suggestions: list[str] = []
    warning = ""
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = line.lstrip("-* ").strip()
        while line and (line[0].isdigit() or line[0] in {".", ")"}):
            line = line[1:].strip()
        if not line:
            continue
        if line.lower().startswith("risk:"):
            warning = line
            continue
        suggestions.append(line)

    if not suggestions and text.strip():
        suggestions = [text.strip()]
    return suggestions[:3], warning


def _summary_payload(snapshot: TrafficSnapshot) -> dict[str, object]:
    corridors: dict[str, dict[str, object]] = {}
    for name, corridor in snapshot.corridors.items():
        corridors[name] = {
            "vehicle_count": corridor.vehicle_count,
            "pedestrian_count": corridor.pedestrian_count,
            "pressure": round(corridor.pressure, 1),
            "dominant_labels": corridor.dominant_labels,
            "heavy_vehicle_count": corridor.heavy_vehicle_count,
            "two_wheeler_count": corridor.two_wheeler_count,
        }

    return {
        "captured_at_iso": snapshot.captured_at_iso,
        "vehicle_count": snapshot.vehicle_count,
        "congestion_index": round(snapshot.congestion_index, 1),
        "mobility_score": round(snapshot.mobility_score, 1),
        "throughput_per_min": round(snapshot.throughput_per_min, 1),
        "recommended_corridor": snapshot.recommended_corridor,
        "class_breakdown": snapshot.class_breakdown,
        "corridors": corridors,
        "alerts": snapshot.alerts,
        "controller_note": snapshot.controller_note,
    }


def _top_corridor(snapshot: TrafficSnapshot) -> CorridorState | None:
    if snapshot.recommended_corridor == "none":
        return None
    return snapshot.corridors.get(snapshot.recommended_corridor)


class BaseAdvisor:
    name = "advisor"

    def suggest(self, snapshot: TrafficSnapshot, frame: object | None = None) -> SuggestionPacket:
        raise NotImplementedError


class OpenAIAdvisor(BaseAdvisor):
    name = "openai"

    def __init__(self, api_key: str, model: str, timeout_seconds: float, use_image_context: bool) -> None:
        if not api_key:
            raise AdvisorError("OPENAI_API_KEY is not configured.")
        try:
            from openai import OpenAI
        except Exception as exc:
            raise AdvisorError(f"OpenAI SDK is unavailable: {exc}") from exc

        self.client = OpenAI(api_key=api_key, timeout=timeout_seconds)
        self.model = model
        self.use_image_context = use_image_context

    def suggest(self, snapshot: TrafficSnapshot, frame: object | None = None) -> SuggestionPacket:
        prompt = (
            "You are assisting a smart traffic control room for Indian urban roads. "
            "Review the structured live metrics and return exactly three short operational suggestions. "
            "End with one line beginning with 'Risk:' describing the biggest current risk. "
            "Keep the advice practical, concise, and suitable for field operators.\n\n"
            f"{json.dumps(_summary_payload(snapshot), indent=2)}"
        )

        content: list[dict[str, str]] = [{"type": "input_text", "text": prompt}]
        if frame is not None and self.use_image_context:
            try:
                import cv2

                ok, encoded = cv2.imencode(".jpg", frame)
                if ok:
                    payload = base64.b64encode(encoded.tobytes()).decode("utf-8")
                    content.append(
                        {
                            "type": "input_image",
                            "image_url": f"data:image/jpeg;base64,{payload}",
                        }
                    )
            except Exception:
                logger.debug("Unable to attach image context for OpenAI.", exc_info=True)

        try:
            response = self.client.responses.create(
                model=self.model,
                instructions=(
                    "Respond with concise operational traffic guidance. "
                    "Use plain language and avoid markdown tables."
                ),
                input=[{"role": "user", "content": content}],
                max_output_tokens=220,
            )
        except Exception as exc:
            raise AdvisorError(f"OpenAI suggestion call failed: {exc}") from exc

        output_text = getattr(response, "output_text", "") or ""
        if not output_text.strip():
            raise AdvisorError("OpenAI returned an empty suggestion response.")

        suggestions, warning = _clean_lines(output_text)
        return SuggestionPacket(
            suggestions=suggestions,
            source=f"openai:{self.model}",
            generated_at_iso=_now_iso(),
            status="online",
            warning=warning,
        )


class OllamaAdvisor(BaseAdvisor):
    name = "ollama"

    def __init__(self, host: str, model: str) -> None:
        self.host = host.rstrip("/")
        self.model = model

    def suggest(self, snapshot: TrafficSnapshot, frame: object | None = None) -> SuggestionPacket:
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a traffic advisor for mixed Indian roads. "
                        "Return exactly three short suggestions and one 'Risk:' line."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(_summary_payload(snapshot), indent=2),
                },
            ],
            "stream": False,
        }

        try:
            response = requests.post(
                f"{self.host}/api/chat",
                json=payload,
                timeout=8,
            )
            response.raise_for_status()
            body = response.json()
            output_text = body.get("message", {}).get("content", "")
        except Exception as exc:
            raise AdvisorError(f"Ollama advisor failed: {exc}") from exc

        if not output_text.strip():
            raise AdvisorError("Ollama returned an empty response.")

        suggestions, warning = _clean_lines(output_text)
        return SuggestionPacket(
            suggestions=suggestions,
            source=f"ollama:{self.model}",
            generated_at_iso=_now_iso(),
            status="offline-llm",
            warning=warning,
        )


class RuleBasedAdvisor(BaseAdvisor):
    name = "offline-rules"

    def suggest(self, snapshot: TrafficSnapshot, frame: object | None = None) -> SuggestionPacket:
        hot_corridor = _top_corridor(snapshot)
        suggestions: list[str] = []
        warning = ""

        if snapshot.vehicle_count == 0 and not snapshot.alerts:
            suggestions = [
                "Traffic is light right now. Keep monitoring and hold a short adaptive cycle.",
                "Use this low-load window to verify camera framing and model confidence.",
                "Leave offline mode armed so the dashboard continues operating during network drops.",
            ]
            warning = "Risk: Light traffic can still hide sudden pedestrian crossings or parked obstructions."
            return SuggestionPacket(
                suggestions=suggestions,
                source=self.name,
                generated_at_iso=_now_iso(),
                status="offline",
                warning=warning,
            )

        if hot_corridor is not None:
            suggestions.append(
                f"Favor the {hot_corridor.name} corridor first because it has the highest live pressure score."
            )

        if snapshot.congestion_index >= 75:
            suggestions.append(
                "Trigger a longer green extension, meter cross-flow, and alert operators for manual diversion support."
            )
        elif snapshot.congestion_index >= 55:
            suggestions.append(
                "Apply a moderate adaptive extension and keep checking whether the hot corridor pressure keeps rising."
            )
        else:
            suggestions.append(
                "Keep the cycle balanced, but continue watching the leading corridor for a sudden mixed-traffic spike."
            )

        two_wheeler_total = sum(corridor.two_wheeler_count for corridor in snapshot.corridors.values())
        heavy_total = sum(corridor.heavy_vehicle_count for corridor in snapshot.corridors.values())
        pedestrian_total = sum(corridor.pedestrian_count for corridor in snapshot.corridors.values())

        if two_wheeler_total >= 8:
            suggestions.append(
                "Create smoother release waves for two-wheelers and keep the stop-line area clear to reduce weaving."
            )
        elif heavy_total >= 3:
            suggestions.append(
                "Watch bus and truck clustering, and avoid sharp signal flips that trap long vehicles in the junction."
            )
        elif pedestrian_total >= 6:
            suggestions.append(
                "Insert a safer pedestrian gap before restoring full vehicle priority on the busiest approach."
            )
        else:
            suggestions.append(
                "Maintain lane discipline messaging near the busiest approach to reduce side friction from mixed traffic."
            )

        if hot_corridor is not None and hot_corridor.pedestrian_count >= 4:
            warning = f"Risk: Pedestrian spillover is rising on the {hot_corridor.name} corridor."
        elif hot_corridor is not None and hot_corridor.heavy_vehicle_count >= 2:
            warning = f"Risk: Heavy vehicle clustering may slow clearance on the {hot_corridor.name} side."
        else:
            warning = "Risk: Mixed traffic can change quickly, so keep monitoring the current hot corridor."

        return SuggestionPacket(
            suggestions=suggestions[:3],
            source=self.name,
            generated_at_iso=_now_iso(),
            status="offline",
            warning=warning,
        )


class AdvisoryOrchestrator:
    """Tries cloud, local, and offline advisors in order."""

    def __init__(self, advisors: Iterable[BaseAdvisor]) -> None:
        self.advisors = list(advisors)

    def suggest(self, snapshot: TrafficSnapshot, frame: object | None = None) -> SuggestionPacket:
        last_error = ""
        for advisor in self.advisors:
            try:
                return advisor.suggest(snapshot, frame)
            except Exception as exc:
                last_error = str(exc)
                logger.warning("%s advisor unavailable: %s", advisor.name, exc)

        return SuggestionPacket(
            suggestions=[
                "No advisor backend is reachable right now. Continue using the live metrics and alerts.",
                "Check network connectivity or local LLM availability before relying on automated recommendations.",
                "Offline fallback should remain enabled so core monitoring continues uninterrupted.",
            ],
            source="system-fallback",
            generated_at_iso=_now_iso(),
            status="degraded",
            warning=f"Risk: Advisory backends are unavailable. Last error: {last_error}" if last_error else "",
        )
