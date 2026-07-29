const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 114514;
const DATA_FILE = path.join(__dirname, '803班擂台赛数据.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  const url = req.url.split('?')[0];

  // 数据读取
  if (url === '/data.json' && req.method === 'GET') {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) {
        // 没有数据文件，返回空
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"pkList":[],"savedExams":[]}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // 数据保存
  if (url === '/save.json' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { JSON.parse(body); } catch(e) {
        res.writeHead(400); res.end('invalid json'); return;
      }
      fs.writeFile(DATA_FILE, body, 'utf8', err => {
        if (err) { res.writeHead(500); res.end('save failed'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    return;
  }

  // 根目录重定向到 HTML
  if (url === '/') {
    res.writeHead(302, { 'Location': '/803%E7%8F%AD%E8%80%83%E8%AF%95%E6%93%82%E5%8F%B0%E8%B5%9B.html' });
    res.end();
    return;
  }

  // 静态文件
  const filePath = path.join(__dirname, decodeURIComponent(url));
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
});
