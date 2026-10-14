"""AquaGuard YOLO to ONNX Exporter.

Exports the PyTorch flood segmentation model (flood_best.pt) to ONNX format
(flood_best.onnx) with dynamic input shape support for optimized CPU/edge inference.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from ultralytics import YOLO

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
)
LOGGER = logging.getLogger("AquaGuard-ONNX-Export")

DEFAULT_MODEL_PATH = (
    Path(__file__).resolve().parent / "models" / "flood_best.pt"
)


def export_yolo_to_onnx(
    model_path: Path | str = DEFAULT_MODEL_PATH,
    dynamic: bool = True,
    opset: int = 17,
    simplify: bool = True,
) -> Path:
    """Export a YOLO PyTorch model (.pt) to ONNX format (.onnx).

    Args:
        model_path: Path to the .pt model weights file.
        dynamic: Enable dynamic axes for batch size and resolution.
        opset: ONNX operator set version (default 17).
        simplify: Run onnx-simplifier if installed.

    Returns:
        Path to the exported .onnx model file.
    """
    source_path = Path(model_path).resolve()
    if not source_path.exists():
        raise FileNotFoundError(f"Source model file not found: {source_path}")

    LOGGER.info("Loading PyTorch model: %s", source_path)
    model = YOLO(str(source_path))

    LOGGER.info(
        "Exporting to ONNX format (dynamic=%s, opset=%d)...",
        dynamic,
        opset,
    )
    # ultralytics export produces a file next to the source model with .onnx extension
    exported = model.export(
        format="onnx",
        dynamic=dynamic,
        opset=opset,
        simplify=simplify,
    )

    exported_path = Path(exported).resolve()
    if not exported_path.exists():
        # Fallback to standard expected naming
        candidate = source_path.with_suffix(".onnx")
        if candidate.exists():
            exported_path = candidate
        else:
            raise RuntimeError(
                f"ONNX export reported success but file not found at {exported_path}"
            )

    size_mb = exported_path.stat().st_size / (1024 * 1024)
    LOGGER.info("ONNX model successfully exported: %s (%.2f MB)", exported_path, size_mb)

    # Optional verification with onnx library
    try:
        import onnx

        onnx_model = onnx.load(str(exported_path))
        onnx.checker.check_model(onnx_model)
        LOGGER.info("ONNX model structural integrity verified successfully.")
    except Exception as verify_err:
        LOGGER.warning("ONNX checker note: %s", verify_err)

    return exported_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export AquaGuard YOLO flood segmentation model to ONNX."
    )
    parser.add_argument(
        "--model",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help="Path to flood_best.pt model weights file.",
    )
    parser.add_argument(
        "--static",
        action="store_true",
        help="Disable dynamic shape support (fixed input resolution).",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version (default: 17).",
    )

    args = parser.parse_args()

    try:
        exported_file = export_yolo_to_onnx(
            model_path=args.model,
            dynamic=not args.static,
            opset=args.opset,
        )
        print(f"\n[SUCCESS] ONNX Model ready: {exported_file}")
    except Exception as error:
        LOGGER.error("Export failed: %s", error)
        sys.exit(1)


if __name__ == "__main__":
    main()

