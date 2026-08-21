require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { OBSWebSocket } = require('obs-websocket-js');
const mm = require('music-metadata');

const PORT = process.env.PORT || 3000;
const OBS_WS_URL = process.env.OBS_WS_URL || 'ws://127.0.0.1:4455';
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD || '';
const WATCH_SOURCES = (process.env.OBS_MEDIA_SOURCE_NAMES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---- Express + Socket.IO のセットアップ ----
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// サーバー内の状態（新規接続者にはこれを送る）
let state = {
  connectedToOBS: false,
  nowPlaying: null, // { title, artist, sourceName, filePath, startedAt }
  history: [], // 再生履歴（新しい順）
};

app.get('/api/state', (req, res) => res.json(state));

io.on('connection', (socket) => {
  socket.emit('state', state);
});

function broadcastState() {
  io.emit('state', state);
}

// ---- ファイルパスから曲名/アーティストを推定する ----
async function extractTrackInfo(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  let title = base;
  let artist = '';

  try {
    const meta = await mm.parseFile(filePath, { duration: false });
    if (meta.common.title) title = meta.common.title;
    if (meta.common.artist) artist = meta.common.artist;
  } catch (err) {
    // タグが読めない場合はファイル名をそのまま使う
    // 「アーティスト - 曲名.mp3」のような命名規則にも簡易対応
    const m = base.match(/^(.+?)\s*-\s*(.+)$/);
    if (m) {
      artist = m[1].trim();
      title = m[2].trim();
    }
  }

  return { title, artist };
}

// ---- OBS WebSocket 接続 ----
const obs = new OBSWebSocket();
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return; // 二重にタイマーを立てない
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectOBS();
  }, 5000);
}

async function connectOBS() {
  try {
    await obs.connect(OBS_WS_URL, OBS_WS_PASSWORD || undefined);
    state.connectedToOBS = true;
    console.log(`[OBS] 接続成功: ${OBS_WS_URL}`);
    broadcastState();
  } catch (err) {
    state.connectedToOBS = false;
    console.error('[OBS] 接続失敗。5秒後に再試行します:', err.message);
    broadcastState();
    scheduleReconnect();
  }
}

function isWatchedSource(inputName) {
  if (WATCH_SOURCES.length === 0) return true; // 未指定なら全メディアソースを監視
  return WATCH_SOURCES.includes(inputName);
}

// 曲の再生が始まったタイミングで発火
obs.on('MediaInputPlaybackStarted', async ({ inputName }) => {
  if (!isWatchedSource(inputName)) return;

  try {
    const { inputSettings } = await obs.call('GetInputSettings', { inputName });
    const filePath = inputSettings.local_file || inputSettings.input || '';
    if (!filePath) return;

    const { title, artist } = await extractTrackInfo(filePath);

    const track = {
      title,
      artist,
      sourceName: inputName,
      filePath,
      startedAt: new Date().toISOString(),
    };

    state.nowPlaying = track;
    state.history.unshift(track);
    if (state.history.length > 300) state.history.pop();

    console.log(`[NowPlaying] ${artist ? artist + ' - ' : ''}${title}`);
    broadcastState();
  } catch (err) {
    console.error('[OBS] メディア情報の取得に失敗:', err.message);
  }
});

// 再生が終わった/停止した場合
obs.on('MediaInputPlaybackEnded', ({ inputName }) => {
  if (!isWatchedSource(inputName)) return;
  if (state.nowPlaying && state.nowPlaying.sourceName === inputName) {
    state.nowPlaying = null;
    broadcastState();
  }
});

obs.on('ConnectionClosed', () => {
  if (!state.connectedToOBS) return; // すでに未接続処理済みなら何もしない
  state.connectedToOBS = false;
  broadcastState();
  console.log('[OBS] 接続が切断されました。再接続します...');
  scheduleReconnect();
});

connectOBS();

server.listen(PORT, () => {
  console.log(`視聴者ページ: http://localhost:${PORT}`);
});
