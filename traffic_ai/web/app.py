"""Flask app factory for the traffic AI dashboard."""

from __future__ import annotations

import atexit
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request
from werkzeug.utils import secure_filename

from traffic_ai.config import AppConfig
from traffic_ai.logging_utils import configure_logging
from traffic_ai.services.presentation import PresentationFeedService
from traffic_ai.services.processor import TrafficProcessor


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".wmv", ".m4v"}


def create_app(config: AppConfig) -> Flask:
    templates_path = Path(__file__).parent / "templates"
    static_path = Path(__file__).parent / "static"
    app = Flask(
        __name__,
        template_folder=str(templates_path),
        static_folder=str(static_path),
    )

    processor = TrafficProcessor(config)
    presentation = PresentationFeedService(
        frame_width=max(640, config.frame_width // 2),
        frame_height=max(360, config.frame_height // 2),
    )
    processor.attach_presentation_service(presentation)
    processor.start()
    atexit.register(processor.stop)

    app.config["TRAFFIC_PROCESSOR"] = processor
    app.config["TRAFFIC_PRESENTATION"] = presentation
    app.config["TRAFFIC_RUNTIME_CONFIG"] = config

    @app.get("/")
    @app.get("/control-center")
    @app.get("/operations-lab")
    def control_center() -> str:
        return render_template("control_center.html", config=config)

    @app.get("/dashboard")
    @app.get("/dashboard.html")
    def dashboard() -> str:
        return render_template("dashboard.html", config=config)

    @app.get("/video_feed")
    def video_feed() -> Response:
        return Response(
            processor.mjpeg_generator(),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    @app.get("/video_feed/<slot>")
    def presentation_feed(slot: str) -> Response:
        return Response(
            presentation.stream_slot(slot),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    @app.get("/api/state")
    def state() -> Response:
        payload = processor.current_state()
        payload["presentation_feeds"] = presentation.all_states()
        return jsonify(payload)

    @app.post("/api/source")
    def switch_source() -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True) or request.form
        source_type = str(payload.get("source_type", "camera")).strip().lower()
        source_value = str(payload.get("source_value", "")).strip()
        if source_type == "camera" and not source_value:
            source_value = "0"

        try:
            processor.switch_source(source_type, source_value)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

        return jsonify({"ok": True, "state": processor.current_state()})

    @app.post("/api/operator")
    def update_operator() -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True) or request.form
        try:
            operator_state = processor.update_operator_state(dict(payload))
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

        return jsonify({"ok": True, "operator": operator_state, "state": processor.current_state()})

    @app.post("/api/presentation-source/<slot>")
    def update_presentation_source(slot: str) -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True) or request.form
        source_type = str(payload.get("source_type", "camera")).strip().lower()
        source_value = str(payload.get("source_value", "")).strip()
        label = str(payload.get("label", "")).strip()
        if source_type == "camera" and not source_value:
            source_value = "0"

        try:
            feed_state = presentation.set_slot_source(slot, source_type, source_value, label)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

        return jsonify({"ok": True, "slot": slot, "feed": feed_state, "presentation_feeds": presentation.all_states()})

    @app.post("/api/presentation-upload/<slot>")
    def upload_presentation_source(slot: str) -> tuple[Response, int] | Response:
        upload = request.files.get("file")
        label = str(request.form.get("label", "")).strip()
        if upload is None or not upload.filename:
            return jsonify({"ok": False, "error": "Please choose an image or video file first."}), 400

        filename = secure_filename(upload.filename)
        extension = Path(filename).suffix.lower()
        if extension not in IMAGE_EXTENSIONS and extension not in VIDEO_EXTENSIONS:
            return jsonify({"ok": False, "error": "Unsupported file type."}), 400

        stamped_name = f"{slot}-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{filename}"
        target_path = config.upload_dir / stamped_name
        try:
            upload.save(target_path)
            source_type = "image" if extension in IMAGE_EXTENSIONS else "video"
            feed_state = presentation.set_slot_source(slot, source_type, str(target_path), label)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

        return jsonify({"ok": True, "slot": slot, "feed": feed_state, "presentation_feeds": presentation.all_states()})

    @app.post("/api/presentation-source/<slot>/clear")
    def clear_presentation_source(slot: str) -> tuple[Response, int] | Response:
        try:
            feed_state = presentation.clear_slot_source(slot)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

        return jsonify({"ok": True, "slot": slot, "feed": feed_state, "presentation_feeds": presentation.all_states()})

    @app.post("/api/upload")
    def upload_source() -> tuple[Response, int] | Response:
        upload = request.files.get("file")
        if upload is None or not upload.filename:
            return jsonify({"ok": False, "error": "Please choose an image or video file first."}), 400

        filename = secure_filename(upload.filename)
        extension = Path(filename).suffix.lower()
        if extension not in IMAGE_EXTENSIONS and extension not in VIDEO_EXTENSIONS:
            return jsonify({"ok": False, "error": "Unsupported file type."}), 400

        stamped_name = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{filename}"
        target_path = config.upload_dir / stamped_name
        try:
            upload.save(target_path)
            source_type = "image" if extension in IMAGE_EXTENSIONS else "video"
            processor.switch_source(source_type, str(target_path))
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

        return jsonify(
            {
                "ok": True,
                "source_type": source_type,
                "path": str(target_path),
                "state": processor.current_state(),
            }
        )

    @app.get("/health")
    def health() -> Response:
        return jsonify(
            {
                "status": "ok",
                "source_type": config.source_type,
                "source_value": config.source_value,
            }
        )

    return app


def run_server(config: AppConfig) -> None:
    configure_logging(debug=config.debug)
    app = create_app(config)
    app.run(
        host=config.host,
        port=config.port,
        debug=config.debug,
        threaded=True,
        use_reloader=False,
    )
