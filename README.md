# FileShare

自托管的文件共享与管理 Web 应用，VS Code 风格界面。

基于 FastAPI (Python) 和原生 HTML / CSS / JavaScript 构建。

## 功能

- **文件树** -- 展开/折叠文件夹，codicon 图标
- **新建文件 / 新建文件夹 / 上传文件** -- 工具栏按钮和右键菜单
- **拖拽上传** -- 侧边栏底部拖放区，逐文件显示进度条；也可拖放到树中任意文件夹
- **内部拖拽** -- 拖动文件到文件夹或根目录进行移动
- **内联创建与重命名** -- 新建时生成占位行并立即进入编辑；F2 或右键重命名
- **文件预览** -- 图片、视频、音频、PDF、HTML（直接渲染网页）、Markdown（含 LaTeX 数学公式）、代码高亮、图表（Kroki）
- **实时同步** -- WebSocket 广播文件变更和在线用户数
- **存储用量** -- 可视化进度条和数值显示

## 快速开始

### 本地开发

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

打开 http://localhost:8000。

### Docker

```bash
docker compose up --build
```

数据持久化在 `./data`。

## 配置

全部通过环境变量：

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | 文件存储根目录 |
| `MAX_TOTAL_SIZE_GB` | `10` | 总存储配额 (GB) |
| `MAX_FILE_SIZE_MB` | `2048` | 单文件上传限制 (MB) |
| `HOST` | `0.0.0.0` | 服务器绑定地址 |
| `PORT` | `8000` | 服务器端口 |
| `KROKI_URL` | `https://kroki.io` | Kroki 图表渲染服务地址 |

## API

| 方法 | 端点 | 说明 |
|--------|----------|-------------|
| `GET` | `/api/tree` | 递归文件树 |
| `GET` | `/api/storage` | 存储用量 |
| `POST` | `/api/upload?dir=` | 上传文件 |
| `DELETE` | `/api/delete?path=` | 删除文件或文件夹 |
| `GET` | `/api/download?path=` | 下载文件 |
| `POST` | `/api/mkdir?path=` | 创建文件夹 |
| `POST` | `/api/move?src=&dst=` | 移动 / 重命名 |
| `POST` | `/api/rename?path=&name=` | 原地重命名 |
| `GET` | `/api/preview?path=` | 预览页面 |
| `GET` | `/api/raw?path=` | 原始文件字节 |
| `GET` | `/api/kroki?path=` | 通过 Kroki 渲染图表为 SVG |
| `WS` | `/ws` | 实时事件推送 |

## 图表预览 (Kroki)

支持图表文件自动渲染预览。上传以下格式的文件即可在浏览器中看到渲染后的图表：

| 扩展名 | 图表类型 |
|--------|----------|
| `.puml` `.pu` `.plantuml` | PlantUML |
| `.mmd` `.mermaid` | Mermaid |
| `.dot` `.gv` | Graphviz |
| `.d2` | D2 |
| `.erd` | Entity Relationship |
| `.excalidraw` | Excalidraw |
| `.blockdiag` | Block Diagram |
| `.seqdiag` | Sequence Diagram |
| `.actdiag` | Activity Diagram |
| `.nwdiag` | Network Diagram |
| `.c4plantuml` | C4 (PlantUML) |
| `.svgbob` | Svgbob |
| `.vega` `.vegalite` | Vega / Vega-Lite |
| `.wavedrom` | WaveDrom |

使用公共 Kroki 服务 (`https://kroki.io`) 或自托管。

### 自托管 Kroki

`docker-compose.yml` 已内置完整 Kroki 集群（含 Mermaid + BlockDiag 支持）。

```bash
docker compose up -d   # 一键启动
docker compose ps      # 查看状态
docker compose down    # 停止
```

本地开发时连接 Docker 中的 Kroki：

```bash
export KROKI_URL=http://localhost:8001
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 快捷键

| 按键 | 操作 |
|-----|--------|
| `Del` | 删除选中项 |
| `F2` | 内联重命名 |
| `Ctrl+Shift+C` | 复制绝对路径 |

## 项目结构

```
file-share/
  app/
    main.py                    FastAPI 入口 + 后端初始化
    ws.py                       WebSocket 管理器
    models/                     数据契约（Pydantic）
      file.py                   FileNode, StorageInfo
      ws_message.py             WsMessage, WsMessageType
    routes/
      files.py                  CRUD 端点
      preview.py                文件预览 + 分类注册表
    services/
      storage_backend.py        存储后端 Protocol + get/set_backend
      local_storage.py          本地文件系统后端实现
      storage.py                门面层（委托给已注册后端）
    templates/
      preview.html              预览模板（image/video/audio/pdf/html/md/code/diagram）
    static/
      index.html                主布局（VS Code 风格）
      style.css                 深色主题
      codicon.css/.ttf          VS Code 图标字体
      js/                       前端模块（IIFE，按顺序加载）
        state.js                共享状态 + DOM 引用
        api.js                  fetch 封装 + 数据刷新
        ws.js                   WebSocket 连接
        tree.js                 目录树渲染 + 拖拽 + 右键菜单 + 行内重命名
        upload.js               拖拽上传 + 进度条
        preview.js              预览面板控制
        main.js                 工具栏 + 键盘快捷键 + 初始化
  config.py                     环境变量配置
  requirements.txt
  Dockerfile
  docker-compose.yml
  data/                         文件存储 (gitignore)
```

## 架构设计

### 数据模型层 (`app/models/`)

前后端统一的数据契约，所有 API 响应和 WebSocket 消息均有 Pydantic 类型约束。新增字段或消息类型时有补全提示，避免拼写错误。

### 存储后端抽象 (`app/services/`)

`StorageBackend` Protocol 定义存储接口，`LocalStorageBackend` 为本地文件系统实现。
替换为 S3/MinIO 等远端存储只需实现 Protocol 并在 `main.py` 注册。

```
app/services/
  storage_backend.py    ← Protocol + set_backend() / get_backend()
  local_storage.py      ← 当前实现
  storage.py            ← 门面层，路由和预览只依赖此层
```

### 前端模块化 (`app/static/js/`)

500+ 行的 `app.js` 拆分为 7 个独立模块，按依赖顺序加载：

```
state.js → api.js → ws.js → tree.js → upload.js → preview.js → main.js
```

各模块通过共享 `FileShare` 全局状态对象和 DOM 引用（定义在 `state.js`）进行通信。

### 预览注册表 (`app/routes/preview.py`)

文件类型→预览类别的映射采用注册表模式，替代硬编码的 if/elif 链：

```python
register_preview(PreviewCategory(
    name="html",
    exts={".html", ".htm"},
))
```

新增格式只需 `register_preview()` 一行，无需修改核心分类逻辑。

## 许可证

MIT
