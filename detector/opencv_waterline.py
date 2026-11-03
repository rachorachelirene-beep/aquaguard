"""Conservative color-independent surface detection inside a calibrated gauge."""
from collections import deque
from dataclasses import dataclass
import cv2
import numpy as np
from pathlib import Path
try:
    from .gauge import is_valid_gauge_points
except ImportError:
    from gauge import is_valid_gauge_points


_face_cascade = None


def has_nearby_face(frame):
    """Conservative veto for a webcam aimed at people, using bundled OpenCV data."""
    global _face_cascade
    if _face_cascade is None:
        path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        _face_cascade = cv2.CascadeClassifier(str(path)) if path.exists() else False
    if _face_cascade is False or _face_cascade.empty():
        return False
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    scale = min(1., 480/max(gray.shape))
    small = cv2.resize(gray, None, fx=scale, fy=scale)
    faces = _face_cascade.detectMultiScale(small, scaleFactor=1.15, minNeighbors=5, minSize=(24,24))
    return any(w*h >= small.size*.02 for _,_,w,h in faces)


@dataclass(frozen=True)
class Waterline:
    waterline_y: int
    score: float
    ratio: float
    proposed_roi: tuple = ()


def _has_calm_water_evidence(warped, margin, y, span, rh, gx) -> bool:
    """Detect real calm/submerged water inside the gauge while rejecting flat neutral shadows."""
    if warped.ndim != 3 or float(np.mean(gx)) >= 2.2:
        return False
    crop = warped[:, margin:-margin]
    if crop.shape[1] < 4:
        return False
    abv = slice(max(0, y - span), max(1, y - 1))
    bel = slice(min(rh - 1, y + 2), rh)
    if bel.stop - bel.start < 3 or abv.stop - abv.start < 2:
        return False
    gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY).astype(np.float32)
    if float(np.median(gray_crop[abv]) - np.median(gray_crop[bel])) < 10.0:
        return False
    sat = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)[:, :, 1].astype(np.float32)
    rb = crop[:, :, 2].astype(np.float32) - crop[:, :, 0].astype(np.float32)
    if float(np.median(sat[bel])) < 15.0:
        return False
    sat_shift = float(np.median(sat[bel]) - np.median(sat[abv]))
    rb_shift = float(abs(np.median(rb[bel]) - np.median(rb[abv])))
    if sat_shift < 12.0 and rb_shift < 10.0:
        return False
    row_meds = np.median(gray_crop[bel], axis=1)
    row_sats = np.median(sat[bel], axis=1)
    return float(np.std(row_meds)) < 8.0 and float(np.std(row_sats)) < 10.0


def _detect_flank_waterline(frame, points, warped, rw, rh, span, search_start, search_end):
    """Detect water meniscus across flanking channel walls when gauge interior has printed bands."""
    if frame.ndim != 3 or warped.ndim != 3 or float(np.std(warped)) < 8.0:
        return None
    if float(np.max(np.abs(warped[rh // 3:, :, 2].astype(np.float32) - warped[rh // 3:, :, 0].astype(np.float32)))) < 3.0:
        return None
    h, w = frame.shape[:2]
    tl, tr, br, bl = points
    top_vec = tr - tl
    bot_vec = br - bl
    left_pts = np.float32([
        tl - 0.55 * top_vec,
        tl - 0.08 * top_vec,
        bl - 0.08 * bot_vec,
        bl - 0.55 * bot_vec,
    ])
    right_pts = np.float32([
        tr + 0.08 * top_vec,
        tr + 0.55 * top_vec,
        br + 0.55 * bot_vec,
        br + 0.08 * bot_vec,
    ])
    for fp in (left_pts, right_pts):
        fp[:, 0] = np.clip(fp[:, 0], 0, w - 1)
        fp[:, 1] = np.clip(fp[:, 1], 0, h - 1)
    if np.linalg.norm(left_pts[1] - left_pts[0]) < 8 or np.linalg.norm(right_pts[1] - right_pts[0]) < 8:
        return None
    fw = 48
    fdst = np.float32([[0, 0], [fw - 1, 0], [fw - 1, rh - 1], [0, rh - 1]])
    wl = cv2.warpPerspective(frame, cv2.getPerspectiveTransform(left_pts, fdst), (fw, rh))
    wr = cv2.warpPerspective(frame, cv2.getPerspectiveTransform(right_pts, fdst), (fw, rh))
    gl = cv2.GaussianBlur(cv2.cvtColor(wl, cv2.COLOR_BGR2GRAY).astype(np.float32), (3, 3), 0)
    gr = cv2.GaussianBlur(cv2.cvtColor(wr, cv2.COLOR_BGR2GRAY).astype(np.float32), (3, 3), 0)
    sl = cv2.cvtColor(wl, cv2.COLOR_BGR2HSV)[:, :, 1].astype(np.float32)
    sr = cv2.cvtColor(wr, cv2.COLOR_BGR2HSV)[:, :, 1].astype(np.float32)
    rbl = wl[:, :, 2].astype(np.float32) - wl[:, :, 0].astype(np.float32)
    rbr = wr[:, :, 2].astype(np.float32) - wr[:, :, 0].astype(np.float32)
    grad_l = np.abs(cv2.Sobel(gl, cv2.CV_32F, 0, 1, ksize=3)) / 8.0
    grad_r = np.abs(cv2.Sobel(gr, cv2.CV_32F, 0, 1, ksize=3)) / 8.0
    best = None
    for y in range(search_start, search_end):
        y_abv0, y_abv1 = max(0, y - span), max(1, y - 1)
        y_bel0, y_bel1 = min(rh - 1, y + 2), min(rh, y + span + 2)
        if y_abv1 <= y_abv0 or y_bel1 <= y_bel0:
            continue
        dl = float(np.median(gl[y_abv0:y_abv1]) - np.median(gl[y_bel0:y_bel1]))
        dr = float(np.median(gr[y_abv0:y_abv1]) - np.median(gr[y_bel0:y_bel1]))
        if dl < 10.0 or dr < 10.0:
            continue
        bot0 = max(y_bel0, rh - max(span, 4))
        dl_bot = float(np.median(gl[:max(2, y_abv1)]) - np.median(gl[bot0:rh]))
        dr_bot = float(np.median(gr[:max(2, y_abv1)]) - np.median(gr[bot0:rh]))
        if dl_bot < 12.0 or dr_bot < 12.0:
            continue
        dsl = float(np.median(sl[y_bel0:rh]) - np.median(sl[:max(2, y_abv1)]))
        dsr = float(np.median(sr[y_bel0:rh]) - np.median(sr[:max(2, y_abv1)]))
        drbl = float(abs(np.median(rbl[y_bel0:rh]) - np.median(rbl[:max(2, y_abv1)])))
        drbr = float(abs(np.median(rbr[y_bel0:rh]) - np.median(rbr[:max(2, y_abv1)])))
        if (dsl < 12.0 or dsr < 12.0) and (drbl < 10.0 or drbr < 10.0):
            continue
        band_l = grad_l[max(0, y - 1):min(rh, y + 2)]
        band_r = grad_r[max(0, y - 1):min(rh, y + 2)]
        str_l = float(np.max(np.median(band_l, axis=1)))
        str_r = float(np.max(np.median(band_r, axis=1)))
        sup_l = float(np.mean(np.max(band_l, axis=0) >= 2.0))
        sup_r = float(np.mean(np.max(band_r, axis=0) >= 2.0))
        if str_l < 1.8 or str_r < 1.8 or sup_l < 0.5 or sup_r < 0.5:
            continue
        contrast = 0.5 * (dl + dr)
        strength = 0.5 * (str_l + str_r)
        support = 0.5 * (sup_l + sup_r)
        row_peak = 0.5 * (float(np.median(grad_l[y])) + float(np.median(grad_r[y])))
        score = max(0.18, support * min(1.0, strength / 10.0) * min(1.0, contrast / 25.0))
        key = (round(score, 3), row_peak)
        if best is None or key > best[0]:
            best = (key, score, y)
    return (best[1], best[2]) if best is not None else None


def detect_waterline(frame, gauge_points, water_confirmed=False, analysis_roi=None) -> Waterline | None:
    if frame is None or gauge_points is None:
        return None
    try:
        points = np.asarray(gauge_points, dtype=np.float32)
        h, w = frame.shape[:2]
        if has_nearby_face(frame):
            return None
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
        search_start, search_end = border, rh-border
        if analysis_roi:
            mapped = cv2.perspectiveTransform(np.float32([analysis_roi]), matrix)[0]
            search_start = max(border, int(np.min(mapped[:,1])))
            search_end = min(rh-border, int(np.max(mapped[:,1]))+1)
        candidates = []
        for y in range(search_start, search_end):
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
            far_below = (
                gray[min(rh-1,y+span):min(rh,y+2*span)]
                if y + span < rh - border
                else gray[min(rh-1,y+2):rh]
            )
            if abs(float(np.median(far_above)-np.median(far_below))) < 10:
                continue
            score = support*min(1.,strength/20)*min(1.,contrast/30)
            candidates.append((score,y))
        selected = None
        if candidates:
            candidates.sort(reverse=True)
            score, y = candidates[0]
            ambiguous = score < .15 or any(
                s > score*.85 and abs(row-y) > max(5,rh*.04) for s,row in candidates[1:]
            )
            if not ambiguous:
                region = gray[y+3:]
                if region.shape[0] >= 4:
                    gy = np.abs(cv2.Sobel(region, cv2.CV_32F, 0, 1, ksize=3))/8
                    gx = np.abs(cv2.Sobel(region, cv2.CV_32F, 1, 0, ksize=3))/8
                    ripple_rows = np.flatnonzero(np.mean(gy > 1.5, axis=1) > .65)
                    groups = np.split(ripple_rows, np.flatnonzero(np.diff(ripple_rows) > 1)+1)
                    ripple_evidence = (
                        sum(bool(group.size) for group in groups) >= 2
                        and float(np.mean(gy)) > max(1., float(np.mean(gx))*1.6)
                    )
                    calm_evidence = _has_calm_water_evidence(warped, margin, y, span, rh, gx)
                    if ripple_evidence or water_confirmed or calm_evidence:
                        selected = (score, y)
        if selected is None:
            selected = _detect_flank_waterline(
                frame, points, warped, rw, rh, span, search_start, search_end
            )
        if selected is None:
            # Movement outside a prior band triggers full-gauge reacquisition.
            if analysis_roi:
                return detect_waterline(frame,gauge_points,water_confirmed)
            return None
        score, y = selected
        # Map back with the inverse homography, not a linear approximation:
        # the indicator follows the actual image boundary even on a trapezoid.
        band = np.float32([[[margin, max(border,y-span)],
                             [rw-1-margin, max(border,y-span)],
                             [rw-1-margin, min(rh-1-border,y+span)],
                             [margin, min(rh-1-border,y+span)]]])
        inverse = np.linalg.inv(matrix)
        proposal = cv2.perspectiveTransform(band, inverse)[0]
        center = cv2.perspectiveTransform(np.float32([[[(rw-1)/2,y]]]), inverse)[0,0]
        original_y = int(round(float(center[1])))
        ratio = ((bl[1]+br[1])/2-original_y)/((bl[1]+br[1]-tl[1]-tr[1])/2)
        return Waterline(original_y, round(score,4), float(ratio),
                         tuple(tuple(float(v) for v in point) for point in proposal))
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


class WaterlineTracker:
    """Three independent frames before acquiring/reacquiring a surface."""
    def __init__(self, verification_interval=12):
        self.verification_interval = max(1, verification_interval)
        self.reset()

    def reset(self):
        self.rows = deque(maxlen=3)
        self.last = None
        self.roi = None
        self.verification_frames = 0

    def verification_due(self):
        self.verification_frames += 1
        if self.verification_frames >= self.verification_interval:
            self.verification_frames = 0
            return True
        return False

    def accept(self, row, height):
        if row is None:
            self.reset()
            return False
        tolerance = max(3, height*.02)
        if self.last is not None and abs(row-self.last) <= tolerance:
            self.last = row
            return True
        self.rows.append(row)
        if len(self.rows) < 3 or max(self.rows)-min(self.rows) > tolerance:
            self.last = None
            return False
        self.last = row
        self.rows.clear()
        return True
