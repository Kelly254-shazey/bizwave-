#!/usr/bin/env python3
"""Deterministic local website analyzer for the disposable API integration DB.

This is a mock, not the website safety implementation. The real fetch/SSRF
checks are covered separately by intelligence/tests/test_intelligence.py.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit, urlunsplit


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"status": "ok", "service": "mock-intelligence"})
        else:
            self.send_json(404, {"detail": "Not found"})

    def do_POST(self):
        if self.path != "/v1/scientist/website-analyze":
            return self.send_json(404, {"detail": "Not found"})
        request = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        url = urlsplit(request.get("url", ""))
        canonical = urlunsplit((url.scheme, url.netloc, url.path, "", ""))
        price = 700 if parse_qs(url.query).get("version") == ["2"] else 500
        if url.path == "/concurrent":
            products = [{"name": "Concurrent item", "sku": "QA-CONCURRENT", "price": 300, "currency": "KES"}]
        elif url.path == "/branch-b":
            products = [{"name": "Branch B item", "sku": "QA-BRANCH-B", "price": 400, "currency": "KES"}]
        else:
            products = [
                {"name": "Collision", "sku": "QA-COLLISION", "price": 9999, "currency": "KES"},
                {"name": "Source item", "sku": "QA-OWNED", "price": price, "currency": "KES"},
                {"name": "Foreign currency", "sku": "QA-USD", "price": 42, "currency": "USD"},
                {"name": "Missing currency", "sku": "QA-UNKNOWN", "price": 20, "currency": None},
                {"name": "Duplicate", "sku": "QA-OWNED", "price": 50, "currency": "KES"},
            ]
        self.send_json(200, {
            "url": canonical,
            "business_profile": {"name": "Mock catalog"},
            "pricing_stats": {"total_items_found": len(products)},
            "charts": {}, "insights": [], "products": products,
        })

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("MOCK_INTELLIGENCE_PORT", "8002"))), Handler).serve_forever()
