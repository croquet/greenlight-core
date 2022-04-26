#!/usr/bin/env python
from __future__ import print_function
import sys
import os

if sys.version_info[0] < 3:
  from BaseHTTPServer import HTTPServer
  from SimpleHTTPServer import SimpleHTTPRequestHandler
else:
  from http.server import HTTPServer, SimpleHTTPRequestHandler

class HTTPRequestHandler(SimpleHTTPRequestHandler, object):

    def end_headers(self):
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET")
        self.send_header("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range")
        self.send_header("Access-Control-Max-Age", 0)
        self.send_header("Cache-Control", "no-cache")
        super(HTTPRequestHandler, self).end_headers()

if __name__ == '__main__':
    # default port is 8000, or pass on command line
    port = int(sys.argv[1]) if sys.argv[1:] else 8000
    # only accept connections from localhost
    listen_address = ('localhost', port)

    httpd = HTTPServer(listen_address, HTTPRequestHandler)
    s = httpd.socket.getsockname()
    print("Listening on http://%s:%s ..." % s)
    httpd.serve_forever()
