"""Exercise the compiled app with local HTTP models; never use real credentials.

Usage: python3 script/smoke-olivecode.py /absolute/path/to/olivecode
"""
import base64
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

calls = []
coordination = []
tool_sent = []


class ModelServer(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        calls.append(body["model"])
        prompt = json.dumps(body)
        if "completion reviewer" in prompt:
            count = sum(item[0] == "review" for item in coordination)
            coordination.append(("review", body["model"]))
            content = json.dumps({
                "status": "continue" if count == 0 else "complete",
                "summary": "Check the requested outcome" if count == 0 else "The requested outcome is covered",
                "gaps": ["Add the missing second point"] if count == 0 else [],
            })
        elif "read-only quality adviser" in prompt:
            coordination.append(("second opinion", body["model"], "Plan the requested points" in prompt))
            content = "Verify both requested points, not just the first."
        elif "read-only progress adviser" in prompt:
            coordination.append(("progress", body["model"]))
            content = "The files were inspected. Summarize what the reads actually showed."
        elif "read-only planner" in prompt:
            coordination.append(("planning", body["model"]))
            content = "Plan the requested points before answering."
        else:
            coordination.append(("lead", body["model"]))
            content = "OliveCode prompt verified"
        if "Inspect five project files" in prompt and body["model"] == "cohere/north-mini-code:free" and body.get("tools") and not tool_sent:
            tool_sent.append(True)
            tool_calls = [{
                "index": index, "id": f"call_read_{index}", "type": "function",
                "function": {"name": "read", "arguments": json.dumps({"filePath": f"file_{index}.txt"})},
            } for index in range(5)]
            payload = {
                "id": "mock-tools", "object": "chat.completion.chunk", "created": 1, "model": body["model"],
                "choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": tool_calls}, "finish_reason": None}],
            }
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
            payload["choices"][0] = {"index": 0, "delta": {}, "finish_reason": "tool_calls"}
            self.wfile.write(("data: " + json.dumps(payload) + "\n\ndata: [DONE]\n\n").encode())
            return
        payload = {
            "id": "mock-completion", "object": "chat.completion", "created": 1,
            "model": body["model"],
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14},
        }
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream" if body.get("stream") else "application/json")
        self.end_headers()
        if not body.get("stream"):
            self.wfile.write(json.dumps(payload).encode())
            return
        payload["object"] = "chat.completion.chunk"
        payload["choices"][0]["delta"] = payload["choices"][0].pop("message")
        payload["choices"][0]["finish_reason"] = None
        self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
        payload["choices"][0]["delta"] = {}
        payload["choices"][0]["finish_reason"] = "stop"
        self.wfile.write(("data: " + json.dumps(payload) + "\n\ndata: [DONE]\n\n").encode())


binary = str(Path(sys.argv[1]).resolve())
mock = ThreadingHTTPServer(("127.0.0.1", 0), ModelServer)
threading.Thread(target=mock.serve_forever, daemon=True).start()
models = {
    "openrouter": "cohere/north-mini-code:free",
    "groq": "openai/gpt-oss-120b",
    "mistral": "mistral-small-latest",
    "ollama": "olivecode-test",
}
try:
    with tempfile.TemporaryDirectory(prefix="olivecode-smoke-") as folder:
        for index in range(5):
            (Path(folder) / f"file_{index}.txt").write_text(f"Observed point {index}\n")
        env = {key: value for key, value in os.environ.items()
               if not key.startswith(("OPENCODE_", "OLIVECODE_")) and not key.endswith(("_API_KEY", "_TOKEN"))}
        for name in ("DATA", "CONFIG", "STATE", "CACHE"):
            env[f"XDG_{name}_HOME"] = str(Path(folder) / name.lower())
        env["OPENCODE_TEST_HOME"] = folder
        env["OPENCODE_DISABLE_MODELS_FETCH"] = "1"
        env["OPENCODE_SERVER_PASSWORD"] = os.urandom(24).hex()
        env["OPENCODE_CONFIG_CONTENT"] = json.dumps({
            "autoupdate": False, "enabled_providers": list(models), "model": "opencode/big-pickle",
            "provider": {provider: {
                **({"npm": "@ai-sdk/openai-compatible"} if provider == "ollama" else {}),
                "options": {"apiKey": "isolated-test-key", "baseURL": f"http://127.0.0.1:{mock.server_port}/v1"},
                "models": {model: {"name": model, "limit": {"context": 32768, "output": 1024}, "cost": {"input": 0, "output": 0}}},
            } for provider, model in models.items()},
        })
        output = queue.Queue()
        lines = []
        process = subprocess.Popen([binary, "--pure", "--print-logs", "serve", "--hostname", "127.0.0.1", "--port", "0"],
                                   cwd=folder, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

        def drain():
            for line in process.stdout:
                lines.append(line)
                output.put(line)

        threading.Thread(target=drain, daemon=True).start()
        try:
            import re
            import time
            deadline = time.monotonic() + 30
            url = None
            while time.monotonic() < deadline:
                try:
                    line = output.get(timeout=0.5)
                except queue.Empty:
                    if process.poll() is not None:
                        raise RuntimeError("Server exited before listening")
                    continue
                match = re.search(r"http://127[.]0[.]0[.]1:[0-9]+", line)
                if match:
                    url = match.group(0)
                    break
            assert url, "Server did not announce its URL"
            auth = base64.b64encode(("opencode:" + env["OPENCODE_SERVER_PASSWORD"]).encode()).decode()

            def request(path, body=None, method=None):
                req = urllib.request.Request(url + path, data=None if body is None else json.dumps(body).encode(),
                                             headers={"Authorization": "Basic " + auth, "Content-Type": "application/json"},
                                             method=method)
                with urllib.request.urlopen(req, timeout=90) as response:
                    return json.load(response)

            catalog = request("/provider")
            assert set(catalog["connected"]) == set(models), catalog["connected"]
            assert all(item["id"] in models for item in catalog["all"])
            router = next(item for item in catalog["all"] if item["id"] == "openrouter")
            assert all(model.endswith(":free") for model in router["models"])
            assert all("opencode" not in value for value in catalog["default"].values())
            print("Catalog: free providers only; upstream default removed", flush=True)

            for provider, model in models.items():
                session = request("/session", {})
                result = request(f"/session/{session['id']}/message", {
                    "model": {"providerID": provider, "modelID": model},
                    "parts": [{"type": "text", "text": "Reply briefly."}],
                })
                assert any(part.get("text") == "OliveCode prompt verified" for part in result["parts"]), str(result)[:1000]
                print(f"{provider}: full context, native adapter and streamed response passed", flush=True)

            before = len(coordination)
            session = request("/session", {})
            result = request(f"/session/{session['id']}/message", {
                "model": {"providerID": "openrouter", "modelID": models["openrouter"]},
                "parts": [{"type": "text", "text": "Write a project summary with purpose and verification points."}],
            })
            sequence = coordination[before:]
            assert [item[0] for item in sequence].count("planning") == 1, sequence
            mistral_choices = next(item for item in catalog["all"] if item["id"] == "mistral")["models"]
            assert any(item[0] == "second opinion" and item[1] in mistral_choices and item[2] for item in sequence), sequence
            assert [item[0] for item in sequence].count("review") == 2, sequence
            assert sum(item == ("lead", models["openrouter"]) for item in sequence) >= 2, sequence
            assert any(part.get("text") == "OliveCode prompt verified" for part in result["parts"]), result
            print("Assistance: advisers exchanged a plan; reviewer requested work; lead continued and passed review", flush=True)

            coordination.clear()
            session = request("/session", {})
            result = request(f"/session/{session['id']}/message", {
                "model": {"providerID": "openrouter", "modelID": models["openrouter"]},
                "parts": [{"type": "text", "text": "Inspect five project files and summarize results."}],
            })
            history = request(f"/session/{session['id']}/message")
            reads = [part for message in history for part in message["parts"] if part.get("tool") == "read"]
            assert len(reads) == 5 and all(part["state"]["status"] == "completed" for part in reads), reads
            assert tool_sent, coordination
            assert any(item[0] == "progress" for item in coordination), (coordination, str(result)[:2500])
            reviewers = [item[1] for item in coordination if item[0] == "review"]
            assert len(reviewers) >= 2 and len(set(reviewers[:2])) == 2, coordination
            assert any(part.get("text") == "OliveCode prompt verified" for part in result["parts"]), result
            print("Assistance: five tool calls triggered a progress check and independent completion reviews", flush=True)

            request("/config", {"collaboration": {"teamwork": False, "followThrough": False}}, method="PATCH")
            assert request("/config")["collaboration"] == {"teamwork": False, "followThrough": False}
            coordination.clear()
            session = request("/session", {})
            request(f"/session/{session['id']}/message", {
                "model": {"providerID": "openrouter", "modelID": models["openrouter"]},
                "parts": [{"type": "text", "text": "Write a short project summary."}],
            })
            assert not any(item[0] in ("planning", "second opinion", "progress", "review") for item in coordination), coordination
            print("Assistance: project switches disabled both extra workflows without interrupting chat", flush=True)

            session = request("/session", {})
            try:
                request(f"/session/{session['id']}/message", {
                    "model": {"providerID": "openrouter", "modelID": "openai/gpt-5"},
                    "parts": [{"type": "text", "text": "This paid model must be rejected."}],
                })
            except urllib.error.HTTPError:
                pass
            else:
                raise AssertionError("Paid model was accepted")
            assert set(calls).issubset({model for provider in catalog["all"] for model in provider["models"]}), calls
            assert not (Path(folder) / "data" / "opencode").exists()
            assert (Path(folder) / "data" / "olivecode").exists()
            print("Paid model blocked; background calls stayed free; OliveCode data namespace verified", flush=True)
        except Exception:
            for line in lines:
                if "level=ERROR" in line:
                    print(line[:2500], file=sys.stderr)
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
finally:
    mock.shutdown()
    mock.server_close()
