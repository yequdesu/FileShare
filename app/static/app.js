/* ------------------------------------------------------------------ */
/*  DOM refs                                                          */
/* ------------------------------------------------------------------ */
const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

const treeRoot    = $('#tree-root');
const dropZone    = $('#drop-zone');
const fileInput   = $('#file-input');
const previewFrame = $('#preview-frame');
const fileActions = $('#file-actions');
const breadcrumb  = $('#selected-breadcrumb');
const userCountEl = $('#user-count');
const storageBar  = $('#storage-bar-fill');
const storageText = $('#storage-text');

const modalMask   = $('#modal-mask');
const modalMsg    = $('#modal-msg');
const modalInput  = $('#modal-input');
const modalOk     = $('#modal-ok');
const modalCancel = $('#modal-cancel');

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
let treeData = [];
let selected = null;          // { path, is_dir }
let activeDir = '';           // current upload target directory
let ws = null;

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */
async function api(method, url, body) {
  const opts = { method };
  if (body && !(body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json().catch(() => ({}));
}

/* ------------------------------------------------------------------ */
/*  Data fetch                                                         */
/* ------------------------------------------------------------------ */
async function refreshTree() {
  const data = await api('GET', '/api/tree');
  treeData = data;
  renderTree(treeData, treeRoot, 0);
  if (selected) {
    const el = $(`.tree-item[data-path="${CSS.escape(selected.path)}"]`);
    if (el) el.classList.add('active');
  }
}

async function refreshStorage() {
  const s = await api('GET', '/api/storage');
  storageBar.style.width = s.percent + '%';
  storageText.textContent = s.used_human + ' / ' + s.max_human;
}

/* ------------------------------------------------------------------ */
/*  Tree rendering                                                     */
/* ------------------------------------------------------------------ */
function renderTree(items, container, depth) {
  container.innerHTML = '';

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = (depth * 16) + 'px';
    row.dataset.path = item.path;
    row.dataset.isDir = item.is_dir ? '1' : '0';

    if (selected && selected.path === item.path) {
      row.classList.add('active');
    }

    // toggle arrow
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    if (item.is_dir) {
      toggle.textContent = '\u25B6';  // right triangle
    } else {
      toggle.classList.add('empty');
    }
    row.appendChild(toggle);

    // icon
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = item.is_dir ? '\u25A0' : '\u25A0';  // filled square
    icon.classList.add(item.is_dir ? 'folder' : 'file');
    row.appendChild(icon);

    // name
    const name = document.createElement('span');
    name.className = 'tree-name ' + (item.is_dir ? 'folder' : 'file');
    name.textContent = item.name;
    name.title = item.name;
    row.appendChild(name);

    // hover actions
    const actions = document.createElement('span');
    actions.className = 'tree-actions';
    if (!item.is_dir) {
      const dl = document.createElement('button');
      dl.textContent = '\u2193';  // down arrow
      dl.title = 'Download';
      dl.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadItem(item.path);
      });
      actions.appendChild(dl);
    }
    const del = document.createElement('button');
    del.textContent = '\u2715';  // X
    del.title = 'Delete';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(item.path);
    });
    actions.appendChild(del);
    row.appendChild(actions);

    // click -> toggle folder or select
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.is_dir) {
        toggleFolder(row, item);
      }
      selectItem(item.path, item.is_dir);
    });

    // dblclick -> preview
    if (!item.is_dir) {
      row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        showPreview(item.path);
      });
    }

    // drag & drop onto tree items
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drop-target');
      const targetDir = item.is_dir ? item.path : '';
      uploadFiles(e.dataTransfer.files, targetDir);
    });

    container.appendChild(row);

    // children (initially hidden)
    if (item.is_dir && item.children && item.children.length > 0) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      childContainer.style.display = 'none';
      renderTree(item.children, childContainer, depth + 1);
      container.appendChild(childContainer);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Tree interactions                                                  */
/* ------------------------------------------------------------------ */
function toggleFolder(row, item) {
  const children = row.nextElementSibling;
  if (!children || !children.classList.contains('tree-children')) return;

  const toggle = row.querySelector('.tree-toggle');
  const icon = row.querySelector('.tree-icon');

  if (children.style.display === 'none') {
    children.style.display = '';
    toggle.textContent = '\u25BC';    // down triangle
    icon.classList.add('open');
  } else {
    children.style.display = 'none';
    toggle.textContent = '\u25B6';    // right triangle
    icon.classList.remove('open');
  }
}

function selectItem(path, isDir) {
  // deselect all
  $$('.tree-item.active').forEach(el => el.classList.remove('active'));

  selected = { path, is_dir: isDir };
  activeDir = isDir ? path : '';

  const el = $(`.tree-item[data-path="${CSS.escape(path)}"]`);
  if (el) el.classList.add('active');

  if (isDir) {
    fileActions.style.display = 'none';
    previewFrame.style.display = 'none';
    dropZone.style.display = '';
    breadcrumb.textContent = path || '/ (root)';
  } else {
    fileActions.style.display = '';
    breadcrumb.textContent = path;
    showPreview(path);
  }
}

/* ------------------------------------------------------------------ */
/*  Preview                                                            */
/* ------------------------------------------------------------------ */
function showPreview(path) {
  dropZone.style.display = 'none';
  previewFrame.style.display = '';
  previewFrame.src = '/api/preview?path=' + encodeURIComponent(path);
}

/* ------------------------------------------------------------------ */
/*  Upload                                                             */
/* ------------------------------------------------------------------ */
async function uploadFiles(files, dir) {
  dir = dir || activeDir || '';
  for (const f of files) {
    const fd = new FormData();
    fd.append('file', f);
    try {
      await api('POST', '/api/upload?dir=' + encodeURIComponent(dir), fd);
    } catch (err) {
      showModal('Upload failed: ' + err.message, false);
    }
  }
  await refreshTree();
  await refreshStorage();
}

/* --- drag & drop on drop zone --- */
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  uploadFiles(e.dataTransfer.files);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    uploadFiles(fileInput.files);
    fileInput.value = '';
  }
});

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */
async function deleteItem(path) {
  if (!confirm('Delete ' + path + ' ?')) return;
  try {
    await api('DELETE', '/api/delete?path=' + encodeURIComponent(path));
    if (selected && selected.path === path) {
      selected = null;
      fileActions.style.display = 'none';
      previewFrame.style.display = 'none';
      dropZone.style.display = '';
      breadcrumb.textContent = '';
    }
    await refreshTree();
    await refreshStorage();
  } catch (err) {
    showModal('Delete failed: ' + err.message, false);
  }
}

/* ------------------------------------------------------------------ */
/*  Download                                                           */
/* ------------------------------------------------------------------ */
function downloadItem(path) {
  const a = document.createElement('a');
  a.href = '/api/download?path=' + encodeURIComponent(path);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ------------------------------------------------------------------ */
/*  New folder                                                         */
/* ------------------------------------------------------------------ */
function showModal(msg, withInput, onOk) {
  modalMsg.textContent = msg;
  modalInput.style.display = withInput ? '' : 'none';
  modalInput.value = '';
  modalMask.style.display = '';

  const handler = () => {
    modalMask.style.display = 'none';
    modalOk.removeEventListener('click', handler);
    modalCancel.removeEventListener('click', cancelHandler);
    if (onOk) onOk(modalInput.value);
  };
  const cancelHandler = () => {
    modalMask.style.display = 'none';
    modalOk.removeEventListener('click', handler);
    modalCancel.removeEventListener('click', cancelHandler);
  };
  modalOk.addEventListener('click', handler);
  modalCancel.addEventListener('click', cancelHandler);
  if (withInput) modalInput.focus();
}

$('#btn-new-folder').addEventListener('click', () => {
  showModal('Create folder in: ' + (activeDir || '/'), true, async (name) => {
    if (!name.trim()) return;
    const parent = activeDir || '';
    const fullPath = parent ? parent + '/' + name.trim() : name.trim();
    try {
      await api('POST', '/api/mkdir?path=' + encodeURIComponent(fullPath));
      await refreshTree();
    } catch (err) {
      showModal('Failed: ' + err.message, false);
    }
  });
});

$('#btn-upload').addEventListener('click', () => fileInput.click());

$('#btn-download').addEventListener('click', () => {
  if (selected && !selected.is_dir) downloadItem(selected.path);
});

$('#btn-delete').addEventListener('click', () => {
  if (selected) deleteItem(selected.path);
});

/* ------------------------------------------------------------------ */
/*  WebSocket                                                          */
/* ------------------------------------------------------------------ */
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = proto + '://' + location.host + '/ws';
  ws = new WebSocket(url);

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case 'file_added':
      case 'file_deleted':
        refreshTree();
        refreshStorage();
        break;
      case 'user_count':
        userCountEl.textContent = msg.count + ' online';
        break;
    }
  };

  ws.onclose = () => {
    setTimeout(connectWS, 2000);
  };
}

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */
(async () => {
  await refreshTree();
  await refreshStorage();
  connectWS();
})();
