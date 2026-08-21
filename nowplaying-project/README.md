# 配信 Now Playing 表示システム

VLCで再生している曲を、配信とは独立したWebページでリアルタイムに視聴者へ表示するシステムです。

```
[VLC] --(HTTPインターフェース)--> [local-reporter] --(HTTPS)--> [server] --(WebSocket)--> [視聴者のブラウザ]
 (配信者のPC内だけ)                  (配信者のPC)              (公開ホスティング)         (誰でもURLでアクセス可)
```

- **server/** … 公開サーバー。デプロイして視聴者に共有するURLはここ。
- **local-reporter/** … 配信者のPCで動かす通知スクリプト。VLCを監視して server に送る。

---

## 1. VLCの設定(配信者のPCで1回だけ)

1. VLCを開く → メニューの「ツール」→「設定」
2. 左下「設定の表示」を **すべて** に切り替える
3. 左側ツリーで「インターフェース」→「メインインターフェース」を開き、**「Web」にチェック**
4. 同じく「インターフェース」→「メインインターフェース」→「Lua」を開き、**「Lua HTTP」のパスワード**を好きな文字列に設定
5. VLCを再起動

確認方法: ブラウザで `http://localhost:8080/` を開き、ユーザー名は空欄・パスワードは設定したものでログインできればOKです。

---

## 2. 公開サーバー(server/)のセットアップ

### ローカルで動作確認する場合

```bash
cd server
npm install
cp .env.example .env
# .env を開いて UPDATE_SECRET を好きなランダム文字列に変更する
npm start
```

`http://localhost:3000` を開けば、視聴者用ページが表示されます(まだ曲情報が来ていないので「曲情報を待っています…」と出ます)。

### 実際に視聴者に公開する場合

視聴者に見てもらうには、どこかインターネット上のサーバーにデプロイする必要があります。無料枠で手軽に始められるのは以下のようなサービスです。

- **Render** (render.com) … GitHubリポジトリを繋いで「Web Service」として登録するだけで動きます
- **Railway** (railway.app) … 同様にGit連携でデプロイ可能
- お使いのVPSがあれば `pm2` などで常駐させてもOKです

デプロイ先の環境変数に `UPDATE_SECRET` を設定するのを忘れないでください(local-reporter側と同じ値にする必要があります)。

デプロイが終わったら、割り当てられたURL(例: `https://your-app.onrender.com`)が視聴者に共有するURLです。

---

## 3. ローカル通知スクリプト(local-reporter/)のセットアップ

配信者のPC(VLCが動いているPC)で実行します。

```bash
cd local-reporter
npm install
cp .env.example .env
```

`.env` を開いて以下を設定:

- `VLC_PASSWORD` … 手順1で設定したVLCのパスワード
- `UPDATE_SECRET` … server側の `.env` と**同じ値**
- `SERVER_URL` … デプロイした公開サーバーのURL(例: `https://your-app.onrender.com`)

設定できたら起動:

```bash
npm start
```

VLCで曲を再生・一時停止すると、コンソールに更新ログが出て、公開ページにも反映されます。配信中はこのスクリプトを起動しっぱなしにしておいてください。

---

## 4. OBSのオーバーレイとしても使いたい場合

公開ページのURL(`https://your-app.onrender.com`)をそのままOBSの「ブラウザソース」に追加すれば、配信画面にも同じ表示を重ねられます。背景を透過させたい場合は `public/index.html` の `body` の `background` を `transparent` に変更してください。

---

## 5. セキュリティについて

- `UPDATE_SECRET` は「誰でも曲情報を書き換えられてしまう」ことを防ぐための合言葉です。第三者に推測されない長い文字列にしてください。
- VLCのWebインターフェースはローカル(`localhost`)からしかアクセスできない前提です。ルーターの設定でポート8080を外部公開しないよう注意してください。
