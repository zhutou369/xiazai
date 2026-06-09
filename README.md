# 下载统计站

基于 Cloudflare Pages 的下载统计管理后台，支持多管理员、产品文件管理与下载量统计。

## 功能

- **根目录登录**：访问网站根目录 `/` 即为超级管理员 `admin` 登录页
- **超级管理员 admin**：目录固定为根目录 `/`，产品链接在根路径
  - 例：`admin` 新增产品 `kuailian` → `https://你的域名/kuailian.txt`
- **多管理员**：超级管理员可新增子管理员（名称仅字母），每人对应独立目录
  - 例：管理员 `zh` → `https://你的域名/zh/`
  - 例：管理员 `dows` → `https://你的域名/dows/`
- **产品管理**：新增 / 删除 / 重命名产品，编辑 `.txt` 文件内容
  - 例：`zh` 新增产品 `kuailian` → `https://你的域名/zh/kuailian.txt`
- **下载统计**：每次访问 `.txt` 文件自动 +1，记录今日、昨日、历史总下载量

## 默认账号

| 用户名 | 密码 |
|--------|------|
| admin  | admin123 |

部署后请立即修改密码。

## 部署到 Cloudflare Pages（推荐）

### 1. 创建 KV 命名空间

```bash
npx wrangler kv namespace create XIAZAI_KV
npx wrangler kv namespace create XIAZAI_KV --preview
```

将返回的 ID 填入 `wrangler.toml`。

### 2. 连接 GitHub 仓库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 选择仓库 `zhutou369/xiazai`
4. 构建设置：
   - **构建命令**：留空
   - **构建输出目录**：`public`
5. 在 **Settings** → **Functions** → **KV namespace bindings** 添加：
   - Variable name: `XIAZAI_KV`
   - KV namespace: 选择刚创建的命名空间
6. 在 **Settings** → **Environment variables** 添加（可选）：
   - `DEFAULT_ADMIN_USER` = `admin`
   - `DEFAULT_ADMIN_PASS` = 你的安全密码

### 3. 绑定自定义域名

在 Cloudflare Pages 项目的 **Custom domains** 中添加你的域名（如 `youlian-cn.com`）。

## 本地开发

```bash
npm install
npm run dev
```

访问 http://localhost:8788

## 目录结构

```
xiazai/
├── public/              # 静态前端（管理后台）
│   ├── index.html
│   └── assets/
├── functions/           # Cloudflare Pages Functions
│   ├── _middleware.js # 下载统计 + 文件服务
│   ├── api/           # 管理 API
│   └── utils/
├── wrangler.toml
└── package.json
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录 |
| GET  | `/api/products` | 获取产品列表及统计 |
| POST | `/api/products` | 新增产品 |
| PUT  | `/api/products` | 编辑/重命名产品 |
| DELETE | `/api/products?name=xxx` | 删除产品 |
| GET  | `/api/admins` | 获取管理员列表（超管） |
| POST | `/api/admins` | 新增管理员（超管） |
| DELETE | `/api/admins?username=xxx` | 删除管理员（超管） |

## 下载链接格式

```
超级管理员 admin：https://你的域名/{产品名称}.txt
其他管理员：      https://你的域名/{管理员名称}/{产品名称}.txt
```

每次 GET 请求该链接，下载量 +1。

## 关于 GitHub Pages

GitHub Pages 仅支持静态文件，无法运行后端 API 和下载统计。如需使用 GitHub Pages，需配合 Cloudflare Worker 代理，**建议直接使用 Cloudflare Pages 部署**。

## 仓库

https://github.com/zhutou369/xiazai
