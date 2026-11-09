"""Protocol safety tests with explicit AT-SPI fixtures, not real Linux GUI tests."""
import importlib.util
import pathlib
import types
import unittest
from unittest.mock import patch

source = pathlib.Path(__file__).parents[2] / "src/computer/native/desktop-linux.py"
spec = importlib.util.spec_from_file_location("desktop_linux", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class State:
    def __init__(self, *items): self.items = set(items)
    def contains(self, item): return item in self.items


class Node:
    def __init__(self, name, role="push button", children=(), states=()):
        self.name, self.role, self.nodes = name, role, list(children)
        self.states = State("showing", "enabled", "focusable", *states)
        self.box = types.SimpleNamespace(x=10, y=10, width=100, height=100)
        self.value = ""
        self.writes = []
        self.actions = []
        self.nActions = 1
        self.caretOffset = 0
        self.selection = 0
    @property
    def childCount(self): return len(self.nodes)
    @property
    def characterCount(self): return len(self.value)
    def __getitem__(self, i): return self.nodes[i]
    def getState(self): return self.states
    def getRoleName(self): return self.role
    def getAttributes(self): return []
    def queryComponent(self): return self
    def getExtents(self, _): return self.box
    def queryText(self): return self
    def getText(self, start, end): return self.value[start:end]
    def queryAction(self): return self
    def getName(self, _): return "click"
    def doAction(self, i): self.actions.append(i); return True
    def queryEditableText(self): return self
    def setTextContents(self, text): self.value = text; self.writes.append(text); return True
    def insertText(self, offset, text, count): self.writes.append((offset, text, count)); return True
    def getNSelections(self): return self.selection
    def get_process_id(self): return 42


class Contract(unittest.TestCase):
    def setUp(self):
        self.field = Node("Name Box", "combo box", states=("editable", "focused"))
        self.secret = Node("Password", "password text", states=("editable",))
        self.secret.value = "MUST-NOT-LEAK"
        self.window = Node("Test workbook", "frame", (self.field, self.secret), ("active",))
        self.app = Node("LibreOffice Calc", "application", (self.window,))
        desktop = Node("Desktop", "desktop", (self.app,))
        fake = types.SimpleNamespace(Registry=types.SimpleNamespace(getDesktop=lambda _: desktop), DESKTOP_COORDS=0,
                                     **{"STATE_"+s.upper(): s for s in ("active", "enabled", "showing", "focused", "focusable", "editable")})
        self.patches = [patch.object(module, "atspi", fake), patch.dict(module.os.environ, {"DBUS_SESSION_BUS_ADDRESS": "fixture", "XDG_SESSION_TYPE": "wayland", "WAYLAND_DISPLAY": "wayland-0"}), patch.object(module.time, "sleep", lambda _: None)]
        for p in self.patches: p.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])
        self.desktop = module.Desktop()
        self.observed = self.desktop.observe()
        self.target = next(c["target"] for c in self.observed["controls"] if c["name"] == "Name Box")
    def request(self, action, **extra):
        return dict(action=action, target=self.target, revision=self.desktop.revision, **extra)
    def test_private_text_and_controls_excluded(self):
        self.assertNotIn("MUST-NOT-LEAK", str(self.observed))
        self.assertFalse(any(c["name"] == "Password" for c in self.observed["controls"]))
        self.assertEqual(next(c for c in self.observed["controls"] if c["target"] == self.target)["role"], "AXComboBox")
    def test_electron_static_conversation_labels_are_read(self):
        message = Node("The project builds a local notes app", "label")
        self.window.nodes.append(message)
        self.assertIn("local notes app", self.desktop.observe()["text"])
    def test_empty_app_tree_is_not_proof_a_conversation_was_read(self):
        self.assertTrue(self.observed["limitedObservation"])
        self.assertIn("accessibility", self.observed["note"])
    def test_claude_code_alias_discovers_the_requested_desktop_app(self):
        self.app.name = "Claude"
        result = self.desktop.perform({"action": "find_app", "query": "Claude Code"})
        self.assertEqual(result["apps"], [{"name": "Claude", "bundle": "pid:42"}])
    def test_stale_revision_sends_no_input(self):
        request = self.request("fill", text="B2")
        self.desktop.observe()
        with self.assertRaisesRegex(ValueError, "Observe again"): self.desktop.perform(request)
        self.assertEqual(self.field.writes, [])
    def test_changed_or_disabled_controls_send_no_input(self):
        self.field.name = "A different control"
        with self.assertRaisesRegex(ValueError, "changed"): self.desktop.perform(self.request("fill", text="B2"))
        self.assertEqual(self.field.writes, [])
    def test_wrong_foreground_is_not_read(self):
        self.window.states.items.remove("active")
        with self.assertRaisesRegex(ValueError, "No accessible active"): self.desktop.perform(self.request("fill", text="B2"))
        self.assertEqual(self.field.writes, [])
    def test_atomic_fill_and_fresh_revision(self):
        revision = self.desktop.revision
        result = self.desktop.perform(self.request("fill", text="Žilina 🫒"))
        self.assertEqual(self.field.writes, ["Žilina 🫒"])
        self.assertGreater(result["revision"], revision)
    def test_wayland_never_sends_global_keys(self):
        with patch.object(module.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "Wayland input is unavailable"): self.desktop.perform(self.request("key", key="a", modifiers=["control"]))
            run.assert_not_called()
    def test_unsupported_capture_or_drag_never_send_input(self):
        for action in ("screenshot", "look", "drag", "click_point"):
            with self.assertRaisesRegex(ValueError, "does not support"): self.desktop.perform(self.request(action))
            self.assertFalse(self.desktop.sent)
    def test_selected_text_cannot_be_deleted_before_failed_insert(self):
        self.field.selection = 1
        with self.assertRaisesRegex(ValueError, "atomically"): self.desktop.perform(self.request("type", text="replacement"))
        self.assertEqual(self.field.writes, [])
    def test_semantic_click_works_without_x11_input(self):
        result = self.desktop.perform(self.request("click"))
        self.assertEqual(self.field.actions, [0])
        self.assertGreater(result["revision"], self.observed["revision"])
    def test_unverified_partial_input_blocks_further_edits(self):
        self.desktop.unverified = True
        with self.assertRaisesRegex(ValueError, "Observe again"): self.desktop.perform(self.request("fill", text="no"))
        self.assertEqual(self.field.writes, [])
        self.desktop.observe()
        self.desktop.perform(self.request("fill", text="recovered"))
        self.assertEqual(self.field.writes, ["recovered"])


if __name__ == "__main__": unittest.main()
