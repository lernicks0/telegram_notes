const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { detectFormat, resolveFormat } = require('../mk/html-support');

const root = path.resolve(__dirname, '..');
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-html-test-'));
const files = ['server.js', 'html-support.js', 'index.html', 'document.html'];
for (const file of files) fs.copyFileSync(path.join(root, 'mk', file), path.join(runtime, file));
for (const file of ['index.html', 'document.html']) {
  const page = fs.readFileSync(path.join(runtime, file), 'utf8');
  for (const match of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: file });
}

const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>示例</title><style>h1{color:rgb(12, 34, 56)}</style></head><body><h1>HTML 测试</h1><button id="test" onclick="this.textContent=\'已点击\'">点击</button><script>try{parent.document.body.dataset.compromised="yes"}catch(e){document.body.dataset.isolated="yes"}</script></body></html>';
for (const content of [html, '\uFEFF \n<!-- 导出 -->\n<HTML><body>hi</body></HTML>', '<h1>标题</h1>', '<div class="card">片段</div>', '<strong>加粗</strong>', '<my-card>自定义元素</my-card>']) assert.equal(detectFormat(content), 'html');
for (const content of ['# 标题\n\n$E=mc^2$', '```html\n<div>example</div>\n```', '说明 <div> 标签', '<https://example.com>', '<person@example.com>', '']) assert.equal(detectFormat(content), 'mixed');
assert.equal(resolveFormat('mixed', html), 'mixed');
assert.equal(resolveFormat('markdown', html), 'markdown');
assert.equal(resolveFormat('latex', html), 'latex');

let child, browser, output = '';
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(runtime, 'server.js')], {
    cwd: runtime, windowsHide: true,
    env: { ...process.env, MK_PORT: String(port), MK_MIN_FREE_MB: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(base + '/api/status')).ok) break; } catch (_) {}
    if (attempt > 50 || child.exitCode !== null) throw new Error('Server failed: ' + output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  async function api(method, route, body, status = 200) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const created = await api('POST', '/api/documents', { title: 'HTML 测试', format: 'html', content: html }, 201);
  const route = '/api/documents/' + created.id;
  let saved = (await api('GET', route)).document;
  assert.equal(saved.format, 'html');
  assert.equal(saved.content, html);
  const raw = await fetch(base + created.rawUrl);
  assert.match(raw.headers.get('content-disposition'), /\.html"$/);
  assert.match(raw.headers.get('content-type'), /^text\/plain/);
  assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await raw.text(), html);
  assert.equal((await fetch(base + created.rawUrl, { method: 'HEAD' })).status, 200);
  const publicPage = await fetch(base + created.viewUrl);
  assert.equal(publicPage.headers.get('x-frame-options'), null);
  assert.equal((await fetch(base + created.editUrl)).headers.get('x-frame-options'), 'DENY');
  const helper = await fetch(base + '/html-support.js');
  assert.match(helper.headers.get('content-type'), /javascript/);
  assert.equal(await helper.text(), fs.readFileSync(path.join(runtime, 'html-support.js'), 'utf8'));
  await api('PUT', route, { key: 'incorrect', title: 'X', content: 'X', format: 'mixed' }, 403);
  assert.equal((await api('GET', route)).document.content, html);
  await api('PUT', route, { key: created.key, title: '已修改', content: html + '<!-- updated -->' });
  assert.equal((await api('GET', route)).document.format, 'html');
  await api('PUT', route, { key: created.key, title: 'HTML 测试', format: 'html', content: html });
  for (const format of [undefined, 'auto', 'mixed', 'markdown', 'latex']) {
    const document = await api('POST', '/api/documents', { format, content: html }, 201);
    saved = (await api('GET', '/api/documents/' + document.id)).document;
    assert.equal(saved.format, format === undefined || format === 'auto' ? 'html' : format);
  }
  await api('POST', '/api/documents', { format: 'html', content: ' ' }, 400);
  await api('POST', '/api/documents', { format: 'html', content: 'x'.repeat(1024 * 1024 + 1) }, 413);
  console.log('PASS: detection, syntax, create/read/update, key protection, raw HTML filename, legacy formats, size limits.');

  if (process.env.MK_PLAYWRIGHT_MODULE) {
    const { chromium } = require(process.env.MK_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext();
    // Avoid programmatic scrolling moving click targets during headless interaction.
    await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.scrollBehavior = 'auto'; }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('ERR_FAILED')) console.error(message.text()); });
    // HTML support is local and must work even when optional Markdown/KaTeX CDNs are down.
    await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await page.goto(base);
    await page.locator('#contentInput').fill(html);
    await page.locator('#previewButton').click();
    const preview = page.frameLocator('#createPreview iframe');
    await preview.locator('h1').waitFor();
    assert.equal(await preview.locator('h1').textContent(), 'HTML 测试');
    assert.equal(await preview.locator('h1').evaluate(el => getComputedStyle(el).color), 'rgb(12, 34, 56)');
    assert.equal(await preview.locator('body').getAttribute('data-isolated'), 'yes');
    assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
    await preview.locator('#test').click();
    await preview.getByText('已点击').waitFor();
    await page.locator('#previewButton').click();
    assert.equal(await page.locator('#createPreview iframe').count(), 0);
    await page.locator('#fileInput').setInputFiles({ name: '上传页面.HTM', mimeType: 'text/html', buffer: Buffer.from(html) });
    await page.waitForFunction(() => document.getElementById('formatInput').value === 'html');
    assert.equal(await page.locator('#titleInput').inputValue(), '上传页面');
    await page.locator('#createButton').click();
    await page.locator('#result.show').waitFor();
    const viewUrl = await page.locator('#viewLink').inputValue();
    const editUrl = await page.locator('#editLink').inputValue();
    const key = await page.locator('#documentKey').inputValue();
    await page.goto(viewUrl);
    await page.frameLocator('#article iframe').locator('h1').waitFor();
    assert.equal(await page.locator('#formatChip').textContent(), 'HTML 网页');
    await page.locator('#sourceTab').click();
    assert.equal(await page.locator('#article pre').textContent(), html);
    assert.equal(await page.locator('#article iframe').count(), 0);
    await page.locator('#renderTab').click();
    await page.frameLocator('#article iframe').locator('h1').waitFor();
    await page.goto(editUrl);
    await page.locator('#keyInput').fill(key);
    await page.locator('#verifyButton').click();
    await page.locator('#editor.show').waitFor();
    assert.equal(await page.locator('#editFormat').inputValue(), 'html');
    await page.locator('#previewTab').click();
    await page.frameLocator('#editPreview iframe').locator('h1').waitFor();
    assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
    await page.locator('#writeTab').click();
    assert.equal(await page.locator('#editPreview iframe').count(), 0);
    await page.locator('#editContent').fill('<h1>已保存 HTML</h1>');
    await Promise.all([page.waitForResponse(response => response.request().method() === 'PUT'), page.locator('#saveButton').click()]);
    await page.goto(viewUrl);
    await page.frameLocator('#article iframe').getByText('已保存 HTML').waitFor();
    await page.goto(editUrl);
    await page.locator('#keyInput').fill(key);
    await page.locator('#verifyButton').click();
    await page.locator('#editor.show').waitFor();
    await page.locator('#editFormat').selectOption('mixed');
    await Promise.all([page.waitForResponse(response => response.request().method() === 'PUT'), page.locator('#saveButton').click()]);
    await page.goto(viewUrl);
    await page.locator('#article pre').waitFor();
    assert.equal(await page.locator('#article iframe').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: browser upload, pasted HTML preview, CSS, scripts, parent isolation, source view, edit/save/reopen, format switching, CDN fallback.');
  }
  await api('DELETE', route, { key: created.key });
  await api('GET', route, undefined, 404);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
  const resolved = path.resolve(runtime);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('mk-html-test-')) fs.rmSync(resolved, { recursive: true, force: true });
});
