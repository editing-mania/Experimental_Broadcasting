require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // 必要に応じて配信サイトのドメインだけに絞ってください
});

// ローカルの通知スクリプトだけがここを叩けるように、秘密の合言葉(トークン)で保護する
const UPDATE_SECRET = process.env.UPDATE_SECRET || 'change-me-please';
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 今流れている曲の状態をメモリ上に保持しておく
// (サーバーが再起動すると消えるが、今回の用途では十分)
let currentTrack = {
  title: null,
  artist: null,
  album: null,
  state: 'offline', // 'playing' | 'paused' | 'offline'
  updatedAt: null
};

// --- ローカルの通知スクリプトから曲情報を受け取るエンドポイント ---
app.post('/api/update', (req, res) => {
  const token = req.headers['x-update-secret'];
  if (token !== UPDATE_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { title, artist, album, state } = req.body;

  currentTrack = {
    title: title || null,
    artist: artist || null,
    album: album || null,
    state: state || 'playing',
    updatedAt: Date.now()
  };

  // 接続中の全視聴者にリアルタイムで配信
  io.emit('nowPlaying', currentTrack);

  res.json({ ok: true });
});

// 現在の状態を取得するAPI(ページ読み込み直後の初期表示用)
app.get('/api/now', (req, res) => {
  res.json(currentTrack);
});

// ヘルスチェック用
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  // つないだ瞬間に今の状態を送ってあげる
  socket.emit('nowPlaying', currentTrack);
});

server.listen(PORT, () => {
  console.log(`Now Playing サーバー起動: http://localhost:${PORT}`);
});
