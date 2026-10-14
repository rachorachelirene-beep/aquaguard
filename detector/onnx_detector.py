"""AquaGuard ONNX Flood Detector & Inference Optimizer.

Runs 24/7 camera flood segmentation with onnxruntime-backed models to minimize
CPU utilization, memory usage, and thermal load on monitoring hardware.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

LOGGER = logging.getLogger(__name__)

DEFAULT_PT_MODEL = Path(__file__).resolve().parent / "models" / "flood_best.pt"
DEFAULT_ONNX_MODEL = Path(__file__).resolve().parent / "models" / "flood_best.onnx"


def resolve_optimized_model_path(
    preferred_path: str | Path | None = None,
) -> tuple[Path, str]:
    """Resolve the optimal model format available (.onnx preferred, .pt fallback).

    Returns:
        tuple of (resolved_path, format_type) where format_type is 'onnx' or 'pytorch'.
    """
    if preferred_path:
        custom_path = Path(preferred_path).resolve()
        if custom_path.exists():
            format_type = "onnx" if custom_path.suffix.lower() == ".onnx" else "pytorch"
            return custom_path, format_type

    # Check environment variable
    env_model = os.getenv("YOLO_MODEL_PATH")
    if env_model:
        env_path = Path(env_model)
        if not env_path.is_absolute():
            env_path = Path(__file__).resolve().parent / env_path
        if env_path.exists():
            format_type = "onnx" if env_path.suffix.lower() == ".onnx" else "pytorch"
            return env_path.resolve(), format_type

    # Priority 1: Compiled ONNX model (fastest, lowest CPU overhead)
    if DEFAULT_ONNX_MODEL.exists():
        return DEFAULT_ONNX_MODEL, "onnx"

    # Priority 2: Standard PyTorch model
    if DEFAULT_PT_MODEL.exists():
        return DEFAULT_PT_MODEL, "pytorch"

    raise FileNotFoundError(
        f"Neither ONNX ({DEFAULT_ONNX_MODEL}) nor PyTorch ({DEFAULT_PT_MODEL}) model found."
    )


class OnnxFloodDetector:
    """Optimized flood segmentation inference engine supporting ONNX and PyTorch runtimes."""

    def __init__(
        self,
        model_path: str | Path | None = None,
        confidence_threshold: float = 0.35,
        image_size: int = 416,
        device: str = "cpu",
    ) -> None:
        self.resolved_path, self.model_format = resolve_optimized_model_path(
            model_path
        )
        self.confidence_threshold = max(0.01, min(0.99, float(confidence_threshold)))
        self.image_size = max(160, int(image_size))
        self.device = device

        LOGGER.info(
            "Initializing AquaGuard Flood Detector [%s runtime]: %s",
            self.model_format.upper(),
            self.resolved_path.name,
        )

        # Ultralytics natively wraps onnxruntime when loading an .onnx file with task="segment"
        task_hint = "segment" if self.model_format == "onnx" else None
        self._model = YOLO(
            str(self.resolved_path),
            task=task_hint,
        )

    @property
    def is_onnx(self) -> bool:
        return self.model_format == "onnx"

    def predict(
        self,
        frame: np.ndarray,
        confidence: float | None = None,
    ) -> tuple[dict[str, Any], np.ndarray | None]:
        """Perform water surface segmentation on a camera frame.

        Args:
            frame: Input BGR image from OpenCV.
            confidence: Optional confidence threshold override.

        Returns:
            tuple of (detection_summary_dict, binary_water_mask_or_None)
        """
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return {
                "detected": False,
                "water_coverage": 0.0,
                "confidence": 0.0,
                "objects": [],
                "model_format": self.model_format,
            }, None

        conf = confidence if confidence is not None else self.confidence_threshold
        height, width = frame.shape[:2]

        results = self._model.predict(
            source=frame,
            conf=conf,
            imgsz=self.image_size,
            device=self.device,
            verbose=False,
        )

        if not results or len(results) == 0:
            return {
                "detected": False,
                "water_coverage": 0.0,
                "confidence": 0.0,
                "objects": [],
                "model_format": self.model_format,
            }, None

        result = results[0]
        water_mask = None
        max_confidence = 0.0
        detected_objects: list[dict[str, Any]] = []

        # Extract segmented masks if present
        if result.masks is not None and result.masks.data is not None:
            raw_masks = result.masks.data.cpu().numpy()
            if len(raw_masks) > 0:
                combined_mask = np.zeros((height, width), dtype=np.uint8)
                for mask_idx, single_mask in enumerate(raw_masks):
                    resized = cv2.resize(
                        single_mask.astype(np.uint8),
                        (width, height),
                        interpolation=cv2.INTER_NEAREST,
                    )
                    combined_mask = np.bitwise_or(combined_mask, resized)

                water_mask = (combined_mask * 255).astype(np.uint8)

        # Extract bounding boxes and confidences
        if result.boxes is not None and len(result.boxes) > 0:
            boxes = result.boxes
            for idx in range(len(boxes)):
                box_conf = float(boxes.conf[idx].item())
                max_confidence = max(max_confidence, box_conf)
                xyxy = boxes.xyxy[idx].tolist()
                class_id = int(boxes.cls[idx].item())
                class_name = result.names.get(class_id, "water") if hasattr(result, "names") else "water"

                detected_objects.append({
                    "class": class_name,
                    "confidence": round(box_conf, 3),
                    "bbox": [round(coord, 1) for coord in xyxy],
                })

        # Calculate percentage water coverage
        if water_mask is not None:
            water_pixels = np.count_nonzero(water_mask)
            total_pixels = height * width
            coverage = (water_pixels / total_pixels) * 100.0 if total_pixels > 0 else 0.0
        else:
            coverage = 0.0

        is_detected = len(detected_objects) > 0 or coverage > 1.0

        return {
            "detected": is_detected,
            "water_coverage": round(coverage, 2),
            "confidence": round(max_confidence, 3),
            "objects": detected_objects,
            "model_format": self.model_format,
        }, water_mask

