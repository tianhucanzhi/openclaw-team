#!/usr/bin/env python3
"""Convert English words to lowercase. Handles files or direct strings.

Usage:
  python to_lowercase.py -t "HELLO World"
  python to_lowercase.py -i input.txt -o output.txt
  python to_lowercase.py -i input.txt  # print to stdout
"""

import argparse
import re
import sys
from pathlib import Path


def to_lowercase(text: str) -> str:
    """Convert all English letters to lowercase, preserving other characters."""
    return text.lower()


def main():
    parser = argparse.ArgumentParser(description="Convert English words to lowercase")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-t", "--text", help="Direct text input")
    group.add_argument("-i", "--input", help="Input file path")
    parser.add_argument("-o", "--output", help="Output file path (default: stdout)")
    parser.add_argument("--encoding", default="utf-8", help="File encoding (default: utf-8)")
    args = parser.parse_args()

    if args.input:
        text = Path(args.input).read_text(encoding=args.encoding)
    else:
        text = args.text

    result = to_lowercase(text)

    if args.output:
        Path(args.output).write_text(result, encoding=args.encoding)
        print(f"Output written to: {args.output}")
    else:
        print(result)


if __name__ == "__main__":
    main()
