"""Local uncached preview with the production site's clean URL routes."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import re

ROUTES = {"guide", "privacy", "sponsors", "about", "terms"}

class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        apache = Path(self.directory) / ".htaccess"
        cloudflare = Path(self.directory) / "_headers"
        config = apache.read_text() if apache.exists() else cloudflare.read_text()
        policy = re.search(r'Header always set Content-Security-Policy "([^"]+)"', config) if apache.exists() else re.search(r"Content-Security-Policy: ([^\n]+)", config)
        if policy:
            self.send_header("Content-Security-Policy", policy[1].replace("; upgrade-insecure-requests", ""))
        super().end_headers()

    def do_GET(self):
        parsed = urlsplit(self.path)
        route = parsed.path
        suffix = ("?" + parsed.query) if parsed.query else ""
        legacy = route.removeprefix("/").removesuffix(".html") in ROUTES and route.endswith(".html")
        trailing = route.strip("/") in ROUTES and route.endswith("/")
        if route == "/index.html" or legacy or trailing:
            clean = "/" if route == "/index.html" else "/" + route.strip("/").removesuffix(".html")
            self.send_response(301)
            self.send_header("Location", clean + suffix)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if any(part.startswith(".") for part in route.split("/") if part) and not route.startswith("/.well-known/"):
            self.send_error(403)
            return
        if route.removeprefix("/") in ROUTES:
            self.path = route + ".html" + suffix
        super().do_GET()

    def send_error(self, code, message=None, explain=None):
        if code != 404:
            return super().send_error(code, message, explain)
        content = (Path(self.directory) / "404.html").read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def guess_type(self, path):
        return "text/plain; charset=utf-8" if Path(path).name in {"install", "install.ps1"} else super().guess_type(path)

if __name__ == "__main__":
    directory = Path(__file__).resolve().parent.parent / "site-dist"
    handler = partial(PreviewHandler, directory=str(directory))
    with ThreadingHTTPServer(("127.0.0.1", 8765), handler) as server:
        print("OliveCode preview: http://127.0.0.1:8765 (browser caching disabled)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
