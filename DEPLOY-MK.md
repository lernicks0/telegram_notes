# mk.lernicks.cn 部署说明

## 功能与端口

- Markdown / LaTeX 文档分享站
- 端口：1150
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
cp -a mk/index.html mk/document.html mk/server.js /root/mk/

pm2 start /root/mk/server.js --name mk-server --cwd /root/mk
pm2 save
```

以后更新使用：

```bash
pm2 restart mk-server
pm2 save
```

不要删除 `/root/mk/data` 或 `/root/mk/documents`。

## Nginx 与 Cloudflare

仓库中的 `deploy/nginx-lernicks.conf` 已增加 `mk.lernicks.cn`。先备份当前配置，再更新：

```bash
NGINX_TARGET="$(readlink -f /etc/nginx/sites-enabled/default)"
cp -a "$NGINX_TARGET" "/root/nginx-default-before-mk-$(date +%Y%m%d-%H%M%S).bak"
cp -a /root/telegram-notes/deploy/nginx-lernicks.conf "$NGINX_TARGET"
nginx -t
systemctl reload nginx
```

Cloudflare 添加开启代理的 A 记录：

```text
mk -> 124.223.201.40
```

## 检查

```bash
curl -s -o /dev/null -w "MK PORT: %{http_code}\n" http://127.0.0.1:1150/
curl -s http://127.0.0.1:1150/api/status
curl -s -o /dev/null -w "MK NGINX: %{http_code}\n" -H "Host: mk.lernicks.cn" http://127.0.0.1/
pm2 logs mk-server --lines 20 --nostream
```

