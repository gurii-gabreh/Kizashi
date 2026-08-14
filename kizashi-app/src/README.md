# 結（Yui）本体（Cloudflare Workers + D1）

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
├── worker/lib/crisisDetection.js  傾聴AIチャットの危機キーワード安全網
├── worker/lib/crisisResponse.js   危機時の固定応答文・相談窓口情報（要確認）
├── worker/routes/chat.js         傾聴AIチャットAPI（Workers AI、会話は非永続）
└── public/                      フロントエンド（バニラJS、フレームワーク不使用）
    ├── index.html                タブは「地図／事前問診・間取り／前兆報告／AI相談」の4つ
    ├── app.js                    ルーム作成/参加、API連携、ポーリング、地図への前兆マーカー表示
    ├── floorplan.js               Canvas手書きウィジェット
    ├── voiceIntake.js             音声ガイド付き事前問診（Web Speech API）
    ├── chat.js                    傾聴AIチャットのフロントエンド
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
- 事前問診フォームには「音声で入力を始める」ボタンがあり（Web Speech API
  非対応ブラウザでは自動的に非表示）、一問一答の音声ガイドで項目を埋められる。
  書き起こしはAIに解釈させず、そのまま（verbatim）採用し、必ずタップでの
  確認ステップを挟む（手が震える状況でも認識エラーを積み重ねないため）
- 「AI相談」タブは、Cloudflare Workers AIを使った傾聴専用のチャット。
  助言・予測は一切行わず、企画整理.md セクション5の「生存確率・見込み時間の
  提示禁止」を厳守するようシステムプロンプトで明示的に制限している。会話内容は
  D1にもlocalStorageにも一切保存しない。深刻な危機の兆候（キーワード一致）を
  検知した場合は、AIを呼ばずに固定の専門相談窓口情報を返す
  （`worker/lib/crisisDetection.js` / `crisisResponse.js`）

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
| POST | `/api/rooms/:code/chat` | 傾聴AIチャット（会話は保存しない。危機キーワード検知時はAIを呼ばず固定応答） |

## 暗号化

事前問診フォーム（要配慮個人情報）のみ、AES-GCM（Web Crypto API）で暗号化して
D1に保存する。鍵はアプリ全体で1つ（サーバー側秘密鍵で一括暗号化する方式）。
毎回新しいランダムIVを生成し使い回さない。詳細は `worker/lib/crypto.js` を参照。

## 傾聴AIチャット（重要な未確認事項あり）

`worker/routes/chat.js` はCloudflare Workers AI（`wrangler.toml`の`[ai]`
バインディング）を使う。**以下2点は、このセッションではネットワークアクセスが
制限されており確認できていない。本番投入前に必ずユーザー自身で確認すること：**

1. **`AI_MODEL_ID`**（`chat.js`内、現在`@cf/meta/llama-3.1-8b-instruct`）が
   Cloudflareの現行カタログの正しいモデルIDか。Cloudflareダッシュボードの
   Workers AIモデル一覧で確認・必要なら差し替える
2. **`worker/lib/crisisResponse.js`の相談窓口電話番号**（よりそいホットライン、
   いのちの電話）が現在も正しいか。公式サイトで確認せずに本番公開しない
   （誤った番号は危機的状況の相手に実害を与えるため）

安全設計として、`detectCrisis()`（`worker/lib/crisisDetection.js`）による
キーワード一致の安全網を`env.AI`呼び出しより必ず先に実行する。これにより
プロンプト操作やAIの応答の気まぐれに左右されず、深刻な危機のサインを検知した
場合は常に固定の相談窓口情報を返す。システムプロンプトにも「生存確率・見込み
時間はいかなる推測も口にしない」「助言・行動計画は提案しない」という制約を
明記している（企画整理.md セクション5の絶対除外事項に直結）。

会話内容はD1にもlocalStorageにも一切保存しない（`chat.js`のフロントエンド
実装はメモリ内の配列のみで履歴を保持し、ルーム退出時に破棄する）。

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

## 検証状況（2026-08-01、音声問診＋傾聴AIチャット追加分、ローカルのみ）

- ✅ 音声ガイド付き事前問診：Playwrightで`window.SpeechRecognition`/
  `speechSynthesis`をスタブ注入し、10問すべての質問→書き起こし→確認→
  既存フォームフィールドへの反映、性別の正規化判定、既存の手入力・保存ボタンが
  無改修で動くことを確認済み。Speech API非対応環境（該当APIを明示的に削除して
  再現）では音声入力ボタンが表示されないフォールバックも確認済み
- ✅ 傾聴AIチャット：無効/期限切れルームコードでの404、危機キーワードを含む
  メッセージが`env.AI`を呼ばずに安全網（固定応答＋相談窓口の`tel:`リンク）で
  処理されること、`env.AI`未設定時のスタブ応答、通常メッセージでのチャット
  吹き出し表示、D1のどのテーブルにも会話内容が保存されていないこと
  （`wrangler d1 execute`でテーブル一覧を確認、`chat`関連テーブルは存在しない）
  を確認済み
- ✅ 既存機能（地図・間取り手書き共有・前兆現象報告）への回帰がないことを
  Playwrightで再確認済み
- ⚠️ **`wrangler dev`（`--local`含む）は、`wrangler.toml`に`[ai]`
  バインディングがあるとCloudflareの実サービスへの接続を試み、このセッションの
  ようにネットワークアクセスが制限された環境では起動自体に失敗する**
  （D1と異なりWorkers AIにはローカルエミュレーションが存在しないため）。
  今回のローカル検証は`[ai]`ブロックを一時的にコメントアウトした状態
  （＝`env.AI`が`undefined`になりスタブ応答フォールバックに入る状態）で
  実施した。実際のAI応答の質・トーンは、Cloudflareアカウントでログイン後の
  `wrangler dev --remote`または本番デプロイ後に確認する必要がある
  （未検証。上記「傾聴AIチャット」セクションの2つの要確認事項も参照）
- ⚠️ 実機・実ブラウザでの音声認識精度・音声合成の自然さは未検証
  （Playwrightのヘッドレスブラウザではスタブ経由の配線確認のみ可能で、
  実際のマイク入力・音声認識バックエンドは検証できない）
