/* Shared application state */
var FileShare = {
  treeData: [],
  selected: null,       // { path, is_dir }
  activeDir: '',        // current upload target directory
  ctxTarget: null,      // context menu target, null = empty area
  dragSource: null,     // { path, is_dir, name } being dragged
  _uploading: false,
};
