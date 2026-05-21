/* ------------------------------------------------------------------ */
/*  DOM refs & globals                                                */
/* ------------------------------------------------------------------ */
const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

const treeRoot     = $('#tree-root');
const sidebarScroll = $('#sidebar-scroll');
const dropZone     = $('#drop-zone');
const fileInput    = $('#file-input');
const previewFrame = $('#preview-frame');
const fileActions  = $('#file-actions');
const breadcrumb   = $('#selected-breadcrumb');
const userCountEl  = $('#user-count');
const storageBar   = $('#storage-bar-fill');
const storageText  = $('#storage-text');
const ctxMenu      = $('#ctx-menu');

const modalMask   = $('#modal-mask');
const modalMsg    = $('#modal-msg');
const modalInput  = $('#modal-input');
const modalOk     = $('#modal-ok');
const modalCancel = $('#modal-cancel');

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
let treeData     = [];
let selected     = null;          // { path, is_dir }
let activeDir    = '';            // current upload target
let ws           = null;
let ctxTarget    = null;          // { path, is_dir, name } or null (empty area)
let dragSource   = null;          // { path, is_dir, name }
let expandingDirs = new Set();    // tracks which dirs are expanded

/* ================================================================== */
/*  ICONS  (VS Code codicons)                                          */
/* ================================================================== */
const FILE_ICONS = {
  md:   'markdown',        py:   'file-code',
  js:   'file-code',       ts:   'file-code',
  jsx:  'react',           tsx:  'react',
  vue:  'file-code',       svelte:'file-code',
  html: 'html',            htm:  'html',
  css:  'css',             scss: 'css',       less:'css',
  json: 'json',            xml:  'xml',
  yml:  'settings',        yaml: 'settings',  toml:'settings',
  cfg:  'settings',        ini:  'settings',  env:'settings',
  lock: 'lock',
  svg:  'file-media',      png:  'file-media',jpg:'file-media',
  jpeg: 'file-media',      gif:  'file-media',webp:'file-media',
  ico:  'file-media',      bmp:  'file-media',
  zip:  'file-zip',        tar:  'file-zip',  gz:'file-zip',
  bz2:  'file-zip',        '7z': 'file-zip',  rar:'file-zip',
  pdf:  'file-pdf',
  txt:  'file-text',       log:  'file-text',
  sh:   'terminal',        bash: 'terminal',
  dockerfile:'docker',
  gitignore:'git-ignore',
};
function getIconClass(n, isDir) {
  if (isDir) return 'codicon codicon-folder folder-icon';
  const ext = n.split('.').pop().toLowerCase();
  return `codicon codicon-${FILE_ICONS[ext] || 'file'} file-icon`;
}
function folderIconCls(open) {
  return open ? 'codicon codicon-folder-opened folder-icon open'
              : 'codicon codicon-folder folder-icon';
}

/* ================================================================== */
/*  API                                                                */
/* ================================================================== */
async function api(m, url, body) {
  const o = { method: m };
  if (body && !(body instanceof FormData)) {
    o.headers = { 'Content-Type': 'application/json' };
    o.body = JSON.stringify(body);
  } else if (body instanceof FormData) o.body = body;
  const r = await fetch(url, o);
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json().catch(() => ({}));
}

/* ================================================================== */
/*  Data fetch                                                         */
/* ================================================================== */
async function refreshTree() {
  treeData = await api('GET', '/api/tree');
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
    const row = makeTreeRow(item, depth);
    container.appendChild(row);
    if (item.is_dir) {
      const children = document.createElement('div');
      children.className = 'tree-children';
      children.style.display = 'none';
      renderTree(item.children, children, depth + 1);
      container.appendChild(children);
    }
  }
}

function makeTreeRow(item, depth) {
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.style.paddingLeft = (depth * 16 + 4) + 'px';
  row.dataset.path = item.path;
  row.dataset.isDir = item.is_dir ? '1' : '0';
  row.dataset.name = item.name;
  row.dataset.ghost = item._ghost || '';

  if (selected && selected.path === item.path) row.classList.add('active');

  /* toggle */
  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle codicon';
  toggle.classList.add(item.is_dir ? 'codicon-chevron-right' : 'empty');
  row.appendChild(toggle);

  /* icon */
  const icon = document.createElement('span');
  icon.className = 'tree-icon ' + getIconClass(item.name, item.is_dir);
  row.appendChild(icon);

  /* name */
  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = item.name;
  name.title = item.name;
  row.appendChild(name);

  /* ghost badge */
  if (item._ghost) {
    row.style.opacity = '0.7';
    row.style.fontStyle = 'italic';
  }

  /* --- click → select / toggle --- */
  row.addEventListener('click', (e) => {
    if (row.classList.contains('editing')) return;
    e.stopPropagation();
    if (item.is_dir) toggleFolder(row, item);
    selectItem(item.path, item.is_dir);
  });

  /* dblclick → preview */
  if (!item.is_dir) {
    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      showPreview(item.path);
    });
  }

  /* ===== DRAG SOURCE ===== */
  row.draggable = true;
  row.addEventListener('dragstart', (e) => {
    if (item._ghost) { e.preventDefault(); return; }
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
    e.preventDefault(); e.stopPropagation();
    if (!dragSource) return;
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    row.classList.remove('drag-over');
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    row.classList.remove('drag-over');
    if (dragSource && e.dataTransfer.files.length === 0) {
      doTreeDrop(item, dragSource);
      return;
    }
    if (e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files, item.is_dir ? item.path : '');
    }
  });

  /* ===== RIGHT-CLICK ===== */
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (item.is_dir) toggleFolder(row, item);
    selectItem(item.path, item.is_dir);
    ctxTarget = { path: item.path, is_dir: item.is_dir, name: item.name, _ghost: item._ghost };
    showContextMenu(e.clientX, e.clientY, ctxTarget);
  });

  return row;
}

/* ================================================================== */
/*  Drop onto empty area → move to root                                */
/* ================================================================== */
sidebarScroll.addEventListener('dragover', (e) => {
  if (!dragSource) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  sidebarScroll.classList.add('drag-over-area');
});
sidebarScroll.addEventListener('dragleave', () => {
  sidebarScroll.classList.remove('drag-over-area');
});
sidebarScroll.addEventListener('drop', (e) => {
  sidebarScroll.classList.remove('drag-over-area');
  if (!dragSource) return;
  e.preventDefault();
  const src = dragSource;
  doTreeDrop({ is_dir: true, path: '', name: '' }, src);
});

treeRoot.addEventListener('dragover', (e) => {
  if (!dragSource) return;
  // only trigger if hovering empty space (not a .tree-row)
  if (e.target.closest('.tree-row') || e.target.closest('.tree-children')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  treeRoot.classList.add('drag-over-area');
});
treeRoot.addEventListener('dragleave', () => {
  treeRoot.classList.remove('drag-over-area');
});
treeRoot.addEventListener('drop', (e) => {
  treeRoot.classList.remove('drag-over-area');
  if (!dragSource) return;
  if (e.target.closest('.tree-row') || e.target.closest('.tree-children')) return;
  e.preventDefault();
  doTreeDrop({ is_dir: true, path: '', name: '' }, dragSource);
});

/* --- empty-area right-click context menu --- */
treeRoot.addEventListener('contextmenu', (e) => {
  const onRow = e.target.closest('.tree-row');
  if (onRow) return; // let the row handler deal with it
  e.preventDefault();
  ctxTarget = null;
  showContextMenu(e.clientX, e.clientY, null);
});
sidebarScroll.addEventListener('contextmenu', (e) => {
  if (e.target !== sidebarScroll) return;
  e.preventDefault();
  ctxTarget = null;
  showContextMenu(e.clientX, e.clientY, null);
});

/* ================================================================== */
/*  Tree drop logic                                                    */
/* ================================================================== */
async function doTreeDrop(targetItem, source) {
  if (!source || source.path === targetItem.path) return;
  if (targetItem.is_dir && targetItem.path && targetItem.path.startsWith(source.path + '/')) return;

  const destDir = targetItem.is_dir ? (targetItem.path || '') : targetItem.path.split('/').slice(0, -1).join('/');
  const newPath = (destDir ? destDir + '/' : '') + source.name;
  if (newPath === source.path) return;

  try {
    await api('POST', '/api/move?src=' + encodeURIComponent(source.path) + '&dst=' + encodeURIComponent(newPath));
    await refreshTree();
  } catch (err) {
    alert('Move failed: ' + err.message);
  }
}

/* ================================================================== */
/*  Tree interactions                                                  */
/* ================================================================== */
function toggleFolder(row, item) {
  const children = row.nextElementSibling;
  if (!children || !children.classList.contains('tree-children')) return;
  const toggle = row.querySelector('.tree-toggle');
  const icon   = row.querySelector('.tree-icon');

  if (children.style.display === 'none') {
    children.style.display = '';
    toggle.classList.replace('codicon-chevron-right', 'codicon-chevron-down');
    icon.className = 'tree-icon ' + folderIconCls(true);
    expandingDirs.add(item.path);
  } else {
    children.style.display = 'none';
    toggle.classList.replace('codicon-chevron-down', 'codicon-chevron-right');
    icon.className = 'tree-icon ' + folderIconCls(false);
    expandingDirs.delete(item.path);
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
    const fd = new FormData(); fd.append('file', f);
    try { await api('POST', '/api/upload?dir=' + encodeURIComponent(dir), fd); }
    catch (err) { alert('Upload failed: ' + err.message); }
  }
  await refreshTree();
  await refreshStorage();
}

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  uploadFiles(e.dataTransfer.files);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) { uploadFiles(fileInput.files); fileInput.value = ''; }
});

/* ================================================================== */
/*  Delete / Download                                                  */
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
  } catch (err) { alert('Delete failed: ' + err.message); }
}

function downloadItem(path) {
  const a = document.createElement('a');
  a.href = '/api/download?path=' + encodeURIComponent(path);
  a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function createFolderOnBackend(parent, name) {
  const fp = parent ? parent + '/' + name : name;
  await api('POST', '/api/mkdir?path=' + encodeURIComponent(fp));
  await refreshTree();
}
async function createFileOnBackend(parent, name) {
  const fp = parent ? parent + '/' + name : name;
  // upload empty file
  await api('POST', '/api/upload?dir=' + encodeURIComponent(parent || ''),
    new File([new Blob([''], { type: 'text/plain' })], name));
  await refreshTree();
  await refreshStorage();
}

/* ================================================================== */
/*  INLINE RENAME  (VS Code style)                                     */
/* ================================================================== */
/**
 * Start inline rename on a tree row.
 * opts: { isNew, isDir, parentPath? }
 *   isNew=true  → ghost row; on confirm → create; on cancel → remove row
 *   isNew=false → real row; on confirm → rename; on cancel → restore name
 */
function startInlineRename(row, opts) {
  opts = opts || {};
  const isNew = opts.isNew || false;
  const isDir = opts.isDir || false;
  const parentPath = opts.parentPath || '';
  const oldName = row.dataset.name;

  const nameSpan = row.querySelector('.tree-name');
  const input = document.createElement('input');
  input.className = 'tree-inline-input';
  input.value = oldName;

  // Size the input to match the text width roughly
  const style = getComputedStyle(nameSpan);
  input.style.font = style.font;
  input.style.fontSize = style.fontSize;
  input.style.color = style.color;
  input.style.width = '100%';
  input.style.minWidth = '60px';

  nameSpan.replaceWith(input);
  row.classList.add('editing');

  // Select name without extension for files (unless it's a new item)
  if (!isDir && oldName) {
    const dot = oldName.lastIndexOf('.');
    if (dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  } else {
    input.select();
  }
  input.focus();

  let committed = false;

  const commit = async () => {
    if (committed) return;
    committed = true;

    const newName = input.value.trim();
    // Restore span
    input.replaceWith(nameSpan);
    row.classList.remove('editing');
    nameSpan.textContent = newName || oldName;

    if (isNew) {
      // Ghost row — create or remove
      if (!newName) {
        row.remove();
        row.nextElementSibling?.classList.contains('tree-children') && row.nextElementSibling.remove();
        return;
      }
      try {
        if (isDir) await createFolderOnBackend(parentPath, newName);
        else await createFileOnBackend(parentPath, newName);
      } catch (err) { alert('Create failed: ' + err.message); }
      // row will be replaced by refreshTree
      await refreshTree();
      return;
    }

    // Real row — rename
    if (!newName || newName === oldName) return;
    try {
      await api('POST', '/api/rename?path=' + encodeURIComponent(oldName) +
                      '&name=' + encodeURIComponent(newName));
      if (selected && selected.path === oldName) {
        const parts = oldName.split('/');
        parts[parts.length - 1] = newName;
        selected.path = parts.join('/');
      }
      await refreshTree();
    } catch (err) { alert('Rename failed: ' + err.message); }
  };

  const cancel = () => {
    if (committed) return;
    committed = true;
    input.replaceWith(nameSpan);
    row.classList.remove('editing');
    nameSpan.textContent = oldName;

    if (isNew) {
      row.remove();
      row.nextElementSibling?.classList.contains('tree-children') && row.nextElementSibling.remove();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });

  input.addEventListener('blur', () => {
    // Small delay so context-menu clicks don't trigger blur commit
    setTimeout(() => { if (!committed) commit(); }, 120);
  });
}

/* ================================================================== */
/*  INLINE CREATE  — insert ghost row into the tree                    */
/* ================================================================== */
function insertGhostRow(parentPath, isDir) {
  const placeholder = isDir ? 'New Folder' : 'New File';
  const path = (parentPath ? parentPath + '/' : '') + placeholder;

  const ghostItem = {
    name: placeholder,
    path: path,
    is_dir: isDir,
    children: [],
    _ghost: true,
  };

  const row = makeTreeRow(ghostItem, 0); // depth doesn't matter, will be replaced on refresh
  row.dataset.path = path;
  row.dataset.name = placeholder;
  row.dataset.ghost = '1';

  // Insert at top of tree root (or find the parent container)
  let container = treeRoot;

  // If parentPath is not empty, find the parent's children container
  if (parentPath) {
    const parentRow = $(`.tree-row[data-path="${CSS.escape(parentPath)}"]`);
    if (parentRow) {
      // ensure parent is expanded
      const children = parentRow.nextElementSibling;
      if (children && children.classList.contains('tree-children')) {
        if (children.style.display === 'none') {
          children.style.display = '';
          const toggle = parentRow.querySelector('.tree-toggle');
          const icon = parentRow.querySelector('.tree-icon');
          if (toggle) toggle.classList.replace('codicon-chevron-right', 'codicon-chevron-down');
          if (icon) icon.className = 'tree-icon ' + folderIconCls(true);
          expandingDirs.add(parentPath);
        }
        container = children;
      }
    }
  }

  // Insert at beginning
  container.insertBefore(row, container.firstChild);

  // Scroll into view
  row.scrollIntoView({ block: 'nearest' });

  // Start rename immediately
  startInlineRename(row, { isNew: true, isDir, parentPath });
}

/* ================================================================== */
/*  Context menu                                                       */
/* ================================================================== */
function showContextMenu(x, y, target) {
  // target = null means empty area
  $$('.ctx-item', ctxMenu).forEach(el => {
    const onlyFile = el.dataset.onlyFile !== undefined;
    const onlyDir  = el.dataset.onlyDir !== undefined;
    const forItem  = el.dataset.forItem !== undefined;
    const forEmpty = el.dataset.forEmpty !== undefined;

    el.style.display = '';

    if (target === null) {
      // Empty area: only show items with forEmpty
      if (!forEmpty && forItem !== undefined) el.style.display = 'none';
      return;
    }
    // Item menu: hide empty-area items
    if (forEmpty && forItem === undefined) { el.style.display = 'none'; return; }
    if (onlyFile && target.is_dir) { el.style.display = 'none'; return; }
    if (onlyDir  && !target.is_dir) { el.style.display = 'none'; return; }
  });

  // Position
  ctxMenu.style.display = '';
  const mw = ctxMenu.offsetWidth  || 180;
  const mh = ctxMenu.offsetHeight || 260;
  ctxMenu.style.left = (x + mw > window.innerWidth  ? x - mw : x) + 'px';
  ctxMenu.style.top  = (y + mh > window.innerHeight ? y - mh : y) + 'px';
}

function hideContextMenu() { ctxMenu.style.display = 'none'; }

ctxMenu.addEventListener('click', async (e) => {
  const el = e.target.closest('.ctx-item');
  if (!el) return;
  const action = el.dataset.action;
  const target = ctxTarget;

  hideContextMenu();

  // Empty-area actions
  if (target === null) {
    switch (action) {
      case 'new-file': insertGhostRow(activeDir, false); break;
      case 'new-folder': insertGhostRow(activeDir, true); break;
      case 'refresh': await refreshTree(); await refreshStorage(); break;
    }
    return;
  }

  const parent = target.is_dir ? target.path : target.path.split('/').slice(0, -1).join('/');
  const row = $(`.tree-row[data-path="${CSS.escape(target.path)}"]`);

  switch (action) {
    case 'new-file':
      insertGhostRow(parent, false);
      break;
    case 'new-folder':
      insertGhostRow(parent, true);
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
      if (row && !target._ghost) startInlineRename(row, { isNew: false, isDir: target.is_dir });
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

/* --- close context menu on any outside mousedown / click --- */
document.addEventListener('mousedown', (e) => {
  if (!ctxMenu.contains(e.target)) hideContextMenu();
});
document.addEventListener('contextmenu', (e) => {
  if (!ctxMenu.contains(e.target)) hideContextMenu();
});

/* ================================================================== */
/*  Modal (kept for simple alerts)                                     */
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
$('#btn-new-file')?.addEventListener('click', () => insertGhostRow(activeDir, false));
$('#btn-new-folder')?.addEventListener('click', () => insertGhostRow(activeDir, true));
$('#btn-refresh')?.addEventListener('click', async () => { await refreshTree(); await refreshStorage(); });
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
    e.preventDefault(); deleteItem(selected.path);
  }
  // F2 → inline rename selected
  if (e.key === 'F2' && selected && document.activeElement === document.body) {
    e.preventDefault();
    const row = $(`.tree-row[data-path="${CSS.escape(selected.path)}"]`);
    if (row && !row.dataset.ghost) startInlineRename(row, { isNew: false, isDir: selected.is_dir });
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
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case 'file_added': case 'file_deleted': case 'file_moved': case 'file_renamed':
        refreshTree(); refreshStorage(); break;
      case 'user_count':
        userCountEl.textContent = msg.count + ' online'; break;
    }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onerror = () => ws.close();
}

/* ================================================================== */
/*  Init                                                               */
/* ================================================================== */
(async () => {
  await refreshTree();
  await refreshStorage();
  connectWS();
})();
