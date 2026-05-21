/* Upload with progress */
/* ================================================================== */
/*  Upload  (with progress)                                            */
/* ================================================================== */
function uploadTargetDir() {
  if (!FileShare.selected) return '';
  if (FileShare.selected.is_dir) return FileShare.selected.path;
  const parts = FileShare.selected.path.split('/');
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
  if (FileShare._uploading) {
    alert('Upload in progress — please wait for current upload to finish.');
    return;
  }
  FileShare._uploading = true;
  try {
    dir = dir || uploadTargetDir() || '';
    sidebarDropIn.style.display = 'none';
    uploadProg.style.display = '';
    progressFill.style.width = '0%';
    for (let i = 0; i < files.length; i++) {
      progressText.textContent = files[i].name + '  (0%)';
      try { await uploadWithProgress(files[i], dir); }
      catch (err) { alert('Upload failed: ' + err.message); break; }
    }
  } finally {
    uploadProg.style.display = 'none';
    sidebarDropIn.style.display = '';
    await refreshTree();
    await refreshStorage();
    FileShare._uploading = false;
  }
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
