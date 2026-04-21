---
name: json-to-string
description: Convert JSON to various string representations. Use when the user asks to convert JSON to a string, serialize JSON, flatten JSON, compact JSON, or stringify JSON. Supports compact, pretty, inline, and flatten (dot-notation) output modes. Triggers on phrases like "JSON to string", "convert JSON to string", "stringify JSON", "flatten JSON", "compact JSON", "JSON 转字符串".
---

# JSON to String

Convert JSON data to various string representations.

## Usage

```bash
python scripts/json_to_string.py input.json -o output.txt -m compact
```

Or via stdin:

```bash
echo '{"a":1}' | python scripts/json_to_string.py -m flatten
```

### Arguments

| Arg | Description |
|-----|-------------|
| `input` | Input JSON file path (stdin if omitted) |
| `-o, --output` | Output file path (stdout if omitted) |
| `-m, --mode` | Output mode: `compact`, `pretty`, `inline`, `flatten` (default: compact) |
| `-i, --indent` | Indent spaces for pretty mode (default: 2) |

## Output Modes

Given `{"name": "Alice", "address": {"city": "Shanghai", "zip": "200000"}}`:

- **compact** — Single-line, no spaces: `{"name":"Alice","address":{"city":"Shanghai","zip":"200000"}}`
- **inline** — Single-line with spaces: `{"name": "Alice", "address": {"city": "Shanghai", "zip": "200000"}}`
- **pretty** — Multi-line indented JSON
- **flatten** — Dot-notation key=value pairs, one per line:
  ```
  name="Alice"
  address.city="Shanghai"
  address.zip="200000"
  ```

## Without the Script

For quick inline conversions, use Python's `json` module:

```python
import json
# Compact
json.dumps(data, ensure_ascii=False, separators=(",", ":"))
# Pretty
json.dumps(data, ensure_ascii=False, indent=2)
```
