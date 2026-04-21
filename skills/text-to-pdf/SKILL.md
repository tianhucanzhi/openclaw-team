---
name: text-to-pdf
description: Convert plain text or text files to PDF documents. Use when the user asks to convert text content (strings, .txt files, markdown, logs, code) into a PDF file. Triggers on phrases like "text to pdf", "convert to pdf", "save as pdf", "export pdf", "make a pdf from this text". Supports CJK text (Chinese/Japanese/Korean) with automatic font detection.
---

# Text to PDF

Convert plain text content into well-formatted PDF documents.

## Quick Start

Run the bundled script:

```bash
python scripts/text_to_pdf.py -i input.txt -o output.pdf
```

Pipe text directly:

```bash
echo "Hello world" | python scripts/text_to_pdf.py -o output.pdf
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `-i, --input` | stdin | Input text file path |
| `-o, --output` | required | Output PDF path |
| `--font-size` | 11 | Font size in pt |
| `--line-height` | 1.5 | Line spacing multiplier |
| `--margin` | 25 | Page margin in mm |
| `--title` | "" | PDF document title metadata |
| `--encoding` | utf-8 | Text file encoding |

## CJK Support

The script auto-detects system CJK fonts (Microsoft YaHei, SimHei, PingFang, Noto Sans CJK, WQY Micro Hei). No manual configuration needed.

## Workflow

1. Determine the text source (file path, user-provided string, or stdin)
2. Choose output path (default: same name as input with `.pdf` extension)
3. Run `scripts/text_to_pdf.py` with appropriate options
4. Confirm the PDF was created and report the path to the user

## Dependency

Requires `fpdf2`. Install if missing:

```bash
pip install fpdf2
```
