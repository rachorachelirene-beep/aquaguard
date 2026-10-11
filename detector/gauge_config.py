"""Validated local calibration persistence. No credentials or database writes."""
import json
import math
import os
import tempfile
from pathlib import Path

try:
    from . import gauge
except ImportError:
    import gauge

FIELDS = {
    'gauge_enabled': 'GAUGE_ENABLED', 'gauge_points': 'GAUGE_POINTS',
    'min_level_m': 'MIN_LEVEL_M', 'max_level_m': 'MAX_LEVEL_M',
    'normal_level_m': 'NORMAL_LEVEL_M', 'warning_level_m': 'WARNING_LEVEL_M',
    'critical_level_m': 'CRITICAL_LEVEL_M',
    'gauge_tick_interval_m': 'GAUGE_TICK_INTERVAL_M',
    'gauge_label_interval_m': 'GAUGE_LABEL_INTERVAL_M',
    'waterline_row_coverage': 'WATERLINE_ROW_COVERAGE',
    'waterline_fallback_row_coverage': 'WATERLINE_FALLBACK_ROW_COVERAGE',
}


def validate(value, camera_width=1280, camera_height=720):
    if not isinstance(value, dict) or set(value) != set(FIELDS):
        raise ValueError('Supply all gauge settings and no unknown fields.')
    result = {}
    enabled = value['gauge_enabled']
    if isinstance(enabled, str) and enabled.lower() in ('true', 'false'):
        enabled = enabled.lower() == 'true'
    if not isinstance(enabled, bool):
        raise ValueError('Gauge enabled must be true or false.')
    result['gauge_enabled'] = enabled
    raw = value['gauge_points']
    try:
        points = tuple(tuple(float(v) for v in p.split(',')) for p in str(raw).split(';'))
        if len(points) != 4 or any(len(p) != 2 for p in points):
            raise ValueError()
        if not gauge.is_valid_gauge_points(points):
            raise ValueError()
        tl, tr, br, bl = points
        if tr[0] <= tl[0] or br[0] <= bl[0] or min(bl[1],br[1]) <= max(tl[1],tr[1]):
            raise ValueError()
        normalized = max(v for p in points for v in p) <= 1.5
        bound_x, bound_y = (1,1) if normalized else (camera_width,camera_height)
        if any(not (0 <= x < bound_x and 0 <= y < bound_y) for x,y in points):
            raise ValueError()
    except (ValueError, TypeError):
        # Disabling an unconfigured gauge is allowed; enabling it requires points.
        if enabled or str(raw).strip():
            raise ValueError('Gauge points must be a convex TL, TR, BR, BL polygon within the camera.') from None
        points = ()
    result['gauge_points'] = ';'.join(f'{x:g},{y:g}' for x,y in points)
    for key in FIELDS:
        if key in result:
            continue
        try:
            if isinstance(value[key], bool) or str(value[key]).strip() == '':
                raise ValueError()
            number = float(value[key])
            if not math.isfinite(number) or number < 0 or number > 10000:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError(f'{key} must be a finite nonnegative number.') from None
        result[key] = number
    if not (result['min_level_m'] <= result['normal_level_m'] < result['warning_level_m']
            < result['critical_level_m'] <= result['max_level_m']):
        raise ValueError('Require min <= normal < warning < critical <= max.')
    tick, label = result['gauge_tick_interval_m'], result['gauge_label_interval_m']
    if tick < .05 or label < tick or (result['max_level_m']-result['min_level_m'])/tick > 200:
        raise ValueError('Tick must be >= 0.05, label >= tick, and at most 200 ticks.')
    if not (0.01 <= result['waterline_fallback_row_coverage'] <= result['waterline_row_coverage'] <= .95):
        raise ValueError('Require 0.01 <= fallback coverage <= row coverage <= 0.95.')
    return result


class GaugeConfigStore:
    def __init__(self, path):
        self.path = Path(path)

    def load(self):
        try:
            return json.loads(self.path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return None

    def save(self, config):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.path.parent,
                                             prefix='.gauge_config_', suffix='.tmp', delete=False) as file:
                temporary = Path(file.name)
                json.dump(config, file, allow_nan=False)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.path)
            temporary = None
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def environment_defaults():
    return {key: getattr(gauge, name) for key,name in FIELDS.items()}


def load_configuration(store, defaults, width=1280, height=720):
    saved = store.load()
    return (validate(defaults if saved is None else saved, width, height),
            'environment' if saved is None else 'runtime_config')
