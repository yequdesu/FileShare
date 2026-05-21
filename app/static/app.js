/* ------------------------------------------------------------------ */
/*  DOM refs                                                          */
/* ------------------------------------------------------------------ */
const $  = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

const treeRoot      = $('#tree-root');
const sidebarScroll = $('#sidebar-scroll');
const sidebarDrop   = $('#sidebar-drop-zone');
const uploadProg    = $('#upload-progress');
const progressFill  = $('#upload-progress-fill');
const progressText  = $('#upload-progress-text');
const sidebarDropIn = $('#sidebar-drop-inner');
const fileInput     = $('#file-input');
const previewFrame  = $('#preview-frame');
const fileActions   = $('#file-actions');
const breadcrumb    = $('#selected-breadcrumb');
const userCountEl   = $('#user-count');
const storageBar    = $('#storage-bar-fill');
const storageText   = $('#storage-text');
const ctxMenu       = $('#ctx-menu');

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
let treeData   = [];
let selected   = null;       // { path, is_dir }
let activeDir  = '';         // current upload target directory
let ws         = null;
let ctxTarget  = null;       // context menu target, null = empty area
let dragSource = null;       // { path, is_dir, name } being dragged

/* ================================================================== */
/*  ICONS  (VS Code codicons)                                          */
/* ================================================================== */
const FILE_ICONS = {
  md:       'markdown',     py:       'file-code',
  js:       'file-code',    ts:       'file-code',
  jsx:      'react',        tsx:      'react',
  vue:      'file-code',    svelte:   'file-code',
  html:     'html',         htm:      'html',
  css:      'css',          scss:     'css',       less: 'css',
  json:     'json',         xml:      'xml',
  yml:      'settings',     yaml:     'settings',  toml: 'settings',
  cfg:      'settings',     ini:      'settings',  env:  'settings',
  lock:     'lock',
  svg:      'file-media',   png:      'file-media',jpg:  'file-media',
  jpeg:     'file-media',   gif:      'file-media',webp: 'file-media',
  ico:      'file-media',   bmp:      'file-media',
  zip:      'file-zip',     tar:      'file-zip',  gz:   'file-zip',
  bz2:      'file-zip',     '7z':     'file-zip',  rar:  'file-zip',
  pdf:      'file-pdf',
  txt:      'file-text',    log:      'file-text',
  sh:       'terminal',     bash:     'terminal',
  dockerfile: 'docker',
  gitignore:  'git-ignore',
};

function iconClass(name, isDir) {
  if (isDir) return 'codicon codicon-folder folder-icon';
  const ext = name.split('.').pop().toLowerCase();
  return `codicon codicon-${FILE_ICONS[ext] || 'file'} file-icon`;
}

function folderIcon(open) {
  return open ? 'codicon codicon-folder-opened folder-icon open'
              : 'codicon codicon-folder folder-icon';
}

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

  /* toggle arrow */
  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle codicon';
  toggle.classList.add(item.is_dir ? 'codicon-chevron-right' : 'empty');
  row.appendChild(toggle);

  /* icon */
  const icon = document.createElement('span');
  icon.className = 'tree-icon ' + iconClass(item.name, item.is_dir);
  row.appendChild(icon);

  /* name */
  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = item.name;
  name.title = item.name;
  row.appendChild(name);

  /* ghost style */
  if (item._ghost) { row.style.opacity = '0.7'; row.style.fontStyle = 'italic'; }

  /* click → select / toggle */
  row.addEventListener('click', (e) => {
    if (row.classList.contains('editing')) return;
    e.stopPropagation();
    if (item.is_dir) toggleFolder(row, item);
    selectItem(item.path, item.is_dir);
  });

  /* dblclick → preview file */
  if (!item.is_dir) {
    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      showPreview(item.path);
    });
  }

  /* drag source */
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

  /* drop target */
  row.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragSource) return;
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', (e) => { e.stopPropagation(); row.classList.remove('drag-over'); });
  row.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    row.classList.remove('drag-over');
    if (dragSource && e.dataTransfer.files.length === 0) return doTreeDrop(item, dragSource);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, item.is_dir ? item.path : '');
  });

  /* right-click context menu */
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
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  sidebarScroll.classList.add('drag-over-area');
});
sidebarScroll.addEventListener('dragleave', () => sidebarScroll.classList.remove('drag-over-area'));
sidebarScroll.addEventListener('drop', (e) => {
  sidebarScroll.classList.remove('drag-over-area');
  if (!dragSource) return;
  e.preventDefault();
  doTreeDrop({ is_dir: true, path: '' }, dragSource);
});

/* --- empty-area right-click → context menu, click → select root --- */
sidebarScroll.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.tree-row')) return;
  e.preventDefault();
  selectRoot();
  ctxTarget = null;
  showContextMenu(e.clientX, e.clientY, null);
});
sidebarScroll.addEventListener('click', (e) => {
  if (e.target.closest('.tree-row')) return;
  selectRoot();
});

/* ================================================================== */
/*  Tree drop logic                                                    */
/* ================================================================== */
async function doTreeDrop(target, source) {
  if (!source || source.path === target.path) return;
  if (target.is_dir && target.path && target.path.startsWith(source.path + '/')) return;

  const destDir = target.is_dir ? (target.path || '') : target.path.split('/').slice(0, -1).join('/');
  const newPath = (destDir ? destDir + '/' : '') + source.name;
  if (newPath === source.path) return;

  try {
    await api('POST', '/api/move?src=' + encodeURIComponent(source.path) + '&dst=' + encodeURIComponent(newPath));
    await refreshTree();
  } catch (err) { alert('Move failed: ' + err.message); }
}

/* ================================================================== */
/*  Selection helpers                                                  */
/* ================================================================== */
function clearSelection() {
  $$('.tree-row.active').forEach(el => el.classList.remove('active'));
  sidebarScroll.classList.remove('root-selected');
  fileActions.style.display = 'none';
  previewFrame.style.display = 'none';
}

function selectRoot() {
  clearSelection();
  selected = { path: '', is_dir: true };
  activeDir = '';
  sidebarScroll.classList.add('root-selected');
  breadcrumb.textContent = '/ (root)';
}

function selectItem(path, isDir) {
  clearSelection();
  selected = { path, is_dir: isDir };
  activeDir = isDir ? path : '';
  const el = $(`.tree-row[data-path="${CSS.escape(path)}"]`);
  if (el) el.classList.add('active');
  if (isDir) {
    breadcrumb.textContent = path || '/ (root)';
  } else {
    fileActions.style.display = '';
    breadcrumb.textContent = path;
    showPreview(path);
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
    icon.className = 'tree-icon ' + folderIcon(true);
  } else {
    children.style.display = 'none';
    toggle.classList.replace('codicon-chevron-down', 'codicon-chevron-right');
    icon.className = 'tree-icon ' + folderIcon(false);
  }
}

/* ================================================================== */
/*  Preview                                                            */
/* ================================================================== */
function showPreview(path) {
  previewFrame.style.display = '';
  previewFrame.src = '/api/preview?path=' + encodeURIComponent(path);
}

/* ================================================================== */
/*  Upload  (with progress)                                            */
/* ================================================================== */
function uploadTargetDir() {
  if (!selected) return '';
  if (selected.is_dir) return selected.path;
  const parts = selected.path.split('/');
  parts.pop();
  return parts.join('/');
}

function uploadWithProgress(file, dir) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload?dir=' + encodeURIComponent(dir || ''));
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = file.name + '  ' + pct + '%';
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || xhr.statusText));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.send(fd);
  });
}

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

/* sidebar drop zone */
sidebarDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  sidebarDrop.classList.add('drag-over');
});
sidebarDrop.addEventListener('dragleave', (e) => {
  e.stopPropagation();
  sidebarDrop.classList.remove('drag-over');
});
sidebarDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  sidebarDrop.classList.remove('drag-over');
  if (e.dataTransfer.files.length) {
    uploadFiles(e.dataTransfer.files);
  }
});
sidebarDrop.addEventListener('click', () => fileInput.click());

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
    if (selected && selected.path === path) selectRoot();
    await refreshTree();
    await refreshStorage();
  } catch (err) { alert('Delete failed: ' + err.message); }
}

function downloadItem(path) {
  const a = document.createElement('a');
  a.href = '/api/download?path=' + encodeURIComponent(path);
  a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ================================================================== */
/*  Backend creation helpers                                           */
/* ================================================================== */
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

/* ================================================================== */
/*  INLINE RENAME  (VS Code style)                                     */
/* ================================================================== */
function startInlineRename(row, opts) {
  opts = opts || {};
  const isNew      = opts.isNew || false;
  const isDir      = opts.isDir || false;
  const parentPath = opts.parentPath || '';
  const oldName    = row.dataset.name;

  const nameSpan = row.querySelector('.tree-name');
  const input = document.createElement('input');
  input.className = 'tree-inline-input';
  input.value = oldName;

  nameSpan.replaceWith(input);
  row.classList.add('editing');

  if (!isDir && oldName) {
    const dot = oldName.lastIndexOf('.');
    if (dot > 0) input.setSelectionRange(0, dot); else input.select();
  } else {
    input.select();
  }
  input.focus();

  let committed = false;

  const commit = async () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    input.replaceWith(nameSpan);
    row.classList.remove('editing');
    nameSpan.textContent = newName || oldName;

    if (isNew) {
      if (!newName || newName === 'New File' || newName === 'New Folder') { row.remove(); return; }
      try {
        if (isDir) await createDir(parentPath, newName);
        else       await createEmptyFile(parentPath, newName);
      } catch (err) { alert('Create failed: ' + err.message); }
      await refreshTree();
      return;
    }

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
    if (isNew) row.remove();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', () => { setTimeout(() => { if (!committed) commit(); }, 120); });
}

/* ================================================================== */
/*  INLINE CREATE  — insert ghost row into tree                        */
/* ================================================================== */
function insertGhostRow(parentPath, isDir) {
  const placeholder = isDir ? 'New Folder' : 'New File';

  const ghostItem = {
    name: placeholder,
    path: (parentPath ? parentPath + '/' : '') + placeholder,
    is_dir: isDir,
    children: [],
    _ghost: true,
  };

  const row = makeTreeRow(ghostItem, 0);
  row.dataset.path = ghostItem.path;
  row.dataset.name = placeholder;
  row.dataset.ghost = '1';

  let container = treeRoot;
  if (parentPath) {
    const parentRow = $(`.tree-row[data-path="${CSS.escape(parentPath)}"]`);
    if (parentRow) {
      const children = parentRow.nextElementSibling;
      if (children && children.classList.contains('tree-children')) {
        if (children.style.display === 'none') {
          children.style.display = '';
          const toggle = parentRow.querySelector('.tree-toggle');
          const icon   = parentRow.querySelector('.tree-icon');
          if (toggle) toggle.classList.replace('codicon-chevron-right', 'codicon-chevron-down');
          if (icon)   icon.className = 'tree-icon ' + folderIcon(true);
        }
        container = children;
      }
    }
  }

  container.insertBefore(row, container.firstChild);
  row.scrollIntoView({ block: 'nearest' });
  startInlineRename(row, { isNew: true, isDir, parentPath });
}

/* ================================================================== */
/*  Context menu                                                       */
/* ================================================================== */
function showContextMenu(x, y, target) {
  $$('.ctx-item', ctxMenu).forEach(el => {
    const onlyFile = el.dataset.onlyFile !== undefined;
    const onlyDir  = el.dataset.onlyDir !== undefined;
    const forItem  = el.dataset.forItem !== undefined;
    const forEmpty = el.dataset.forEmpty !== undefined;

    el.style.display = '';

    if (target === null) {
      if (!forEmpty) el.style.display = 'none';
      return;
    }
    if (forEmpty && !forItem) { el.style.display = 'none'; return; }
    if (onlyFile && target.is_dir) { el.style.display = 'none'; return; }
    if (onlyDir  && !target.is_dir)  { el.style.display = 'none'; return; }
  });

  $$('.ctx-sep', ctxMenu).forEach(sep => { sep.style.display = (target === null) ? 'none' : ''; });

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

  if (target === null) {
    switch (action) {
      case 'new-file':   insertGhostRow(activeDir, false); break;
      case 'new-folder': insertGhostRow(activeDir, true);  break;
      case 'upload':     fileInput.click();                      break;
      case 'refresh':    await refreshTree(); await refreshStorage(); break;
    }
    return;
  }

  const parent = target.is_dir ? target.path : target.path.split('/').slice(0, -1).join('/');
  const row = $(`.tree-row[data-path="${CSS.escape(target.path)}"]`);

  switch (action) {
    case 'new-file':    insertGhostRow(parent, false);              break;
    case 'new-folder':  insertGhostRow(parent, true);               break;
    case 'open':        if (!target.is_dir) showPreview(target.path); break;
    case 'download':    if (!target.is_dir) downloadItem(target.path); break;
    case 'upload-here': if (target.is_dir) { activeDir = target.path; selectItem(target.path, true); fileInput.click(); } break;
    case 'rename':      if (row && !target._ghost) startInlineRename(row, { isNew: false, isDir: target.is_dir }); break;
    case 'delete':      deleteItem(target.path);                    break;
    case 'copy-path':     navigator.clipboard.writeText(target.path).catch(() => {}); break;
    case 'copy-rel-path': navigator.clipboard.writeText(target.name).catch(() => {}); break;
  }
});

document.addEventListener('mousedown',   (e) => { if (!ctxMenu.contains(e.target)) hideContextMenu(); });
/* ================================================================== */
/*  Deselect on click outside tree                                     */
/* ================================================================== */
document.addEventListener('click', (e) => {
  if (!selected) return;
  const t = e.target;
  if (t.closest('.tree-row') || t.closest('#sidebar-header') ||
      t.closest('#sidebar-drop-zone') || t.closest('#ctx-menu') ||
      t.closest('#sidebar-scroll.root-selected')) return;
  clearSelection();
  selected = null;
  activeDir = '';
  breadcrumb.textContent = '';
});

/* ================================================================== */
/*  Toolbar buttons                                                    */
/* ================================================================== */
$('#btn-new-file').addEventListener('click',   () => insertGhostRow(activeDir, false));
$('#btn-new-folder').addEventListener('click', () => insertGhostRow(activeDir, true));
$('#btn-upload').addEventListener('click',     () => fileInput.click());
$('#btn-refresh').addEventListener('click',    async () => { await refreshTree(); await refreshStorage(); });
$('#btn-download').addEventListener('click',   () => { if (selected && !selected.is_dir) downloadItem(selected.path); });
$('#btn-delete').addEventListener('click',     () => { if (selected) deleteItem(selected.path); });

/* ================================================================== */
/*  Keyboard shortcuts                                                 */
/* ================================================================== */
document.addEventListener('keydown', (e) => {
  if (!selected || document.activeElement !== document.body) return;

  if (e.key === 'Delete') { e.preventDefault(); deleteItem(selected.path); return; }
  if (e.key === 'F2') {
    e.preventDefault();
    const row = $(`.tree-row[data-path="${CSS.escape(selected.path)}"]`);
    if (row && !row.dataset.ghost) startInlineRename(row, { isNew: false, isDir: selected.is_dir });
    return;
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
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
