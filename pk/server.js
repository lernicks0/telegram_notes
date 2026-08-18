const http = require('http');
const fs = require('fs');
const path = require('path');

// 正式服务器默认使用 1145；本地测试可以用 PK_PORT 临时换端口。
const PORT = Number(process.env.PK_PORT) || 1145;
const DATA_FILE = path.join(__dirname, '803班擂台赛数据.json');
const LOCK_FILE = path.join(__dirname, 'lock-state.json');

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const url = req.url.split('?')[0];

  // 所有设备共用的页面锁定状态
  if (url === '/lock-state.json' && req.method === 'GET') {
    fs.readFile(LOCK_FILE, 'utf8', (err, text) => {
      let locked = false;
      if (!err) {
        try { locked = JSON.parse(text).locked === true; } catch (e) {}
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ locked }));
    });
    return;
  }

  // 管理员切换锁定时，网页会把新状态写到这里。
  if (url === '/lock-state.json' && req.method === 'POST') {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) tooLarge = true;
    });
    req.on('end', () => {
      if (tooLarge) {
        res.writeHead(413); res.end('request too large'); return;
      }

      let data;
      try { data = JSON.parse(body); } catch (e) {
        res.writeHead(400); res.end('invalid json'); return;
      }
      if (typeof data.locked !== 'boolean') {
        res.writeHead(400); res.end('locked must be boolean'); return;
      }

      const result = JSON.stringify({
        locked: data.locked,
        updatedAt: new Date().toISOString(),
      }, null, 2);
      fs.writeFile(LOCK_FILE, result, 'utf8', err => {
        if (err) { res.writeHead(500); res.end('save failed'); return; }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ ok: true, locked: data.locked }));
      });
    });
    return;
  }

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
    res.writeHead(302, { 'Location': '/pk.html' });
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
