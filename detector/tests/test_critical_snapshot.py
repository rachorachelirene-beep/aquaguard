"""Tests for critical water level snapshot debouncing, annotation, and upload."""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np
import pytest

try:
    from detector.snapshot_manager import (
        SNAPSHOT_COOLDOWN_SECONDS,
        annotate_critical_frame,
        get_last_snapshot_time,
        handle_critical_snapshot,
        reset_snapshot_cooldown,
    )
except ImportError:
    from snapshot_manager import (
        SNAPSHOT_COOLDOWN_SECONDS,
        annotate_critical_frame,
        get_last_snapshot_time,
        handle_critical_snapshot,
        reset_snapshot_cooldown,
    )


@pytest.fixture(autouse=True)
def clean_cooldown():
    """Ensure test isolation by clearing the in-memory cooldown state."""
    reset_snapshot_cooldown()
    yield
    reset_snapshot_cooldown()


@pytest.fixture
def dummy_frame():
    """Create a dummy BGR image representing a camera frame."""
    return np.zeros((480, 640, 3), dtype=np.uint8)


def test_handle_critical_snapshot_below_threshold(dummy_frame):
    """Should return None and not create snapshot if water_level < threshold."""
    result = handle_critical_snapshot(
        frame=dummy_frame,
        water_level=1.80,
        threshold=2.50,
        station_id=1,
    )
    assert result is None
    assert get_last_snapshot_time(1) == 0.0


def test_handle_critical_snapshot_debouncing(dummy_frame):
    """Second call within cooldown period should be rejected."""
    with tempfile.TemporaryDirectory() as temp_dir:
        # First call: >= threshold -> should succeed
        res1 = handle_critical_snapshot(
            frame=dummy_frame,
            water_level=2.75,
            threshold=2.50,
            station_id=1,
            snapshots_dir=temp_dir,
            sync_upload=True,
        )
        assert res1 is not None
        assert res1["station_id"] == 1
        assert res1["water_level"] == 2.75
        assert Path(res1["local_path"]).exists()

        # Immediate second call -> debounced (returns None)
        res2 = handle_critical_snapshot(
            frame=dummy_frame,
            water_level=2.85,
            threshold=2.50,
            station_id=1,
            snapshots_dir=temp_dir,
            sync_upload=True,
        )
        assert res2 is None


def test_handle_critical_snapshot_separate_stations(dummy_frame):
    """Cooldown on station 1 should not block station 2."""
    with tempfile.TemporaryDirectory() as temp_dir:
        res1 = handle_critical_snapshot(
            frame=dummy_frame,
            water_level=3.0,
            threshold=2.5,
            station_id=1,
            snapshots_dir=temp_dir,
            sync_upload=True,
        )
        res2 = handle_critical_snapshot(
            frame=dummy_frame,
            water_level=3.1,
            threshold=2.5,
            station_id=2,
            snapshots_dir=temp_dir,
            sync_upload=True,
        )
        assert res1 is not None
        assert res2 is not None
        assert res1["station_id"] == 1
        assert res2["station_id"] == 2


def test_annotate_critical_frame(dummy_frame):
    """Annotated frame should be non-empty and modify pixels with red banner."""
    annotated = annotate_critical_frame(
        frame=dummy_frame,
        station_id=5,
        water_level=2.65,
        threshold=2.50,
        timestamp_str="2026-10-14 12:00:00",
    )
    assert annotated.shape == dummy_frame.shape
    # Frame shouldn't be all black anymore
    assert np.count_nonzero(annotated) > 0


def test_upload_and_audit_mock(dummy_frame):
    """Verifies that Supabase storage upload and table insert are called."""
    mock_supabase = MagicMock()
    mock_storage = MagicMock()
    mock_table = MagicMock()

    mock_supabase.storage.from_.return_value = mock_storage
    mock_storage.get_public_url.return_value = (
        "https://example.supabase.co/storage/v1/object/public/flood-snapshots/test.jpg"
    )
    mock_supabase.table.return_value = mock_table

    with tempfile.TemporaryDirectory() as temp_dir:
        result = handle_critical_snapshot(
            frame=dummy_frame,
            water_level=2.90,
            threshold=2.50,
            station_id=42,
            supabase_client=mock_supabase,
            snapshots_dir=temp_dir,
            sync_upload=True,
        )

        assert result is not None
        mock_storage.upload.assert_called_once()
        mock_table.insert.assert_called_once()
