"""Project-specific exceptions."""


class TrafficAIError(Exception):
    """Base application exception."""


class BootstrapError(TrafficAIError):
    """Raised when dependency or runtime bootstrapping fails."""


class SourceError(TrafficAIError):
    """Raised when a camera, image, or video source cannot be opened."""


class DetectorError(TrafficAIError):
    """Raised when the vision detector cannot process a frame."""


class AdvisorError(TrafficAIError):
    """Raised when a suggestion provider fails."""
