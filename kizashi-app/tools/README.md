# tools/

技術検証用のデータ変換スクリプト。

## convert_ksj_a33.py

国土数値情報「土砂災害警戒区域データ」(A33) の GML/Shapefile を、
`prototype/doshasai-prototype.html` の `sampleGeoJSON` と同じ属性構造の
GeoJSON に変換する。

### 準備

```bash
pip install -r requirements.txt
```

### データの入手

1. https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-v1_4.html を開く
2. 東京都・令和2年版（A33-20_13_GML.zip、約20.9MB）をダウンロード
   （GML形式のほか、Shapefile／GeoJSON形式でも提供されている場合はそちらを
   使ってもよい。GeoJSON形式が既にあれば変換の手間が省ける）

### 使い方

まず中身を確認する（列名・CRS・件数を表示するだけで、ファイルは出力しない）。
KSJのバージョンにより属性列名が変わることがあるため、必ず最初に確認する。

```bash
python3 convert_ksj_a33.py --input A33-20_13_GML.zip --inspect
```

変換する（23区のみに絞り込み、座標を簡略化する場合）：

```bash
python3 convert_ksj_a33.py \
  --input A33-20_13_GML.zip \
  --output ../prototype/data/tokyo_sabo_zones.geojson \
  --tolerance 0.00002 \
  --ward-column <inspectで確認した市区町村コード列名> \
  --ward-codes
```

- `--tolerance` は座標の間引き（簡略化）の許容誤差（度単位）。`0.00002` は約2m相当。
  値を大きくするほどファイルサイズは小さくなるが形状の精度は落ちる。
- `--ward-column` / `--ward-codes` を省略すると絞り込みなし（都内全域）で出力する。
- 座標系がJGD2011等でWGS84と異なる場合は自動的にEPSG:4326へ再投影される。

出力後、`prototype/doshasai-prototype.html` 内の `sampleGeoJSON` を
生成されたGeoJSONの読み込みに差し替えて表示を確認する。
