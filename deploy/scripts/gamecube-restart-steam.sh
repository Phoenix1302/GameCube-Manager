#!/usr/bin/env bash
# ==============================================================================
# GameCube-Manager - Universal SteamOS / Gamescope & Desktop Session Manager
# ==============================================================================
# Seamlessly handles:
#   1. restart / reload: soft restart of Steam inside Gamescope (no greeter drop)
#   2. plasma / desktop / 1: clean switch to KDE Plasma Desktop
#   3. gamescope / steam / 0: clean return to Gaming Mode (Gamescope)
# Compatible with both Plasma Login Manager (plasmalogin) and SDDM.
# ==============================================================================

set -uo pipefail

# 0. Auto-elevate to root if invoked by unprivileged user (e.g. Steam client)
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        exec sudo "$0" "$@"
    else
        echo "[GameCube-Session] Error: Root permissions required." >&2
        exit 1
    fi
fi

ACTION="${1:-restart}"
echo "[GameCube-Session] Requested action: ${ACTION}"

# 1. Determine active non-root desktop user and environment
ACTIVE_USER="${SUDO_USER:-}"
if [ -z "$ACTIVE_USER" ] || [ "$ACTIVE_USER" = "root" ]; then
    ACTIVE_USER=$(who 2>/dev/null | awk '{print $1}' | head -n1 || true)
fi

if [ -z "$ACTIVE_USER" ] || [ "$ACTIVE_USER" = "root" ]; then
    if [ -d "/run/user" ]; then
        for u in /run/user/[0-9]*; do
            if [ -d "$u" ]; then
                uid_num=$(basename "$u")
                uid_name=$(id -nu "$uid_num" 2>/dev/null || true)
                if [ -n "$uid_name" ] && [ "$uid_name" != "root" ]; then
                    ACTIVE_USER="$uid_name"
                    break
                fi
            fi
        done
    fi
fi

if [ -z "$ACTIVE_USER" ] || [ "$ACTIVE_USER" = "root" ]; then
    if [ -d "/home/gamecube" ]; then
        ACTIVE_USER="gamecube"
    elif [ -d "/home/deck" ]; then
        ACTIVE_USER="deck"
    else
        ACTIVE_USER=$(ls -1 /home 2>/dev/null | head -n1 || echo "gamecube")
    fi
fi

ACTIVE_UID=$(id -u "$ACTIVE_USER" 2>/dev/null || echo "1000")
USER_HOME=$(eval echo "~$ACTIVE_USER")

export XDG_RUNTIME_DIR="/run/user/${ACTIVE_UID}"
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${ACTIVE_UID}/bus"

echo "[GameCube-Session] Target desktop user: ${ACTIVE_USER} (UID: ${ACTIVE_UID})"

# Helper to run systemctl --user commands cleanly for the target user
user_systemctl() {
    sudo -u "$ACTIVE_USER" env XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" systemctl --user "$@" 2>/dev/null \
    || systemctl --machine="${ACTIVE_USER}@.host" --user "$@" 2>/dev/null \
    || true
}

# 2. Detect available session .desktop files
GAMESCOPE_SESSION=""
for candidate in \
    "gamescope-session-steam.desktop" \
    "gamescope-wayland.desktop" \
    "gamescope-session.desktop" \
    "steam.desktop" \
    "steamos.desktop"; do
    if [ -f "/usr/share/wayland-sessions/${candidate}" ] || [ -f "/usr/share/xsessions/${candidate}" ]; then
        GAMESCOPE_SESSION="${candidate}"
        break
    fi
done
[ -z "$GAMESCOPE_SESSION" ] && GAMESCOPE_SESSION="gamescope-session-steam.desktop"

DESKTOP_SESSION=""
for candidate in \
    "plasma.desktop" \
    "plasmawayland.desktop" \
    "gnome.desktop" \
    "gnome-wayland.desktop"; do
    if [ -f "/usr/share/wayland-sessions/${candidate}" ] || [ -f "/usr/share/xsessions/${candidate}" ]; then
        DESKTOP_SESSION="${candidate}"
        break
    fi
done
[ -z "$DESKTOP_SESSION" ] && DESKTOP_SESSION="plasma.desktop"

# Helper function to write autologin config for plasmalogin and SDDM
set_autologin_session() {
    local target_session="$1"
    echo "[GameCube-Session] Configuring autologin for session: ${target_session}..."

    # Clean up legacy / conflicting drop-ins that break desktop switching
    rm -f /etc/sddm.conf.d/zz-gamecube-session.conf 2>/dev/null || true
    rm -f /etc/plasmalogin.conf.d/zz-gamecube-session.conf 2>/dev/null || true

    # A. Plasma Login Manager (/etc/plasmalogin.conf.d/)
    if [ -d "/etc/plasmalogin.conf.d" ] || command -v plasmalogin >/dev/null 2>&1 || systemctl is-active --quiet plasmalogin.service 2>/dev/null; then
        mkdir -p "/etc/plasmalogin.conf.d" 2>/dev/null || true
        cat << EOF > /etc/plasmalogin.conf.d/autologin.conf 2>/dev/null || true
[Autologin]
User=${ACTIVE_USER}
Session=${target_session}
EOF
        echo "[GameCube-Session] Updated /etc/plasmalogin.conf.d/autologin.conf"
    fi

    # B. SDDM (/etc/sddm.conf.d/)
    if [ -d "/etc/sddm.conf.d" ] || command -v sddm >/dev/null 2>&1 || systemctl is-active --quiet sddm.service 2>/dev/null; then
        mkdir -p "/etc/sddm.conf.d" 2>/dev/null || true
        cat << EOF > /etc/sddm.conf.d/autologin.conf 2>/dev/null || true
[Autologin]
User=${ACTIVE_USER}
Session=${target_session}
Relogin=true
EOF
        echo "[GameCube-Session] Updated /etc/sddm.conf.d/autologin.conf"
    fi

    # C. Update SDDM state.conf
    if [ -d "/var/lib/sddm" ]; then
        local sess_path="/usr/share/wayland-sessions/${target_session}"
        [ ! -f "$sess_path" ] && sess_path="/usr/share/xsessions/${target_session}"
        cat << EOF > /var/lib/sddm/state.conf 2>/dev/null || true
[Last]
Session=${sess_path}
User=${ACTIVE_USER}
EOF
    fi
}

# 3. Handle Actions
case "$ACTION" in
    plasma|desktop|1|*plasma*|*desktop*)
        # ======================================================================
        # SWITCH TO DESKTOP MODE (Called by Steam Power menu "Switch to Desktop")
        # ======================================================================
        echo "[GameCube-Session] Switching to Desktop Mode (${DESKTOP_SESSION})..."
        set_autologin_session "${DESKTOP_SESSION}"

        # Cleanly stop gamescope systemd user services
        user_systemctl stop gamescope-session-plus@steam.service
        user_systemctl stop gamescope-session.service

        # Graceful shutdown of Steam client
        sudo -u "$ACTIVE_USER" env XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" steam -shutdown 2>/dev/null || true
        sleep 1

        # If gamescope process is still lingering, terminate gently
        pkill -u "$ACTIVE_UID" -x gamescope 2>/dev/null || true

        # Trigger display manager to pick up new desktop session immediately
        if systemctl is-active --quiet plasmalogin.service 2>/dev/null; then
            systemctl restart plasmalogin.service 2>/dev/null || true
        elif systemctl is-active --quiet sddm.service 2>/dev/null; then
            systemctl restart sddm.service 2>/dev/null || true
        fi
        ;;

    gamescope|game|steam|0|*gamescope*|*steam*)
        # ======================================================================
        # RETURN TO GAMING MODE (Called by Desktop "Return to Gaming Mode" icon)
        # ======================================================================
        echo "[GameCube-Session] Switching to Gaming Mode (${GAMESCOPE_SESSION})..."
        set_autologin_session "${GAMESCOPE_SESSION}"

        # Close Plasma session gracefully via DBus
        sudo -u "$ACTIVE_USER" env XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" qdbus org.kde.Shutdown /Shutdown logout 2>/dev/null || true
        sleep 1

        # Fallback termination of plasma if still alive
        if pgrep -u "$ACTIVE_UID" -x plasmashell >/dev/null 2>&1; then
            pkill -u "$ACTIVE_UID" -x plasmashell 2>/dev/null || true
            pkill -u "$ACTIVE_UID" -x ksmserver 2>/dev/null || true
            pkill -u "$ACTIVE_UID" -x kwin_wayland 2>/dev/null || true
        fi

        # Trigger display manager
        if systemctl is-active --quiet plasmalogin.service 2>/dev/null; then
            systemctl restart plasmalogin.service 2>/dev/null || true
        elif systemctl is-active --quiet sddm.service 2>/dev/null; then
            systemctl restart sddm.service 2>/dev/null || true
        fi
        ;;

    restart|reload|soft-restart|*)
        # ======================================================================
        # SEAMLESS SOFT RESTART (Called by GameCube-Manager after shortcut changes)
        # ======================================================================
        echo "[GameCube-Session] Performing seamless Gamescope session restart..."
        set_autologin_session "${GAMESCOPE_SESSION}"

        RESTARTED=false

        # A. Priority: Restart gamescope-session-plus@steam.service (Fedora 44 / Bazzite / ChimeraOS)
        if user_systemctl is-active --quiet gamescope-session-plus@steam.service; then
            echo "[GameCube-Session] Restarting systemd user service: gamescope-session-plus@steam.service..."
            user_systemctl restart gamescope-session-plus@steam.service
            RESTARTED=true
        fi

        # B. Fallback: Restart standard gamescope-session.service
        if [ "$RESTARTED" = false ] && user_systemctl is-active --quiet gamescope-session.service; then
            echo "[GameCube-Session] Restarting systemd user service: gamescope-session.service..."
            user_systemctl restart gamescope-session.service
            RESTARTED=true
        fi

        # C. Fallback: Signal Steam client cleanly
        if [ "$RESTARTED" = false ]; then
            echo "[GameCube-Session] Restarting Steam client cleanly inside compositor..."
            sudo -u "$ACTIVE_USER" env XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" steam -shutdown 2>/dev/null || true
            sleep 2
            pkill -u "$ACTIVE_UID" -x steam 2>/dev/null || true
        fi
        ;;
esac

echo "[GameCube-Session] Operation completed successfully."
exit 0
