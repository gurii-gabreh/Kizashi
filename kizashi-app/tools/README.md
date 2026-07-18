# tools/

技術検証用のデータ変換スクリプト。

## convert_ksj_a33.py

国土数値情報「土砂災害警戒区域データ」(A33) の GML/Shapefile/GeoJSON を、
`prototype/doshasai-prototype.html` が読み込む GeoJSON（`prototype/data/`）に変換する。

2022年度（令和4年度）版・東京都データ（A33-22_13_GML.zip）で実際に動作確認済み。
このzipにはGML・Shapefileに加えてGeoJSON形式（`A33-22_13Polygon.geojson`）が
最初から同梱されているため、GML変換は不要でそのまま入力できた。

### 準備

```bash
pip install -r requirements.txt
```

### データの入手

1. https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-v1_4.html を開く
2. 東京都データ（A33-\*\*_13_GML.zip）をダウンロード。年度が新しいほど区域指定が
   最新に近い（土砂災害警戒区域は随時追加・変更される）
3. zip内にGeoJSON形式のファイル（`*Polygon.geojson`）が同梱されていればそれを
   `--input` に指定すれば変換不要。無い場合はGML/Shapefileを直接指定してもよい
   （スクリプトが自動判定する）

### 使い方

まず中身を確認する（列名・CRS・件数を表示するだけで、ファイルは出力しない）。
KSJのバージョンにより属性列名が変わることがあるため、必ず最初に確認する。

```bash
python3 convert_ksj_a33.py --input A33-22_13Polygon.geojson --inspect
```

変換する（23区のみに絞り込み、座標を簡略化する場合）：

```bash
python3 convert_ksj_a33.py \
  --input A33-22_13Polygon.geojson \
  --output ../prototype/data/tokyo_23wards_sabo_zones.geojson \
  --tolerance 0.00003 \
  --wards-only
```

- `--tolerance` は座標の間引き（簡略化）の許容誤差（度単位）。`0.00003` は約3m相当。
  値を大きくするほどファイルサイズは小さくなるが形状の精度は落ちる。
- `--wards-only` を指定すると、所在地（住所）文字列に東京23区の区名が含まれる
  区域だけに絞り込む（KSJのこの属性セットには市区町村コード列が無いため、
  住所の文字列マッチで判定している）。省略すると都内全域（山間部・島嶼部含む）。
- GeoJSON形式の入力はすでにWGS84（EPSG:4326）で出力されていることが多く、
  その場合は再投影は発生しない。GML/Shapefileの元座標系がJGD2011等の場合は
  自動的にEPSG:4326へ再投影される。

### 実データでの検証結果（2022年度・東京都、2026-07-18実施）

| 対象 | 件数 | サイズ |
|---|---|---|
| 元GeoJSON（都内全域、簡略化なし） | 29,641件 | 34MB |
| 都内全域、簡略化あり（tolerance 0.00003） | 29,641件 | 約17MB |
| 23区のみ、簡略化なし | 1,818件 | 約1.6MB |
| **23区のみ、簡略化あり（tolerance 0.00003）** | **1,818件** | **約880KB** |

`prototype/data/tokyo_23wards_sabo_zones.geojson` は上表の最終行（23区・簡略化あり）。
`prototype/doshasai-prototype.html` はこのファイルをfetchで読み込み、成功すれば実データを、
file://で直接開くなどfetchが失敗する場合はサンプルデータにフォールバックする。
実データを表示するには、プロトタイプをHTTP(S)サーバー経由で開く必要がある
（file://だとブラウザのCORS制限でfetchがブロックされる）。

現象区分（`A33_001`）・区域区分（`A33_002`）のコード対応（1/2/3が何を指すか）は、
今回取得したデータにコードリストが同梱されておらず、国交省の製品仕様書PDFでの
確認ができていない（ネットワーク制限のため）。スクリプト内では一般的な並び順を
暫定採用しているが、正式な数値は別途確認すること。詳細は
`docs/企画整理.md` セクション6-1を参照。
