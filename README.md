# FileShare

自托管的文件共享与管理 Web 应用，VS Code 风格界面。

基于 FastAPI (Python) 和原生 HTML / CSS / JavaScript 构建。

## 功能

- **文件树** -- 展开/折叠文件夹，codicon 图标
- **新建文件 / 新建文件夹 / 上传文件** -- 工具栏按钮和右键菜单
- **拖拽上传** -- 侧边栏底部拖放区，逐文件显示进度条；也可拖放到树中任意文件夹。自动识别目标：选中文件夹、选中文件的父目录、或根目录
- **内部拖拽** -- 拖动文件到文件夹或根目录进行移动
- **内联创建与重命名** -- 新建时生成占位行并立即进入编辑；选中后按 F2 或右键重命名
- **点击取消选中** -- 点击树之外的区域取消高亮
- **文件预览** -- 图片、视频、音频、PDF、Markdown（渲染）、代码高亮
- **实时同步** -- WebSocket 广播文件变更和在线用户数
- **存储用量** -- 可视化进度条和数值显示

## 快速开始

### 本地开发

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

打开 http://localhost:8080。

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
| `PORT` | `8080` | 服务器端口 |

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
| `WS` | `/ws` | 实时事件推送 |

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
    main.py              FastAPI 入口
    ws.py                 WebSocket 管理器
    routes/
      files.py            CRUD 端点
      preview.py          文件预览
    services/
      storage.py          路径解析、树构建、大小计算
    templates/
      preview.html        预览模板
    static/
      index.html          主布局
      app.js              前端逻辑
      style.css           VS Code 深色主题
      codicon.css/.ttf    VS Code 图标字体
  config.py               环境变量配置
  requirements.txt
  Dockerfile
  docker-compose.yml
  data/                   文件存储 (gitignore)
```

## 许可证

MIT
