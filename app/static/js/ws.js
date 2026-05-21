/* WebSocket manager */
var ws = null;

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
