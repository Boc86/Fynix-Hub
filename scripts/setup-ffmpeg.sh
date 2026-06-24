#!/bin/bash
set -e

FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
BIN_DIR="$(dirname "$0")/../bin"
FFMPEG_OUT="$BIN_DIR/ffmpeg"

if [ -f "$FFMPEG_OUT" ]; then
  echo "ffmpeg already exists at $FFMPEG_OUT"
  exit 0
fi

echo "Downloading static ffmpeg..."
TMPFILE=$(mktemp /tmp/ffmpeg-static.XXXXXX.tar.xz)
TMPDIR=$(mktemp -d /tmp/ffmpeg-extract.XXXXXX)

cleanup() {
  rm -f "$TMPFILE"
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

curl -sL "$FFMPEG_URL" -o "$TMPFILE"
tar -xf "$TMPFILE" -C "$TMPDIR" --strip-components=1

mkdir -p "$BIN_DIR"
cp "$TMPDIR/ffmpeg" "$FFMPEG_OUT"
chmod +x "$FFMPEG_OUT"

echo "ffmpeg installed to $FFMPEG_OUT"
"$FFMPEG_OUT" -version | head -1
