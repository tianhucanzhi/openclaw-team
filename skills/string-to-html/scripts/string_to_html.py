#!/usr/bin/env python3
"""Convert plain text to a well-formatted HTML document."""

import argparse
import html
import sys


def text_to_html(text: str, title: str = "Document") -> str:
    """Convert plain text to HTML, preserving structure.

    - Empty lines become paragraph breaks
    - Lines starting with # become headings (h1-h6)
    - Lines starting with - or * become list items
    - Inline URLs become links
    - All other text is escaped and wrapped in <p>
    """
    import re

    lines = text.split("\n")
    body_parts = []
    in_list = False

    for line in lines:
        stripped = line.strip()

        # Blank line → paragraph break, close any open list
        if not stripped:
            if in_list:
                body_parts.append("</ul>")
                in_list = False
            continue

        # Heading detection: # Title → <h1>Title</h1>
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            if in_list:
                body_parts.append("</ul>")
                in_list = False
            level = len(heading_match.group(1))
            content = html.escape(heading_match.group(2))
            body_parts.append(f"<h{level}>{content}</h{level}>")
            continue

        # List item detection: - item or * item
        list_match = re.match(r"^[-*]\s+(.+)$", stripped)
        if list_match:
            if not in_list:
                body_parts.append("<ul>")
                in_list = True
            content = html.escape(list_match.group(1))
            # Auto-link URLs
            content = re.sub(
                r"(https?://[^\s<>]+)",
                r'<a href="\1">\1</a>',
                content,
            )
            body_parts.append(f"<li>{content}</li>")
            continue

        # Close list if we hit a non-list line
        if in_list:
            body_parts.append("</ul>")
            in_list = False

        # Regular text → paragraph with auto-linked URLs
        content = html.escape(stripped)
        content = re.sub(
            r"(https?://[^\s<>]+)",
            r'<a href="\1">\1</a>',
            content,
        )
        body_parts.append(f"<p>{content}</p>")

    if in_list:
        body_parts.append("</ul>")

    body = "\n".join(body_parts)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(title)}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #333; }}
        h1, h2, h3, h4, h5, h6 {{ margin-top: 1.5em; }}
        a {{ color: #0066cc; }}
        ul {{ padding-left: 1.5em; }}
        li {{ margin-bottom: 0.3em; }}
        p {{ margin: 0.8em 0; }}
    </style>
</head>
<body>
{body}
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser(description="Convert plain text to HTML")
    parser.add_argument("input", nargs="?", help="Input text file (stdin if omitted)")
    parser.add_argument("-o", "--output", help="Output HTML file (stdout if omitted)")
    parser.add_argument("-t", "--title", default="Document", help="HTML document title")
    args = parser.parse_args()

    if args.input:
        with open(args.input, encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    result = text_to_html(text, title=args.title)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(result)


if __name__ == "__main__":
    main()
