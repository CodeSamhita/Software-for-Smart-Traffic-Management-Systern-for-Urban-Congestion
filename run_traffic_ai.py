"""Bootstrap and launch the smart traffic AI dashboard."""

from __future__ import annotations

import argparse
import importlib
from pathlib import Path
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Smart Traffic AI dashboard.")
    parser.add_argument("--source-type", choices=("camera", "video", "image"), default=None)
    parser.add_argument("--source-value", default=None)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--install-system-tools", action="store_true")
    parser.add_argument("--disable-openai", action="store_true")
    parser.add_argument("--disable-ollama", action="store_true")
    return parser.parse_args()


def find_missing_packages() -> list[str]:
    missing: list[str] = []
    for package_name, import_name in REQUIRED_IMPORTS.items():
        try:
            importlib.import_module(import_name)
        except Exception:
            missing.append(package_name)
    return missing


def ensure_runtime(requirements_path: Path) -> None:
    missing = find_missing_packages()
    if not missing:
        return

    print(f"Installing missing dependencies: {', '.join(missing)}")
    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
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


def main() -> int:
    args = parse_args()
    project_root = Path(__file__).resolve().parent
    requirements_path = project_root / "requirements.txt"

    try:
        ensure_runtime(requirements_path)
        maybe_install_system_tools(args.install_system_tools)
    except Exception as exc:
        print(f"Bootstrap failed: {exc}")
        return 1

    from traffic_ai.config import load_config
    from traffic_ai.web.app import run_server

    config = load_config(project_root)
    if args.host:
        config.host = args.host
    if args.port:
        config.port = args.port
    if args.debug:
        config.debug = True
    if args.source_type:
        config.source_type = args.source_type
    if args.source_value is not None:
        config.source_value = args.source_value
    elif config.source_type == "camera":
        config.source_value = str(args.camera_index)
    if args.disable_openai:
        config.openai_enabled = False
    if args.disable_ollama:
        config.ollama_enabled = False

    run_server(config)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
