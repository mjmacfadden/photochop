#!/usr/bin/env python3
"""Simple HTTP server for PhotoChop development with cache busting."""
import http.server
import socketserver
import time

PORT = 8080

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
    print(f'PhotoChop dev server running at http://localhost:{PORT}')
    print('Press Ctrl+C to stop')
    httpd.serve_forever()
