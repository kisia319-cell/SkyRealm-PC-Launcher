#!/usr/bin/env python3
"""Behavior tests for the public GitHub news API exposed by LauncherApi."""
from __future__ import annotations

import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER_PATH = ROOT / "launcher.py"

# The news method uses only stdlib. Stub pywebview so this test can run on CI
# without installing the desktop GUI dependency.
sys.modules.setdefault("webview", types.ModuleType("webview"))
spec = importlib.util.spec_from_file_location("skyrealm_launcher_news_test", LAUNCHER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load launcher.py for news tests")
launcher = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = launcher
spec.loader.exec_module(launcher)


class FakeResponse:
    def __init__(self, payload: object, status: int = 200):
        self.payload = json.dumps(payload).encode("utf-8")
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit: int = -1):
        return self.payload


class LauncherNewsFeedTests(unittest.TestCase):
    def setUp(self):
        self.api = launcher.LauncherApi()

    def test_published_releases_are_normalized_and_cached(self):
        releases = [
            {
                "tag_name": "v1.2.7",
                "name": "SkyRealm Launcher 1.2.7",
                "published_at": "2026-11-01T17:32:21Z",
                "html_url": "https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/tag/v1.2.7",
                "body": "## Changes\n- **Profiles** and [friends](https://example.com).\n- `Safe updates`.",
                "draft": False,
                "prerelease": False,
            },
            {
                "tag_name": "v1.2.8-draft",
                "name": "Draft must not appear",
                "html_url": "https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/tag/v1.2.8-draft",
                "draft": True,
            },
            {
                "tag_name": "v1.2.9",
                "name": "Untrusted URL",
                "html_url": "https://example.com/evil",
                "draft": False,
            },
        ]
        with patch.object(launcher.urllib.request, "urlopen", return_value=FakeResponse(releases)) as urlopen:
            result = self.api.get_release_news()
            cached = self.api.get_release_news()
        self.assertTrue(result["ok"])
        self.assertEqual(result["source"], "releases")
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["tag"], "v1.2.7")
        self.assertEqual(result["items"][0]["title"], "SkyRealm Launcher 1.2.7")
        self.assertIn("Profiles and friends.", result["items"][0]["summary"])
        self.assertEqual(result["items"][0]["url"], releases[0]["html_url"])
        self.assertFalse(result["cached"])
        self.assertTrue(cached["cached"])
        self.assertEqual(urlopen.call_count, 1)

    def test_force_refresh_bypasses_cache(self):
        releases = [{
            "tag_name": "v1.2.7",
            "name": "Release",
            "html_url": "https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/tag/v1.2.7",
            "published_at": "2026-11-01T17:32:21Z",
            "body": "Notes",
        }]
        with patch.object(launcher.urllib.request, "urlopen", return_value=FakeResponse(releases)) as urlopen:
            self.api.get_release_news()
            refreshed = self.api.get_release_news(True)
        self.assertEqual(urlopen.call_count, 2)
        self.assertFalse(refreshed["cached"])

    def test_empty_release_list_falls_back_to_main_commits(self):
        commits = [{
            "sha": "abcdef0123456789",
            "html_url": "https://github.com/kisia319-cell/SkyRealm-PC-Launcher/commit/abcdef0123456789",
            "commit": {
                "message": "Fix release feed\\n\\nAvoid static demo news.",
                "author": {"date": "2026-11-02T09:00:00Z"},
            },
        }]
        responses = [FakeResponse([]), FakeResponse(commits)]
        with patch.object(launcher.urllib.request, "urlopen", side_effect=responses) as urlopen:
            result = self.api.get_release_news()
        self.assertTrue(result["ok"])
        self.assertEqual(result["source"], "commits")
        self.assertEqual(result["items"][0]["kind"], "commit")
        self.assertEqual(result["items"][0]["title"], "Fix release feed")
        self.assertEqual(urlopen.call_count, 2)

    def test_network_failure_returns_safe_error(self):
        with patch.object(launcher.urllib.request, "urlopen", side_effect=URLError("offline")):
            result = self.api.get_release_news()
        self.assertFalse(result["ok"])
        self.assertIn("Не удалось загрузить новости", result["message"])
        self.assertNotIn("token", json.dumps(result).lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
