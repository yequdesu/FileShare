/* Tree rendering, selection, drag/drop, context menu, inline rename */
/* ================================================================== */
/*  ICONS  (VS Code codicons)                                          */
/* ================================================================== */
const FILE_ICONS = {
  puml:     'file-code',    pu:       'file-code',    plantuml: 'file-code',
  mmd:      'file-code',    mermaid:  'file-code',
  dot:      'file-code',    gv:       'file-code',
  d2:       'file-code',    erd:      'file-code',
  md:       'markdown',     py:       'file-code',
  js:       'file-code',    ts:       'file-code',
  jsx:      'react',        tsx:      'react',
  vue:      'file-code',    svelte:   'file-code',
  html:     'file-code',   htm:      'file-code',
  css:      'file-code',   scss:     'file-code', less: 'file-code',
  json:     'json',         xml:      'file-code',
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
  dockerfile: 'file-code',
  gitignore:  'file',
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
  if (FileShare.selected && FileShare.selected.path === item.path) row.classList.add('active');

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
    FileShare.dragSource = { path: item.path, is_dir: item.is_dir, name: item.name };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.path);
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    FileShare.dragSource = null;
    $$('.tree-row.drag-over').forEach(r => r.classList.remove('drag-over'));
  });

  /* drop target */
  row.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!FileShare.dragSource) return;
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', (e) => { e.stopPropagation(); row.classList.remove('drag-over'); });
  row.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    row.classList.remove('drag-over');
    if (FileShare.dragSource && e.dataTransfer.files.length === 0) return doTreeDrop(item, FileShare.dragSource);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, item.is_dir ? item.path : '');
  });

  /* right-click context menu */
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (item.is_dir) toggleFolder(row, item);
    selectItem(item.path, item.is_dir);
    FileShare.ctxTarget = { path: item.path, is_dir: item.is_dir, name: item.name, _ghost: item._ghost };
    showContextMenu(e.clientX, e.clientY, FileShare.ctxTarget);
  });

  return row;
}

/* ================================================================== */
/*  Drop onto empty area → move to root                                */
/* ================================================================== */
sidebarScroll.addEventListener('dragover', (e) => {
  if (!FileShare.dragSource) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  sidebarScroll.classList.add('drag-over-area');
});
sidebarScroll.addEventListener('dragleave', () => sidebarScroll.classList.remove('drag-over-area'));
sidebarScroll.addEventListener('drop', (e) => {
  sidebarScroll.classList.remove('drag-over-area');
  if (!FileShare.dragSource) return;
  e.preventDefault();
  doTreeDrop({ is_dir: true, path: '' }, FileShare.dragSource);
});

/* --- empty-area right-click → context menu, click → select root --- */
sidebarScroll.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.tree-row')) return;
  e.preventDefault();
  selectRoot();
  FileShare.ctxTarget = null;
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
  FileShare.selected = { path: '', is_dir: true };
  FileShare.activeDir = '';
  sidebarScroll.classList.add('root-selected');
  breadcrumb.textContent = '/ (root)';
}

function selectItem(path, isDir) {
  clearSelection();
  FileShare.selected = { path, is_dir: isDir };
  FileShare.activeDir = isDir ? path : '';
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
      if (FileShare.selected && FileShare.selected.path === oldName) {
        const parts = oldName.split('/');
        parts[parts.length - 1] = newName;
        FileShare.selected.path = parts.join('/');
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
  const target = FileShare.ctxTarget;
  hideContextMenu();

  if (target === null) {
    switch (action) {
      case 'new-file':   insertGhostRow(FileShare.activeDir, false); break;
      case 'new-folder': insertGhostRow(FileShare.activeDir, true);  break;
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
    case 'upload-here': if (target.is_dir) { FileShare.activeDir = target.path; selectItem(target.path, true); fileInput.click(); } break;
    case 'rename':      if (row && !target._ghost) startInlineRename(row, { isNew: false, isDir: target.is_dir }); break;
    case 'delete':      deleteItem(target.path);                    break;
    case 'copy-path':     navigator.clipboard.writeText(target.path).catch(() => {}); break;
    case 'copy-rel-path': navigator.clipboard.writeText(target.name).catch(() => {}); break;
  }
});

document.addEventListener('mousedown', (e) => { if (!ctxMenu.contains(e.target)) hideContextMenu(); });
