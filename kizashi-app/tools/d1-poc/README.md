# d1-poc

Cloudflare D1のセットアップ検証。ローカル環境（`wrangler d1 execute --local`、
クラウド接続不要）でスキーマ作成・データ投入・JOINクエリまで動作確認済み。

## 検証状況

- ✅ `wrangler`（4.112.0）をnpmでインストールし、ローカルD1（workerd/miniflareの
  エミュレーション）でスキーマ作成・INSERT・JOINクエリが動くことを確認した。
- ✅ `schema.sql` は企画整理.md セクション7の「テーブル例」
  （incidents / family_intake / reports / precursor_signs）を具体化したもの。
  要配慮個人情報（身体的特徴等）を扱う `family_intake` は、平文の列を持たず
  `encrypted_payload`（アプリ層で暗号化した値）にまとめる設計にし、
  `incidents.expires_at` で事案終了30日後の自動削除の起点を持たせている
  （セクション9の方針に対応）。
- ⚠️ **無料枠の上限（容量・読み書き回数）は未確認。** developers.cloudflare.com
  がこのセッションからアクセスできず、公式ページで確認できていない。
  作成時点の記憶では「ストレージ5GB、読み取り500万行/日、書き込み10万行/日」
  程度だったと思うが、古い・不正確な可能性があるため参考にしないこと。
  実装前に公式ページ（developers.cloudflare.com/d1/platform/pricing）で
  必ず確認する。
- ⚠️ **実際のクラウド上でのD1データベース作成は未実施。** `wrangler login`や
  実データベースの作成にはユーザーのCloudflareアカウントでの認証が必要なため、
  ここでは行っていない。

## 使い方

```bash
npm install
npx wrangler d1 execute kizashi-local --local --file=schema.sql
npx wrangler d1 execute kizashi-local --local --command="SELECT * FROM incidents;"
```

`--local` を外すと実際のCloudflareアカウント上のD1に対して実行される
（要 `wrangler login`、かつ `wrangler.toml` の `database_id` を実際のものに
差し替える必要がある）。
