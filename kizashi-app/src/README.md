# きざし本体（Cloudflare Workers + D1）

現場ルーム・事前問診フォーム・家の間取り手書き共有・前兆現象共有の実装。
単一のCloudflare Worker（静的アセット配信＋API）として構成している。

実装計画・設計判断の詳細は、実装時に作成した計画ドキュメントと
`docs/企画整理.md` セクション4・7・9を参照。

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars
# .dev.vars の INTAKE_ENC_KEY に `openssl rand -base64 32` の出力を設定する
npm run migrate:local
npm run dev
```

`npm run dev` は `wrangler dev` を起動する。ローカルD1（`--local`、Cloudflareアカウント
不要）が自動的に使われる。デフォルトで http://localhost:8787 で起動する。

## ディレクトリ構成

```
src/
├── migrations/
│   ├── 0001_init.sql            D1スキーマ（tools/d1-poc/schema.sqlを流用）
│   └── 0002_add_reporter_name.sql   前兆現象への報告者名追加
├── worker/
│   ├── index.js                fetch()ルーター + scheduled()ハンドラ
│   ├── routes/                  incidents / intake / floorplans / precursors
│   ├── lib/                     roomAuth, crypto（AES-GCM）, db, json, precursorLabels
│   └── scheduled/                purgeExpiredIncidents.js（30日自動削除）
└── public/                      フロントエンド（バニラJS、フレームワーク不使用）
    ├── index.html                タブは「地図／事前問診・間取り／前兆報告」の3つ
    ├── app.js                    ルーム作成/参加、API連携、ポーリング、地図への前兆マーカー表示
    ├── floorplan.js               Canvas手書きウィジェット
    └── data/                     地図データ（実データ、prototype/data/と同一）
```

画面構成の補足：
- 「事前問診」タブに間取り手書き共有を統合している（別タブに分けていない）
- 「地図」タブに、実データのハザード地図に加えて、国交省・首相官邸の公式資料に
  基づく「過去の災害の記録（参考情報）」カードがある。**現在の天候や特定区域と
  結びつけて危険度を判定するものではなく、あくまで一般的な参考情報**という位置
  づけを明記している（企画整理.md セクション5の「独自の予測・判定はしない」
  という方針を守るため）
- 前兆現象の報告には任意で報告者名を添えられ、一覧は「〇〇さんの近くで報告：
  ○○」という呼びかけ形式で表示される（危機感を伝えるUX、企画整理.md
  セクション4項目6）。位置情報が取得できた報告は、地図タブ上にも赤い
  マーカーとして重ねて表示される

## APIエンドポイント

すべて `/api/` 配下。現場ルームコード（6桁）はサーバー側で毎リクエスト検証する
（`worker/lib/roomAuth.js`）。無効なコードと期限切れのコードは区別せず、両方
404を返す（総当たり探索でコードの有効性を推測させないため）。

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/rooms` | ルーム作成（6桁コード発行） |
| GET | `/api/rooms/:code/verify` | 参加コードの検証 |
| POST | `/api/rooms/:code/close` | ルームをクローズ（30日自動削除の起点をセット） |
| POST/GET | `/api/rooms/:code/intake` | 事前問診フォーム（暗号化、1ルーム1件・上書き） |
| POST/GET | `/api/rooms/:code/floorplans` | 間取り手書き共有（複数投稿可） |
| POST/GET | `/api/rooms/:code/precursors` | 前兆現象共有（`sign_label`はサーバー側allowlist検証） |

## 暗号化

事前問診フォーム（要配慮個人情報）のみ、AES-GCM（Web Crypto API）で暗号化して
D1に保存する。鍵はアプリ全体で1つ（サーバー側秘密鍵で一括暗号化する方式）。
毎回新しいランダムIVを生成し使い回さない。詳細は `worker/lib/crypto.js` を参照。

## 30日自動削除

`wrangler.toml` の `[triggers] crons` で毎日実行される `scheduled()` ハンドラ
（`worker/scheduled/purgeExpiredIncidents.js`）が、`incidents.expires_at` を
過ぎた事案を関連データごとカスケード削除する。ローカルでは以下で手動発火して
検証できる（`wrangler dev`起動中に別ターミナルで）。

```bash
curl http://localhost:8787/cdn-cgi/handler/scheduled
```

## 検証状況（2026-07-25、ローカルのみ）

- ✅ バックエンド：`wrangler dev` + curlで、ルーム作成/検証、事前問診の暗号化
  ラウンドトリップ（D1に平文で保存されていないことをhexダンプで確認済み）、
  ルーム間のデータ分離、前兆現象のallowlist検証（自由入力の拒否）、
  自動削除ハンドラの手動発火によるカスケード削除（期限切れルームのみ削除され
  別ルームは無傷）を確認済み
- ✅ フロントエンド：Playwrightで、ルーム作成→別クライアントでの参加→
  地図タブの回帰確認→事前問診フォームの入力・保存・リロード後の復元→
  間取りのCanvas描画・共有・一覧反映→前兆現象のワンタップ報告・
  別クライアントへのポーリング反映→無効な参加コードのエラー表示、
  を一通り確認済み
- ⚠️ 実際のCloudflareアカウントへのデプロイは未実施（このセッションからは
  developers.cloudflare.com にアクセスできず、デプロイにはユーザー自身の
  アカウントが必要なため）。都知事杯オープンデータ・ハッカソン2026の
  募集要項では、ライブのデモURLは任意（1分操作動画でも代替可）であり、
  作品提出の締切（8/23）にも余裕があるため、今回のセッションではローカル
  検証を優先した
- ⚠️ Geolocation APIの `getCurrentPosition` は、環境によっては渡した
  `timeout` オプションが守られずコールバックが一切呼ばれないことがある
  （このセッションのヘッドレスブラウザ環境で実際に確認）。`app.js` の
  `getGeolocation()` では、ブラウザ側のtimeoutに加えて自前の
  `setTimeout` フォールバックを必ず設定し、位置情報が取得できない環境でも
  前兆現象の共有処理全体が止まらないようにしている
