/* 대조 도구용 정적 서버. 전환 전(freeze 태그에서 꺼낸 index.html)과 전환 후(dist/)를
 * 같은 방식으로 띄워, 차이가 "서빙 방식"이 아니라 "파일 내용"에서만 나게 한다.
 *
 * 앱 파일 말고 도구 전용 경로가 있다(앱은 이 경로를 모른다):
 *   /__pdfview.html, /__pdfjs/*   인쇄 PDF를 쪽별 그림으로 그릴 때 쓴다(node_modules/pdfjs-dist/build)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PDFJS = path.join(HERE, '..', '..', 'node_modules', 'pdfjs-dist', 'build');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.map': 'application/json',
};

const PDFVIEW = `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`;

function send(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

export function startServer(root) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__pdfview.html') { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); res.end(PDFVIEW); return; }
    if (p.startsWith('/__pdfjs/')) { send(res, path.join(PDFJS, path.basename(p))); return; }
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.resolve(root, rel);
    if (!file.startsWith(path.resolve(root))) { res.writeHead(403); res.end(); return; }
    send(res, file);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(r)) });
  }));
}
