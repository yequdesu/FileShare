/* API helpers */
/* ================================================================== */
/*  API                                                                */
/* ================================================================== */
async function api(method, url, body) {
  const opts = { method };
  if (body && !(body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json().catch(() => ({}));
}

/* ================================================================== */
/*  Data fetch                                                         */
/* ================================================================== */
async function refreshTree() {
  FileShare.treeData = await api('GET', '/api/tree');
  renderTree(FileShare.treeData, treeRoot, 0);
  if (FileShare.selected) {
    const el = $(`.tree-row[data-path="${CSS.escape(FileShare.selected.path)}"]`);
    if (el) el.classList.add('active');
  }
}

async function refreshStorage() {
  const s = await api('GET', '/api/storage');
  storageBar.style.width = s.percent + '%';
  storageText.textContent = s.used_human + ' / ' + s.max_human;
}

async function deleteItem(path) {
  if (!confirm('Delete ' + path + ' ?')) return;
  try {
    await api('DELETE', '/api/delete?path=' + encodeURIComponent(path));
    if (FileShare.selected && FileShare.selected.path === path) selectRoot();
    await refreshTree();
    await refreshStorage();
  } catch (err) { alert('Delete failed: ' + err.message); }
}

function downloadItem(path) {
  const a = document.createElement('a');
  a.href = '/api/download?path=' + encodeURIComponent(path);
  a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function createDir(parent, name) {
  const fp = parent ? parent + '/' + name : name;
  await api('POST', '/api/mkdir?path=' + encodeURIComponent(fp));
  await refreshTree();
}

async function createEmptyFile(parent, name) {
  const fd = new FormData();
  fd.append('file', new File([new Blob([''], { type: 'text/plain' })], name));
  await api('POST', '/api/upload?dir=' + encodeURIComponent(parent || ''), fd);
  await refreshTree();
  await refreshStorage();
}
