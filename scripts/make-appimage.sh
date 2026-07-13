#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Fynix Hub"
EXECUTABLE="fynix-hub"
ARCH="x86_64"
APPIMAGE_DIR="out/appimage"
DESKTOP_FILE="${APPIMAGE_DIR}/${APP_NAME}.desktop"
APP_RUN="${APPIMAGE_DIR}/AppRun"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <forge-package-dir>"
  echo "Example: $0 out/Fynix\\ Hub-linux-x64"
  exit 1
fi

FORGE_OUT="$1"
VERSION="$(node -p "require('./package.json').version")"

rm -rf "$APPIMAGE_DIR"
mkdir -p "$APPIMAGE_DIR/usr/bin"
mkdir -p "$APPIMAGE_DIR/usr/share/applications"
mkdir -p "$APPIMAGE_DIR/usr/share/icons/hicolor/512x512/apps"
mkdir -p "$APPIMAGE_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$APPIMAGE_DIR/usr/share/icons/hicolor/128x128/apps"
mkdir -p "$APPIMAGE_DIR/usr/share/icons/hicolor/64x64/apps"

cp -r "$FORGE_OUT"/* "$APPIMAGE_DIR/usr/bin/"
ln -sf "usr/bin/$EXECUTABLE" "$APPIMAGE_DIR/"

cp assets/FLB-512.png "$APPIMAGE_DIR/usr/share/icons/hicolor/512x512/apps/fynix-hub.png"
cp assets/FLB-256.png "$APPIMAGE_DIR/usr/share/icons/hicolor/256x256/apps/fynix-hub.png"
cp assets/FLB-128.png "$APPIMAGE_DIR/usr/share/icons/hicolor/128x128/apps/fynix-hub.png"
cp assets/FLB-64.png "$APPIMAGE_DIR/usr/share/icons/hicolor/64x64/apps/fynix-hub.png"
cp assets/FLB-512.png "$APPIMAGE_DIR/.DirIcon"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Fynix Hub
Exec=$EXECUTABLE
Icon=fynix-hub
Type=Application
Categories=Video;AudioVideo;
Terminal=false
StartupWMClass=fynix-hub
MimeType=video/mp4;video/x-matroska;
EOF

cp "$DESKTOP_FILE" "$APPIMAGE_DIR/usr/share/applications/"

cat > "$APP_RUN" <<'RUNEOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
export PATH="${HERE}/usr/bin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH:-}"
exec "${HERE}/usr/bin/fynix-hub" "$@"
RUNEOF
chmod +x "$APP_RUN"

APPDIR=$(mktemp -d)
cp -r "$APPIMAGE_DIR"/* "$APPDIR/"

if command -v appimagetool &>/dev/null; then
  appimagetool "$APPDIR" "out/Fynix_Hub-${VERSION}-${ARCH}.AppImage"
elif command -v docker &>/dev/null; then
  docker run --rm -v "$PWD:/workspace" -v "$APPDIR:/appdir" \
    -u "$(id -u):$(id -g)" \
    ghcr.io/appimage/appimagetool \
    /appdir "/workspace/out/Fynix_Hub-${VERSION}-${ARCH}.AppImage"
else
  echo "Error: appimagetool not found. Install it or use Docker."
  echo "  wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
  echo "  chmod +x appimagetool-x86_64.AppImage"
  exit 1
fi

rm -rf "$APPDIR"
echo "AppImage created: out/Fynix_Hub-${VERSION}-${ARCH}.AppImage"
