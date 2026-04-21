#!/usr/bin/env python3
"""String serialization/deserialization utility.

Supports multiple formats: base64, hex, url, html, json, csv, unicode-escape, rot13, punycode.

Usage:
  python serialize.py -f hex -e "Hello"
  python serialize.py -f hex -d "48656c6c6f"
  python serialize.py -f url -e "你好 world"
  python serialize.py -f base64 -d "SGVsbG8=" -o output.txt
  python serialize.py --list
"""

import argparse
import base64
import csv
import html
import json
import io
import sys
import urllib.parse
from pathlib import Path


# ── Format handlers ──────────────────────────────────────────────

FORMATS = {}

def register(fmt, encode_fn, decode_fn, desc):
    FORMATS[fmt] = {"encode": encode_fn, "decode": decode_fn, "desc": desc}

# Base64
register("base64",
    lambda s, **kw: base64.b64encode(s.encode(kw.get("encoding", "utf-8"))).decode("ascii"),
    lambda s, **kw: base64.b64decode(s.encode("ascii")).decode(kw.get("encoding", "utf-8")),
    "Base64 encoding")

# Hex
register("hex",
    lambda s, **kw: s.encode(kw.get("encoding", "utf-8")).hex(),
    lambda s, **kw: bytes.fromhex(s).decode(kw.get("encoding", "utf-8")),
    "Hexadecimal encoding")

# URL encoding
register("url",
    lambda s, **kw: urllib.parse.quote(s, encoding=kw.get("encoding", "utf-8")),
    lambda s, **kw: urllib.parse.unquote(s, encoding=kw.get("encoding", "utf-8")),
    "URL percent encoding")

# HTML entities
register("html",
    lambda s, **kw: html.escape(s, quote=True),
    lambda s, **kw: html.unescape(s),
    "HTML entity encoding")

# JSON escape
register("json",
    lambda s, **kw: json.dumps(s, ensure_ascii=False),
    lambda s, **kw: json.loads(s),
    "JSON string escaping")

# Unicode escape (\uXXXX)
register("unicode",
    lambda s, **kw: s.encode("unicode_escape").decode("ascii"),
    lambda s, **kw: s.encode("ascii").decode("unicode_escape"),
    "Unicode escape sequences (\\uXXXX)")

# ROT13
register("rot13",
    lambda s, **kw: s.translate(str.maketrans(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
        "NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm")),
    lambda s, **kw: s.translate(str.maketrans(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
        "NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm")),
    "ROT13 cipher (encode = decode)")

# Punycode (IDN)
register("punycode",
    lambda s, **kw: s.encode("punycode").decode("ascii"),
    lambda s, **kw: s.encode("ascii").decode("punycode"),
    "Punycode (internationalized domain names)")

# Base32
register("base32",
    lambda s, **kw: base64.b32encode(s.encode(kw.get("encoding", "utf-8"))).decode("ascii"),
    lambda s, **kw: base64.b32decode(s.encode("ascii")).decode(kw.get("encoding", "utf-8")),
    "Base32 encoding")

# CSV row serialization
def _csv_encode(s, **kw):
    buf = io.StringIO()
    # Split by comma if the string looks like a list, otherwise treat as single field
    fields = [f.strip() for f in s.split(",")] if "," in s else [s]
    csv.writer(buf).writerow(fields)
    return buf.getvalue().rstrip("\r\n")

def _csv_decode(s, **kw):
    row = next(csv.reader(io.StringIO(s)))
    return ",".join(row)

register("csv",
    _csv_encode,
    _csv_decode,
    "CSV row encoding (quote fields with commas/quotes)")


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="String serialization/deserialization",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Available formats: " + ", ".join(sorted(FORMATS.keys())))
    parser.add_argument("-f", "--format", required=True,
        choices=sorted(FORMATS.keys()), help="Serialization format")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-e", "--encode", metavar="TEXT", help="Serialize text")
    group.add_argument("-d", "--decode", metavar="TEXT", help="Deserialize text")
    group.add_argument("--list", action="store_true", help="List available formats")
    parser.add_argument("-i", "--input", help="Read input from file")
    parser.add_argument("-o", "--output", help="Write output to file")
    parser.add_argument("--encoding", default="utf-8", help="Text encoding (default: utf-8)")
    args = parser.parse_args()

    if args.list:
        for fmt in sorted(FORMATS.keys()):
            print(f"  {fmt:12s} {FORMATS[fmt]['desc']}")
        return

    if args.input:
        text = Path(args.input).read_text(encoding=args.encoding).rstrip("\n")
    else:
        text = args.encode if args.encode is not None else args.decode

    handler = FORMATS[args.format]
    fn = handler["encode"] if args.encode is not None else handler["decode"]

    try:
        result = fn(text, encoding=args.encoding)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        Path(args.output).write_text(result, encoding=args.encoding)
        print(f"Output written to: {args.output}")
    else:
        print(result)


if __name__ == "__main__":
    main()
