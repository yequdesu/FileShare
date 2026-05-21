/* ------------------------------------------------------------------ */
/*  DOM refs & globals                                                */
/* ------------------------------------------------------------------ */
const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

const treeRoot      = $('#tree-root');
const dropZone      = $('#drop-zone');
const fileInput     = $('#file-input');
const previewFrame  = $('#preview-frame');
const fileActions   = $('#file-actions');
const breadcrumb    = $('#selected-breadcrumb');
const userCountEl   = $('#user-count');
const storageBar    = $('#storage-bar-fill');
const storageText   = $('#storage-text');
const ctxMenu       = $('#ctx-menu');

const modalMask   = $('#modal-mask');
const modalMsg    = $('#modal-msg');
const modalInput  = $('#modal-input');
const modalOk     = $('#modal-ok');
const modalCancel = $('#modal-cancel');

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
let treeData    = [];
let selected    = null;       // { path, is_dir }
let activeDir   = '';         // current upload target directory
let ws          = null;
let ctxTarget   = null;       // tree item right-clicked on
let dragSource  = null;       // { path, is_dir, name } being dragged
let expandedPaths = new Set(); // remember which folders were expanded

/* ================================================================== */
/*  ICONS  (VS Code codicons)                                          */
/* ================================================================== */
const FILE_ICONS = {
  md: 'markdown',
  py: 'file-code', js: 'file-code', ts: 'file-code',
  jsx: 'react', tsx: 'react', vue: 'file-code', svelte: 'file-code',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css',
  json: 'json', xml: 'xml',
  svg: 'file-media', png: 'file-media', jpg: 'file-media',
  jpeg: 'file-media', gif: 'file-media', webp: 'file-media',
  ico: 'file-media', bmp: 'file-media',
  zip: 'file-zip', tar: 'file-zip', gz: 'file-zip',
  bz2: 'file-zip', '7z': 'file-zip', rar: 'file-zip',
  yml: 'settings', yaml: 'settings', toml: 'settings',
  cfg: 'settings', ini: 'settings', env: 'settings',
  lock: 'lock',
  pdf: 'file-pdf',
  txt: 'file-text', log: 'file-text',
  drawio: 'file', svg: 'file-media',
};

function getIconClass(name, isDir) {
  if (isDir) return 'codicon codicon-folder folder-icon';
  const ext = name.split('.').pop().toLowerCase();
  const icon = FILE_ICONS[ext] || 'file';
  return `codicon codicon-${icon} file-icon`;
}

function getFolderIcon(isOpen) {
  return isOpen ? 'codicon codicon-folder-opened folder-icon open'
                : 'codicon codicon-folder folder-icon';
}

/* ================================================================== */
/*  API helpers                                                        */
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json().catch(() => ({}));
}

/* ================================================================== */
/*  Data fetch                                                         */
/* ================================================================== */
async function refreshTree() {
  const data = await api('GET', '/api/tree');
  treeData = data;
  renderTree(treeData, treeRoot, 0);
  if (selected) {
    const el = $(`.tree-row[data-path="${CSS.escape(selected.path)}"]`);
    if (el) el.classList.add('active');
  }
}

async function refreshStorage() {
  const s = await api('GET', '/api/storage');
  storageBar.style.width = s.percent + '%';
  storageText.textContent = s.used_human + ' / ' + s.max_human;
}

/* ================================================================== */
/*  Tree rendering                                                     */
/* ================================================================== */
function renderTree(items, container, depth) {
  container.innerHTML = '';

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (depth * 16 + 4) + 'px';
    row.dataset.path = item.path;
    row.dataset.isDir = item.is_dir ? '1' : '0';
    row.dataset.name = item.name;

    if (selected && selected.path === item.path) {
      row.classList.add('active');
    }

    /* --- toggle arrow --- */
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle codicon';
    if (item.is_dir) {
      toggle.classList.add('codicon-chevron-right');
    } else {
      toggle.classList.add('empty');
    }
    row.appendChild(toggle);

    /* --- icon --- */
    const icon = document.createElement('span');
    icon.className = 'tree-icon ' + getIconClass(item.name, item.is_dir);
    row.appendChild(icon);

    /* --- name --- */
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = item.name;
    name.title = item.name;
    row.appendChild(name);

    /* --- click → select / toggle folder --- */
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.is_dir) toggleFolderEl(row, item);
      selectItem(item.path, item.is_dir);
    });

    /* --- dblclick → open / preview --- */
    if (!item.is_dir) {
      row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        showPreview(item.path);
      });
    }

    /* ===== DRAG SOURCE ===== */
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      dragSource = { path: item.path, is_dir: item.is_dir, name: item.name };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.path);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      dragSource = null;
      $$('.tree-row.drag-over').forEach(r => r.classList.remove('drag-over'));
    });

    /* ===== DROP TARGET ===== */
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragSource) return; // only accept internal drags on tree rows
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over');

      // external files → upload
      if (!dragSource && e.dataTransfer.files.length) {
        const targetDir = item.is_dir ? item.path : '';
        await uploadFiles(e.dataTransfer.files, targetDir);
        return;
      }
      // internal move
      if (!dragSource) return;
      await handleTreeDrop(item, dragSource);
    });

    /* ===== RIGHT-CLICK CONTEXT MENU ===== */
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // select the item first
      if (item.is_dir) toggleFolderEl(row, item);
      selectItem(item.path, item.is_dir);
      ctxTarget = item;
      showContextMenu(e.clientX, e.clientY, item);
    });

    container.appendChild(row);

    /* --- children container --- */
    if (item.is_dir) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      childContainer.style.display = 'none';
      renderTree(item.children, childContainer, depth + 1);
      container.appendChild(childContainer);
    }
  }
}

/* ================================================================== */
/*  Internal drag-drop: move within tree                               */
/* ================================================================== */
async function handleTreeDrop(targetItem, source) {
  if (!source || source.path === targetItem.path) return;
  // prevent dropping into own subtree
  if (targetItem.is_dir && targetItem.path.startsWith(source.path + '/')) return;

  const destDir = targetItem.is_dir ? targetItem.path : targetItem.path.split('/').slice(0, -1).join('/');
  const newPath = (destDir ? destDir + '/' : '') + source.name;

  if (newPath === source.path) return;

  try {
    await api('POST', '/api/move?src=' + encodeURIComponent(source.path) + '&dst=' + encodeURIComponent(newPath));
    await refreshTree();
  } catch (err) {
    showModal('Move failed: ' + err.message, false);
  }
}

/* ================================================================== */
/*  Tree interactions                                                  */
/* ================================================================== */
function toggleFolderEl(row, item) {
  const children = row.nextElementSibling;
  if (!children || !children.classList.contains('tree-children')) return;

  const toggle = row.querySelector('.tree-toggle');
  const icon   = row.querySelector('.tree-icon');

  if (children.style.display === 'none') {
    children.style.display = '';
    toggle.classList.remove('codicon-chevron-right');
    toggle.classList.add('codicon-chevron-down');
    icon.className = 'tree-icon ' + getFolderIcon(true);
    expandedPaths.add(item.path);
  } else {
    children.style.display = 'none';
    toggle.classList.remove('codicon-chevron-down');
    toggle.classList.add('codicon-chevron-right');
    icon.className = 'tree-icon ' + getFolderIcon(false);
    expandedPaths.delete(item.path);
  }
}

function selectItem(path, isDir) {
  $$('.tree-row.active').forEach(el => el.classList.remove('active'));
  selected = { path, is_dir: isDir };
  activeDir = isDir ? path : '';

  const el = $(`.tree-row[data-path="${CSS.escape(path)}"]`);
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

/* ================================================================== */
/*  Preview                                                            */
/* ================================================================== */
function showPreview(path) {
  dropZone.style.display = 'none';
  previewFrame.style.display = '';
  previewFrame.src = '/api/preview?path=' + encodeURIComponent(path);
}

/* ================================================================== */
/*  Upload                                                             */
/* ================================================================== */
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

/* --- external drag-drop onto drop zone --- */
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

/* --- upload via click or button --- */
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    uploadFiles(fileInput.files);
    fileInput.value = '';
  }
});

/* ================================================================== */
/*  Delete / Download / New folder / New file                          */
/* ================================================================== */
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

function downloadItem(path) {
  const a = document.createElement('a');
  a.href = '/api/download?path=' + encodeURIComponent(path);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function createFolder(parentDir, name) {
  const fullPath = parentDir ? parentDir + '/' + name : name;
  try {
    await api('POST', '/api/mkdir?path=' + encodeURIComponent(fullPath));
    await refreshTree();
  } catch (err) {
    showModal('Create folder failed: ' + err.message, false);
  }
}

async function createFile(parentDir, name) {
  const fullPath = parentDir ? parentDir + '/' + name : name;
  try {
    await api('POST', '/api/upload?dir=' + encodeURIComponent(parentDir || ''),
      new File([new Blob([''], { type: 'text/plain' })], name));
    await refreshTree();
    await refreshStorage();
  } catch (err) {
    showModal('Create file failed: ' + err.message, false);
  }
}

async function renameItem(oldPath, oldName) {
  showModal('Rename: ' + oldName, true, async (newName) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    try {
      await api('POST', '/api/rename?path=' + encodeURIComponent(oldPath) + '&name=' + encodeURIComponent(newName.trim()));
      if (selected && selected.path === oldPath) {
        const parts = oldPath.split('/');
        parts[parts.length - 1] = newName.trim();
        selected.path = parts.join('/');
      }
      await refreshTree();
    } catch (err) {
      showModal('Rename failed: ' + err.message, false);
    }
  });
}

/* ================================================================== */
/*  Context menu                                                       */
/* ================================================================== */
function showContextMenu(x, y, item) {
  // show/hide items based on file vs dir
  $$('.ctx-item', ctxMenu).forEach(el => {
    const onlyFile = el.dataset.onlyFile !== undefined;
    const onlyDir  = el.dataset.onlyDir !== undefined;
    if (onlyFile && item.is_dir) { el.style.display = 'none'; return; }
    if (onlyDir && !item.is_dir)  { el.style.display = 'none'; return; }
    el.style.display = '';
  });

  // position (clamp to viewport)
  const mw = ctxMenu.offsetWidth  || 180;
  const mh = ctxMenu.offsetHeight || 200;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  ctxMenu.style.left = (x + mw > vw ? x - mw : x) + 'px';
  ctxMenu.style.top  = (y + mh > vh ? y - mh : y) + 'px';
  ctxMenu.style.display = '';
}

function hideContextMenu() {
  ctxMenu.style.display = 'none';
}

ctxMenu.addEventListener('click', async (e) => {
  const item = e.target.closest('.ctx-item');
  if (!item) return;

  const action = item.dataset.action;
  const target = ctxTarget;
  const parent = target.is_dir ? target.path : target.path.split('/').slice(0, -1).join('/');

  hideContextMenu();

  switch (action) {
    case 'new-file':
      showModal('New file in: ' + (parent || '/'), true, async (name) => {
        if (!name.trim()) return;
        await createFile(parent, name.trim());
      });
      break;
    case 'new-folder':
      showModal('New folder in: ' + (parent || '/'), true, async (name) => {
        if (!name.trim()) return;
        await createFolder(parent, name.trim());
      });
      break;
    case 'open':
      if (!target.is_dir) showPreview(target.path);
      break;
    case 'download':
      if (!target.is_dir) downloadItem(target.path);
      break;
    case 'upload-here':
      if (target.is_dir) {
        activeDir = target.path;
        selectItem(target.path, true);
        fileInput.click();
      }
      break;
    case 'rename':
      renameItem(target.path, target.name);
      break;
    case 'delete':
      deleteItem(target.path);
      break;
    case 'copy-path':
      navigator.clipboard.writeText(target.path).catch(() => {});
      break;
    case 'copy-rel-path':
      navigator.clipboard.writeText(target.name).catch(() => {});
      break;
  }
});

/* --- close context menu on any outside click --- */
document.addEventListener('click', (e) => {
  if (!ctxMenu.contains(e.target)) hideContextMenu();
});
document.addEventListener('contextmenu', (e) => {
  if (!ctxMenu.contains(e.target)) hideContextMenu();
});

/* ================================================================== */
/*  Modal                                                              */
/* ================================================================== */
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

/* ================================================================== */
/*  Toolbar buttons                                                    */
/* ================================================================== */
$('#btn-new-folder')?.addEventListener('click', () => {
  showModal('Create folder in: ' + (activeDir || '/'), true, async (name) => {
    if (!name.trim()) return;
    await createFolder(activeDir, name.trim());
  });
});
$('#btn-new-file')?.addEventListener('click', () => {
  showModal('New file in: ' + (activeDir || '/'), true, async (name) => {
    if (!name.trim()) return;
    await createFile(activeDir, name.trim());
  });
});
$('#btn-refresh')?.addEventListener('click', async () => {
  await refreshTree();
  await refreshStorage();
});
$('#btn-download')?.addEventListener('click', () => {
  if (selected && !selected.is_dir) downloadItem(selected.path);
});
$('#btn-delete')?.addEventListener('click', () => {
  if (selected) deleteItem(selected.path);
});

/* ================================================================== */
/*  Keyboard shortcuts                                                 */
/* ================================================================== */
document.addEventListener('keydown', (e) => {
  // Del → delete selected
  if (e.key === 'Delete' && selected && document.activeElement === document.body) {
    e.preventDefault();
    deleteItem(selected.path);
  }
  // F2 → rename selected
  if (e.key === 'F2' && selected && document.activeElement === document.body) {
    e.preventDefault();
    renameItem(selected.path, selected.path.split('/').pop());
  }
  // Ctrl+Shift+C → copy path
  if (e.ctrlKey && e.shiftKey && e.key === 'C' && selected && document.activeElement === document.body) {
    e.preventDefault();
    navigator.clipboard.writeText(selected.path).catch(() => {});
  }
});

/* ================================================================== */
/*  WebSocket                                                          */
/* ================================================================== */
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = proto + '://' + location.host + '/ws';
  ws = new WebSocket(url);

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case 'file_added':
      case 'file_deleted':
      case 'file_moved':
      case 'file_renamed':
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
  ws.onerror = () => {
    ws.close();
  };
}

/* ================================================================== */
/*  Init                                                               */
/* ================================================================== */
(async () => {
  await refreshTree();
  await refreshStorage();
  connectWS();
})();
