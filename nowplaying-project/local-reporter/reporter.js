require('dotenv').config();

const VLC_HOST = process.env.VLC_HOST || 'http://localhost:8080';
const VLC_PASSWORD = process.env.VLC_PASSWORD || '';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const UPDATE_SECRET = process.env.UPDATE_SECRET || 'change-me-please';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3000);

if (typeof fetch !== 'function') {
  console.error('Node.js 18以上が必要です(組み込みのfetchを使用しています)。');
  process.exit(1);
}

let lastSentKey = null;

// ファイル名から拡張子を取り除くだけの簡易処理(タイトルタグが無いときのフォールバック用)
function stripExtension(filename) {
  if (!filename) return null;
  return filename.replace(/\.[^/.]+$/, '');
}

function parseTrack(vlcStatus) {
  const state = vlcStatus.state; // "playing" | "paused" | "stopped" など
  const meta = vlcStatus?.information?.category?.meta || {};

  const title = meta.title || stripExtension(meta.filename) || null;
  const artist = meta.artist || null;
  const album = meta.album || null;

  let normalizedState = 'offline';
  if (state === 'playing') normalizedState = 'playing';
  else if (state === 'paused') normalizedState = 'paused';
  else if (title) normalizedState = 'paused'; // 曲は読み込まれているが再生停止中など

  return { title, artist, album, state: normalizedState };
}

async function fetchVlcStatus() {
  const auth = Buffer.from(`:${VLC_PASSWORD}`).toString('base64');
  const res = await fetch(`${VLC_HOST}/requests/status.json`, {
    headers: { Authorization: `Basic ${auth}` }
  });

  if (!res.ok) {
    throw new Error(`VLCへの接続に失敗しました (HTTP ${res.status}) — Webインターフェースのパスワードを確認してください`);
  }

  return res.json();
}

async function sendUpdate(track) {
  const res = await fetch(`${SERVER_URL}/api/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-update-secret': UPDATE_SECRET
    },
    body: JSON.stringify(track)
  });

  if (!res.ok) {
    throw new Error(`サーバーへの送信に失敗しました (HTTP ${res.status})`);
  }
}

async function tick() {
  let track;

  try {
    const status = await fetchVlcStatus();
    track = parseTrack(status);
  } catch (err) {
    // VLCが起動していない/接続できない場合は「オフライン」として扱う
    track = { title: null, artist: null, album: null, state: 'offline' };
  }

  const key = JSON.stringify(track);
  if (key === lastSentKey) return; // 変化がなければ何もしない(無駄な通信を避ける)

  try {
    await sendUpdate(track);
    lastSentKey = key;
    const label = track.title ? `${track.artist ? track.artist + ' - ' : ''}${track.title}` : '(再生なし)';
    console.log(`[${new Date().toLocaleTimeString()}] 更新: ${track.state} / ${label}`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] 送信エラー:`, err.message);
  }
}

console.log('Now Playing ローカル通知スクリプトを開始します');
console.log(`  VLC   : ${VLC_HOST}`);
console.log(`  サーバー: ${SERVER_URL}`);
console.log(`  間隔  : ${POLL_INTERVAL_MS}ms\n`);

tick();
setInterval(tick, POLL_INTERVAL_MS);
