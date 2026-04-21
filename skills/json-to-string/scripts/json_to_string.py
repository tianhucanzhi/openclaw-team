#!/usr/bin/env python3
"""Convert JSON to various string representations."""

import argparse
import json
import sys


def json_to_string(
    data,
    mode: str = "compact",
    indent: int = 2,
    key_sep: str = ":",
    item_sep: str = ",",
) -> str:
    """Convert JSON data to a string representation.

    Modes:
      compact  - Single-line JSON, no spaces (default)
      pretty   - Pretty-printed JSON with indentation
      flatten  - Dot-notation key=value pairs, one per line
      inline   - Single-line JSON with spaces after separators
    """
    if mode == "compact":
        return json.dumps(data, ensure_ascii=False, separators=(item_sep, key_sep))
    elif mode == "pretty":
        return json.dumps(data, ensure_ascii=False, indent=indent)
    elif mode == "inline":
        return json.dumps(data, ensure_ascii=False, separators=(item_sep + " ", key_sep + " "))
    elif mode == "flatten":
        lines = []
        _flatten(data, "", lines)
        return "\n".join(lines)
    else:
        raise ValueError(f"Unknown mode: {mode}. Use: compact, pretty, flatten, inline")


def _flatten(obj, prefix, lines):
    """Recursively flatten a JSON object into dot-notation key=value pairs."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                _flatten(v, key, lines)
            else:
                lines.append(f"{key}={json.dumps(v, ensure_ascii=False)}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            key = f"{prefix}[{i}]"
            if isinstance(v, (dict, list)):
                _flatten(v, key, lines)
            else:
                lines.append(f"{key}={json.dumps(v, ensure_ascii=False)}")
    else:
        lines.append(f"{prefix}={json.dumps(obj, ensure_ascii=False)}")


def main():
    parser = argparse.ArgumentParser(description="Convert JSON to string")
    parser.add_argument("input", nargs="?", help="Input JSON file (stdin if omitted)")
    parser.add_argument("-o", "--output", help="Output file (stdout if omitted)")
    parser.add_argument(
        "-m", "--mode",
        default="compact",
        choices=["compact", "pretty", "inline", "flatten"],
        help="Output mode (default: compact)",
    )
    parser.add_argument("-i", "--indent", type=int, default=2, help="Indent spaces for pretty mode (default: 2)")
    args = parser.parse_args()

    if args.input:
        with open(args.input, encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    result = json_to_string(data, mode=args.mode, indent=args.indent)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(result)


if __name__ == "__main__":
    main()
