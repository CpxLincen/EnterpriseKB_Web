# 企业知识库助手前端（Enterprise KB Web）

基于 [EnterpriseKB](E:\EnterpriseKB)（FastAPI + PostgreSQL/pgvector RAG 后端）的
**前后端分离** Web 前端，使用 **Bun** 构建。

## 功能

- **智能问询**（首页 `/`）：选择知识库，向 RAG Agent 提问，展示带引用的回答。
- **知识库管理**（`/admin`）：上传 Markdown / TXT / 文字型 PDF 文档并解析入向量库，
  查看知识库与文档列表、文本块数量，删除文档。
- **评测**（`/eval`）：选择评测集并一键运行，实时展示进度；自动对比
  **向量 / 混合 / Rerank** 三种检索方式的检索命中率、事实覆盖率、拒答正确率
  （可选 LLM 裁判），并可按方式切换查看逐题回答与引用。
  （需管理员账号；评测集由后端 `E:\EnterpriseKB\eval\*.yaml` 提供。）

## 技术栈

- Bun（构建 / 依赖管理）
- Vite + React 18 + TypeScript
- React Router（页面路由）
- 通过 `fetch` 调用后端 REST API（CORS 已由后端放行）

## 快速开始

```bash
# 1. 启动后端（见 E:\EnterpriseKB\README.md，默认 http://127.0.0.1:8000）
cd E:\EnterpriseKB
.\\.venv\\Scripts\\python.exe -m uvicorn app.api:app --host 127.0.0.1 --port 8000

# 2. 安装前端依赖并启动开发服务器
cd E:\EnterpriseKBWeb
bun install
bun run dev        # http://127.0.0.1:5173

# 3. 生产构建
bun run build       # 产物输出到 dist/
bun run preview     # 本地预览构建产物
```

如需修改后端 API 地址，复制 `.env.example` 为 `.env` 并设置 `VITE_API_BASE`。
