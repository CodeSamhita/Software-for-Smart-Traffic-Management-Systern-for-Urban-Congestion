"""Bootstrap and launch the smart traffic AI dashboard."""

from __future__ import annotations

import argparse
import ctypes
from dataclasses import dataclass
import importlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


REQUIRED_IMPORTS = {
    "Flask": "flask",
    "numpy": "numpy",
    "requests": "requests",
    "python-dotenv": "dotenv",
    "Pillow": "PIL",
    "opencv-python": "cv2",
    "ultralytics": "ultralytics",
    "openai": "openai",
}

DETECTION_MODEL_FAMILIES = ("yolo26", "yoloe", "yolo-world", "rtdetr", "yolo-nas", "yolov8")
SEGMENTATION_MODEL_FAMILIES = ("sam", "sam2", "sam3", "mobile-sam", "fastsam")
SEARCH_DIRS = ("", "runtime", "runtime/models", "models", "weights", "traffic_ai/weights")
DEFAULT_CANDIDATES_BY_FAMILY = {
    "yolo26": ("yolo26x.pt", "yolo26l.pt", "yolo26m.pt", "yolo26s.pt", "yolo26n.pt", "yolo26.pt"),
    "yoloe": ("yoloe-l.pt", "yoloe-m.pt", "yoloe-s.pt"),
    "yolo-world": ("yolov8l-worldv2.pt", "yolov8m-worldv2.pt", "yolov8s-worldv2.pt"),
    "rtdetr": ("rtdetr-l.pt", "rtdetr-x.pt"),
    "yolo-nas": ("yolo_nas_l.pt", "yolo_nas_m.pt", "yolo_nas_s.pt"),
    "yolov8": ("yolov8x.pt", "yolov8l.pt", "yolov8m.pt", "yolov8s.pt", "yolov8n.pt"),
}
FAMILY_ALIAS_DEFAULT = {
    "yolo26": "yolo26.pt",
    "yoloe": "yoloe-s.pt",
    "yolo-world": "yolov8s-worldv2.pt",
    "rtdetr": "rtdetr-l.pt",
    "yolo-nas": "yolo_nas_m.pt",
    "yolov8": "yolov8n.pt",
}


@dataclass(slots=True)
class SystemProfile:
    cpu_cores: int
    ram_gb: float
    gpu_backend: str
    gpu_name: str
    gpu_ram_gb: float
    tier: str


def parse_args() -> argparse.Namespace:
    valid_families = ("auto", *DETECTION_MODEL_FAMILIES, *SEGMENTATION_MODEL_FAMILIES)
    valid_priorities = ("quality", "balanced", "speed")

    default_family = os.getenv("MODEL_FAMILY", "auto").strip().lower() or "auto"
    if default_family not in valid_families:
        default_family = "auto"
    default_priority = os.getenv("MODEL_PRIORITY", "balanced").strip().lower() or "balanced"
    if default_priority not in valid_priorities:
        default_priority = "balanced"

    parser = argparse.ArgumentParser(description="Run the Smart Traffic AI dashboard.")
    parser.add_argument("--source-type", choices=("camera", "video", "image", "stream"), default=None)
    parser.add_argument("--source-value", default=None)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--vision-model", default=None, help="YOLO model name or path, for example yolo26.pt")
    parser.add_argument(
        "--model-family",
        default=default_family,
        choices=valid_families,
        help="Model family to use. In auto mode, the launcher picks the best detector family for this system.",
    )
    parser.add_argument(
        "--model-priority",
        default=default_priority,
        choices=valid_priorities,
        help="Quality favors larger models, speed favors lighter models, balanced adapts to hardware.",
    )
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--skip-install", action="store_true", help="Skip dependency auto-install during bootstrap")
    parser.add_argument("--install-system-tools", action="store_true")
    parser.add_argument("--disable-openai", action="store_true")
    parser.add_argument("--disable-ollama", action="store_true")
    parser.add_argument("--show-config", action="store_true", help="Print startup configuration summary")
    return parser.parse_args()


def ensure_python_version(min_major: int = 3, min_minor: int = 10) -> None:
    if sys.version_info < (min_major, min_minor):
        raise RuntimeError(
            "Python "
            f"{min_major}.{min_minor}+ is required, but found {sys.version_info.major}.{sys.version_info.minor}."
        )


def find_missing_packages() -> list[str]:
    missing: list[str] = []
    for package_name, import_name in REQUIRED_IMPORTS.items():
        try:
            importlib.import_module(import_name)
        except Exception:
            missing.append(package_name)
    return missing


def ensure_runtime(requirements_path: Path, skip_install: bool = False) -> None:
    missing = find_missing_packages()
    if not missing:
        return
    if skip_install:
        raise RuntimeError(f"Missing dependencies: {', '.join(missing)}")
    if not requirements_path.exists():
        raise FileNotFoundError(f"requirements.txt not found at: {requirements_path}")

    print(f"Installing missing dependencies: {', '.join(missing)}")
    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "-r",
            str(requirements_path),
        ]
    )


def maybe_install_system_tools(enabled: bool) -> None:
    if not enabled:
        return
    if shutil.which("ffmpeg") is not None:
        return
    if shutil.which("winget") is None:
        print("FFmpeg is not installed and winget is unavailable. Skipping system tool install.")
        return

    print("Installing FFmpeg with winget...")
    subprocess.check_call(
        [
            "winget",
            "install",
            "-e",
            "--id",
            "Gyan.FFmpeg",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ]
    )


def _resolve_requested_model(project_root: Path, requested: str | None) -> str | None:
    if requested is None:
        return None
    normalized = requested.strip()
    if not normalized:
        return None
    lowered = normalized.lower()
    if lowered in FAMILY_ALIAS_DEFAULT:
        normalized = FAMILY_ALIAS_DEFAULT[lowered]

    as_path = Path(normalized)
    if as_path.is_absolute():
        return str(as_path)
    if as_path.exists():
        return str(as_path.resolve())

    project_candidate = project_root / as_path
    if project_candidate.exists():
        return str(project_candidate.resolve())

    return normalized


def _detect_ram_gb() -> float:
    try:
        import psutil  # type: ignore

        return float(psutil.virtual_memory().total) / (1024**3)
    except Exception:
        pass

    if sys.platform == "win32":
        class _MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = _MemoryStatus()
        status.dwLength = ctypes.sizeof(_MemoryStatus)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):  # type: ignore[attr-defined]
            return float(status.ullTotalPhys) / (1024**3)
    else:
        try:
            pages = os.sysconf("SC_PHYS_PAGES")
            page_size = os.sysconf("SC_PAGE_SIZE")
            return float(pages * page_size) / (1024**3)
        except Exception:
            pass
    return 8.0


def _detect_gpu() -> tuple[str, str, float]:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            index = int(torch.cuda.current_device())
            props = torch.cuda.get_device_properties(index)
            return ("cuda", torch.cuda.get_device_name(index), float(props.total_memory) / (1024**3))
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return ("mps", "Apple MPS", 0.0)
    except Exception:
        pass
    return ("cpu", "CPU", 0.0)


def _build_system_profile() -> SystemProfile:
    cpu_cores = max(1, int(os.cpu_count() or 4))
    ram_gb = _detect_ram_gb()
    gpu_backend, gpu_name, gpu_ram_gb = _detect_gpu()

    if gpu_backend == "cuda" and gpu_ram_gb >= 10:
        tier = "high"
    elif gpu_backend in {"cuda", "mps"} or ram_gb >= 16 or cpu_cores >= 10:
        tier = "medium"
    else:
        tier = "low"

    return SystemProfile(
        cpu_cores=cpu_cores,
        ram_gb=ram_gb,
        gpu_backend=gpu_backend,
        gpu_name=gpu_name,
        gpu_ram_gb=gpu_ram_gb,
        tier=tier,
    )


def _search_roots(project_root: Path) -> tuple[Path, ...]:
    roots: list[Path] = []
    for rel in SEARCH_DIRS:
        root = project_root if not rel else project_root / rel
        if not root.exists():
            continue
        roots.append(root)
    return tuple(roots)


def _discover_local_weights(project_root: Path) -> list[Path]:
    discovered: list[Path] = []
    for root in _search_roots(project_root):
        for pattern in ("*.pt", "*.onnx", "*.engine"):
            discovered.extend(path.resolve() for path in root.glob(pattern))
    unique: dict[str, Path] = {}
    for item in discovered:
        unique[str(item).lower()] = item
    return sorted(unique.values(), key=lambda item: item.name.lower())


def _family_match(family: str, filename: str) -> bool:
    lower = filename.lower()
    if family == "yolo26":
        return "yolo26" in lower
    if family == "yoloe":
        return "yoloe" in lower
    if family == "yolo-world":
        return "world" in lower and "yolo" in lower
    if family == "rtdetr":
        return "rtdetr" in lower
    if family == "yolo-nas":
        return "yolo_nas" in lower or "yolonas" in lower
    if family == "yolov8":
        return "yolov8" in lower and "world" not in lower
    return False


def _infer_model_scale(model_name: str) -> int:
    name = Path(model_name).name.lower()
    if re.search(r"(^|[-_])x(\.|$)", name):
        return 5
    if re.search(r"(^|[-_])l(\.|$)", name):
        return 4
    if re.search(r"(^|[-_])m(\.|$)", name):
        return 3
    if re.search(r"(^|[-_])s(\.|$)", name):
        return 2
    if re.search(r"(^|[-_])n(\.|$)", name):
        return 1
    if "nano" in name:
        return 1
    if "small" in name:
        return 2
    if "medium" in name:
        return 3
    if "large" in name:
        return 4
    if "xlarge" in name or "x-large" in name:
        return 5
    return 2


def _target_scale(profile: SystemProfile, priority: str) -> int:
    base = {"low": 2, "medium": 3, "high": 5}.get(profile.tier, 2)
    if priority == "quality":
        return min(5, base + 1)
    if priority == "speed":
        return max(1, base - 1)
    return base


def _pick_best_candidate(candidates: list[str], profile: SystemProfile, priority: str) -> str:
    target = _target_scale(profile, priority)
    scored = [(candidate, _infer_model_scale(candidate)) for candidate in candidates]
    within = [item for item in scored if item[1] <= target]
    if within:
        return max(within, key=lambda item: item[1])[0]
    return min(scored, key=lambda item: item[1])[0]


def _family_candidates(family: str, local_weights: list[Path]) -> list[str]:
    local_matches = [str(path) for path in local_weights if _family_match(family, path.name)]
    if local_matches:
        return local_matches
    return list(DEFAULT_CANDIDATES_BY_FAMILY.get(family, ()))


def _select_model_for_family(
    family: str,
    local_weights: list[Path],
    profile: SystemProfile,
    priority: str,
) -> tuple[str, str]:
    candidates = _family_candidates(family, local_weights)
    if not candidates:
        return ("", "")
    chosen = _pick_best_candidate(candidates, profile, priority)
    local_count = len([path for path in local_weights if _family_match(family, path.name)])
    source = "local" if local_count else "default"
    return (chosen, source)


def _select_auto_detector(
    local_weights: list[Path],
    profile: SystemProfile,
    priority: str,
) -> tuple[str, str]:
    if priority == "speed":
        family_order = ("yolo26", "yolov8", "yoloe", "yolo-world", "rtdetr", "yolo-nas")
    elif priority == "quality":
        family_order = ("yolo26", "yoloe", "rtdetr", "yolo-world", "yolo-nas", "yolov8")
    elif profile.tier == "low":
        family_order = ("yolo26", "yolov8", "yoloe", "yolo-world", "rtdetr", "yolo-nas")
    else:
        family_order = DETECTION_MODEL_FAMILIES

    for family in family_order:
        local_candidates = [path for path in local_weights if _family_match(family, path.name)]
        if not local_candidates:
            continue
        chosen = _pick_best_candidate([str(path) for path in local_candidates], profile, priority)
        return (chosen, f"auto-local:{family}")

    for family in family_order:
        defaults = list(DEFAULT_CANDIDATES_BY_FAMILY.get(family, ()))
        if not defaults:
            continue
        chosen = _pick_best_candidate(defaults, profile, priority)
        return (chosen, f"auto-default:{family}")
    return ("", "auto-no-candidate")


def select_detector_model(
    project_root: Path,
    configured_default: str,
    requested_model: str | None,
    requested_family: str,
    priority: str,
) -> tuple[str, str, SystemProfile]:
    profile = _build_system_profile()
    explicit = _resolve_requested_model(project_root, requested_model)
    if explicit:
        return (explicit, "explicit-model", profile)

    local_weights = _discover_local_weights(project_root)
    family = (requested_family or "auto").strip().lower()
    if family in SEGMENTATION_MODEL_FAMILIES:
        print(
            "Requested model family "
            f"'{family}' is segmentation-focused and not compatible with the current detection+tracking pipeline."
        )
        print("Falling back to detection family auto-selection.")
        family = "auto"

    if family == "auto":
        selected, reason = _select_auto_detector(local_weights, profile, priority)
        if selected:
            resolved = _resolve_requested_model(project_root, selected) or selected
            return (resolved, reason, profile)
        resolved_default = _resolve_requested_model(project_root, configured_default) or configured_default
        return (resolved_default, "auto-config-default", profile)

    selected, reason = _select_model_for_family(family, local_weights, profile, priority)
    if selected:
        resolved = _resolve_requested_model(project_root, selected) or selected
        return (resolved, f"{family}:{reason}", profile)

    resolved_default = _resolve_requested_model(project_root, configured_default) or configured_default
    return (resolved_default, "config-default", profile)


def apply_runtime_overrides(config: object, args: argparse.Namespace, project_root: Path) -> tuple[str, SystemProfile]:
    if args.host:
        config.host = args.host.strip()
    if args.port:
        config.port = max(1, min(65535, int(args.port)))
    if args.debug:
        config.debug = True

    if args.source_type:
        config.source_type = args.source_type

    explicit_source = str(args.source_value).strip() if args.source_value is not None else None
    if explicit_source is not None:
        config.source_value = explicit_source
    if config.source_type == "camera" and not str(config.source_value).strip():
        config.source_value = str(args.camera_index)

    if args.disable_openai:
        config.openai_enabled = False
    if args.disable_ollama:
        config.ollama_enabled = False

    selected_model, selection_reason, profile = select_detector_model(
        project_root=project_root,
        configured_default=str(getattr(config, "detector_model_path", "yolov8n.pt")),
        requested_model=args.vision_model,
        requested_family=args.model_family,
        priority=args.model_priority,
    )
    config.detector_model_path = selected_model
    return selection_reason, profile


def print_startup_summary(config: object, model_selection_reason: str, profile: SystemProfile) -> None:
    print("Starting Smart Traffic AI with:")
    print(f"  host: {config.host}")
    print(f"  port: {config.port}")
    print(f"  source: {config.source_type} ({config.source_value})")
    print(f"  detector: {config.detector_model_path}")
    print(f"  detector-selection: {model_selection_reason}")
    print(
        "  system-profile: "
        f"tier={profile.tier}, cpu={profile.cpu_cores}, ram={profile.ram_gb:.1f}GB, "
        f"gpu={profile.gpu_backend}:{profile.gpu_name}, gpu_ram={profile.gpu_ram_gb:.1f}GB"
    )
    print(f"  openai: {'enabled' if config.openai_enabled else 'disabled'}")
    print(f"  ollama: {'enabled' if config.ollama_enabled else 'disabled'}")


def main() -> int:
    args = parse_args()
    project_root = Path(__file__).resolve().parent
    requirements_path = project_root / "requirements.txt"

    try:
        ensure_python_version()
        ensure_runtime(requirements_path, skip_install=args.skip_install)
        maybe_install_system_tools(args.install_system_tools)
    except Exception as exc:
        print(f"Bootstrap failed: {exc}")
        return 1

    from traffic_ai.config import load_config
    from traffic_ai.web.app import run_server

    config = load_config(project_root)
    model_selection_reason, profile = apply_runtime_overrides(config, args, project_root)
    if args.show_config or args.vision_model or args.model_family != "auto" or args.model_priority != "balanced":
        print_startup_summary(config, model_selection_reason=model_selection_reason, profile=profile)

    try:
        run_server(config)
    except KeyboardInterrupt:
        print("Traffic AI stopped by user.")
        return 0
    except Exception as exc:
        print(f"Runtime failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
