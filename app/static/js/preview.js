/* Preview panel */
/* ================================================================== */
/*  Preview                                                            */
/* ================================================================== */
function showPreview(path) {
  previewFrame.style.display = '';
  previewFrame.src = '/api/preview?path=' + encodeURIComponent(path);
}
