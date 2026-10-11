import copy
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from detector import stream_api as api
from detector import gauge
from detector.admin_auth import AdminAuthorizationError
from detector.gauge_config import FIELDS, GaugeConfigStore, validate, load_configuration
from test_opencv_waterline import scene

CONFIG = dict(gauge_enabled=True, gauge_points='0.2,0.1;0.8,0.1;0.8,0.9;0.2,0.9',
              min_level_m=0, max_level_m=3, normal_level_m=1, warning_level_m=2,
              critical_level_m=2.5, gauge_tick_interval_m=.25, gauge_label_interval_m=.5,
              waterline_row_coverage=.3, waterline_fallback_row_coverage=.08)


class GaugeConfigurationTests(unittest.TestCase):
    def test_calibration_activation_waits_for_insert_without_blocking_capture_lock(self):
        self.save()
        reading = dict(detected=True,calibration_valid=True,measurement_validated=True,
                       level_m=1,calibration_generation=api.calibration_generation)
        entered, release, updated = threading.Event(), threading.Event(), threading.Event()
        results = []
        def execute():
            entered.set()
            if not release.wait(3):
                raise TimeoutError('test insert did not release')
        def update():
            results.append(self.save().status_code)
            updated.set()
        with mock.patch.object(api,'supabase') as database:
            database.table.return_value.insert.return_value.execute.side_effect = execute
            writer = threading.Thread(target=api.execute_measurement_insert,args=('water_levels',{},reading))
            writer.start()
            updater = None
            try:
                self.assertTrue(entered.wait(2))
                acquired = api.calibration_lock.acquire(timeout=1)
                self.assertTrue(acquired)
                if acquired:
                    api.calibration_lock.release()
                updater = threading.Thread(target=update)
                updater.start()
                self.assertFalse(updated.wait(.05))
            finally:
                release.set()
                writer.join(3)
                if updater:
                    updater.join(3)
            self.assertEqual(results,[200])
            self.assertFalse(api.execute_measurement_insert('alerts',{},reading))
            self.assertEqual(database.table.call_count,1)

    def test_calibration_change_during_context_refresh_cancels_records_and_alerts(self):
        self.save()
        reading = dict(station_id=1,detected=True,calibration_valid=True,
                       measurement_validated=True,level_m=2.8,status='critical',
                       calibration_generation=api.calibration_generation)
        with (mock.patch.object(api,'supabase') as database,
              mock.patch.object(api,'refresh_risk_context',side_effect=lambda *_:self.save()),
              mock.patch.object(api,'publish_combined_risk') as publish,
              mock.patch.object(api,'create_alert_if_needed') as alert):
            api.write_detection_to_supabase(reading)
        database.table.assert_not_called()
        publish.assert_not_called()
        alert.assert_not_called()

    def test_measurement_without_generation_cannot_be_persisted(self):
        reading = dict(detected=True,calibration_valid=True,measurement_validated=True,level_m=1)
        with mock.patch.object(api,'supabase') as database:
            self.assertFalse(api.execute_measurement_insert('water_levels',{},reading))
        database.table.assert_not_called()

    def test_calibration_change_between_inserts_cancels_remaining_tables(self):
        self.save()
        reading = dict(station_id=1,detected=True,calibration_valid=True,
                       measurement_validated=True,level_m=1,status='normal',
                       calibration_generation=api.calibration_generation)
        insert = api.execute_measurement_insert
        def insert_then_activate(table, payload, detection):
            accepted = insert(table,payload,detection)
            if table == 'water_levels':
                self.assertEqual(self.save().status_code,200)
            return accepted
        with (mock.patch.object(api,'supabase') as database,
              mock.patch.object(api,'refresh_risk_context'),
              mock.patch.object(api,'publish_combined_risk'),
              mock.patch.object(api,'execute_measurement_insert',side_effect=insert_then_activate)):
            api.write_detection_to_supabase(reading)
        self.assertEqual(database.table.call_args_list,[mock.call('water_levels')])

    def test_alert_waiting_for_cooldown_lock_is_rechecked_after_activation(self):
        self.save()
        reading = dict(station_id=1,detected=True,calibration_valid=True,
                       measurement_validated=True,level_m=2.8,status='critical',
                       calibration_generation=api.calibration_generation)
        checked = threading.Event()
        valid = api.valid_measurement
        def check(detection):
            result = valid(detection)
            checked.set()
            return result
        with (mock.patch.object(api,'supabase') as database,
              mock.patch.object(api,'last_alert_times',{}),
              mock.patch.object(api,'valid_measurement',side_effect=check)):
            worker = threading.Thread(target=api.create_alert_if_needed,args=(reading,))
            try:
                with api.alert_lock:
                    worker.start()
                    self.assertTrue(checked.wait(2))
                    self.assertEqual(self.save().status_code,200)
            finally:
                if worker.ident is not None:
                    worker.join(3)
            self.assertFalse(worker.is_alive())
            database.table.assert_not_called()
            self.assertEqual(api.last_alert_times,{})

    def setUp(self):
        self.client = api.app.test_client()
        directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(directory.cleanup)
        store = mock.patch.object(api,'gauge_config_store',GaugeConfigStore(Path(directory.name)/'gauge.json'))
        store.start()
        self.addCleanup(store.stop)
        for key in ('gauge_configuration','calibration_generation','calibration_source',
                    'calibration_error','calibration_reference_valid','latest_detection','latest_water_mask'):
            original = copy.deepcopy(getattr(api,key))
            self.addCleanup(setattr,api,key,original)
        for constant in FIELDS.values():
            self.addCleanup(setattr,api,constant,getattr(api,constant))
            self.addCleanup(setattr,gauge,constant,getattr(gauge,constant))

    def save(self, config=CONFIG):
        with mock.patch.object(api,'authorize_active_admin'):
            return self.client.put('/gauge_config',json=config,headers={'Authorization':'Bearer test'})

    def test_auth_required_for_read_and_write(self):
        for method in ('get','put'):
            response = getattr(self.client,method)('/gauge_config',json=CONFIG)
            self.assertEqual(response.status_code,401)
        with mock.patch.object(api,'authorize_active_admin',side_effect=AdminAuthorizationError('Not active admin',403)):
            self.assertEqual(self.client.put('/gauge_config',json=CONFIG).status_code,403)

    def test_invalid_points_numbers_and_thresholds_do_not_change_state(self):
        for changes in ({'gauge_points':'0.2,0.1;0.8,0.9;0.8,0.1;0.2,0.9'},
                        {'gauge_points':'0,0;1,0;1,1;0,1'}, {'max_level_m':'nan'},
                        {'warning_level_m':3}, {'gauge_enabled':'maybe'},
                        {'gauge_tick_interval_m':0}, {'waterline_fallback_row_coverage':.8}):
            before = api.calibration_generation
            response = self.save(dict(CONFIG,**changes))
            self.assertEqual(response.status_code,400,changes)
            self.assertEqual(api.calibration_generation,before)

    def test_saved_reference_survives_new_store_and_is_immediately_active(self):
        response = self.save()
        self.assertEqual(response.status_code,200)
        reloaded = GaugeConfigStore(api.gauge_config_store.path).load()
        self.assertEqual(validate(reloaded),response.json['settings'])
        self.assertEqual(gauge.GAUGE_POINTS,CONFIG['gauge_points'])
        self.assertTrue(api.has_calibration(gauge.resolve_gauge_points(1280,720,1280,720),1280,720))
        self.assertFalse(api.latest_detection['detected'])
        self.assertIsNone(api.latest_detection['level_m'])
        with mock.patch.object(api,'authorize_active_admin'):
            loaded = self.client.get('/gauge_config')
        self.assertEqual(loaded.json['settings'],reloaded)
        self.assertEqual(loaded.json['configuration_source'],'runtime_config')
        self.assertNotIn('SUPABASE',loaded.get_data(as_text=True))
        self.assertEqual(loaded.headers['Cache-Control'],'no-store')
        restarted, source = load_configuration(GaugeConfigStore(api.gauge_config_store.path),
                                               dict(CONFIG, max_level_m=9))
        self.assertEqual(source,'runtime_config')
        self.assertEqual(restarted,reloaded)

    def test_missing_saved_file_uses_defaults_and_corrupt_file_does_not(self):
        config, source = load_configuration(api.gauge_config_store, CONFIG)
        self.assertEqual(source,'environment')
        api.gauge_config_store.save({'invalid':'saved'})
        with self.assertRaises(ValueError):
            load_configuration(api.gauge_config_store,CONFIG)

    def test_failed_persistence_does_not_activate_config(self):
        before = api.calibration_generation
        with mock.patch.object(api.gauge_config_store,'save',side_effect=OSError('private file path')):
            response = self.save()
        self.assertEqual(response.status_code,500)
        self.assertEqual(api.calibration_generation,before)
        self.assertNotIn('private file path',response.get_data(as_text=True))

    def test_atomic_replace_failure_preserves_previous_file(self):
        self.save()
        before = api.gauge_config_store.load()
        with mock.patch('detector.gauge_config.os.replace',side_effect=OSError('disk failure')):
            self.assertEqual(self.save(dict(CONFIG,max_level_m=4)).status_code,500)
        self.assertEqual(api.gauge_config_store.load(),before)
        self.assertEqual(list(api.gauge_config_store.path.parent.glob('.gauge_config_*.tmp')),[])

    def test_thresholds_change_only_when_explicitly_edited(self):
        self.save()
        moved = dict(CONFIG,gauge_points='0.25,0.1;0.75,0.1;0.75,0.9;0.25,0.9')
        self.save(moved)
        self.assertEqual(api.WARNING_LEVEL_M,CONFIG['warning_level_m'])
        self.save(dict(moved,warning_level_m=2.1))
        self.assertEqual(api.WARNING_LEVEL_M,2.1)
        self.assertEqual(gauge.WARNING_LEVEL_M,2.1)

    def test_update_waits_for_complete_capture_calibration_context(self):
        started = threading.Event()
        finished = threading.Event()
        results = []
        def update():
            started.set()
            results.append(self.save().status_code)
            finished.set()
        with api.calibration_lock:
            before = api.calibration_generation
            worker = threading.Thread(target=update)
            worker.start()
            self.assertTrue(started.wait(1))
            self.assertFalse(finished.wait(.05))
            self.assertEqual(api.calibration_generation,before)
        worker.join(2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(results,[200])
        self.assertGreater(api.calibration_generation,before)

    def test_old_pending_measurement_is_invalid_after_reference_change(self):
        self.save()
        reading = dict(detected=True,calibration_valid=True,measurement_validated=True,
                       level_m=1,calibration_generation=api.calibration_generation)
        self.assertTrue(api.valid_measurement(reading))
        self.save()
        self.assertFalse(api.valid_measurement(reading))

    def test_calibration_change_reacquires_during_running_capture(self):
        self.assertEqual(self.save().status_code,200)
        frames = [scene(110) for _ in range(6)] + [scene()]
        published = []
        capture = mock.Mock()
        count = 0
        def read():
            nonlocal count
            count += 1
            if count == 4:
                self.assertEqual(self.save(dict(CONFIG,max_level_m=4)).status_code,200)
            frame = frames.pop(0)
            if not frames:
                api.stop_event.set()
            return True,frame
        capture.read.side_effect = read
        def publish():
            if api.latest_detection.get('detected_at'):
                published.append(dict(api.latest_detection))
        with (
            mock.patch.object(api,'stop_event',threading.Event()),
            mock.patch.object(api,'camera_reconnect_event',threading.Event()),
            mock.patch.object(api,'open_camera',return_value=capture),
            mock.patch.object(api,'active_camera_source','usb'),
            mock.patch.object(api,'update_camera_state'),
            mock.patch.object(api,'resize_frame_for_processing',side_effect=lambda frame:frame),
            mock.patch.object(api,'annotate_frame',side_effect=lambda frame,*args:frame),
            mock.patch.object(api,'notify_detection_clients',side_effect=publish),
            mock.patch.object(api,'yolo_model',None),
            mock.patch.object(api,'supabase',None),
            mock.patch.object(api,'latest_camera_frame',None),
            mock.patch.object(api,'latest_frame_at',None),
            mock.patch.object(api,'latest_jpeg',None),
        ):
            api.camera_capture_loop()
        readings = [r for r in published if r.get('measurement_source') != 'none' or r.get('status')=='no_detection']
        self.assertGreaterEqual(len(readings),7)
        self.assertFalse(readings[0]['detected'])
        self.assertTrue(readings[2]['detected'])
        self.assertFalse(readings[3]['detected'])
        self.assertFalse(readings[4]['detected'])
        self.assertTrue(readings[5]['detected'])
        self.assertIsNone(readings[6]['level_m'])
        self.assertNotEqual(readings[2]['calibration_generation'],readings[5]['calibration_generation'])


if __name__ == '__main__':
    unittest.main()
