# 便签电报 / telegram-notes

一个类似 note.ms 的自建站点:

- 首页输入一个「代号」即可创建 / 打开一份笔记
- 笔记内容自动保存
- 可选择开启密码保护(密码用 bcrypt 哈希存储在服务端)
- 独立的问题反馈区(公开留言墙)

技术栈:纯 Node.js + Express,前端为单个静态 HTML 文件,数据落地为本地 JSON 文件。
不依赖任何需要编译的原生模块,几乎可以部署到任何支持 Node 的环境。

---

## 本地运行

```bash
npm install
npm start
```

然后打开 http://localhost:3000

---

## 部署到公网(任选一种)

### 方式一:Railway / Render(最省心,几分钟搞定)

1. 把这个项目推送到一个 GitHub 仓库
2. 在 Railway(railway.app)或 Render(render.com)新建项目,选择 "Deploy from GitHub repo"
3. 构建命令留空(会自动识别 `npm install`),启动命令填 `npm start`
4. **重要**:这两个平台默认磁盘不持久,重新部署会清空 `data/` 目录。
   - Render:在服务设置里添加一个 "Persistent Disk",挂载路径填 `/opt/render/project/src/data`
   - Railway:添加一个 "Volume",挂载路径填 `/app/data`
5. 部署成功后平台会给一个 `xxx.up.railway.app` 或 `xxx.onrender.com` 的地址
6. 绑定自己的域名:在平台的 "Custom Domain" 设置里添加你的域名,然后去你的域名服务商(阿里云/腾讯云/Cloudflare/Namecheap 等)添加一条 CNAME 记录指向平台给的地址。HTTPS 证书平台会自动签发。

### 方式二:自己的服务器(VPS)+ Docker

```bash
# 服务器上执行
docker build -t telegram-notes .
docker run -d --name telegram-notes \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  telegram-notes
```

然后用 Nginx 做反向代理并挂 HTTPS:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

再用 `certbot --nginx -d yourdomain.com` 一键签发免费 HTTPS 证书。

### 方式三:不用 Docker,直接在 VPS 上跑

```bash
npm install --omit=dev
npm install -g pm2
pm2 start server.js --name telegram-notes
pm2 save
pm2 startup   # 让服务开机自启
```

同样配合上面的 Nginx + certbot 做域名和 HTTPS。

---

## 域名怎么接进来(通用步骤)

1. 在域名服务商(阿里云 / 腾讯云 / Cloudflare / GoDaddy 等)购买或已有一个域名
2. 添加一条解析记录:
   - 如果部署平台给的是一个域名(如 Railway/Render):添加 **CNAME** 记录,指向平台给的地址
   - 如果部署在自己的服务器上(有固定公网 IP):添加 **A** 记录,指向服务器 IP
3. 等待 DNS 生效(一般几分钟到几小时)
4. 用 Let's Encrypt(certbot)或平台自带功能签发免费 HTTPS 证书,确保用 `https://` 访问

---

## 公网访问 + 数据留在本机(推荐给个人/家用场景)

如果你不想用云平台托管、只想让这套系统一直跑在自己的电脑或家里的一台机器上,数据文件也就一直留在这台机器的硬盘里,可以用 **Cloudflare Tunnel** 把它安全地暴露到公网,不需要公网 IP,也不需要在路由器上做端口转发。

### 步骤

1. **准备一个域名,并把它加入 Cloudflare**(免费账号即可):登录 Cloudflare 控制台 → Add a site → 按提示把域名的 DNS 服务商改成 Cloudflare。

2. **创建一个 Tunnel**:登录 Cloudflare 控制台 → 左侧 "Zero Trust" → "Networks" → "Tunnels" → "Create a tunnel" → 选择 "Cloudflared" → 起个名字(比如 `telegram-notes`)。

3. 创建过程中会给你一条安装命令,里面包含一个 **token**,复制下来。

4. **配置公开的访问地址(Public Hostname)**:在同一个创建流程里,把子域名填成你想要的样子(比如 `notes.yourdomain.com`),Service 类型选 `HTTP`,地址填 `app:3000`(对应 docker-compose 里的服务名和端口)。

5. 在项目根目录新建一个 `.env` 文件:
   ```
   TUNNEL_TOKEN=刚才复制的那串token
   ```

6. 启动:
   ```bash
   docker compose up -d
   ```
   这会同时启动你的笔记应用和 Cloudflare Tunnel 两个容器。

7. 打开 `https://notes.yourdomain.com`,应该就能看到网站了 —— 而数据其实一直存在这台电脑的 `./data` 文件夹里,没有经过任何第三方存储。

### 需要注意

- 这台电脑(或家用服务器/树莓派/NAS 等)**需要一直开机联网**,一旦关机或断网,网站就访问不了。
- 建议用一台常年开机的设备(比如闲置的旧电脑、NAS、树莓派),而不是你日常使用会关机的笔记本。
- 想临时体验一下效果、不想折腾 Cloudflare 账号,可以先用 `ngrok`(`ngrok http 3000`)几秒钟内拿到一个临时公网地址,但这个地址每次重启都会变,只适合测试,不适合长期使用。

---

## 关于数据存储的说明

- 现在的实现把数据存在服务器本地的 `data/notes.json` 和 `data/feedback.json` 里,胜在零配置、易部署,**适合个人使用或小规模访问**。
- 如果之后需要多台服务器负载均衡,或者数据量变大,需要把 `server.js` 里的存储部分换成真正的数据库(推荐 SQLite 用于单机、PostgreSQL/Supabase 用于多实例),我可以在需要的时候帮你改。
- 密码保护只是"访问门槛":密码经过 bcrypt 哈希不可逆,但笔记内容本身没有做端到端加密,服务器管理员理论上可以直接看到内容。这一点已经在页面上提示用户了。

---

## 目录结构

```
telegram-notes/
├── server.js         # 后端 API + 静态文件服务
├── package.json
├── Dockerfile
├── public/
│   └── index.html    # 前端页面(首页 / 笔记编辑器 / 反馈区)
└── data/              # 运行时自动生成,存放笔记和反馈数据
```
