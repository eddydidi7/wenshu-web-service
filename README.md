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

## 测试公开文章与正式链接（2026-09-19）

`/p/test-article` 是已有公开文章的测试别名，不新建或复制用户文章。默认绑定此前验证的公开分享标识，可用 TEST_ARTICLE_SLUG 指定另一篇公开文章。每次请求仍检查接口和 public 可见性；变为 link_only/private、撤销或下架后测试别名不可读。

页面输出标题、正文、图片、作者、北京时间，并输出 Open Graph 标题/摘要/封面/网址/站点名/发布时间。实际社交软件是否显示卡片由其抓取和缓存策略决定。App 打开使用 huideng://，未安装不能保证自动跳转应用商店；下载按钮需要真实 DOWNLOAD_URL，未设置时禁用且明确标注。

正式 slug 在 Supabase shared_pages 插入记录时生成：两个随机 UUID 去掉连字符，得到64位十六进制标识；forum_action_v3 发布内容时自动创建分享记录。分享链接为 PUBLIC_BASE_URL（或 Render 自动网址）+/p/+slug。不是文章标题，也不是 auth.uid()，无需逐篇配置路由。撤销分享后再次分享会生成新标识。

所有红书文章接入：在 Supabase community_config 的唯一记录中，将 public_base_url 填为当前 Render HTTPS 根网址，不含 /p/。客户端现有分享代码已读取这个值。只有包含该功能的客户端可使用；设置网址不替代首次客户端升级。

当前上传更新至少包含 server.mjs；test.mjs 和本 README 也应同步。仓库更新后确认 Render 已部署新提交，再访问 /p/test-article。
