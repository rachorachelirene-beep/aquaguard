import unittest
import threading
from unittest import mock
from types import SimpleNamespace

import cv2
import numpy as np

from detector import stream_api, gauge
from detector.opencv_waterline import detect_waterline, LevelSmoother

POINTS = ((30., 10.), (110., 10.), (110., 210.), (30., 210.))


def scene(row=None):
    image = np.full((230, 140, 3), 170, np.uint8)
    if row is not None:
        image[row:] = 70  # neutral gray water, no blue color cue
    return image


class OpticalTests(unittest.TestCase):
    def test_no_surface(self):
        self.assertIsNone(detect_waterline(scene(), POINTS))

    def test_low_middle_warning_critical(self):
        for row in (204, 110, 74, 40):
            with self.subTest(row=row):
                result = detect_waterline(scene(row), POINTS)
                self.assertIsNotNone(result)
                self.assertLessEqual(abs(result.waterline_y-row), 2)
                level = gauge.waterline_to_level(result.waterline_y, 230, POINTS)
                self.assertAlmostEqual(level, (210-row)/200*3, delta=.04)

    def test_horizontal_object_is_rejected(self):
        image = scene()
        image[105:111] = 20
        self.assertIsNone(detect_waterline(image, POINTS))

    def test_edges_outside_polygon(self):
        image = scene()
        image[100:, :25] = 20
        image[100:, 115:] = 20
        self.assertIsNone(detect_waterline(image, POINTS))

    def test_ambiguous_boundaries(self):
        image = scene(65)
        image[155:] = 170
        self.assertIsNone(detect_waterline(image, POINTS))

    def test_border_is_ignored(self):
        image = scene()
        image[10:12] = 20
        image[209:211] = 20
        self.assertIsNone(detect_waterline(image, POINTS))

    def test_perspective_gauge(self):
        points = np.float32([[40,20], [105,30], [120,210], [20,200]])
        rect = np.full((200,80,3), 170, np.uint8)
        rect[100:] = 70
        transform = cv2.getPerspectiveTransform(
            np.float32([[0,0],[79,0],[79,199],[0,199]]), points)
        image = cv2.warpPerspective(rect, transform, (140,230))
        result = detect_waterline(image, tuple(map(tuple, points)))
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result.ratio, .5, delta=.02)
        self.assertAlmostEqual(gauge.waterline_to_level(result.waterline_y,230,points),1.5,delta=.05)

    def test_invalid_points(self):
        for points in (None, [], ((0,0),)*4, ((float('nan'),0),)*4,
                       ((0,0),(200,0),(200,100),(0,100)),
                       (POINTS[0], POINTS[2], POINTS[1], POINTS[3])):
            with self.subTest(points=points):
                self.assertIsNone(detect_waterline(scene(), points))


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.points_patch = mock.patch.object(stream_api, 'resolve_configured_gauge_points', return_value=POINTS)
        self.points_patch.start()
        self.addCleanup(self.points_patch.stop)

    def test_yolo_unavailable_optical_valid(self):
        with mock.patch.object(stream_api, 'yolo_model', None):
            result, mask = stream_api.run_yolo_detection(scene(110))
        self.assertTrue(result['detected'])
        self.assertEqual(result['measurement_source'], 'opencv')
        self.assertEqual(result['confidence'], 0)
        self.assertFalse(mask.any())

    def test_yolo_exception_optical_valid(self):
        with mock.patch.object(stream_api, '_run_yolo_detection', side_effect=RuntimeError('inference failed')):
            result, _ = stream_api.run_yolo_detection(scene(110))
        self.assertTrue(result['detected'])
        self.assertEqual(result['measurement_source'], 'opencv')
        self.assertEqual(result['confidence'], 0)
        self.assertEqual(result['measurement_mode'], 'calibrated_gauge')

    def test_public_snapshot_includes_separate_optical_fields(self):
        with mock.patch.object(stream_api, 'yolo_model', None):
            result, _ = stream_api.run_yolo_detection(scene(110))
        with mock.patch.object(stream_api, 'latest_detection', result):
            snapshot = stream_api.get_public_detection_snapshot()
        self.assertEqual(snapshot['measurement_source'], 'opencv')
        self.assertGreater(snapshot['opencv_score'], 0)
        self.assertEqual(snapshot['confidence'], 0)

    def test_camera_measures_each_frame_between_yolo_runs(self):
        frames = [scene(110), scene(109), scene(50), scene(110)]
        published = []
        capture = mock.Mock()

        def read():
            image = frames.pop(0)
            if not frames:
                stream_api.stop_event.set()
            return True, image

        def publish():
            published.append(dict(stream_api.latest_detection))

        capture.read.side_effect = read
        with (
            mock.patch.object(stream_api, 'stop_event', threading.Event()),
            mock.patch.object(stream_api, 'camera_reconnect_event', threading.Event()),
            mock.patch.object(stream_api, 'open_camera', return_value=capture),
            mock.patch.object(stream_api, 'update_camera_state'),
            mock.patch.object(stream_api, 'active_camera_source', 'usb'),
            mock.patch.object(stream_api, 'yolo_model', None),
            mock.patch.object(stream_api, 'YOLO_FRAME_INTERVAL', 12),
            mock.patch.object(stream_api, 'resize_frame_for_processing', side_effect=lambda x:x),
            mock.patch.object(stream_api, 'annotate_frame', side_effect=lambda frame,*args:frame),
            mock.patch.object(stream_api, 'notify_detection_clients', side_effect=publish),
            mock.patch.object(stream_api, 'latest_detection', {'detected_at':'previous connection'}),
            mock.patch.object(stream_api, 'latest_water_mask', None),
            mock.patch.object(stream_api, 'latest_camera_frame', None),
            mock.patch.object(stream_api, 'latest_frame_at', None),
            mock.patch.object(stream_api, 'latest_jpeg', None),
            mock.patch.object(stream_api, 'supabase', None),
            mock.patch.object(stream_api, 'safe_yolo_detection', wraps=stream_api.safe_yolo_detection) as inference,
        ):
            stream_api.camera_capture_loop()
        self.assertEqual(inference.call_count, 1)
        self.assertEqual(len(published), 4)
        self.assertTrue(published[0]['detected'])
        self.assertFalse(published[2]['detected'])  # large isolated jump rejected
        self.assertEqual(published[2]['measurement_source'], 'none')
        self.assertTrue(published[3]['detected'])
        capture.release.assert_called_once()

    def test_yolo_mask_and_optical(self):
        class Tensor:
            def __init__(self, value):
                self.value = np.asarray(value)
            def detach(self):
                return self
            def cpu(self):
                return self
            def numpy(self):
                return self.value
        mask = np.zeros((230,140), np.float32)
        mask[160:,30:111] = 1
        prediction = SimpleNamespace(
            boxes=SimpleNamespace(cls=Tensor([0]), conf=Tensor([.87])),
            masks=SimpleNamespace(data=[Tensor(mask)]))
        model = mock.Mock(names={0:'water'})
        model.predict.return_value = [prediction]
        with mock.patch.object(stream_api, 'yolo_model', model), mock.patch.object(stream_api,'YOLO_ENABLED',True):
            result, _ = stream_api.run_yolo_detection(scene(110))
            fallback, _ = stream_api.run_yolo_detection(scene())
        self.assertEqual(result['measurement_source'], 'opencv+yolo')
        self.assertAlmostEqual(result['level_m'],1.5,delta=.04)
        self.assertEqual(result['confidence'],.87)
        self.assertGreater(result['water_coverage'],0)
        self.assertTrue(result['yolo_available'])
        self.assertTrue(result['yolo_detected'])
        self.assertIsNotNone(result['combined_risk']['components']['water'])
        self.assertGreater(result['combined_risk']['components']['yolo'], 0)
        self.assertEqual(fallback['measurement_source'],'yolo')
        self.assertTrue(fallback['detected'])

    def test_both_fail(self):
        with mock.patch.object(stream_api, 'yolo_model', None):
            result, _ = stream_api.run_yolo_detection(scene())
        self.assertFalse(result['detected'])
        self.assertEqual(result['status'],'no_detection')
        self.assertEqual(result['measurement_source'],'none')

    def test_thresholds_unchanged(self):
        warning = stream_api.WARNING_LEVEL_M
        critical = stream_api.CRITICAL_LEVEL_M
        for level, status in (
            (warning - .01, 'normal'),
            (warning, 'warning'),
            ((warning + critical) / 2, 'warning'),
            (critical, 'critical'),
        ):
            self.assertEqual(stream_api.determine_level_status(level,True),status)

    def test_optical_only_risk_has_no_yolo_evidence(self):
        with mock.patch.object(stream_api, 'yolo_model', None), mock.patch.object(
            stream_api, 'get_risk_context', return_value={}
        ):
            result, _ = stream_api.run_yolo_detection(scene(110))
        risk = result['combined_risk']
        self.assertTrue(result['detected'])
        self.assertTrue(result['opencv_available'])
        self.assertTrue(result['opencv_detected'])
        self.assertFalse(result['detection_enabled'])
        self.assertFalse(result['yolo_available'])
        self.assertFalse(result['yolo_detected'])
        self.assertTrue(risk['assessed'])
        self.assertIsNotNone(risk['components']['water'])
        self.assertIsNone(risk['components']['yolo'])
        factor = next(f for f in risk['factors'] if f['name'] == 'Floodwater detection')
        self.assertEqual(factor['impact'], 'unavailable')

    def test_optical_and_available_yolo_without_detection_risk(self):
        model = mock.Mock(names={0:'water'})
        model.predict.return_value = [SimpleNamespace(boxes=None, masks=None)]
        with (
            mock.patch.object(stream_api, 'yolo_model', model),
            mock.patch.object(stream_api, 'YOLO_ENABLED', True),
            mock.patch.object(stream_api, 'get_risk_context', return_value={}),
        ):
            result, _ = stream_api.run_yolo_detection(scene(110))
        self.assertTrue(result['detected'])
        self.assertTrue(result['yolo_available'])
        self.assertFalse(result['yolo_detected'])
        self.assertEqual(result['combined_risk']['components']['yolo'], 0)
        self.assertIsNotNone(result['combined_risk']['components']['water'])
        factor = next(f for f in result['combined_risk']['factors'] if f['name'] == 'Floodwater detected')
        self.assertEqual(factor['value'], 'No')

    def test_outside_gauge_yolo_mask_does_not_confirm_optical(self):
        class Tensor:
            def __init__(self, value):
                self.value = np.asarray(value)
            def detach(self):
                return self
            def cpu(self):
                return self
            def numpy(self):
                return self.value

        mask = np.zeros((230,140), np.float32)
        mask[100:, :25] = 1
        model = mock.Mock(names={0:'water'})
        model.predict.return_value = [SimpleNamespace(
            boxes=SimpleNamespace(cls=Tensor([0]), conf=Tensor([.87])),
            masks=SimpleNamespace(data=[Tensor(mask)]),
        )]
        with (
            mock.patch.object(stream_api, 'yolo_model', model),
            mock.patch.object(stream_api, 'YOLO_ENABLED', True),
            mock.patch.object(stream_api, 'get_risk_context', return_value={}),
        ):
            result, _ = stream_api.run_yolo_detection(scene(110))
        self.assertGreater(result['confidence'], 0)
        self.assertGreater(result['water_coverage'], 0)
        self.assertTrue(result['detected'])
        self.assertFalse(result['yolo_detected'])
        self.assertEqual(result['measurement_source'], 'opencv')
        self.assertEqual(result['combined_risk']['components']['yolo'], 0)


class SmoothingTests(unittest.TestCase):
    def test_median_outlier_and_sustained_change(self):
        smoother = LevelSmoother()
        self.assertEqual(smoother.update(1.),1.)
        smoother.update(1.1)
        self.assertEqual(smoother.update(.9),1.)
        self.assertIsNone(smoother.update(2.5))
        self.assertEqual(smoother.update(1.),1.)
        self.assertIsNone(smoother.update(2.))
        self.assertIsNone(smoother.update(2.05))
        self.assertEqual(smoother.update(2.02),2.02)
        self.assertIsNone(smoother.update(None))
        self.assertIsNone(smoother.update(.1))
        smoother.reset()
        self.assertEqual(smoother.update(.1),.1)

    def test_miss_preserves_stable_history_and_jump_validation(self):
        smoother = LevelSmoother()
        for level in (.99, 1., 1.01):
            smoother.update(level)
        self.assertIsNone(smoother.update(None))
        self.assertIsNone(smoother.update(2.5))
        self.assertIsNone(smoother.update(2.51))
        self.assertEqual(smoother.update(2.49), 2.5)

    def test_miss_clears_pending_jump_candidates(self):
        smoother = LevelSmoother()
        smoother.update(1.)
        self.assertIsNone(smoother.update(2.5))
        self.assertIsNone(smoother.update(None))
        self.assertIsNone(smoother.update(2.5))
        self.assertIsNone(smoother.update(2.51))
        self.assertEqual(smoother.update(2.49), 2.5)


if __name__ == '__main__':
    unittest.main()
