import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.error import URLError
import socket
import json
import threading
from http.client import HTTPConnection

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import servidor


class TranslationTests(unittest.TestCase):
    def setUp(self):
        servidor.translate.cache_clear()

    @patch('servidor.time.sleep')
    @patch('servidor.urlopen')
    def test_recovers_from_remote_500_and_caches_success(self, request, sleep):
        response = io.BytesIO(b'{"traducao":"OI"}')
        request.side_effect = [HTTPError('https://example.com', 500, 'error', {}, None), response]
        self.assertEqual(servidor.translate('Ola'), 'OI')
        self.assertEqual(servidor.translate('Ola'), 'OI')
        self.assertEqual(request.call_count, 2)

    @patch('servidor.time.sleep')
    @patch('servidor.urlopen')
    def test_reports_remote_error_after_three_attempts(self, request, sleep):
        request.side_effect = lambda *a, **k: (_ for _ in ()).throw(HTTPError('https://example.com', 500, 'error', {}, None))
        with self.assertRaisesRegex(servidor.TranslationUnavailable, 'HTTP 500.*3 tentativas'):
            servidor.translate('Teste')
        self.assertEqual(request.call_count, 3)
        self.assertEqual(servidor.translate.cache_info().currsize, 0)

    @patch('servidor.urlopen')
    def test_does_not_retry_client_errors(self, request):
        request.side_effect = HTTPError('https://example.com', 400, 'error', {}, None)
        with self.assertRaisesRegex(servidor.TranslationUnavailable, 'HTTP 400'):
            servidor.translate('Teste')
        self.assertEqual(request.call_count, 1)

    @patch('servidor.time.sleep')
    @patch('servidor.urlopen')
    def test_never_returns_html_as_gloss(self, request, sleep):
        request.side_effect = lambda *a, **k: io.BytesIO(b'<html>unavailable</html>')
        with self.assertRaises(servidor.TranslationUnavailable):
            servidor.translate('Teste')

    @patch('servidor.time.sleep')
    @patch('servidor.urlopen')
    def test_classifies_errors_and_keeps_failures_out_of_cache(self, request, sleep):
        cases = [
            (HTTPError('https://example.com', 429, 'limit', {}, None), 'RATE_LIMIT', 429),
            (HTTPError('https://example.com', 500, 'error', {}, None), 'UPSTREAM_ERROR', 500),
            (TimeoutError(), 'TIMEOUT', None),
            (URLError(socket.timeout()), 'TIMEOUT', None),
            (URLError('no connection'), 'CONNECTION_ERROR', None),
        ]
        for error, code, status in cases:
            with self.subTest(code=code):
                request.reset_mock()
                request.side_effect = error
                with self.assertRaises(servidor.TranslationUnavailable) as result:
                    servidor.translate('Teste')
                payload = result.exception.payload()
                self.assertEqual(payload['code'], code)
                self.assertTrue(payload['retryable'])
                self.assertEqual(payload.get('upstream_status'), status)
                self.assertEqual(request.call_count, 3)
                self.assertEqual(servidor.translate.cache_info().currsize, 0)

    @patch('servidor.time.sleep')
    @patch('servidor.urlopen')
    def test_invalid_json_shapes_are_not_translations(self, request, sleep):
        for content in [b'{}', b'[]', b'{"traducao":null}', b'']:
            request.side_effect = lambda *a, **k: io.BytesIO(content)
            with self.assertRaises(servidor.TranslationUnavailable) as result:
                servidor.translate('Teste')
            self.assertEqual(result.exception.code, 'INVALID_RESPONSE')

    def test_disconnected_browser_does_not_raise_on_response_write(self):
        handler = object.__new__(servidor.Handler)
        from unittest.mock import Mock
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.wfile = Mock()
        handler.wfile.write.side_effect = BrokenPipeError()
        handler.json_response(200, {'gloss': 'OI'})
        handler.end_headers.side_effect = ConnectionResetError()
        handler.json_response(200, {'gloss': 'OI'})


class HandlerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class QuietHandler(servidor.Handler):
            def log_message(self, *args):
                pass
        cls.server = servidor.ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        connection = HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        try:
            connection.request(method, path, body, headers or {})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def test_health_and_project_files_are_not_exposed(self):
        status, content = self.request('GET', '/api/health')
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(content)['ok'])
        self.assertEqual(self.request('GET', '/servidor.py')[0], 404)
        self.assertEqual(self.request('GET', '/../servidor.py')[0], 404)

    def test_invalid_requests_have_structured_errors(self):
        cases = [
            ('{}', {'Content-Type': 'application/json'}, 400, 'INVALID_REQUEST'),
            ('not json', {'Content-Type': 'application/json'}, 400, 'INVALID_REQUEST'),
            (json.dumps({'text': 'x' * 5001}), {'Content-Type': 'application/json'}, 400, 'INVALID_REQUEST'),
            ('{}', {'Content-Type': 'text/plain'}, 415, 'UNSUPPORTED_MEDIA_TYPE'),
            ('{}', {'Content-Type': 'application/json', 'Origin': 'https://example.com'}, 403, 'FORBIDDEN_ORIGIN'),
        ]
        for body, headers, expected_status, code in cases:
            status, content = self.request('POST', '/api/translate', body, headers)
            self.assertEqual(status, expected_status)
            self.assertEqual(json.loads(content)['code'], code)
            self.assertFalse(json.loads(content)['retryable'])

    @patch('servidor.translate')
    def test_success_and_upstream_failure_keep_api_contract(self, translate):
        headers = {'Content-Type': 'application/json'}
        translate.return_value = 'OI'
        status, content = self.request('POST', '/api/translate', '{"text":"Ola"}', headers)
        self.assertEqual((status, json.loads(content)), (200, {'gloss': 'OI'}))
        translate.side_effect = servidor.TranslationUnavailable('Limite externo', 'RATE_LIMIT', True, 429)
        status, content = self.request('POST', '/api/translate', '{"text":"Ola"}', headers)
        self.assertEqual(status, 502)
        self.assertEqual(json.loads(content), {'error': 'Limite externo', 'code': 'RATE_LIMIT', 'retryable': True, 'upstream_status': 429})


if __name__ == '__main__':
    unittest.main()
