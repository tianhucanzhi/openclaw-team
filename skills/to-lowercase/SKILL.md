---
name: to-lowercase
description: Convert all English letters in text to lowercase. Use when the user asks to lowercase text, convert uppercase to lowercase, make text all lowercase, or transform English words to lower case. Handles both direct strings and files. Triggers on phrases like "to lowercase", "convert to lowercase", "make lowercase", "lower case", "全部转小写".
---

# To Lowercase

Convert all English letters to lowercase.

## Quick Start

```bash
python scripts/to_lowercase.py -t "HELLO World"   # hello world
python scripts/to_lowercase.py -i input.txt -o output.txt
```

## Options

| Flag | Description |
|------|-------------|
| `-t, --text TEXT` | Direct text input |
| `-i, --input FILE` | Read from file |
| `-o, --output FILE` | Write to file (default: stdout) |
| `--encoding` | File encoding (default: utf-8) |

## Notes

- Only English letters (A-Z) are converted; CJK characters, numbers, and symbols are preserved.
- Python standard library only — no dependencies.
