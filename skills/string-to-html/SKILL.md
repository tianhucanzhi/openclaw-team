---
name: string-to-html
description: Convert plain text or strings to well-formatted HTML documents. Use when the user asks to convert text to HTML, generate HTML from plain text, wrap text in HTML tags, or create an HTML page from a string. Handles headings (# syntax), lists (- or * syntax), auto-linked URLs, paragraph breaks, and HTML escaping. Triggers on phrases like "convert to HTML", "text to HTML", "string to HTML", "make HTML from text", "wrap in HTML".
---

# String to HTML

Convert plain text to a styled HTML document with automatic structure detection.

## Usage

Run the bundled script:

```bash
python scripts/string_to_html.py input.txt -o output.html --title "My Page"
```

Or via stdin:

```bash
echo "Hello world" | python scripts/string_to_html.py --title "My Page"
```

### Arguments

| Arg | Description |
|-----|-------------|
| `input` | Input text file path (stdin if omitted) |
| `-o, --output` | Output HTML file path (stdout if omitted) |
| `-t, --title` | HTML `<title>` value (default: "Document") |

## Auto-Detection Rules

The script parses plain text and applies these transformations:

- **`# Heading`** → `<h1>Heading</h1>` (supports h1–h6 via # count)
- **`- item` or `* item`** → `<ul><li>item</li></ul>` (consecutive items grouped)
- **Blank lines** → paragraph breaks (close any open list)
- **`https://...`** → auto-linked `<a>` tags
- **All other text** → HTML-escaped and wrapped in `<p>`
- **Special characters** (`<`, `>`, `&`, `"`) → HTML entity escaping

## Without the Script

For quick inline conversions, apply these rules manually:

1. Escape `&`, `<`, `>`, `"` with HTML entities
2. Wrap each text block in `<p>...</p>`
3. Convert `#`-prefixed lines to `<h1>`–`<h6>`
4. Group consecutive `-`/`*` lines into `<ul><li>...</li></ul>`
5. Wrap URLs in `<a href="url">url</a>`
