#!/usr/bin/env python3
"""
国土数値情報「土砂災害警戒区域データ」(A33) の GML/Shapefile を
prototype/doshasai-prototype.html の sampleGeoJSON と同じ構造の
GeoJSON に変換するツール。

使い方（まずは中身を確認するだけ）:
    python3 convert_ksj_a33.py --input A33-20_13_GML.zip --inspect

実際に変換する（23区のみ・簡略化あり）:
    python3 convert_ksj_a33.py --input A33-22_13Polygon.geojson \
        --output ../prototype/data/tokyo_23wards_sabo_zones.geojson \
        --tolerance 0.00003 --wards-only

実データ（2022年度・令和4年度版、A33-22_13）で確認済みの属性列対応:
    A33_001 = ksj:cop 現象区分   （1=急傾斜地の崩壊 2=土石流 3=地すべり ※要検証）
    A33_002 = ksj:coz 区域区分   （1=警戒区域 2=特別警戒区域 ※要検証）
    A33_003 = ksj:prc 都道府県コード（PrefectureCode.xml、東京都=13）
    A33_004 = ksj:znn 区域番号
    A33_005 = ksj:znm 区域名称（多くが "-" で空）
    A33_006 = ksj:ads 所在地（市区町村名を含む文字列。23区絞り込みはこの列を使う）
    A33_007 = ksj:pad 指定年月日
    A33_008 = ksj:cus 特別警戒未指定フラグ

「※要検証」とした2つのコード対応表は、元GML内に codeSpace 参照（コードリストXML）が
含まれておらず、この環境からは製品仕様書PDF（nlftp.mlit.go.jp、アクセス不可）を
確認できなかったため、一般的なKSJの並び順から推定したもの。正式な数値を使う前に
製品仕様書 第2.0版で必ず確認すること。列名自体（A33_001〜008）はKSJのバージョンにより
変わることがあるため、未知のデータを扱う際は必ず --inspect で先に確認する。
"""
import argparse
import json
import sys
import zipfile
import tempfile
from pathlib import Path

import geopandas as gpd

# 東京都23区（特別区）の名称。所在地(住所)文字列の先頭一致で絞り込む。
TOKYO_23_WARDS = [
    "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
    "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
    "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
]

# KSJ A33（2022年度版で確認済み）の属性名候補。他年度で列名が違う場合に備えて
# 汎用的な候補も残す。--inspect の出力で実際の列名を確認すること。
CANDIDATE_PHENOMENON_COLUMNS = ["A33_001", "現象の種類", "phenomenon"]
CANDIDATE_ZONE_TYPE_COLUMNS = ["A33_002", "区域区分", "zone_type"]
CANDIDATE_ZONE_NAME_COLUMNS = ["A33_005", "区域名", "zone_name"]
CANDIDATE_ADDRESS_COLUMNS = ["A33_006", "所在地", "address"]
CANDIDATE_NOTICE_DATE_COLUMNS = ["A33_007", "告示日", "notice_date"]

# 要検証（本文コメント参照）。表示用ラベルとして暫定使用。
PHENOMENON_LABELS = {"1": "急傾斜地の崩壊", "2": "土石流", "3": "地すべり"}
ZONE_TYPE_LABELS = {"1": "土砂災害警戒区域", "2": "土砂災害特別警戒区域"}


def find_first_existing(columns, candidates):
    for c in candidates:
        if c in columns:
            return c
    return None


def load_source(input_path: Path) -> gpd.GeoDataFrame:
    if input_path.suffix.lower() == ".zip":
        with tempfile.TemporaryDirectory() as tmp:
            with zipfile.ZipFile(input_path) as zf:
                zf.extractall(tmp)
            tmp_dir = Path(tmp)
            gml_files = list(tmp_dir.rglob("*.gml")) + list(tmp_dir.rglob("*.xml"))
            shp_files = list(tmp_dir.rglob("*.shp"))
            target = gml_files[0] if gml_files else (shp_files[0] if shp_files else None)
            if target is None:
                raise SystemExit(f"zip内にGML/Shapefileが見つかりません: {list(tmp_dir.rglob('*'))}")
            return gpd.read_file(target)
    return gpd.read_file(input_path)


def inspect(gdf: gpd.GeoDataFrame):
    print(f"件数: {len(gdf)}")
    print(f"CRS: {gdf.crs}")
    print(f"列名: {list(gdf.columns)}")
    print("先頭3件の属性値:")
    print(gdf.drop(columns="geometry").head(3).to_string())
    bounds = gdf.total_bounds
    print(f"範囲 (minx, miny, maxx, maxy): {bounds}")


def convert(
    gdf: gpd.GeoDataFrame,
    tolerance: float,
    wards_only: bool,
) -> dict:
    # JGD2011(EPSG:6668)等 → Leaflet前提のWGS84(EPSG:4326)へ変換
    # 日本付近ではJGD2011とWGS84の差はcm〜m単位で、この用途の地図表示には
    # 実質的な影響はないが、正確を期して明示的に再投影する。
    # なお国交省提供のGeoJSON版はRFC7946に従いすでにWGS84（CRS84）で
    # 出力されていることが多く、その場合は再投影は発生しない。
    if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    columns = gdf.columns
    phenomenon_col = find_first_existing(columns, CANDIDATE_PHENOMENON_COLUMNS)
    zone_type_col = find_first_existing(columns, CANDIDATE_ZONE_TYPE_COLUMNS)
    zone_name_col = find_first_existing(columns, CANDIDATE_ZONE_NAME_COLUMNS)
    address_col = find_first_existing(columns, CANDIDATE_ADDRESS_COLUMNS)
    notice_date_col = find_first_existing(columns, CANDIDATE_NOTICE_DATE_COLUMNS)

    missing = [
        name
        for name, col in [
            ("現象の種類", phenomenon_col),
            ("区域区分", zone_type_col),
            ("区域名", zone_name_col),
            ("所在地", address_col),
            ("告示日", notice_date_col),
        ]
        if col is None
    ]
    if missing:
        print(
            f"警告: 以下の属性列が見つからず空欄になります: {missing}\n"
            f"       --inspect の出力を見て CANDIDATE_* リストに実際の列名を追加してください。",
            file=sys.stderr,
        )

    if wards_only:
        if not address_col:
            raise SystemExit("所在地の列が見つからないため --wards-only による絞り込みができません。")
        pattern = "|".join(TOKYO_23_WARDS)
        gdf = gdf[gdf[address_col].astype(str).str.contains(pattern, regex=True, na=False)]
        print(f"23区絞り込み後の件数: {len(gdf)}")

    if tolerance > 0:
        gdf["geometry"] = gdf["geometry"].simplify(tolerance, preserve_topology=True)
    gdf = gdf[~gdf["geometry"].is_empty & gdf["geometry"].notna()]

    out = gdf[["geometry"]].copy()
    out["現象の種類"] = (
        gdf[phenomenon_col].astype(str).map(PHENOMENON_LABELS).fillna(gdf[phenomenon_col].astype(str))
        if phenomenon_col else ""
    )
    out["区域区分"] = (
        gdf[zone_type_col].astype(str).map(ZONE_TYPE_LABELS).fillna(gdf[zone_type_col].astype(str))
        if zone_type_col else ""
    )
    out["区域名"] = gdf[zone_name_col].astype(str) if zone_name_col else ""
    out["所在地"] = gdf[address_col].astype(str) if address_col else ""
    out["告示日"] = gdf[notice_date_col].astype(str) if notice_date_col else ""

    return json.loads(out.to_json())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path, help="A33-20_13_GML.zip 等の入力ファイル")
    parser.add_argument("--output", type=Path, help="出力GeoJSONパス（--inspect指定時は不要）")
    parser.add_argument("--inspect", action="store_true", help="変換せず、列名・件数・CRS等を表示するだけ")
    parser.add_argument("--tolerance", type=float, default=0.0, help="simplify許容誤差（度単位。例: 0.00003 ≒ 約3m）")
    parser.add_argument(
        "--wards-only",
        action="store_true",
        help="所在地（住所）文字列に東京23区の区名を含むものだけに絞り込む",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"入力ファイルが見つかりません: {args.input}")

    gdf = load_source(args.input)

    if args.inspect:
        inspect(gdf)
        return

    if not args.output:
        raise SystemExit("--output を指定してください（--inspect で先に列名を確認することを推奨）")

    geojson = convert(
        gdf,
        tolerance=args.tolerance,
        wards_only=args.wards_only,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    size_kb = args.output.stat().st_size / 1024
    print(f"出力完了: {args.output}（{size_kb:.1f} KB、{len(geojson['features'])}件）")


if __name__ == "__main__":
    main()
