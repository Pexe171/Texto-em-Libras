import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

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


if __name__ == '__main__':
    unittest.main()
