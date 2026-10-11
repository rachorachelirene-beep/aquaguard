"""Generated room fixtures and runtime safety regressions; no real-water claims."""
import unittest
import os
from unittest import mock

import cv2
import numpy as np

from detector import stream_api
from detector.opencv_waterline import Waterline, WaterlineTracker, detect_waterline
from test_opencv_waterline import POINTS, scene

HAS_CALIBRATION = stream_api.has_calibration


def room_scene():
    frame = np.full((230, 140, 3), 175, np.uint8)
    # Wall/shadow, furniture rail, head, hair, facial contours and clothing.
    frame[160:] = 90
    cv2.rectangle(frame, (0, 140), (139, 147), (45,45,45), -1)
    cv2.ellipse(frame, (72,80), (30,45), 0, 0, 360, (120,155,185), -1)
    cv2.ellipse(frame, (72,43), (29,12), 0, 0, 360, (35,35,35), -1)
    cv2.circle(frame, (61,76), 3, (20,20,20), -1)
    cv2.circle(frame, (83,76), 3, (20,20,20), -1)
    cv2.line(frame, (64,101), (80,101), (40,40,40), 2)
    return frame


class AdaptiveTests(unittest.TestCase):
    def test_periodic_full_gauge_rejects_persistent_wrong_local_edge(self):
        tracker = WaterlineTracker(verification_interval=2)
        local = Waterline(110, .6, .5, tuple(POINTS))
        full = Waterline(70, .9, .7, tuple(POINTS))
        with mock.patch.object(stream_api, 'detect_waterline', return_value=local):
            for _ in range(3):
                result = stream_api.apply_opencv_measurement(scene(110), self.yolo, tracker)
        self.assertTrue(result['detected'])
        def detect(*args, **kwargs):
            return local if kwargs.get('analysis_roi') else full
        with mock.patch.object(stream_api, 'detect_waterline', side_effect=detect) as detector:
            result = stream_api.apply_opencv_measurement(scene(110), self.yolo, tracker)
            self.assertTrue(result['detected'])
            result = stream_api.apply_opencv_measurement(scene(110), self.yolo, tracker)
            self.assertEqual(detector.call_count, 3)
            self.assertFalse(result['detected'])
            self.assertIsNone(result['level_m'])
            self.assertIsNone(tracker.roi)
            for index in range(3):
                result = stream_api.apply_opencv_measurement(scene(70), self.yolo, tracker)
                self.assertEqual(result['detected'], index == 2)
        self.assertEqual(result['waterline_y'], 70)

    def test_periodic_full_gauge_agreement_keeps_valid_tracking(self):
        tracker = WaterlineTracker(verification_interval=1)
        for _ in range(3):
            result = stream_api.apply_opencv_measurement(scene(110), self.yolo, tracker)
        with mock.patch.object(stream_api, 'detect_waterline', wraps=detect_waterline) as detector:
            result = stream_api.apply_opencv_measurement(scene(110), self.yolo, tracker)
        self.assertTrue(result['detected'])
        self.assertEqual(detector.call_count, 2)

    def test_local_candidate_without_full_gauge_support_becomes_unavailable(self):
        tracker = WaterlineTracker(verification_interval=1)
        for _ in range(3):
            stream_api.apply_opencv_measurement(scene(110), self.yolo, tracker)
        local = Waterline(110, .8, .5, tuple(POINTS))
        with mock.patch.object(stream_api,'detect_waterline',side_effect=[local,None]):
            result = stream_api.apply_opencv_measurement(scene(110), self.yolo, tracker)
        self.assertFalse(result['detected'])
        self.assertIsNone(result['level_m'])
        self.assertIsNone(result['waterline_y'])
        self.assertIsNone(tracker.last)

    def setUp(self):
        for name, value in (('resolve_configured_gauge_points', POINTS),
                            ('has_calibration', True), ('get_risk_context', {})):
            patch = mock.patch.object(stream_api, name, return_value=value)
            patch.start()
            self.addCleanup(patch.stop)
        self.yolo = dict(station_id=stream_api.get_active_station_id(), detected=False,
                         yolo_available=False, yolo_detected=False, level_m=None,
                         waterline_y=None, confidence=0, water_coverage=0)

    def test_no_water_room_and_strong_shadow_remain_unavailable(self):
        shadow = np.full((230,140,3),170,np.uint8)
        shadow[110:] = 70
        for image in (room_scene(), shadow):
            tracker = WaterlineTracker()
            for _ in range(6):
                result = stream_api.apply_opencv_measurement(image,self.yolo,tracker)
                self.assertFalse(result['detected'])
                self.assertIsNone(result['level_m'])
                self.assertIsNone(result['waterline_y'])

    def test_valid_movement_proposes_analysis_band_without_moving_gauge(self):
        tracker = WaterlineTracker()
        for _ in range(3):
            result = stream_api.apply_opencv_measurement(scene(110),self.yolo,tracker)
        self.assertTrue(result['detected'])
        first_level = result['level_m']
        fixed_points = result['gauge_points']
        result = stream_api.apply_opencv_measurement(scene(107),self.yolo,tracker)
        self.assertTrue(result['detected'])
        self.assertGreater(result['level_m'], first_level)
        self.assertAlmostEqual(result['waterline_y'],107,delta=2)
        self.assertEqual(result['gauge_points'],fixed_points)
        self.assertEqual(len(result['proposed_roi']),4)
        for x,y in result['proposed_roi']:
            self.assertGreaterEqual(x,30)
            self.assertLessEqual(x,110)
            self.assertGreaterEqual(y,10)
            self.assertLessEqual(y,210)

    def test_uncertain_observations_and_loss_require_reacquisition(self):
        tracker = WaterlineTracker()
        for row in (110,80,110,80):
            self.assertFalse(stream_api.apply_opencv_measurement(scene(row),self.yolo,tracker)['detected'])
        for _ in range(3):
            result = stream_api.apply_opencv_measurement(scene(110),self.yolo,tracker)
        self.assertTrue(result['detected'])
        result = stream_api.apply_opencv_measurement(scene(),self.yolo,tracker)
        self.assertIsNone(result['level_m'])
        self.assertIsNone(result['waterline_y'])
        self.assertFalse(stream_api.apply_opencv_measurement(scene(110),self.yolo,tracker)['detected'])
        tracker.reset()  # camera reconnect/context change
        self.assertFalse(stream_api.apply_opencv_measurement(scene(110),self.yolo,tracker)['detected'])

    def test_conflicting_yolo_and_optical_are_unavailable(self):
        yolo = dict(self.yolo,detected=True,yolo_available=True,yolo_detected=True,
                    waterline_y=40,level_m=2.5,confidence=.9,water_coverage=40)
        result = stream_api.apply_opencv_measurement(scene(110),yolo,WaterlineTracker())
        self.assertFalse(result['detected'])
        self.assertIsNone(result['level_m'])
        self.assertIsNone(result['waterline_y'])

    def test_missing_calibration_never_produces_meters(self):
        with mock.patch.object(stream_api,'has_calibration',return_value=False):
            tracker = WaterlineTracker()
            for _ in range(3):
                result = stream_api.apply_opencv_measurement(scene(110),self.yolo,tracker)
        self.assertFalse(result['detected'])
        self.assertFalse(result['calibration_valid'])
        self.assertIsNone(result['level_m'])
        self.assertIsNotNone(result['waterline_y'])
        self.assertEqual(result['measurement_mode'],'uncalibrated')
        with mock.patch.object(stream_api,'resolve_configured_gauge_points',return_value=None):
            result = stream_api.apply_opencv_measurement(scene(110),self.yolo)
        self.assertIsNone(result['level_m'])

    def test_flat_edge_requires_independent_water_confirmation(self):
        flat = np.full((230,140,3),170,np.uint8)
        flat[110:] = 70
        self.assertIsNone(detect_waterline(flat,POINTS))
        self.assertIsNotNone(detect_waterline(flat,POINTS,water_confirmed=True))

    def test_nearby_face_vetoes_optical_candidate(self):
        with mock.patch('detector.opencv_waterline.has_nearby_face',return_value=True):
            self.assertIsNone(detect_waterline(scene(110),POINTS,water_confirmed=True))

    def test_vertical_clothing_texture_is_not_ripple_evidence(self):
        image = np.full((230,140,3),170,np.uint8)
        for x in range(140):
            image[110:,x] = int(70+18*np.sin(x*1.2))
        self.assertIsNone(detect_waterline(image,POINTS))

    def test_invalid_measurements_cannot_write_or_alert(self):
        for changes in ({'detected':False}, {'calibration_valid':False},
                        {'measurement_validated':False}, {'level_m':None}):
            result = dict(self.yolo,detected=True,calibration_valid=True,
                          measurement_validated=True,level_m=2.8,status='critical')
            result.update(changes)
            with mock.patch.object(stream_api,'supabase') as database:
                stream_api.write_detection_to_supabase(result)
                stream_api.create_alert_if_needed(result)
                database.table.assert_not_called()

    def test_missing_or_invalid_reference_configuration(self):
        for config in ({}, {'GAUGE_POINTS':'reference','MIN_LEVEL_M':'bad','MAX_LEVEL_M':'3'},
                       {'GAUGE_POINTS':'reference','MIN_LEVEL_M':'0','MAX_LEVEL_M':'nan'}):
            with mock.patch.dict(os.environ,config,clear=True), mock.patch.object(
                stream_api,'calibration_reference_valid',False
            ):
                self.assertFalse(HAS_CALIBRATION(POINTS,140,230))

    def test_valid_reading_can_write_monitoring_records(self):
        tracker = WaterlineTracker()
        for _ in range(3):
            result = stream_api.apply_opencv_measurement(scene(110),self.yolo,tracker)
        with (
            mock.patch.object(stream_api,'supabase') as database,
            mock.patch.object(stream_api,'refresh_risk_context'),
            mock.patch.object(stream_api,'publish_combined_risk'),
            mock.patch.object(stream_api,'create_alert_if_needed'),
        ):
            stream_api.write_detection_to_supabase(result)
            calls = database.table.call_args_list
            self.assertIn(mock.call('water_levels'),calls)
            water_level = database.table.return_value.insert.call_args_list[0].args[0]
            self.assertEqual(water_level['level_m'],result['level_m'])


if __name__ == '__main__':
    unittest.main()
