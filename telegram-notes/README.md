# 便签电报 / telegram-notes

一个类似 note.ms 的自建站点:

- 首页输入一个「代号」即可创建 / 打开一份笔记
- 笔记内容自动保存
- 可选择开启密码保护(密码用 bcrypt 哈希存储在服务端)
- 独立的问题反馈区(公开留言墙)

技术栈:纯 Node.js + Express,前端为单个静态 HTML 文件,数据落地为本地 JSON 文件。
不依赖任何需要编译的原生模块,几乎可以部署到任何支持 Node 的环境。

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
