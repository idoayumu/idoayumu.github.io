#!/usr/bin/env python3
"""タイトル分析JSONから、全作品ラベル付きの散布図PNGを生成する。"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as error:
    raise SystemExit(
        "Pillowが必要です。`python3 -m pip install Pillow` を実行してください。"
    ) from error


WIDTH = 2800
HEIGHT = 2000
PLOT_LEFT = 310
PLOT_TOP = 220
PLOT_RIGHT = 2620
PLOT_BOTTOM = 1690
SCALE_MIN = 0.8
SCALE_MAX = 5.2

BACKGROUND = "#faf9fc"
TEXT = "#25232a"
MUTED_TEXT = "#625c6d"
GRID = "#ddd9e5"
AXIS = "#81788e"
POINT = "#71568f"
POINT_OUTLINE = "#ffffff"
LABEL_BACKGROUND = (250, 249, 252, 218)
LABEL_OUTLINE = (209, 202, 219, 190)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]


@dataclass(frozen=True)
class Point:
    title: str
    artistic_documentary: float
    poetic_explanatory: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="title-analysis.jsonから全作品ラベル付き散布図PNGを生成します。"
    )
    parser.add_argument("--input", default="src/data/title-analysis.json")
    parser.add_argument(
        "--output",
        default="tools/analysis-output/title-scatter-artistic-vs-poetic.png",
    )
    parser.add_argument(
        "--font",
        default=None,
        help="日本語フォントファイルを明示指定する場合に使用します。",
    )
    return parser.parse_args()


def load_font(path: str | None, size: int) -> ImageFont.FreeTypeFont:
    candidates = [path] if path else FONT_CANDIDATES
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    raise RuntimeError(
        "日本語フォントが見つかりません。--font で日本語対応フォントのパスを指定してください。"
    )


def load_points(path: Path) -> tuple[list[Point], list[str]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RuntimeError(f"分析JSONが見つかりません: {path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"分析JSONの形式が不正です: {error}") from error

    if not isinstance(data, list):
        raise RuntimeError("分析JSONのトップレベルは配列である必要があります。")

    points: list[Point] = []
    warnings: list[str] = []
    for index, record in enumerate(data, start=1):
        try:
            title = record["title"]
            scores = record["scores"]
            x = float(scores["artistic_documentary"]["score"])
            y = float(scores["poetic_explanatory"]["score"])
            if not isinstance(title, str) or not title.strip():
                raise ValueError("titleが空です")
            if not (1 <= x <= 5 and 1 <= y <= 5):
                raise ValueError("scoreが1〜5の範囲外です")
            points.append(Point(title=title.strip(), artistic_documentary=x, poetic_explanatory=y))
        except (KeyError, TypeError, ValueError) as error:
            warnings.append(f"{index}件目を除外しました: {error}")

    if not points:
        raise RuntimeError("描画可能な分析結果がありません。")
    return points, warnings


def map_x(value: float) -> float:
    return PLOT_LEFT + (value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) * (PLOT_RIGHT - PLOT_LEFT)


def map_y(value: float) -> float:
    return PLOT_BOTTOM - (value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) * (PLOT_BOTTOM - PLOT_TOP)


def box_overlap_area(
    first: tuple[float, float, float, float], second: tuple[float, float, float, float]
) -> float:
    left = max(first[0], second[0])
    top = max(first[1], second[1])
    right = min(first[2], second[2])
    bottom = min(first[3], second[3])
    return max(0.0, right - left) * max(0.0, bottom - top)


def label_candidates(x: float, y: float, width: float, height: float) -> list[tuple[float, float]]:
    candidates: list[tuple[float, float]] = []
    for radius in (16, 32, 56, 88, 124, 166, 214, 270, 336, 420):
        for angle in range(0, 360, 20):
            radians = math.radians(angle)
            left = x + math.cos(radians) * radius
            top = y + math.sin(radians) * radius - height / 2
            left = min(max(18, left), WIDTH - width - 18)
            top = min(max(18, top), HEIGHT - height - 18)
            candidates.append((left, top))
    return candidates


def place_label(
    x: float,
    y: float,
    text_width: float,
    text_height: float,
    placed_boxes: list[tuple[float, float, float, float]],
) -> tuple[float, float, float, float]:
    padding_x = 8
    padding_y = 5
    width = text_width + padding_x * 2
    height = text_height + padding_y * 2
    best_box: tuple[float, float, float, float] | None = None
    best_cost: float | None = None

    for left, top in label_candidates(x, y, width, height):
        box = (left, top, left + width, top + height)
        overlap = sum(box_overlap_area(box, previous) for previous in placed_boxes)
        distance = math.hypot((left + width / 2) - x, (top + height / 2) - y)
        cost = overlap * 100 + distance
        if overlap == 0:
            return box
        if best_cost is None or cost < best_cost:
            best_box = box
            best_cost = cost

    assert best_box is not None
    return best_box


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: str,
) -> None:
    text_box = draw.textbbox((0, 0), text, font=font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    x = (box[0] + box[2] - text_width) / 2
    y = (box[1] + box[3] - text_height) / 2 - text_box[1]
    draw.text((x, y), text, font=font, fill=fill)


def render(points: list[Point], output_path: Path, font_path: str | None) -> None:
    image = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image, "RGBA")
    title_font = load_font(font_path, 44)
    axis_font = load_font(font_path, 28)
    tick_font = load_font(font_path, 22)
    label_font = load_font(font_path, 20)

    draw.text((PLOT_LEFT, 80), f"タイトル分析散布図（{len(points)}作品）", font=title_font, fill=TEXT)
    draw.text(
        (PLOT_LEFT, 142),
        "横軸: 作品性 ←→ 記録性    縦軸: 詩的 ←→ 説明的",
        font=axis_font,
        fill=MUTED_TEXT,
    )

    for value in range(1, 6):
        x = map_x(value)
        y = map_y(value)
        draw.line((x, PLOT_TOP, x, PLOT_BOTTOM), fill=GRID, width=2)
        draw.line((PLOT_LEFT, y, PLOT_RIGHT, y), fill=GRID, width=2)
        draw.text((x - 7, PLOT_BOTTOM + 20), str(value), font=tick_font, fill=MUTED_TEXT)
        draw.text((PLOT_LEFT - 38, y - 13), str(value), font=tick_font, fill=MUTED_TEXT)

    draw.line((PLOT_LEFT, PLOT_BOTTOM, PLOT_RIGHT, PLOT_BOTTOM), fill=AXIS, width=3)
    draw.line((PLOT_LEFT, PLOT_TOP, PLOT_LEFT, PLOT_BOTTOM), fill=AXIS, width=3)
    draw.line((map_x(3), PLOT_TOP, map_x(3), PLOT_BOTTOM), fill=AXIS, width=3)
    draw.line((PLOT_LEFT, map_y(3), PLOT_RIGHT, map_y(3)), fill=AXIS, width=3)

    x_axis_box = (PLOT_LEFT, PLOT_BOTTOM + 72, PLOT_RIGHT, PLOT_BOTTOM + 120)
    draw_centered_text(draw, x_axis_box, "作品性 ←→ 記録性", axis_font, TEXT)
    y_axis_label = "詩的 ←→ 説明的"
    y_axis_box = draw.textbbox((0, 0), y_axis_label, font=axis_font)
    y_axis_width = y_axis_box[2] - y_axis_box[0]
    y_axis_height = y_axis_box[3] - y_axis_box[1]
    y_axis_image = Image.new("RGBA", (int(y_axis_width + 10), int(y_axis_height + 10)), (0, 0, 0, 0))
    ImageDraw.Draw(y_axis_image).text((5, 5 - y_axis_box[1]), y_axis_label, font=axis_font, fill=TEXT)
    y_axis_image = y_axis_image.rotate(90, expand=True)
    image.alpha_composite(y_axis_image, (78, int((PLOT_TOP + PLOT_BOTTOM - y_axis_image.height) / 2)))

    placed_boxes: list[tuple[float, float, float, float]] = []
    for point in sorted(points, key=lambda item: (item.poetic_explanatory, item.artistic_documentary, item.title)):
        x = map_x(point.artistic_documentary)
        y = map_y(point.poetic_explanatory)
        text_box = draw.textbbox((0, 0), point.title, font=label_font)
        text_width = text_box[2] - text_box[0]
        text_height = text_box[3] - text_box[1]
        label_box = place_label(x, y, text_width, text_height, placed_boxes)
        placed_boxes.append(label_box)

        draw.line(
            (x, y, (label_box[0] + label_box[2]) / 2, (label_box[1] + label_box[3]) / 2),
            fill=(113, 86, 143, 110),
            width=1,
        )
        draw.ellipse((x - 8, y - 8, x + 8, y + 8), fill=POINT_OUTLINE, outline=POINT_OUTLINE)
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=POINT, outline=POINT)
        draw.rounded_rectangle(label_box, radius=6, fill=LABEL_BACKGROUND, outline=LABEL_OUTLINE, width=1)
        draw.text((label_box[0] + 8, label_box[1] + 5 - text_box[1]), point.title, font=label_font, fill=TEXT)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output_path, "PNG", optimize=True)


def main() -> int:
    args = parse_args()
    try:
        points, warnings = load_points(Path(args.input))
        render(points, Path(args.output), args.font)
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    print(f"{len(points)}作品を描画しました。")
    print(f"出力: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
