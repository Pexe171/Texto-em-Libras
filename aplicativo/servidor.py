"""Aplicativo local, sem dependencias externas. Python 3.10+."""
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import argparse
import json
import threading
import time
import webbrowser

PUBLIC = Path(__file__).resolve().parent / 'public'
TRANSLATOR = 'https://traducao2.vlibras.gov.br/translate'


class TranslationUnavailable(Exception):
    pass


@lru_cache(maxsize=128)
def translate(text):
    request = Request(TRANSLATOR, data=json.dumps({'text': text}).encode('utf-8'),
                      headers={'Content-Type': 'application/json; charset=utf-8'}, method='POST')
    for attempt in range(3):
        try:
            with urlopen(request, timeout=8) as response:
                content = response.read(100_000).decode('utf-8').strip()
            try:
                parsed = json.loads(content)
                content = parsed.get('traducao', '') if isinstance(parsed, dict) else parsed
            except json.JSONDecodeError:
                pass
            if not isinstance(content, str) or not content.strip() or content.lstrip().startswith('<'):
                raise ValueError('Resposta invalida')
            return content.strip()
        except HTTPError as error:
            detail = f'O servico VLibras retornou HTTP {error.code}.'
            retryable = error.code in (408, 429) or 500 <= error.code <= 599
            error.close()
            if not retryable:
                raise TranslationUnavailable(detail + ' Tente uma frase menor.') from None
        except (URLError, TimeoutError, OSError):
            detail = 'Nao foi possivel conectar ao servico VLibras.'
        except (ValueError, UnicodeError):
            detail = 'O servico VLibras retornou uma resposta invalida.'
        if attempt < 2:
            time.sleep(0.5 * (attempt + 1))
    raise TranslationUnavailable(detail + ' As 3 tentativas falharam. Aguarde um pouco e tente novamente.')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def list_directory(self, path):
        self.send_error(404)

    def json_response(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        if self.path == '/api/health':
            return self.json_response(200, {'ok': True, 'service': 'Projeto Libras'})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/translate':
            return self.json_response(404, {'error': 'Endereco nao encontrado.'})
        # Aceita apenas o proprio aplicativo; evita formularios de outros sites.
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',
                                     f'http://localhost:{self.server.server_port}'):
            return self.json_response(403, {'error': 'Origem nao permitida.'})
        if self.headers.get_content_type() != 'application/json':
            return self.json_response(415, {'error': 'Envie JSON.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 32000:
                raise ValueError('Tamanho invalido.')
            body = json.loads(self.rfile.read(size).decode('utf-8'))
            text = body.get('text') if isinstance(body, dict) else None
            if not isinstance(text, str) or not 1 <= len(text.strip()) <= 5000:
                raise ValueError('Escreva entre 1 e 5000 caracteres.')
        except (ValueError, UnicodeError) as error:
            return self.json_response(400, {'error': str(error)})
        try:
            gloss = translate(text.strip())
        except TranslationUnavailable as error:
            self.log_error('Tradutor externo: %s', str(error))
            return self.json_response(502, {'error': str(error)})
        return self.json_response(200, {'gloss': gloss})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as error:
        raise SystemExit(f'Nao foi possivel abrir a porta {args.port}: {error}')
    address = f'http://127.0.0.1:{args.port}'
    print(f'Projeto Libras: {address}\nMantenha esta janela aberta. Ctrl+C para encerrar.', flush=True)
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, args=(address,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
