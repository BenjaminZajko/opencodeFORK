"""Verify a compiled Computer session against a local page and scripted models.

Uses temporary app configuration and a separate real browser profile. No keys,
personal browser sessions, external websites or remote model calls are used.
"""
import base64
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

background = "--background" in sys.argv
model = "cohere/north-mini-code:free"
events = []


def observations(value):
    if isinstance(value, str):
        try:
            return observations(json.loads(value))
        except (ValueError, TypeError):
            return []
    if isinstance(value, list):
        return [item for value in value for item in observations(value)]
    if isinstance(value, dict):
        if "revision" in value and "controls" in value:
            return [value]
        return [item for value in value.values() for item in observations(value)]
    return []


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b'''<!doctype html><title>Browser integration fixture</title>
        <label>Name <input aria-label="Name"></label>
        <button onclick="document.querySelector('p').textContent='Saved: '+document.querySelector('input').value">Save</button><p>Not saved</p>''')

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        prompt = json.dumps(body)
        tools = body.get("tools", [])
        names = [item["function"]["name"] for item in tools]
        call = None
        reasoning_only = False
        tool_name = "browser"
        if not names and not any(term in prompt for term in ("completion reviewer", "read-only planner", "read-only quality adviser", "read-only progress adviser")):
            content = "Browser test"
        elif "completion reviewer" in prompt:
            if "Check desktop permission status, then close desktop control" in prompt:
                events.append("desktop.review.unavailable")
                self.send_response(503)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":{"message":"Fixture reviewer unavailable"}}')
                return
            events.append("review")
            content = json.dumps({"status": "complete", "summary": "Browser tool evidence verifies Saved: OliveCode.", "gaps": []})
        elif "read-only planner" in prompt:
            events.append("plan")
            content = "Open the fixture, type OliveCode, approve Save, verify Saved: OliveCode."
        elif "read-only quality adviser" in prompt:
            events.append("second opinion")
            content = "Verify the actual page after clicking. Do not claim success from a click alone."
        elif "read-only progress adviser" in prompt:
            events.append("checkpoint")
            content = "Check the final saved text."
        elif "desktop" in names and "Check desktop permission status, then close desktop control" in prompt:
            tool_name = "desktop"
            assert not set(names) & {"bash", "read", "write", "edit", "task", "execute"}, names
            prior = [json.loads(item["function"]["arguments"])["action"] for message in body["messages"] for item in message.get("tool_calls", []) if item["function"]["name"] == "desktop"]
            rejection = {"message": "Tool call validation failed: tool call validation failed: attempted to call tool 'type' which was not in request.tools", "type": "invalid_request_error"}
            if "desktop.validation.http" not in events:
                events.append("desktop.validation.http")
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": rejection}).encode())
                return
            if "status" in prior and "desktop.validation.stream" not in events:
                events.append("desktop.validation.stream")
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                self.wfile.write(("data: " + json.dumps({"error": rejection}) + "\n\ndata: [DONE]\n\n").encode())
                return
            if "status" not in prior:
                assert "only available tool names" in prompt, "HTTP tool rejection was not corrected"
                call = {"action": "status"}
            elif "desktop.empty" not in events:
                assert "only available tool names" in prompt, "Streamed tool rejection was not corrected"
                reasoning_only = True
                content = ""
                events.append("desktop.empty")
            elif "close" not in prior:
                assert "Your last response stopped without an answer" in prompt and "Completed actions are already done" in prompt, "Empty response was not repaired"
                call = {"action": "close"}
            else:
                content = "Checked desktop permissions and stopped without reading the screen."
            if call:
                events.append("desktop." + call["action"])
        else:
            assert (not background or "desktop" not in names), names
            assert "browser" in names and not set(names) & {"bash", "read", "write", "edit", "task", "execute"}, names
            pages = observations([item for item in body["messages"] if item["role"] == "tool"])
            page = pages[-1] if pages else None
            prior = [json.loads(call["function"]["arguments"])["action"] for message in body["messages"] for call in message.get("tool_calls", []) if call["function"]["name"] == "browser"]
            if not page:
                call = {"action": "open", "url": f"http://127.0.0.1:{fixture.server_port}/"}
            elif "new_tab" not in prior:
                call = {"action": "new_tab", "url": f"http://127.0.0.1:{fixture.server_port}/second"}
            elif "switch_tab" not in prior:
                call = {"action": "switch_tab", "tab": next(tab["tab"] for tab in page["tabs"] if not tab["active"])}
            elif "Saved: OliveCode" in page["text"]:
                if "screenshot" not in prior:
                    call = {"action": "screenshot"}
                else:
                    assert "data:image/png;base64," in json.dumps(body["messages"]), "Screenshot did not reach model"
                    content = "Verified in the browser: Saved: OliveCode. Screenshot received."
                    events.append("complete")
            else:
                field = next(item for item in page["controls"] if item["name"] == "Name")
                if field.get("value") != "OliveCode":
                    call = {"action": "fill", "target": field["target"], "revision": page["revision"], "text": "OliveCode"}
                else:
                    button = next(item for item in page["controls"] if item["name"] == "Save")
                    call = {"action": "click", "target": button["target"], "revision": page["revision"]}
            if call:
                events.append(call["action"])
        delta = {"role": "assistant", "content": content} if call is None else {
            "role": "assistant", "tool_calls": [{"index": 0, "id": "browser_" + str(len(events)), "type": "function", "function": {"name": tool_name, "arguments": json.dumps(call)}}],
        }
        if reasoning_only:
            delta = {"role": "assistant", "reasoning_content": "The permission check succeeded. I will now close desktop control.", "content": None}
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        payload = {"id": "fixture", "object": "chat.completion.chunk", "created": 1, "model": body["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
        self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
        payload["choices"][0] = {"index": 0, "delta": {}, "finish_reason": "tool_calls" if call else "stop"}
        self.wfile.write(("data: " + json.dumps(payload) + "\n\ndata: [DONE]\n\n").encode())


fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
threading.Thread(target=fixture.serve_forever, daemon=True).start()
binary = str(Path(sys.argv[1]).resolve())
try:
    with tempfile.TemporaryDirectory(prefix="olivecode-computer-smoke-") as folder:
        env = {key: value for key, value in os.environ.items() if not key.startswith(("OPENCODE_", "OLIVECODE_")) and not key.endswith(("_API_KEY", "_TOKEN"))}
        for name in ("DATA", "CONFIG", "STATE", "CACHE"):
            env[f"XDG_{name}_HOME"] = str(Path(folder) / name.lower())
        env["OPENCODE_TEST_HOME"] = folder
        env["OPENCODE_DISABLE_MODELS_FETCH"] = "1"
        env["OPENCODE_SERVER_PASSWORD"] = os.urandom(24).hex()
        # Fixture-only image capabilities exercise transport, not the real models.
        env["OPENCODE_CONFIG_CONTENT"] = json.dumps({
            "autoupdate": False, "enabled_providers": ["openrouter", "groq"], "model": "openrouter/" + model,
            "provider": {provider: {"options": {"apiKey": "fixture-only", "baseURL": f"http://127.0.0.1:{fixture.server_port}/v1"}, "models": {name: {"name": name, "modalities": {"input": ["text", "image"], "output": ["text"]}, "cost": {"input": 0, "output": 0}, "limit": {"context": 32768, "output": 2048}}}}
                         for provider, name in {"openrouter": model, "groq": "openai/gpt-oss-120b"}.items()},
        })
        process = subprocess.Popen([binary, "--pure", "--print-logs", "serve", "--hostname", "127.0.0.1", "--port", "0"], cwd=folder, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        lines = queue.Queue()
        log = []

        def drain():
            for line in process.stdout:
                log.append(line)
                lines.put(line)

        threading.Thread(target=drain, daemon=True).start()
        try:
            deadline = time.monotonic() + 30
            url = None
            while time.monotonic() < deadline:
                line = lines.get(timeout=5)
                match = re.search(r"http://127[.]0[.]0[.]1:[0-9]+", line)
                if match:
                    url = match.group(0)
                    break
            assert url, "Server never became ready"
            auth = base64.b64encode(("opencode:" + env["OPENCODE_SERVER_PASSWORD"]).encode()).decode()

            def request(path, body=None):
                req = urllib.request.Request(url + path, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Basic " + auth, "Content-Type": "application/json"})
                try:
                    with urllib.request.urlopen(req, timeout=90) as response:
                        return json.load(response)
                except urllib.error.HTTPError as error:
                    raise RuntimeError(f"{path}: {error.code}: {error.read().decode()[:2000]}") from error

            agents = request("/agent")
            assert any(agent["name"] == "computer" for agent in agents)
            session = request("/session", {})["id"]
            result = queue.Queue()

            def run():
                try:
                    result.put(request(f"/session/{session}/message", {"agent": "computer_background" if background else "computer", "model": {"providerID": "openrouter", "modelID": model}, "parts": [{"type": "text", "text": "Browser smoke test: open the fixture website, enter OliveCode in Name, click Save and verify the actual saved page text. Complete all requested steps."}]}))
                except Exception as error:
                    result.put(error)

            threading.Thread(target=run, daemon=True).start()
            approved = set()
            deadline = time.monotonic() + 60
            while result.empty() and time.monotonic() < deadline:
                for permission in request("/permission"):
                    assert permission["permission"] in ("browser", "browser_screenshot"), permission
                    if permission["id"] not in approved:
                        approved.add(permission["id"])
                        request(f"/permission/{permission['id']}/reply", {"reply": "once" if permission["permission"] == "browser_screenshot" else "always"})
                time.sleep(0.03)
            assert not result.empty(), ("Computer task timed out", events)
            final = result.get()
            if isinstance(final, Exception):
                raise final
            assert len(approved) == 2, (approved, events)
            assert all(action in events for action in ("plan", "open", "new_tab", "switch_tab", "fill", "click", "screenshot", "review", "complete")), events
            history = request(f"/session/{session}/message")
            actions = [part for message in history for part in message["parts"] if part.get("tool") == "browser"]
            assert len(actions) == 6 and all(part["state"]["status"] == "completed" for part in actions), actions
            assert "Saved: OliveCode" in actions[-1]["state"]["output"], actions[-1]
            attachments = actions[-1]["state"].get("attachments", [])
            assert len(attachments) == 1 and attachments[0]["url"].startswith("data:image/png;base64,"), actions[-1]["state"].keys()
            assert "base64" not in actions[-1]["state"]["output"], "Image was dumped into text"
            assert request(f"/session/{session}/abort", {}) is True
            desktop_session = request("/session", {})["id"]
            desktop_final = request(f"/session/{desktop_session}/message", {"agent": "computer", "model": {"providerID": "openrouter", "modelID": model}, "parts": [{"type": "text", "text": "Check desktop permission status, then close desktop control. Do not observe or change any app."}]})
            desktop_history = request(f"/session/{desktop_session}/message")
            desktop_actions = [part for message in desktop_history for part in message["parts"] if part.get("tool") == "desktop"]
            assert len(desktop_actions) == 2 and all(part["state"]["status"] == "completed" for part in desktop_actions), desktop_actions
            status = json.loads(desktop_actions[0]["state"]["output"])
            assert status["platform"] == "macOS" and isinstance(status["accessibility"], bool), status
            assert "text" not in status and "screenshot" not in status, status
            assert json.loads(desktop_actions[1]["state"]["output"])["closed"] is True
            assert "desktop.empty" in events and "desktop.review.unavailable" in events, events
            assert "desktop.validation.http" in events and "desktop.validation.stream" in events, events
            assert any(part.get("type") == "text" and "Checked desktop permissions" in part.get("text", "") for part in desktop_final["parts"]), desktop_final
            assert request(f"/session/{desktop_session}/abort", {}) is True
            assert not request("/permission"), "Unexpected pending desktop permission"
            print("Desktop: embedded native helper, HTTP/streamed tool-name rejection recovery, reasoning-only stop recovery with unavailable reviewers, tool isolation, actual OS permission status and Stop passed without reading the desktop", flush=True)
            print(("Background browser: " if background else "Computer: ") + "compiled chat loop, one chat-wide browser approval plus separate screenshot approval, owned tabs, field replacement, real browser form, screenshot attachment delivered to image-capable fixture model, Assist planning/review and Stop passed", flush=True)
        except Exception:
            print("Events:", events, file=sys.stderr)
            for line in log:
                if "level=ERROR" in line:
                    print(line[:1500], file=sys.stderr)
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
finally:
    fixture.shutdown()
    fixture.server_close()
