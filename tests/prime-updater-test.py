#!/usr/bin/env python3
"""Regression tests for the standalone PrimeLauncher self-updater."""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("prime_launcher_updater", ROOT / "prime_launcher.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, data: bytes, headers=None):
        self._stream = io.BytesIO(data)
        self.headers = headers or {}

    def read(self, size=-1):
        return self._stream.read(size)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self._stream.close()


def make_release_zip(exe_bytes: bytes) -> bytes:
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("PrimeLauncher.exe", exe_bytes)
        archive.writestr("README.txt", "PrimeLauncher test package")
    return target.getvalue()


class PrimeUpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.local_app_data = Path(self.temp.name) / "LocalAppData"
        self.local_app_data.mkdir()
        self.env_patch = mock.patch.dict(os.environ, {"LOCALAPPDATA": str(self.local_app_data)})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_download_reports_progress_and_checks_sha256_and_exe(self):
        exe_bytes = os.urandom(1_000_100)
        archive_bytes = make_release_zip(exe_bytes)
        digest = hashlib.sha256(archive_bytes).hexdigest()
        responses = [
            FakeResponse(archive_bytes, {"Content-Length": str(len(archive_bytes))}),
            FakeResponse((digest + "  PrimeLauncher-Windows.zip\n").encode("ascii")),
        ]
        progress = []
        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=responses):
            result = MODULE._prime_download_archive(
                "1.2.69",
                "https://example.invalid/PrimeLauncher-Windows.zip",
                "https://example.invalid/PrimeLauncher-Windows.zip.sha256",
                lambda downloaded, total, stage: progress.append((downloaded, total, stage)),
            )
        self.assertTrue(result.is_file())
        self.assertEqual(result.read_bytes(), archive_bytes)
        self.assertTrue(any(stage.startswith("Загружаем") for _, _, stage in progress))
        self.assertTrue(any("SHA-256" in stage for _, _, stage in progress))
        self.assertEqual(progress[-1][2], "Обновление проверено")

    def test_bad_checksum_deletes_the_partial_update(self):
        archive_bytes = make_release_zip(os.urandom(1_000_100))
        responses = [
            FakeResponse(archive_bytes, {"Content-Length": str(len(archive_bytes))}),
            FakeResponse(("0" * 64).encode("ascii")),
        ]
        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=responses):
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                MODULE._prime_download_archive(
                    "1.2.69",
                    "https://example.invalid/PrimeLauncher-Windows.zip",
                    "https://example.invalid/PrimeLauncher-Windows.zip.sha256",
                )
        update_dir = self.local_app_data / "SkyRealm" / "PrimeLauncher" / "updates"
        self.assertFalse((update_dir / "PrimeLauncher-1.2.69.zip").exists())

    def test_archive_without_valid_exe_is_rejected(self):
        target = io.BytesIO()
        with zipfile.ZipFile(target, "w") as archive:
            archive.writestr("README.txt", "no executable")
        archive_bytes = target.getvalue()
        digest = hashlib.sha256(archive_bytes).hexdigest()
        responses = [
            FakeResponse(archive_bytes, {"Content-Length": str(len(archive_bytes))}),
            FakeResponse(digest.encode("ascii")),
        ]
        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=responses):
            with self.assertRaisesRegex(ValueError, "слишком мал"):
                MODULE._prime_download_archive(
                    "1.2.69",
                    "https://example.invalid/PrimeLauncher-Windows.zip",
                    "https://example.invalid/PrimeLauncher-Windows.zip.sha256",
                )

    def test_scheduler_passes_config_as_a_real_powershell_file_argument(self):
        exe = Path(self.temp.name) / "PrimeLauncher.exe"
        exe.write_bytes(b"old exe")
        archive = Path(self.temp.name) / "PrimeLauncher-update.zip"
        archive.write_bytes(b"zip")
        fake_process = mock.Mock()
        fake_process.poll.return_value = None
        fake_process.pid = 4242
        with mock.patch.object(MODULE.sys, "executable", str(exe)), \
             mock.patch.object(MODULE.subprocess, "Popen", return_value=fake_process) as popen:
            MODULE._prime_schedule_self_update(archive, "1.2.69")

        args = popen.call_args.args[0]
        self.assertIn("-File", args)
        self.assertNotIn("-EncodedCommand", args)
        config_path = Path(args[-1])
        config = json.loads(config_path.read_text(encoding="utf-8"))
        self.assertEqual(config["archive"], str(archive.resolve()))
        self.assertEqual(config["exe"], str(exe.resolve()))
        self.assertEqual(config["version"], "1.2.69")
        script_path = Path(args[args.index("-File") + 1])
        script = script_path.read_text(encoding="utf-8-sig")
        self.assertIn("param([Parameter(Mandatory=$true)][string]$ConfigPath)", script)
        self.assertIn("Обновление установлено успешно.", script)
        self.assertIn("PrimeLauncher-update.log", script)

    def test_visible_progress_ui_is_used_by_release_check(self):
        source = (ROOT / "prime_launcher.py").read_text(encoding="utf-8")
        self.assertIn("def _prime_update_progress(", source)
        self.assertIn('archive_path = _prime_update_progress(latest, download_url, checksum_url)', source)
        self.assertIn("SHA-256 и содержимое архива проверены", source)
        self.assertIn("process = subprocess.Popen(", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
