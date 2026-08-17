#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Fynix Hub — Interactive Installer / Updater / Uninstaller (TUI)
#
#  Features:
#    • Auto-detects the Linux distribution and its package family
#    • Detects an existing install (AppImage / deb / rpm / zip) + its version
#    • Offers install, update (when a newer version exists), or uninstall
#    • Lets the user pick a package type limited to what the distro supports
#    • Installs via the native package manager (apt/dnf/zypper) or AppImage steps
#    • Fynix-themed UI (orange #FF6B00 on dark) with arrow-key navigation
#
#  Requires: bash 4+, curl, and (optionally) the relevant package manager.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

# ── Palette ──────────────────────────────────────────────────────────────────
ORANGE=$'\033[38;2;255;107;0m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
WHITE=$'\033[38;2;255;255;255m'
GREY=$'\033[38;2;160;160;160m'
GREEN=$'\033[38;2;80;220;120m'
RED=$'\033[38;2;240;100;100m'
YELLOW=$'\033[38;2;240;200;80m'
RESET=$'\033[0m'
CLEAR=$'\033[2J\033[H'

APP="Fynix Hub"
BIN="fynix-hub"
REPO="Boc86/Fynix-Hub"
API="https://api.github.com/repos/$REPO/releases/latest"
STATE_DIR="$HOME/.local/share/fynix-hub"
STATE_FILE="$STATE_DIR/install-info.json"
INSTALL_DIR="$HOME/Applications"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
DESKTOP_FILE="$DESKTOP_DIR/fynix-hub.desktop"

# ── Detect terminal size ──────────────────────────────────────────────────────
term_width=80
term_height=24
if [[ -t 1 ]]; then
  term_width=$(tput cols 2>/dev/null || echo 80)
  term_height=$(tput lines 2>/dev/null || echo 24)
fi

# ── Logging helpers ─────────────────────────────────────────────────────────
log()  { printf "${WHITE}%s${RESET}\n" "$*"; }
info() { printf "  ${DIM}›${RESET} ${GREY}%s${RESET}\n" "$*"; }
ok()   { printf "  ${GREEN}✓${RESET} ${WHITE}%s${RESET}\n" "$*"; }
warn() { printf "  ${YELLOW}!${RESET} ${WHITE}%s${RESET}\n" "$*"; }
err()  { printf "  ${RED}✗${RESET} ${WHITE}%s${RESET}\n" "$*"; }
raw()  { printf "%s" "$*"; }

# ── Banner ──────────────────────────────────────────────────────────────────
banner() {
  local top=$(( (term_height - 12) / 2 ))
  [[ $top -lt 0 ]] && top=0
  # Logo block
  printf "${CLEAR}"
  for ((i=0;i<top;i++)); do echo; done
  local pad=$(( (term_width - 40) / 2 )); [[ $pad -lt 0 ]] && pad=0
  local sp=$(printf "%*s" "$pad" "")
  printf "${sp}${ORANGE}${BOLD}██╗${RESET} ${ORANGE}${BOLD}███████╗${RESET} ${ORANGE}${BOLD}██╗${RESET}   ${ORANGE}${BOLD}██╗${RESET} ${ORANGE}${BOLD}██╗${RESET} ${ORANGE}${BOLD}███████╗${RESET} ${ORANGE}${BOLD}██╗${RESET}  ${ORANGE}${BOLD}██╗${RESET}\n"
  printf "${sp}${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██╔════╝${RESET} ${ORANGE}${BOLD}██║${RESET}   ${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██╔════╝${RESET} ${ORANGE}${BOLD}╚██╗${RESET} ${ORANGE}${BOLD}██╔╝${RESET}\n"
  printf "${sp}${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}█████╗${RESET}   ${ORANGE}${BOLD}██║${RESET}   ${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}█████╗${RESET}   ${ORANGE}${BOLD}╚██╗${RESET} ${ORANGE}${BOLD}██╔╝${RESET}\n"
  printf "${sp}${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██╔══╝${RESET}   ${ORANGE}${BOLD}██║${RESET}   ${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██╔══╝${RESET}   ${ORANGE}${BOLD}██╗${RESET} ${ORANGE}${BOLD}██║${RESET}\n"
  printf "${sp}${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}██║${RESET}      ${ORANGE}${BOLD}╚██████╔╝${RESET} ${ORANGE}${BOLD}██║${RESET} ${ORANGE}${BOLD}███████╗${RESET} ${ORANGE}${BOLD}██╔╝${RESET} ${ORANGE}${BOLD}██║${RESET}\n"
  printf "${sp}${ORANGE}╚═╝${RESET} ${ORANGE}╚═╝${RESET}       ${ORANGE}╚═════╝${RESET}  ${ORANGE}╚═╝${RESET} ${ORANGE}╚══════╝${RESET} ${ORANGE}╚═╝${RESET}  ${ORANGE}╚═╝${RESET}\n"
  echo
  printf "${sp}${GREY}${BOLD}Media Hub with a Netflix-like experience${RESET}\n"
  echo
  printf "${sp}${DIM}Interactive installer · updater · uninstaller${RESET}\n"
  echo
}

# ── Spinner (background curl) ─────────────────────────────────────────────────
spinner() {
  local pid=$1; local msg="$2"; local frames="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${ORANGE}%s${RESET} ${GREY}%s${RESET}" "${frames:i++%10:1}" "$msg"
    sleep 0.1
  done
  printf "\r  ${GREEN}✓${RESET} ${GREY}%s${RESET}\n" "$msg"
}

# ── Key read ──────────────────────────────────────────────────────────────────
read_key() {
  local key
  IFS= read -rsn1 key 2>/dev/null
  if [[ $key == $'\e' ]]; then
    IFS= read -rsn2 -t 0.01 tail 2>/dev/null
    key+=$tail
  fi
  printf '%s' "$key"
}

# ── Menu widget (arrow keys) ──────────────────────────────────────────────────
#  Usage: menu "Title" "opt1|opt2|opt3" -> sets MENU_SEL (1-based index)
menu() {
  local title="$1"; local IFS='|'; local -a opts=($2); local n=${#opts[@]}
  local sel=0; local key
  while true; do
    printf "${CLEAR}"
    banner
    if [[ -n $title ]]; then printf "  ${BOLD}${WHITE}%s${RESET}\n" "$title"; echo; fi
    for i in "${!opts[@]}"; do
      if (( i == sel )); then
        printf "  ${ORANGE}▸ ${BOLD}${WHITE}%s${RESET}\n" "${opts[i]}"
      else
        printf "    ${GREY}%s${RESET}\n" "${opts[i]}"
      fi
    done
    echo
    printf "  ${DIM}↑/↓ navigate · Enter select · q quit${RESET}\n"
    key=$(read_key)
    case "$key" in
      $'\e[A'|$'[[A') (( sel = (sel - 1 + n) % n )) ;;
      $'\e[B'|$'[[B') (( sel = (sel + 1) % n )) ;;
      '') break ;;
      q|Q) MENU_SEL=0; return 1 ;;
    esac
  done
  MENU_SEL=$(( sel + 1 ))
}

# ── Yes/No widget ────────────────────────────────────────────────────────────
confirm() {
  local prompt="$1"; local sel=0; local key
  local yes="Yes"; local no="No"
  while true; do
    printf "${CLEAR}"
    banner
    printf "  ${BOLD}${WHITE}%s${RESET}\n" "$prompt"; echo
    if (( sel == 0 )); then
      printf "  ${ORANGE}▸ ${BOLD}${WHITE}[ Yes ]${RESET}    ${GREY}[ No ]${RESET}\n"
    else
      printf "    ${GREY}[ Yes ]${RESET}    ${ORANGE}▸ ${BOLD}${WHITE}[ No ]${RESET}\n"
    fi
    echo; printf "  ${DIM}←/→ navigate · Enter select${RESET}\n"
    key=$(read_key)
    case "$key" in
      $'\e[D'|$'[[D') sel=0 ;;
      $'\e[C'|$'[[C') sel=1 ;;
      '') break ;;
      q|Q) return 1 ;;
    esac
  done
  [[ $sel -eq 0 ]]
}

# ── Distro detection ──────────────────────────────────────────────────────────
detect_distro() {
  DISTRO_ID=""; DISTRO_NAME=""; DISTRO_FAMILY=""; PKG_MANAGER=""; SUPPORTS_DEB=false; SUPPORTS_RPM=false
  if [[ -r /etc/os-release ]]; then
    . /etc/os-release 2>/dev/null
    DISTRO_ID="${ID:-unknown}"
    DISTRO_NAME="${NAME:-Unknown}"
  fi
  case ",${ID_LIKE:-},$ID," in
    *,debian,*|*,ubuntu,*|*,linuxmint,*) DISTRO_FAMILY="debian"; PKG_MANAGER="apt"; SUPPORTS_DEB=true ;;
    *,fedora,*|*,rhel,*|*,centos,*|*,nobara,*|*,suse,*|*,opensuse,*) DISTRO_FAMILY="rhel"; PKG_MANAGER="dnf"; SUPPORTS_RPM=true ;;
    *,arch,*|*,archlinux,*) DISTRO_FAMILY="arch"; PKG_MANAGER="pacman" ;;
    *,arch,*) DISTRO_FAMILY="arch" ;;
  esac
  # Refine package manager availability
  if $SUPPORTS_DEB && ! command -v apt &>/dev/null && command -v dpkg &>/dev/null; then PKG_MANAGER="dpkg"; fi
  if $SUPPORTS_RPM; then
    if command -v dnf &>/dev/null; then PKG_MANAGER="dnf"
    elif command -v zypper &>/dev/null; then PKG_MANAGER="zypper"; DISTRO_FAMILY="suse"
    elif command -v rpm &>/dev/null; then PKG_MANAGER="rpm"; fi
  fi
}

# ── Version comparison (semver-lite) ───────────────────────────────────────────
ver_gt() { # ver_gt A B -> true if A > B
  [[ "$1" == "$2" ]] && return 1
  local IFS=.
  local a=(${1//v/}); local b=(${2//v/})
  local i
  for ((i=0;i<${#a[@]}||i<${#b[@]};i++)); do
    local an=${a[i]:-0}; local bn=${b[i]:-0}
    (( an > bn )) && return 0
    (( an < bn )) && return 1
  done
  return 1
}

# ── Fetch latest release assets ───────────────────────────────────────────────
fetch_release() {
  info "Querying GitHub for the latest release…"
  local tmp json
  tmp=$(mktemp)
  curl -sL --max-time 30 "$API" -o "$tmp" &
  spinner $! "Contacting GitHub releases API"
  if ! command -v python3 &>/dev/null; then err "python3 is required to parse release metadata."; rm -f "$tmp"; return 1; fi
  json=$(python3 - "$tmp" <<'PY'
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    tag = d.get('tag_name','')
    out = {'tag': tag, 'assets': []}
    for a in d.get('assets', []):
        n = a.get('name','')
        out['assets'].append({'name': n, 'url': a.get('browser_download_url','')})
    print(json.dumps(out))
except Exception as e:
    print('ERR:'+str(e))
PY
  )
  rm -f "$tmp"
  if [[ "$json" == ERR* ]]; then err "Failed to parse release data: ${json#ERR:}"; return 1; fi
  RELEASE_TAG=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag'])")
  RELEASE_VER=${RELEASE_TAG#v}
  # Pick asset URLs
  ASSET_DEB=$(printf '%s' "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((a['url'] for a in d['assets'] if a['name'].endswith('.deb')),''))")
  ASSET_RPM=$(printf '%s' "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((a['url'] for a in d['assets'] if a['name'].endswith('.rpm')),''))")
  ASSET_APPIMAGE=$(printf '%s' "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((a['url'] for a in d['assets'] if a['name'].endswith('.AppImage')),''))")
  ASSET_ZIP=$(printf '%s' "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((a['url'] for a in d['assets'] if a['name'].endswith('.zip')),''))")
  return 0
}

# ── Existing install detection ────────────────────────────────────────────────
detect_install() {
  INSTALLED=false; INSTALLED_TYPE=""; INSTALLED_VERSION=""; INSTALLED_PATH=""
  # 1) State file (most reliable)
  if [[ -r "$STATE_FILE" ]]; then
    local data
    data=$(python3 -c "import json,sys; d=json.load(open('$STATE_FILE')); print(d.get('type','')+'|'+d.get('version','')+'|'+d.get('path',''))" 2>/dev/null)
    if [[ -n "$data" ]]; then
      IFS='|' read -r INSTALLED_TYPE INSTALLED_VERSION INSTALLED_PATH <<< "$data"
      if [[ -n "$INSTALLED_PATH" && -e "$INSTALLED_PATH" ]]; then INSTALLED=true; fi
    fi
  fi
  # 2) AppImage heuristics
  if ! $INSTALLED; then
    local cand=("$INSTALL_DIR/fynix-hub" "$INSTALL_DIR/FynixHub.AppImage" "/opt/fynix-hub/fynix-hub.AppImage")
    for c in "${cand[@]}"; do
      if [[ -x "$c" ]]; then
        INSTALLED=true; INSTALLED_TYPE="appimage"; INSTALLED_PATH="$c"
        # Try to read version from the AppImage
        INSTALLED_VERSION=$(grep -ao 'Fynix Hub v[0-9][0-9.]*' "$c" 2>/dev/null | head -1 | sed 's/.*v//')
        break
      fi
    done
  fi
  # 3) Native package
  if ! $INSTALLED && command -v fynix-hub &>/dev/null; then
    INSTALLED_PATH=$(command -v fynix-hub)
    if command -v dpkg &>/dev/null && dpkg -l fynix-hub &>/dev/null 2>&1 | grep -q '^ii'; then
      INSTALLED=true; INSTALLED_TYPE="deb"; INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' fynix-hub 2>/dev/null | sed 's/.*://; s/~.*//')
    elif command -v rpm &>/dev/null && rpm -q fynix-hub &>/dev/null 2>&1; then
      INSTALLED=true; INSTALLED_TYPE="rpm"; INSTALLED_VERSION=$(rpm -q --qf '%{V}' fynix-hub 2>/dev/null)
    fi
  fi
  if $INSTALLED && [[ -z "$INSTALLED_VERSION" ]]; then INSTALLED_VERSION="unknown"; fi
}

write_state() {
  mkdir -p "$STATE_DIR"
  python3 - "$STATE_FILE" "$1" "$2" "$3" <<'PY'
import json, sys
f, t, v, p = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
json.dump({'type': t, 'version': v, 'path': p}, open(f, 'w'))
PY
}

# ── Icon ────────────────────────────────────────────────────────────────────
install_icon() {
  mkdir -p "$ICON_DIR"
  local icon="$ICON_DIR/fynix-hub.png"
  curl -sL --max-time 20 "https://raw.githubusercontent.com/$REPO/master/assets/FLB-256.png" -o "$icon" 2>/dev/null
  if [[ ! -s "$icon" ]]; then icon="video-player"; fi
  printf '%s' "$icon"
}

install_desktop() {
  local execpath="$1"; local icon="$2"
  mkdir -p "$DESKTOP_DIR"
  cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=$APP
Exec=$execpath
Terminal=false
Type=Application
Icon=$icon
Categories=AudioVideo;Video;Player;
StartupWMClass=fynix-hub
Comment=Media Hub with Netflix-like experience
X-Fynix-Version=$RELEASE_VER
EOF
  if command -v update-desktop-database &>/dev/null; then update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true; fi
}

# ── Package-type selection ────────────────────────────────────────────────────
choose_pkgtype() {
  local opts=""; local urls=""
  if $SUPPORTS_DEB && [[ -n "$ASSET_DEB" ]]; then opts+="Debian package (.deb)|"; urls+="$ASSET_DEB|"; fi
  if $SUPPORTS_RPM && [[ -n "$ASSET_RPM" ]]; then opts+="Red Hat package (.rpm)|"; urls+="$ASSET_RPM|"; fi
  opts+="AppImage (portable)|"; urls+="$ASSET_APPIMAGE|"
  opts+="Zip archive|"; urls+="$ASSET_ZIP|"
  opts="${opts%|}"; urls="${urls%|}"
  menu "Select package type for $DISTRO_NAME" "$opts"
  local idx=$MENU_SEL
  IFS='|' read -ra U <<< "$urls"
  local map=()
  local i=1
  $SUPPORTS_DEB && [[ -n "$ASSET_DEB" ]] && { map+=("deb"); ((i++)); }
  $SUPPORTS_RPM && [[ -n "$ASSET_RPM" ]] && { map+=("rpm"); ((i++)); }
  map+=("appimage"); ((i++)); map+=("zip"); ((i++))
  PKG_TYPE="${map[idx-1]}"
  PKG_URL="${U[idx-1]}"
}

# ── Download helper ────────────────────────────────────────────────────────────
download() {
  local url="$1"; local out="$2"
  curl -sL --max-time 600 "$url" -o "$out" &
  spinner $! "Downloading $(basename "$url")"
  [[ -s "$out" ]]
}

# ── Install routines ───────────────────────────────────────────────────────────
do_install() {
  choose_pkgtype
  [[ -z "$PKG_TYPE" ]] && { err "No package selected."; return 1; }
  local tmpd; tmpd=$(mktemp -d)
  local icon; icon=$(install_icon)
  case "$PKG_TYPE" in
    deb)
      local pkg="$tmpd/fynix.deb"
      download "$PKG_URL" "$pkg" || { err "Download failed."; rm -rf "$tmpd"; return 1; }
      info "Installing with $PKG_MANAGER…"
      case "$PKG_MANAGER" in
        apt)  sudo apt-get install -y "$pkg" 2>&1 | tail -3 || sudo dpkg -i "$pkg" && sudo apt-get install -f -y ;;
        dpkg) sudo dpkg -i "$pkg" ;;
        *)    sudo dpkg -i "$pkg" ;;
      esac
      INSTALLED_PATH=$(command -v fynix-hub || echo "/usr/bin/fynix-hub")
      install_desktop "$INSTALLED_PATH" "$icon"
      write_state "deb" "$RELEASE_VER" "$INSTALLED_PATH"
      ;;
    rpm)
      local pkg="$tmpd/fynix.rpm"
      download "$PKG_URL" "$pkg" || { err "Download failed."; rm -rf "$tmpd"; return 1; }
      info "Installing with $PKG_MANAGER…"
      case "$PKG_MANAGER" in
        dnf)    sudo dnf install -y "$pkg" ;;
        zypper) sudo zypper install -y "$pkg" ;;
        rpm)    sudo rpm -i "$pkg" ;;
        *)      sudo rpm -i "$pkg" ;;
      esac
      INSTALLED_PATH=$(command -v fynix-hub || echo "/usr/bin/fynix-hub")
      install_desktop "$INSTALLED_PATH" "$icon"
      write_state "rpm" "$RELEASE_VER" "$INSTALLED_PATH"
      ;;
    appimage)
      mkdir -p "$INSTALL_DIR"
      local ai="$INSTALL_DIR/fynix-hub"
      download "$PKG_URL" "$ai" || { err "Download failed."; rm -rf "$tmpd"; return 1; }
      chmod +x "$ai"
      install_desktop "$ai" "$icon"
      write_state "appimage" "$RELEASE_VER" "$ai"
      ;;
    zip)
      mkdir -p "$INSTALL_DIR/fynix-hub-app"
      local z="$tmpd/fynix.zip"
      download "$PKG_URL" "$z" || { err "Download failed."; rm -rf "$tmpd"; return 1; }
      ( cd "$INSTALL_DIR/fynix-hub-app" && unzip -oq "$z" )
      INSTALLED_PATH="$INSTALL_DIR/fynix-hub-app/fynix-hub"
      [[ -x "$INSTALLED_PATH" ]] && chmod +x "$INSTALLED_PATH"
      install_desktop "$INSTALLED_PATH" "$icon"
      write_state "zip" "$RELEASE_VER" "$INSTALLED_PATH"
      ;;
  esac
  rm -rf "$tmpd"
  ok "$APP v$RELEASE_VER installed ($PKG_TYPE)"
  info "Launch it from your application menu or run: $INSTALLED_PATH"
}

# ── Update routine ────────────────────────────────────────────────────────────
do_update() {
  info "Updating $INSTALLED_TYPE install from v$INSTALLED_VERSION to v$RELEASE_VER…"
  case "$INSTALLED_TYPE" in
    deb|rpm)
      # Re-run native install (re-installs over the top)
      local tmpd; tmpd=$(mktemp -d)
      local url="$ASSET_DEB"; [[ "$INSTALLED_TYPE" == "rpm" ]] && url="$ASSET_RPM"
      local pkg="$tmpd/fynix.${INSTALLED_TYPE}"
      download "$url" "$pkg" || { err "Download failed."; rm -rf "$tmpd"; return 1; }
      info "Installing with $PKG_MANAGER…"
      if [[ "$INSTALLED_TYPE" == "deb" ]]; then
        case "$PKG_MANAGER" in apt) sudo apt-get install -y "$pkg";; *) sudo dpkg -i "$pkg";; esac
      else
        case "$PKG_MANAGER" in dnf) sudo dnf install -y "$pkg";; zypper) sudo zypper install -y "$pkg";; *) sudo rpm -U "$pkg";; esac
      fi
      write_state "$INSTALLED_TYPE" "$RELEASE_VER" "$INSTALLED_PATH"
      rm -rf "$tmpd"
      ;;
    appimage|zip)
      # Just fetch the matching asset again
      local url="$ASSET_APPIMAGE"; [[ "$INSTALLED_TYPE" == "zip" ]] && url="$ASSET_ZIP"
      local out="$INSTALLED_PATH"
      [[ "$INSTALLED_TYPE" == "zip" ]] && out="$INSTALLED_PATH/fynix.zip"
      download "$url" "$out" || { err "Download failed."; return 1; }
      [[ "$INSTALLED_TYPE" == "appimage" ]] && chmod +x "$out"
      [[ "$INSTALLED_TYPE" == "zip" ]] && ( cd "$(dirname "$INSTALLED_PATH")" && unzip -oq fynix.zip )
      write_state "$INSTALLED_TYPE" "$RELEASE_VER" "$INSTALLED_PATH"
      ;;
  esac
  ok "Updated to v$RELEASE_VER"
}

# ── Uninstall routine ─────────────────────────────────────────────────────────
do_uninstall() {
  info "Removing $APP ($INSTALLED_TYPE)…"
  case "$INSTALLED_TYPE" in
    deb)  sudo apt-get remove -y fynix-hub 2>/dev/null || sudo dpkg -r fynix-hub 2>/dev/null || true ;;
    rpm)  sudo dnf remove -y fynix-hub 2>/dev/null || sudo rpm -e fynix-hub 2>/dev/null || true ;;
    appimage)
      rm -f "$INSTALLED_PATH" "${INSTALLED_PATH}.config" 2>/dev/null || true
      ;;
    zip)
      rm -rf "$(dirname "$INSTALLED_PATH")" 2>/dev/null || true
      ;;
  esac
  rm -f "$DESKTOP_FILE"
  rm -f "$ICON_DIR/fynix-hub.png"
  rm -f "$STATE_FILE"
  ok "Uninstalled $APP"
}

# ── Main flow ──────────────────────────────────────────────────────────────────
main() {
  # Non-interactive override: if called with args, do a quick install
  if [[ $# -gt 0 ]]; then
    detect_distro
    fetch_release || exit 1
    if ! fetch_release; then exit 1; fi
    do_install
    exit $?
  fi

  detect_distro
  banner
  info "Detected: ${BOLD}$DISTRO_NAME${RESET} (${DIM}$DISTRO_FAMILY family${RESET})"
  sleep 0.6

  detect_install
  if ! fetch_release; then err "Could not reach GitHub. Check your connection."; exit 1; fi

  if $INSTALLED; then
    printf "\n"; log "Existing install found: ${BOLD}${WHITE}v$INSTALLED_VERSION${RESET} (${GREY}$INSTALLED_TYPE${RESET})"
    if ver_gt "$RELEASE_VER" "$INSTALLED_VERSION"; then
      warn "A newer version is available: ${BOLD}${ORANGE}v$RELEASE_VER${RESET}"
      menu "What would you like to do?" "Update to v$RELEASE_VER|Reinstall v$RELEASE_VER|Uninstall|Exit"
      case $MENU_SEL in
        1) do_update ;;
        2) do_install ;;
        3) if confirm "Uninstall $APP v$INSTALLED_VERSION?"; then do_uninstall; fi ;;
        4|0) log "Bye."; exit 0 ;;
      esac
    else
      ok "You already have the latest version (v$RELEASE_VER)."
      menu "What would you like to do?" "Reinstall v$RELEASE_VER|Uninstall|Exit"
      case $MENU_SEL in
        1) do_install ;;
        2) if confirm "Uninstall $APP v$INSTALLED_VERSION?"; then do_uninstall; fi ;;
        3|0) log "Bye."; exit 0 ;;
      esac
    fi
  else
    log "No existing install detected."
    menu "Install $APP v$RELEASE_VER?" "Install now|Choose package type|Exit"
    case $MENU_SEL in
      1) PKG_TYPE=""; PKG_URL=""; choose_default ;;
      2) do_install ;;
      3|0) log "Bye."; exit 0 ;;
    esac
  fi
  echo
  log "Done."
}

# Default install = first valid package for this distro
choose_default() {
  if $SUPPORTS_DEB && [[ -n "$ASSET_DEB" ]]; then PKG_TYPE="deb"; PKG_URL="$ASSET_DEB"; do_install; return; fi
  if $SUPPORTS_RPM && [[ -n "$ASSET_RPM" ]]; then PKG_TYPE="rpm"; PKG_URL="$ASSET_RPM"; do_install; return; fi
  PKG_TYPE="appimage"; PKG_URL="$ASSET_APPIMAGE"; do_install
}

# Only run when executed directly (not when sourced for testing)
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
