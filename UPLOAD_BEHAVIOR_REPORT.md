# FileShare 上传中断与并发上传行为分析报告

> 分析日期: 2026-05-21  
> 涉及文件: `app/routes/files.py`, `app/static/app.js`, `app/ws.py`, `app/main.py`

---

## 1. 上传链路概述

### 前端 (app.js)

上传采用 **XHR + FormData + 逐文件串行** 的方式：

```
uploadFiles(files, dir)
  ├── 隐藏拖放区, 显示进度条
  ├── for each file:
  │     └── uploadWithProgress(file, dir)   ← 单文件 XHR，report progress
  │           ├── 成功 → 继续下一个文件
  │           └── 失败 → alert + break (终止后续文件)
  ├── 隐藏进度条, 恢复拖放区
  ├── refreshTree()
  └── refreshStorage()
```

关键代码片段：

```javascript
// app/static/app.js 第 210-226 行
function uploadWithProgress(file, dir) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload?dir=' + encodeURIComponent(dir || ''));
    xhr.upload.addEventListener('progress', (e) => { ... });
    xhr.addEventListener('load',  () => { ... resolve/reject ... });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.send(fd);
  });
}

// app/static/app.js 第 228-239 行
async function uploadFiles(files, dir) {
  dir = dir || uploadTargetDir() || '';
  sidebarDropIn.style.display = 'none';
  uploadProg.style.display = '';
  progressFill.style.width = '0%';
  for (let i = 0; i < files.length; i++) {
    progressText.textContent = files[i].name + '  (0%)';
    try { await uploadWithProgress(files[i], dir); }
    catch (err) { alert('Upload failed: ' + err.message); break; }
  }
  uploadProg.style.display = 'none';
  sidebarDropIn.style.display = '';
  await refreshTree();
  await refreshStorage();
}
```

### 后端 (files.py)

后端采用 **全量读取内存后一次性写入磁盘** 的方式：

```python
# app/routes/files.py 第 26-48 行
@router.post("/upload")
async def upload(file: UploadFile = File(...), dir: str = Query("")):
    max_bytes = int(MAX_TOTAL_SIZE_GB * 1024**3)
    used = get_total_size()

    if used >= max_bytes:
        raise HTTPException(413, "storage limit reached")

    content = await file.read()          # ← 先全部读入内存
    file_size = len(content)

    if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, ...)
    if used + file_size > max_bytes:
        raise HTTPException(413, ...)

    target_dir = get_abs_path(dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / file.filename

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)           # ← 一次性写入磁盘

    await manager.broadcast({...})       # ← WebSocket 广播
    return {"ok": True, "path": rel}
```

---

## 2. 场景一：上传未完成时刷新浏览器页面

### 2.1 行为分析

```
┌─────────────┐          ┌─────────────┐          ┌──────────────┐
│   浏览器      │   XHR    │   Uvicorn    │   read   │   磁盘        │
│  (app.js)    │─────────▶│  (FastAPI)   │─────────▶│  (data/)     │
└─────────────┘          └─────────────┘          └──────────────┘
       │                        │                         │
       │  [用户刷新页面]          │                         │
       │  浏览器强制终止 XHR      │                         │
       │                        │                         │
       ▼                        ▼                         ▼
   JS 上下文销毁            await file.read()          没有任何部分文件
  XHR.onerror 可能       抛出异常/取消                  写入磁盘
  来不及触发              await f.write() 
                         永远不会执行
```

### 2.2 详细结论

| 层面 | 现象 | 严重程度 |
|------|------|----------|
| **前端** | 页面刷新后 JS 上下文销毁，XHR 被浏览器强制终止。`xhr.onerror` 回调**来不及执行**（页面已卸载）。进度条 UI 随页面一起消失，新页面加载后通过 `init()` 重新渲染树。 | ⚠️ 信息丢失 |
| **后端磁盘** | `await file.read()` 在数据未完全接收时抛出异常（ClientDisconnect / CancelledError），**永远不会执行到 `aiofiles.open().write()`**。磁盘上**不会留下任何部分文件**。 | ✅ 安全 |
| **后端内存** | 已读取的字节被丢弃，Python GC 回收，无内存泄漏。 | ✅ 安全 |
| **WebSocket** | 页面刷新会断开 WS 连接，`manager.disconnect()` 清理连接。不会收到 `file_added` 广播。 | ✅ 安全 |
| **用户体验** | 刷新后页面恢复到初始状态，文件树正常显示，上传进度丢失。用户不知道上传是否发生过。 | ⚠️ 体验差 |

### 2.3 风险评估

- **数据完整性**：✅ **无风险**。不会产生损坏的部分文件。
- **磁盘空间**：✅ **无风险**。不会留下垃圾文件。
- **内存**：✅ **无风险**。服务器端内存正常回收。
- **用户体验**：⚠️ **中等风险**。用户刷新后不知道上传状态，可能重复上传。

---

## 3. 场景二：第一份文件正在上传时上传第二份文件

### 3.1 可触发第二份上传的途径

| 途径 | 上传进行中可用？ | 说明 |
|------|:---:|------|
| **侧边栏拖放区** (drop zone) | ❌ 不可用 | `uploadFiles()` 第一步就是 `sidebarDropIn.style.display = 'none'`，隐藏了拖放区 |
| **工具栏上传按钮** | ✅ 可用 | 按钮始终可见，点击 → `fileInput.click()` → 选择文件 → `fileInput.onchange` → 调用 `uploadFiles()` |
| **右键菜单上传** | ✅ 可用 | 右键空白区 → "Upload File" → `fileInput.click()` |
| **右键菜单 "Upload Here"** | ✅ 可用 | 右键文件夹 → "Upload Here" |
| **拖放到树节点** | ✅ 可用 | 树节点的 drop handler 直接调用 `uploadFiles(e.dataTransfer.files, ...)` |

### 3.2 前端并发行为

当第一个 `uploadFiles()` 正在 `await uploadWithProgress(...)` 时，用户通过工具栏触发第二个 `uploadFiles()`：

```
时间线
─────────────────────────────────────────────────────────────────────▶

uploadFiles#1:  隐藏drop区 ── 进度0% ── [上传文件A...50%...] ── ???
                                                 │
uploadFiles#2:              隐藏drop区(已是none) ── 进度0%(覆盖!) ── [上传文件B...]
                                     │
                              progressFill 被重置为 0%！
                              用户看到进度从 50% 跳回 0%，文件名变成 B
```

**关键问题**：两个 `uploadFiles()` 调用**没有互斥锁/信号量**，导致以下竞态：

### 3.3 竞态问题清单

| # | 问题 | 具体表现 |
|---|------|----------|
| 1 | **进度条显示混乱** | 两个调用都在操作同一个 `progressFill` / `progressText`。用户看到的进度在文件 A 和 B 之间来回跳。 |
| 2 | **UI 状态错乱** | 第一个调用完成时 `uploadProg.style.display = 'none'`，但第二个调用还在进行中——进度条被错误隐藏。第二个调用又在某时刻 `uploadProg.style.display = ''` 重新显示。 |
| 3 | **拖放区闪烁** | `sidebarDropIn` 在两个调用之间反复切换 `display: none` / `display: ''`。 |
| 4 | **双重 refreshTree/refreshStorage** | 两个调用最后都会刷新树和存储，产生多余的网络请求。 |
| 5 | **错误提示不准确** | 第一个调用出错 `break` 后会 `alert` 并刷新树——此时第二个调用可能仍在发送中。 |

### 3.4 后端并发行为

```
uploadFiles#1:  POST /api/upload (文件 A)
uploadFiles#2:  POST /api/upload (文件 B)

后端同时处理两个请求（FastAPI 异步并发）：
┌──────────────────────────────────────────────────┐
│  Coroutine 1               Coroutine 2           │
│  ──────────                ──────────            │
│  used = get_total_size()   used = get_total_size()│
│  check used >= max         check used >= max      │
│  content = await read()    content = await read() │
│  check file_size           check file_size        │
│  check used+size > max     check used+size > max  │
│  write to disk             write to disk          │
│  broadcast file_added      broadcast file_added   │
└──────────────────────────────────────────────────┘
```

| # | 问题 | 严重程度 | 具体表现 |
|---|------|:---:|------|
| 6 | **同文件名覆盖** | 🔴 高 | 如果两个上传使用相同的文件名 → 同一个目录，后写入的覆盖先写入的。两次 `broadcast("file_added")` 都会触发。磁盘上只保留最后写入的文件。 |
| 7 | **存储配额绕过 (TOCTOU)** | 🔴 高 | 假设 `used=8GB, max=10GB`。请求1上传 1.5GB，请求2上传 1.5GB。各自独立检查 `used+1.5 ≤ 10` → 都通过。最终磁盘使用量 = 11GB，超出限额 1GB。 |
| 8 | **内存压力** | 🟡 中 | 每个上传请求将整个文件读入内存（`content = await file.read()`）。两个大文件并发上传时内存占用翻倍。例如两个 1GB 文件 → 2GB 内存峰值。 |
| 9 | **磁盘 I/O 竞争** | 🟡 低 | 两个协程同时写入磁盘，操作系统处理并发写入。不同文件名互不影响；同文件名后写胜出。 |
| 10 | **get_total_size() 无锁读** | 🟡 低 | 两个协程可能读到相同的 `used` 值，导致 #7 的配额绕过。 |

### 3.5 TOCTOU 配额绕过详细示例

```
初始状态: used = 9.0 GB, max = 10.0 GB

T1: Coroutine 1 开始
    → get_total_size() = 9.0 GB
    → 9.0 < 10 → ✓ 检查通过
    → await file.read() (文件大小 1.2GB, 耗时 5 秒)
                                
T2: Coroutine 2 开始 (T1 + 0.5s)
    → get_total_size() = 9.0 GB (文件1尚未写入)
    → 9.0 < 10 → ✓ 检查通过 
    → await file.read() (文件大小 0.8GB, 耗时 3 秒)

T3: Coroutine 2 先完成
    → 写入文件2 (0.8 GB), 磁盘 used = 9.8 GB
    → broadcast file_added

T4: Coroutine 1 完成
    → 写入文件1 (1.2 GB), 磁盘 used = 11.0 GB  ← 超出配额!
    → broadcast file_added

最终结果: 11.0 GB > 10 GB 限额 ❌
```

---

## 4. 问题总结与严重性评级

| # | 问题 | 场景 | 严重性 | 影响 |
|---|------|:---:|:---:|------|
| 1 | 刷新页面不产生部分文件 | 场景一 | ✅ 安全 | 无负面影响 |
| 2 | 刷新页面丢失上传进度反馈 | 场景一 | ⚠️ 中等 | 用户体验差 |
| 3 | 前端无并发上传互斥 | 场景二 | 🔴 高 | 进度条混乱、UI 闪烁 |
| 4 | 同文件名并发写入覆盖 | 场景二 | 🔴 高 | 数据丢失（先完成的上传被覆盖） |
| 5 | 存储配额 TOCTOU 绕过 | 场景二 | 🔴 高 | 磁盘使用可超出限额 |
| 6 | 后端全量读入内存 | 场景二 | 🟡 中等 | 大文件并发时内存压力大 |

---

## 5. 改进建议

### 5.1 前端：防止并发上传

```javascript
// 添加全局上传锁
let uploading = false;

async function uploadFiles(files, dir) {
  if (uploading) {
    alert('An upload is already in progress. Please wait.');
    return;
  }
  uploading = true;
  try {
    // ... 原有逻辑 ...
  } finally {
    uploading = false;
    uploadProg.style.display = 'none';
    sidebarDropIn.style.display = '';
  }
}
```

### 5.2 后端：修复 TOCTOU 配额绕过

```python
import asyncio

_upload_lock = asyncio.Lock()

@router.post("/upload")
async def upload(file: UploadFile = File(...), dir: str = Query("")):
    async with _upload_lock:  # 串行化上传，避免竞态
        used = get_total_size()
        if used >= max_bytes:
            raise HTTPException(413, "storage limit reached")
        
        content = await file.read()
        file_size = len(content)
        
        if used + file_size > max_bytes:
            raise HTTPException(413, "upload would exceed storage limit")
        
        # ... 写入磁盘 ...
```

### 5.3 后端：改为流式写入（降低内存压力）

```python
# 逐块写入而非全量读入内存
CHUNK_SIZE = 1024 * 1024  # 1MB

async with aiofiles.open(dest, "wb") as f:
    while chunk := await file.read(CHUNK_SIZE):
        await f.write(chunk)
```

### 5.4 前端：刷新页面前确认

```javascript
window.addEventListener('beforeunload', (e) => {
  if (uploading) {
    e.preventDefault();
    e.returnValue = 'Upload in progress. Leave?';  // Chrome 需要 returnValue
  }
});
```

---

## 6. 结论

| 场景 | 数据安全性 | 用户体验 | 配额安全性 |
|------|:---:|:---:|:---:|
| **刷新中断上传** | ✅ 安全 | ⚠️ 无反馈 | ✅ 安全 |
| **并发上传** | 🔴 同文件名可能覆盖 | 🔴 进度条混乱 | 🔴 可绕过配额 |

**最严重的问题是存储配额 TOCTOU 绕过（#7）和同文件名并发覆盖（#6）**，建议优先修复后端并发控制。方案：添加 `asyncio.Lock` 串行化上传操作，从根本上解决竞争条件。
