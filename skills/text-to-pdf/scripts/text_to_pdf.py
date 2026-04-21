#!/usr/bin/env python3
"""Convert a text file or string to a PDF document.

Usage:
  python text_to_pdf.py -i input.txt -o output.pdf
  python text_to_pdf.py -i input.txt -o output.pdf --font-size 12

Requires: fpdf2  (pip install fpdf2)
"""

import argparse
import os
import platform
import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("Error: fpdf2 not installed. Run: pip install fpdf2", file=sys.stderr)
    sys.exit(1)


def _find_cjk_font():
    """Find a CJK-capable TTF/TTC font on the system. Return path or None."""
    system = platform.system()
    candidates = []
    if system == "Windows":
        windir = os.environ.get("WINDIR", r"C:\Windows")
        candidates = [
            Path(windir) / "Fonts" / "msyh.ttc",
            Path(windir) / "Fonts" / "simhei.ttf",
            Path(windir) / "Fonts" / "simsun.ttc",
        ]
    elif system == "Darwin":
        candidates = [
            Path("/System/Library/Fonts/PingFang.ttc"),
            Path("/Library/Fonts/Arial Unicode.ttf"),
        ]
    else:
        candidates = [
            Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
            Path("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
        ]
    for fp in candidates:
        if fp.exists():
            return str(fp)
    return None


def _has_cjk(text):
    """Check if text contains CJK characters."""
    for ch in text:
        cp = ord(ch)
        if (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or
            0x3000 <= cp <= 0x303F or 0x3040 <= cp <= 0x30FF or
            0xAC00 <= cp <= 0xD7AF):
            return True
    return False


class TextPDF(FPDF):
    _body_font_name = "Helvetica"

    def footer(self):
        self.set_y(-15)
        self.set_font(self._body_font_name, size=8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def text_to_pdf(
    text: str,
    output_path: str,
    font_size: int = 11,
    line_height: float = 1.5,
    margin: float = 25,
    title: str = "",
):
    pdf = TextPDF()

    pdf.set_auto_page_break(auto=True, margin=margin)

    if title:
        pdf.set_title(title)

    # Select font
    body_font = "Helvetica"
    if _has_cjk(text):
        cjk_path = _find_cjk_font()
        if cjk_path:
            pdf.add_font("CJKFont", "", cjk_path)
            body_font = "CJKFont"

    pdf._body_font_name = body_font

    # Set margins AFTER font registration, BEFORE add_page
    pdf.set_margins(margin, margin, margin)
    pdf.add_page()
    pdf.set_font(body_font, size=font_size)
    pdf.set_text_color(33, 33, 33)

    lh = font_size * line_height

    for line in text.splitlines():
        line = line.replace("\t", "    ")
        if line.strip() == "":
            pdf.ln(lh * 0.5)
        else:
            pdf.set_x(margin)
            pdf.multi_cell(w=0, h=lh, text=line)

    pdf.output(output_path)
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Convert text to PDF")
    parser.add_argument("-i", "--input", help="Input text file path")
    parser.add_argument("-o", "--output", required=True, help="Output PDF file path")
    parser.add_argument("--font-size", type=int, default=11, help="Font size (default: 11)")
    parser.add_argument("--line-height", type=float, default=1.5, help="Line height multiplier (default: 1.5)")
    parser.add_argument("--margin", type=float, default=25, help="Page margin in mm (default: 25)")
    parser.add_argument("--encoding", default="utf-8", help="Text encoding (default: utf-8)")
    parser.add_argument("--title", default="", help="PDF document title")
    args = parser.parse_args()

    if args.input:
        text = Path(args.input).read_text(encoding=args.encoding)
    else:
        text = sys.stdin.read()

    result = text_to_pdf(
        text,
        args.output,
        font_size=args.font_size,
        line_height=args.line_height,
        margin=args.margin,
        title=args.title,
    )
    print(f"PDF created: {result}")


if __name__ == "__main__":
    main()
