#!/usr/bin/env bash
set -euo pipefail

APP="Fynix Hub"
BIN="fynix-hub"
REPO="Boc86/Fynix-Hub"
INSTALL_DIR="$HOME/Applications"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"

echo "Installing $APP..."

# Get latest release info
echo "Fetching latest release..."
RELEASE=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest")
VERSION=$(echo "$RELEASE" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": "v\(.*\)",/\1/')
URL=$(echo "$RELEASE" | grep '"browser_download_url"' | grep '\.AppImage"' | head -1 | sed 's/.*"browser_download_url": "\(.*\)"/\1/')

if [ -z "$URL" ]; then
  echo "Error: No AppImage found in latest release"
  exit 1
fi

echo "Version: v$VERSION"
echo "Downloading: $(basename "$URL")"

mkdir -p "$INSTALL_DIR" "$DESKTOP_DIR" "$ICON_DIR"

# Download AppImage
curl -sL "$URL" -o "$INSTALL_DIR/$BIN"
chmod +x "$INSTALL_DIR/$BIN"

# Download icon from GitHub (fallback to a generic media icon)
ICON_PATH="$ICON_DIR/fynix-hub.png"
if ! curl -sL "https://raw.githubusercontent.com/$REPO/master/assets/icon.png" -o "$ICON_PATH" 2>/dev/null; then
  ICON_PATH="multimedia-player"
fi

# Create desktop entry
cat > "$DESKTOP_DIR/fynix-hub.desktop" << EOF
[Desktop Entry]
Name=$APP
Exec=$INSTALL_DIR/$BIN
Terminal=false
Type=Application
Icon=$ICON_PATH
Categories=Multimedia;
StartupWMClass=Fynix Hub
Comment=Media Hub with Netflix-like experience
EOF

# Update desktop database
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo ""
echo "$APP v$VERSION installed to $INSTALL_DIR/$BIN"
echo "Launch from application menu (under Multimedia) or run: $INSTALL_DIR/$BIN"
echo ""
echo "To uninstall:"
echo "  rm $INSTALL_DIR/$BIN $DESKTOP_DIR/fynix-hub.desktop $ICON_DIR/fynix-hub.png"
