---
name: string-serialize
description: Serialize and deserialize strings across multiple encoding formats. Use when the user asks to encode, decode, serialize, or deserialize strings. Supports base64, base32, hex, URL encoding, HTML entities, JSON escaping, unicode escape, ROT13, punycode, and CSV row encoding. Triggers on phrases like "serialize string", "encode to hex", "URL encode", "HTML escape", "unicode escape", "JSON escape", "decode this", "convert encoding", "ROT13", "punycode".
---

# String Serialize

Encode/decode strings across 10 serialization formats with a single script.

## Quick Start

```bash
python scripts/serialize.py -f hex -e "Hello"        # 48656c6c6f
python scripts/serialize.py -f hex -d "48656c6c6f"    # Hello
python scripts/serialize.py -f url -e "你好 world"     # %E4%BD%A0%E5%A5%BD%20world
python scripts/serialize.py -f base64 -e "Hello"      # SGVsbG8=
python scripts/serialize.py -f html -e "<div>"        # &lt;div&gt;
python scripts/serialize.py -f json -e 'say "hi"'     # "say \"hi\""
python scripts/serialize.py -f unicode -e "你好"       # \u4f60\u597d
python scripts/serialize.py -f rot13 -e "Hello"       # Uryyb
python scripts/serialize.py -f punycode -e "中文"      # ck1rpw1c
```

## List Formats

```bash
python scripts/serialize.py --list
```

## Options

| Flag | Description |
|------|-------------|
| `-f, --format` | Format: base64, base32, hex, url, html, json, unicode, rot13, punycode, csv |
| `-e, --encode TEXT` | Serialize (encode) text |
| `-d, --decode TEXT` | Deserialize (decode) text |
| `-i, --input FILE` | Read input from file |
| `-o, --output FILE` | Write output to file |
| `--encoding` | Text encoding (default: utf-8) |

## No Dependencies

Python standard library only.
