/* DOM helpers */
var $  = function(sel, ctx) { return (ctx || document).querySelector(sel); };
var $$ = function(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); };

/* DOM refs */
var treeRoot      = $('#tree-root');
var sidebarScroll = $('#sidebar-scroll');
var sidebarDrop   = $('#sidebar-drop-zone');
var uploadProg    = $('#upload-progress');
var progressFill  = $('#upload-progress-fill');
var progressText  = $('#upload-progress-text');
var sidebarDropIn = $('#sidebar-drop-inner');
var fileInput     = $('#file-input');
var previewFrame  = $('#preview-frame');
var fileActions   = $('#file-actions');
var breadcrumb    = $('#selected-breadcrumb');
var userCountEl   = $('#user-count');
var storageBar    = $('#storage-bar-fill');
var storageText   = $('#storage-text');
var ctxMenu       = $('#ctx-menu');

/* Shared application state */
var FileShare = {
  treeData: [],
  selected: null,       // { path, is_dir }
  activeDir: '',        // current upload target directory
  ctxTarget: null,      // context menu target, null = empty area
  dragSource: null,     // { path, is_dir, name } being dragged
  _uploading: false,
};
