/* Main entry point: toolbar, keyboard, init */
/* ================================================================== */
/*  Toolbar buttons                                                    */
/* ================================================================== */
$('#btn-new-file').addEventListener('click',   () => insertGhostRow(FileShare.activeDir, false));
$('#btn-new-folder').addEventListener('click', () => insertGhostRow(FileShare.activeDir, true));
$('#btn-upload').addEventListener('click',     () => fileInput.click());
$('#btn-refresh').addEventListener('click',    async () => { await refreshTree(); await refreshStorage(); });
$('#btn-download').addEventListener('click',   () => {
  if (FileShare.selected && !FileShare.selected.is_dir) downloadItem(FileShare.selected.path);
});
$('#btn-delete').addEventListener('click',     () => {
  if (FileShare.selected) deleteItem(FileShare.selected.path);
});

/* ================================================================== */
/*  Deselect on click outside tree                                     */
/* ================================================================== */
document.addEventListener('click', (e) => {
  if (!FileShare.selected) return;
  const t = e.target;
  if (t.closest('.tree-row') || t.closest('#sidebar-header') ||
      t.closest('#sidebar-drop-zone') || t.closest('#ctx-menu') ||
      t.closest('#sidebar-scroll.root-selected')) return;
  clearSelection();
  FileShare.selected = null;
  FileShare.activeDir = '';
  breadcrumb.textContent = '';
});

/* ================================================================== */
/*  Keyboard shortcuts                                                 */
/* ================================================================== */
document.addEventListener('keydown', (e) => {
  if (!FileShare.selected || document.activeElement !== document.body) return;

  if (e.key === 'Delete') { e.preventDefault(); deleteItem(FileShare.selected.path); return; }
  if (e.key === 'F2') {
    e.preventDefault();
    const row = $(`.tree-row[data-path="${CSS.escape(FileShare.selected.path)}"]`);
    if (row && !row.dataset.ghost) startInlineRename(row, { isNew: false, isDir: FileShare.selected.is_dir });
    return;
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    navigator.clipboard.writeText(FileShare.selected.path).catch(() => {});
  }
});

/* ================================================================== */
/*  Init                                                               */
/* ================================================================== */
window.addEventListener('beforeunload', (e) => {
  if (FileShare._uploading) {
    e.preventDefault();
    e.returnValue = '';
  }
});

(async () => {
  await refreshTree();
  await refreshStorage();
  connectWS();
})();
