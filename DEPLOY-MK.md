# mk.lernicks.cn 部署说明

## 功能与端口

- Markdown + LaTeX 混合文档与 HTML 网页分享站，写法类似洛谷编辑器。
- 上传 `.html` / `.htm` 文件或粘贴 HTML，可自动识别，也可手动选择 HTML 网页格式。
- HTML 在隔离框架中预览，保留页面样式和内联脚本；支持 jsDelivr 上的脚本、样式和字体。不会自动上传 HTML 引用的本地图片、CSS 或 JS 文件，建议内嵌这些资源。
- HTML 脚本不能读取编辑页密钥或访问父页面；不支持联网请求、表单提交、新窗口或嵌套页面。
- 行内公式使用 `$...$`，独立公式使用 `$$...$$`。
- `/pre` 编辑页支持“编辑 / 实时预览”切换。
- 保留旧 Markdown 和纯 LaTeX 文档的阅读兼容。
- 端口：1151（1150 已被申请登记网站使用）
- PM2 名称：`mk-server`
- 运行目录：`/root/mk`
- 文档正文：`/root/mk/documents/`
- 文档记录：`/root/mk/data/documents.json`

## 默认保护规则

- 单份文档最多 1MB。
- 全部文档最多使用 500MB。
- 为服务器保留至少 1GB 可用空间。
- 达到上限时，只删除文档站中最早创建的文档。
- 创建文档后返回一枚随机密钥，服务器只保存 SHA-256 哈希。
- 阅读链接后增加 `/pre`，输入密钥后可以修改或删除。

## 服务器文件与 PM2

```bash
cd /root/telegram-notes
git pull --ff-only origin master

mkdir -p /root/mk/data /root/mk/documents
cp -a mk/index.html mk/document.html mk/server.js mk/html-support.js /root/mk/

pm2 start /root/mk/server.js --name mk-server --cwd /root/mk
pm2 save
```

以后更新使用：

```bash
pm2 restart mk-server
pm2 save
```

不要删除 `/root/mk/data` 或 `/root/mk/documents`。

## HTML 支持更新包（2026-09-05）

本地更新包：`deploy/releases/mk-html-support-20260905.tar.gz`。只包含 `index.html`、`document.html`、`server.js`、`html-support.js`，不含文档、密钥或文档记录。必须同时更新这四个文件。

将更新包上传至服务器 `/root/mk-html-support-20260905.tar.gz` 后执行：

```bash
backup_dir=$(mktemp -d /root/mk-code-backup-XXXXXXXX)
cp -a /root/mk/index.html /root/mk/document.html /root/mk/server.js "$backup_dir/"
if [ -f /root/mk/html-support.js ]; then cp -a /root/mk/html-support.js "$backup_dir/"; fi
tar -xzf /root/mk-html-support-20260905.tar.gz -C /root/mk
node --check /root/mk/server.js
node --check /root/mk/html-support.js
pm2 restart mk-server
curl -fsS http://127.0.0.1:1151/api/status
```

已有 HTML 内容如果之前保存为混合格式，可以在 `/pre` 编辑页选择“HTML 网页”并保存，阅读链接保持不变。

本地验证：`node tests/mk-html.integration.js`。设置 `MK_PLAYWRIGHT_MODULE` 为 Playwright 模块路径时，还会使用无界面 Edge 验证上传、预览、脚本隔离、阅读与编辑流程。

## Nginx 与 Cloudflare

使用独立的 `deploy/nginx-mk.conf`，不会覆盖其他网站的 Nginx 配置：

```bash
cp -a /root/telegram-notes/deploy/nginx-mk.conf /etc/nginx/sites-enabled/mk-site
nginx -t
systemctl reload nginx
```

Cloudflare 添加开启代理的 A 记录：

```text
mk -> 124.223.201.40
```

## 检查

```bash
curl -s -o /dev/null -w "MK PORT: %{http_code}\n" http://127.0.0.1:1151/
curl -s http://127.0.0.1:1151/api/status
curl -s -o /dev/null -w "MK NGINX: %{http_code}\n" -H "Host: mk.lernicks.cn" http://127.0.0.1/
pm2 logs mk-server --lines 20 --nostream
```
