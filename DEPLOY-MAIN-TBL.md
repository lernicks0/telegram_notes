# Lernicks 主站、图床和便签迁移部署说明

## 最终域名

- `lernicks.cn`、`www.lernicks.cn`：Lernicks 总主站，端口 1149
- `note.lernicks.cn`：便签电报，继续使用原进程和端口 3000
- `tbl.lernicks.cn`：公共图床，端口 1148
- `cla.lernicks.cn`：学校中心，端口 1147
- `pk.lernicks.cn`：PK 擂台赛，端口 1145
- `sco.lernicks.cn`：积分中心，端口 1146

便签没有搬动数据文件，只是增加一个新域名。旧的 `lernicks.cn/#/...` 链接由新主站自动转到 `note.lernicks.cn/#/...`。

浏览器把不同子域名当成不同的网站，所以以前“记住在本机”的笔记密码不会自动搬过去。第一次在新域名打开加密笔记时，需要重新输入一次密码，之后会在新域名继续记住。

## 图床保护规则

- JPG、PNG、GIF、WebP，每张最多 10MB。
- 默认最多使用 3GB。
- 同时为整台服务器保留至少 1GB 可用空间。
- 接近任一上限时，只从 `/root/tbl/uploads/` 删除最早上传的图片。
- 普通用户每个 IP 在 10 分钟内最多尝试上传 12 次。

可以通过 PM2 环境变量修改默认值：

```bash
export TBL_MAX_STORAGE_MB=3072
export TBL_MIN_FREE_MB=1024
export TBL_MAX_FILE_MB=10
export TBL_RATE_MAX=12
```

## 服务器文件

```bash
cd /root/telegram-notes
git pull --ff-only origin master

mkdir -p /root/main /root/tbl/data /root/tbl/uploads
cp -a main/index.html main/server.js /root/main/
cp -a tbl/index.html tbl/server.js /root/tbl/
```

不要删除 `/root/tbl/data` 和 `/root/tbl/uploads`，里面保存图片与删除码记录。

## PM2

第一次启动：

```bash
pm2 start /root/main/server.js --name main-server --cwd /root/main
pm2 start /root/tbl/server.js --name tbl-server --cwd /root/tbl
pm2 save
```

以后更新：

```bash
pm2 restart main-server
pm2 restart tbl-server
pm2 save
```

## Nginx

仓库中的 `deploy/nginx-lernicks.conf` 已包含所有六个域名。部署前先备份旧配置：

```bash
cp -a /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.bak
cp -a /root/telegram-notes/deploy/nginx-lernicks.conf /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

只有 `nginx -t` 显示 successful 后才能重新加载。

## Cloudflare DNS

确认下列 A 记录都指向 `124.223.201.40`，并开启橙色小云朵：

- `@`
- `www`
- `note`
- `tbl`
- `cla`
- `pk`
- `sco`

## 源站检查

```bash
curl -s -o /dev/null -w "MAIN: %{http_code}\n" -H "Host: lernicks.cn" http://127.0.0.1
curl -s -o /dev/null -w "NOTE: %{http_code}\n" -H "Host: note.lernicks.cn" http://127.0.0.1
curl -s -o /dev/null -w "TBL: %{http_code}\n" -H "Host: tbl.lernicks.cn" http://127.0.0.1
curl -s http://127.0.0.1:1148/api/status
pm2 status
```
