"""Conservative color-independent surface detection inside a calibrated gauge."""
from collections import deque
from dataclasses import dataclass
import cv2
import numpy as np
try:
    from .gauge import is_valid_gauge_points
except ImportError:
    from gauge import is_valid_gauge_points

@dataclass(frozen=True)
class Waterline:
    waterline_y: int
    score: float
    ratio: float

def detect_waterline(frame, gauge_points) -> Waterline | None:
    if frame is None or gauge_points is None:
        return None
    try:
        points = np.asarray(gauge_points, dtype=np.float32)
        h, w = frame.shape[:2]
        if points.shape != (4, 2) or not is_valid_gauge_points(tuple(map(tuple, points))):
            return None
        if np.any(points < 0) or np.any(points[:, 0] > w - 1) or np.any(points[:, 1] > h - 1):
            return None
        tl, tr, br, bl = points
        if min(bl[1], br[1]) <= max(tl[1], tr[1]) or tr[0] <= tl[0] or br[0] <= bl[0]:
            return None
        rw = min(256, int(max(np.linalg.norm(tr-tl), np.linalg.norm(br-bl))))
        rh = min(720, int(max(np.linalg.norm(bl-tl), np.linalg.norm(br-tr))))
        if rw < 16 or rh < 40:
            return None
        dst = np.float32([[0,0], [rw-1,0], [rw-1,rh-1], [0,rh-1]])
        matrix = cv2.getPerspectiveTransform(points, dst)
        warped = cv2.warpPerspective(frame, matrix, (rw,rh))
        gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY) if warped.ndim == 3 else warped
        margin = max(3, int(rw*.08))
        gray = cv2.GaussianBlur(gray[:,margin:-margin], (3,3), 0).astype(np.float32)
        gradient = np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))/8
        strengths = np.median(gradient, axis=1)
        border = max(3, int(rh*.015))
        span = max(4, min(16, rh//12))
        candidates = []
        for y in range(border, rh-border):
            strength = float(strengths[y])
            support = float(np.mean(gradient[y] >= 4))
            if strength < 4 or support < .65:
                continue
            above = gray[max(0,y-span):y-1]
            below = gray[y+2:min(rh,y+span+1)]
            if not above.size or not below.size:
                continue
            contrast = float(abs(np.median(above)-np.median(below)))
            if contrast < 10:
                continue
            # Persistent region change rejects thin rails/ticks/isolated stripes.
            far_above = gray[max(0,y-2*span):max(1,y-span)]
            far_below = gray[min(rh-1,y+span):min(rh,y+2*span)]
            if abs(float(np.median(far_above)-np.median(far_below))) < 10:
                continue
            score = support*min(1.,strength/20)*min(1.,contrast/30)
            candidates.append((score,y))
        if not candidates:
            return None
        candidates.sort(reverse=True)
        score,y = candidates[0]
        if score < .15 or any(s > score*.85 and abs(row-y) > max(5,rh*.04) for s,row in candidates[1:]):
            return None
        fraction = y/(rh-1)
        # Match existing linear edge calibration, including the gauge overlay.
        original_y = (tl[1]+tr[1])/2 + fraction*(bl[1]+br[1]-tl[1]-tr[1])/2
        return Waterline(int(round(original_y)), round(score,4), 1-fraction)
    except (ValueError, TypeError, cv2.error, IndexError):
        return None

def detect_waterline_opencv(frame, gauge_points) -> int | None:
    """Compatibility with the original local prototype."""
    result = detect_waterline(frame, gauge_points)
    return result.waterline_y if result else None

class LevelSmoother:
    """Short median; large jumps require three consistent observations."""
    def __init__(self):
        self.reset()

    def reset(self):
        self.values = deque(maxlen=3)
        self.pending = deque(maxlen=3)

    def update(self, level):
        if level is None:
            self.pending.clear()
            return None
        if self.values and abs(level-float(np.median(self.values))) > .4:
            self.pending.append(level)
            if len(self.pending) < 3 or max(self.pending)-min(self.pending) > .15:
                return None
            self.values.clear()
            self.values.extend(self.pending)
        else:
            self.values.append(level)
        self.pending.clear()
        return round(float(np.median(self.values)),2)
