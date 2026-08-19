# 803 班级网站部署说明

本仓库里新增了两个网站，并升级了 PK 网站：

- `pk/`：擂台赛，端口 `1145`
- `sco/`：积分中心，端口 `1146`
- `cla/`：班级主站，端口 `1147`

## 1. 把 GitHub 最新代码复制到运行目录

```bash
cd /root/telegram-notes
git pull origin master

mkdir -p /root/pk /root/sco /root/cla
cp -a pk/pk.html pk/server.js pk/logo-803-pk-tech-v3.png /root/pk/
cp -a sco/index.html sco/server.js /root/sco/
cp -a cla/index.html cla/server.js /root/cla/
```

这些命令不会覆盖 PK 的考试数据文件，也不会覆盖积分站以后生成的数据文件。

## 2. 设置 DeepSeek API Key

下面的输入方式不会把密钥显示在屏幕上，也不会把密钥直接写进代码：

```bash
read -s -p "请输入新的 DeepSeek API Key: " DEEPSEEK_API_KEY
echo
export DEEPSEEK_API_KEY
pm2 restart pk-server --update-env
unset DEEPSEEK_API_KEY
```

如果暂时不设置，PK 的其他功能仍能使用，只有“首次生成成绩分析”会提示未配置。

## 3. 启动三个网站

```bash
pm2 restart pk-server --update-env
pm2 start /root/sco/server.js --name sco-server --cwd /root/sco
pm2 start /root/cla/server.js --name cla-server --cwd /root/cla
pm2 save
pm2 status
```

如果 `sco-server` 或 `cla-server` 已经存在，把对应的 `pm2 start` 改成：

```bash
pm2 restart sco-server
pm2 restart cla-server
```

## 4. Nginx 增加两个域名

在 `/etc/nginx/sites-enabled/default` 最后增加：

```nginx
server {
    listen 80;
    server_name sco.lernicks.cn;

    location / {
        proxy_pass http://127.0.0.1:1146;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name cla.lernicks.cn;

    location / {
        proxy_pass http://127.0.0.1:1147;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

检查并重新加载：

```bash
nginx -t
systemctl reload nginx
```

## 5. Cloudflare DNS

添加两条开启代理的小云朵 A 记录，都指向 `124.223.201.40`：

- `sco` → `124.223.201.40`
- `cla` → `124.223.201.40`

## 6. 检查

```bash
curl -I http://127.0.0.1:1145/pk.html
curl -I http://127.0.0.1:1146/index.html
curl -I http://127.0.0.1:1147/index.html
pm2 logs pk-server --lines 20 --nostream
pm2 logs sco-server --lines 20 --nostream
pm2 logs cla-server --lines 20 --nostream
```
