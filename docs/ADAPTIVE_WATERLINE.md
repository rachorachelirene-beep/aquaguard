# Adaptive waterline and fixed gauge

OpenCV searches only the configured gauge polygon. Perspective rectification,
broad edge support, persistent contrast and horizontal ripple structure provide
spatial evidence. A nearby detected face vetoes the optical candidate. Independent
YOLO flood detection can support smooth water without visible ripples; disagreement
between surface positions makes the measurement unavailable. These are conservative
heuristics, not probabilities or proof that a scene contains water.

The capture loop requires three consistent frames to acquire/reacquire a surface.
Loss immediately hides the reading and indicator. Reconnect or reference-context
changes reset tracking. A short median smooths levels; the indicator stays at the
actual image boundary mapped through the inverse perspective transform.

`proposed_roi` is an optional local analysis band around a validated surface,
inside the fixed gauge. The next frame searches this band first and falls back
to the full gauge if it has no candidate. This band follows the water for inspecting local evidence;
it never replaces the calibrated polygon, meter endpoints, or flood thresholds.
Ambiguous scenes retain the manual reference and return unavailable.

## Administrator calibration

1. Mount the USB camera firmly and place a known physical height reference in view.
2. In Admin → Camera Settings → Virtual staff gauge, use the snapshot calibration
   tool to select top-left, top-right, bottom-right, bottom-left reference corners.
3. Click Apply Calibration to update the preview. Set minimum/maximum meters to
   the known bottom/top heights, then click Save Settings. The authenticated
   local Camera Agent validates and atomically saves `detector/data/gauge_config.json`
   and activates the reference immediately. No environment edits or restart are needed.
   Unsaved edits are labeled separately; Reload active calibration discards them.
   Saved local calibration is authoritative on reload and agent restart. Environment
   settings provide startup defaults only without a saved runtime configuration.
4. Validate at several known water heights. Recalibrate after moving the camera.
   Do not change warning/critical thresholds as part of this procedure.

Without explicit reference points and valid meter endpoints, `level_m` and
`water_level` are null. Supported image evidence may still show an uncalibrated
pixel indicator. With no usable polygon/evidence, the system reports unavailable.
Configuration validity cannot prove a ruler's physical accuracy: sample coordinates
must be replaced/verified against the installed reference.

`calibration_valid`, `measurement_validated`, and `proposed_roi` are optional API
fields with safe defaults. Existing optical/YOLO fields remain independent.
Invalid or uncalibrated observations do not create water-level records or alerts.
No database schema changes are required.

Local tracking is verified against the full fixed gauge every 12 tracked frames.
Missing full-gauge support or a substantially different boundary with comparable
or stronger evidence invalidates that frame and requires three consistent
observations to reacquire. Optical scores remain heuristic rankings.

Each queued record and alert carries its calibration generation. A separate
write gate orders database mutations with calibration activation; the capture
calibration lock is released during network requests. An in-flight mutation must
finish before new calibration becomes active, and stale queued mutations are
discarded. Saving may therefore wait for an in-flight database request.

Current water-level cards require a matching live/polling measurement no older
than 30 seconds. Disconnected, unvalidated or missing observations show
UNAVAILABLE; saved records remain timestamped history rather than a fallback.

The regression scenes are generated room/face/furniture/shadow fixtures, not a
validated camera dataset. Real water, low light, smooth/shallow surfaces, glare,
striped objects, occlusion and different camera perspectives still need field
testing. The bundled frontal-face cascade may miss profiles or obscured faces.
