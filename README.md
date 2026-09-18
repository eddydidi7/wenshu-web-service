# 文殊红书 · Render Web Service

独立 Node.js 22 项目，无第三方 npm 依赖。只读取已有 shared-page 分享接口，不读取私人笔记、聊天或数据库，不需要 service_role 密钥。

## 上传仓库

把本目录里的文件上传到已经创建的 GitHub 仓库根目录。package.json、server.mjs、preview.png 应与 README.md 同级。不要只上传 ZIP 压缩包；保留原有仓库文件，不必删除 README，可用本说明更新它。

## Render 手动创建 Web Service

| 字段 | 填写 |
|---|---|
| Language / Runtime | Node |
| Root Directory | 文件上传仓库根目录时留空；若上传整个文件夹则填 wenshu-web-service |
| Build Command | npm ci && npm test |
| Start Command | npm start |
| Instance Type | Free |
| Health Check Path | /healthz |

在 Environment 填写：

- NODE_VERSION：22
- SUPABASE_URL：https://duakhsuncmbabxomynkr.supabase.co

可选 PUBLIC_BASE_URL：自有域名根地址；未填写时自动使用 Render 提供的 RENDER_EXTERNAL_URL。
可选 DOWNLOAD_URL：真实 APK 下载页，未提供时显示“入口尚未配置”。
可选 SUPABASE_ANON_KEY：公开 anon/publishable key。目前 shared-page 已关闭网关 JWT 校验，通过 slug 核验访问权限，可不填。不要填 service_role 或数据库密码。

已有 render.yaml 可用于 Blueprint 部署（文件放仓库根目录），手动创建服务时仍须填写以上环境变量。

## 路由

- GET /：服务入口说明，不枚举文章。
- GET /healthz：200 JSON，只检查进程存活，不代表 Supabase 连通。
- GET /p/<64位slug>：文章服务端渲染、标题/正文/作者/图片、分享预览、相关内容、打开 App。
- GET /preview.png：文字文章默认分享封面。
- 支持 HEAD；其他方法返回405。

监听 0.0.0.0，使用 Render 注入的 PORT，无需手动填端口。
公开/link_only 权限、撤销和有效期均由 Supabase shared-page 再次检查。响应不缓存，link_only 禁止搜索引擎索引；已下载内容无法收回。

## 本地检查

```sh
npm ci
npm test
node --env-file=.env.example server.mjs
```

打开 http://localhost:8080/healthz 。.env.example 不含私密值；如复制成 .env，可用 node --env-file=.env server.mjs 运行。

## 上线后

访问 Render 分配的 HTTPS 网址，再用现有公开 slug 验证 /p/<slug>。
验证成功后，将网站根地址填入 Supabase public.community_config.public_base_url，App 才会复制正确网页链接。
尚无 APK 下载页时不编造下载地址。没有配置 Android App Links / iOS Universal Links，当前“打开App”使用已有 huideng:// 协议。
免费服务会休眠，首次重新访问可能需要等待；部署成功不等于已完成各地区网络和真机验收。

官方文档：https://render.com/docs/web-services 、https://render.com/docs/environment-variables 、https://render.com/docs/free
