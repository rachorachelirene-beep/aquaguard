"""Interactively select a water ROI from an unannotated local JPEG.

Usage: python tools/choose_water_roi.py diorama.jpg --station 3
Click 3-12 boundary vertices clockwise or counterclockwise, Enter to finish,
R to reset, Esc to exit. Output is the exact detector/.env line to paste.
"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cv2
import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="An unannotated /snapshot image")
    parser.add_argument("--station", type=int, default=3)
    args = parser.parse_args()
    base = cv2.imread(args.image)
    if base is None:
        parser.error("Could not read JPEG image")
    height, width = base.shape[:2]
    points = []

    def click(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 12:
            points.append((x, y))

    title = "AquaGuard ROI - click perimeter, Enter = finish, R = reset, Esc = quit"
    cv2.namedWindow(title, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(title, click)
    while True:
        frame = base.copy()
        if points:
            cv2.polylines(frame, [np.array(points, np.int32)], len(points) >= 3, (0, 240, 255), 2)
            for i, p in enumerate(points):
                cv2.circle(frame, p, 5, (0, 255, 0), -1)
                cv2.putText(frame, str(i + 1), (p[0] + 7, p[1] - 7), cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 255, 0), 2)
        cv2.imshow(title, frame)
        key = cv2.waitKey(40) & 0xff
        if key in (13, 10):
            if len(points) < 3:
                print("Select at least three boundary points")
                continue
            normalized = [(x / max(1, width - 1), y / max(1, height - 1)) for x, y in points]
            from detector.water_roi import parse_roi_points
            value = ";".join(f"{x:.5f},{y:.5f}" for x, y in normalized)
            try:
                parse_roi_points(value)
            except ValueError as error:
                print(f"Invalid ROI: {error}. Press R and click in perimeter order.")
                continue
            print(f"WATER_ROI_POINTS_{args.station}={value}")
            print("Paste into detector/.env, then restart the Camera Agent. Keep a backup first.")
            break
        if key in (ord("r"), ord("R")):
            points.clear()
        if key == 27:
            print("Canceled; no settings were changed.")
            break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
