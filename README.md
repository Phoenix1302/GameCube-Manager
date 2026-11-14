# GameCube-Manager 🎮 (v1.0.0 Release)

Полнофункциональная веб-панель управления и игровой портал для кастомной Steam Machine на базе **Fedora Linux / Fedora Silverblue / Bazzite + KDE Plasma + SteamOS helper scripts**.

---

## Стек технологий
* **Backend**: Node.js 20 (TypeScript) + Fastify 4 + SQLite (better-sqlite3) + PTY (WebSocket bash)
* **Frontend**: React 18 + TypeScript + Vite 5 + Tailwind CSS + Lucide Icons + xterm.js
* **Инфраструктура**: Podman Pod + systemd Quadlets (автозапуск на Fedora/Bazzite) / Docker
* **Торрент-модуль**: Headless qBittorrent 5.0 (порт 8085, BitTorrent 6882, полная изоляция от системного qBittorrent на 8080)
* **Прокси**: Nginx с автогенерацией SAN SSL-сертификатов, HTTP→HTTPS редиректом и поддержкой WSS

---

## Архитектура развертывания (Podman Pod)

Все компоненты работают в изолированном Podman Pod, разделяя общее локальное пространство портов:

```
                     ┌───────────────────────────────────────────────────────────────┐
                     │                   Podman Pod (gamecube-pod)                   │
                     │                                                               │
Outside Network ────>│  [gamecube-proxy]     ──proxy──>  [gamecube-web]              │
:443 (HTTPS)         │  Nginx SSL + SAN                  Node.js + Fastify + React   │
:80  (HTTP)          │  (Auto-redirect)       127.0.0.1  (127.0.0.1:3000)            │
                     │                                                               │
                     │                       ──proxy──>  [gamecube-torrent]          │
:6882 (BitTorrent) ──┼──────────────────────>            Headless qBittorrent-nox    │
 (TCP / UDP)         │                                   (127.0.0.1:8085)            │
                     └───────────────────────────────────────────────────────────────┘
```

1. **Безопасность**: Веб-приложение (`:3000`) и qBittorrent (`:8085`) доступны только внутри pod и не светятся наружу незащищенными портами.
2. **Nginx Reverse Proxy**: Отвечает за шифрование HTTPS, раздачу статики, WebSocket для терминала/графиков и маршрутизацию `/qbittorrent/`.
3. **Изолированный qBittorrent**: Работает на внутренних портах `8085 / 6882` и не конфликтует с нативным qbittorrent-nox на хосте (порт `8080`).

---

## Быстрый старт (Автоматическая установка на боевой машине)

Для автоматической установки и настройки автозапуска на **Fedora / Bazzite / SteamOS**:

```bash
git clone https://github.com/<your-username>/GameCube-Manager.git
cd GameCube-Manager
chmod +x install.sh uninstall.sh
./install.sh
```

**Что делает `install.sh` автоматически:**
1. Проверяет и настраивает разрешение непривилегированным пользователям занимать порты 80/443 (`net.ipv4.ip_unprivileged_port_start=80`).
2. Открывает порты в `firewalld` (80, 443, 6882).
3. Автоматически находит Steam userdata (`~/.local/share/Steam/userdata`) и емкие накопители для загрузок (например, `/mnt/game_data/Downloads`).
4. Собирает контейнеры (`gamecube-manager`, `gamecube-proxy`, `gamecube-torrent`).
5. Устанавливает **systemd Quadlets** в `~/.config/containers/systemd/` и включает `loginctl enable-linger $USER` для старта при включении ПК без входа в графическую сессию.
6. Запускает службу `gamecube-pod.service` и выводит локальный IP для доступа.

---

## Управление службой (systemd)

```bash
# Статус работы
systemctl --user status gamecube-pod.service

# Перезапуск
systemctl --user restart gamecube-pod.service

# Остановка
systemctl --user stop gamecube-pod.service

# Просмотр логов веб-панели
journalctl --user -u gamecube-web.service -f

# Полное удаление службы (игры и загрузки сохраняются)
./uninstall.sh
```

---

## Ручные способы запуска

### Способ 1: Скрипт Podman Pod (без systemd)
```bash
chmod +x deploy/start-pod.sh deploy/stop-pod.sh
./deploy/start-pod.sh

# Остановка
./deploy/stop-pod.sh
```

### Способ 2: Декларативный Kubernetes YAML (podman play kube)
```bash
podman play kube deploy/pod.yaml

# Остановка
podman play kube --down deploy/pod.yaml
```

### Способ 3: Docker Compose
```bash
docker compose -f deploy/docker-compose.yml up -d
```

### Способ 4: Windows PowerShell
```powershell
.\deploy\start-pod.ps1
```

---

## Доступ к панели
После старта откройте в браузере:
- **HTTPS**: `https://<ip-вашей-машины>` или `https://localhost` (подтвердите самоподписанный сертификат при первом входе).
- **Первичная настройка**: перейдите на `/setup` и задайте имя и пароль администратора.
