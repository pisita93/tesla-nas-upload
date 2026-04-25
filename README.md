# Tesla NAS Upload

Upload Tesla dashcam files (and any other files) directly from Tesla's built-in browser to your Synology NAS.

![Tesla NAS Upload](https://img.shields.io/badge/Tesla-Compatible-red) ![Synology](https://img.shields.io/badge/Synology-DSM-blue) ![Docker](https://img.shields.io/badge/Docker-Compose-2496ed)

## Features

- 4-digit PIN authentication
- Drag & drop or browse-to-upload  
- Up to 10 GB per file, 50 files per batch
- Files auto-organized into date folders (`YYYY-MM-DD/`)
- File browser with download & delete
- Storage stats with upload history chart
- Tesla-browser optimized UI (works on older Chromium)
- Single port (3000), nginx reverse proxy
- All session data in-memory, no database needed

## Architecture

```
Tesla browser → http://<NAS-IP>:3000
                       │
                       ▼
              ┌──────────────────┐
              │  nginx (port 80) │
              │  serves UI HTML  │
              │  proxies /api/   │
              └─────────┬────────┘
                        │ internal network
                        ▼
              ┌──────────────────┐
              │  Node.js backend │
              │  (port 4000)     │
              └─────────┬────────┘
                        │ volume mount
                        ▼
                 /volume1/docker/Tesla
```

## Quick Deploy on Synology NAS

### Option A — Portainer (recommended)

1. **Create the upload folder** in File Station: `/volume1/docker/Tesla`

2. **Open Portainer** → **Stacks** → **Add Stack** → choose **Repository**

3. Fill in:
   - **Name**: `tesla-upload`
   - **Repository URL**: `https://github.com/<your-username>/tesla-nas-upload`
   - **Repository reference**: `refs/heads/main`
   - **Compose path**: `docker-compose.yml`

4. Under **Environment variables**, click **Advanced mode** and paste:
   ```
   UPLOAD_PATH=/volume1/docker/Tesla
   ACCESS_PIN=7731
   FRONTEND_PORT=3000
   ```

5. Click **Deploy the stack**

6. Open `http://<NAS-IP>:3000` in your Tesla browser, enter your PIN

### Option B — SSH + Docker Compose

```bash
# SSH to your NAS
ssh admin@<NAS-IP>

# Clone the repo
cd /volume1/docker
git clone https://github.com/<your-username>/tesla-nas-upload.git
cd tesla-nas-upload

# Configure
cp .env.example .env
nano .env  # edit your PIN and path

# Make sure upload folder exists
sudo mkdir -p /volume1/docker/Tesla

# Build and start
sudo docker compose up -d --build

# Check status
sudo docker compose ps
sudo docker compose logs -f
```

## Repository Structure

```
tesla-nas-upload/
├── backend/                  Node.js API
│   ├── server.js            Express server (auth + upload + files)
│   ├── package.json
│   └── Dockerfile
├── frontend/                 Static UI
│   ├── index.html           Tesla-browser-compatible UI
│   ├── default.conf         Nginx reverse proxy config
│   └── Dockerfile
├── docker-compose.yml       Stack definition
├── .env.example             Configuration template
└── README.md
```

## Configuration

All settings are environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_PATH` | `/volume1/docker/Tesla` | NAS folder where files are saved |
| `ACCESS_PIN` | `7731` | 4-digit PIN to unlock the UI |
| `FRONTEND_PORT` | `3000` | Port to access the web UI |

Backend container env vars (set inside `docker-compose.yml`):

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_TIMEOUT_MINUTES` | `60` | How long PIN session stays valid |
| `MAX_FILE_SIZE_GB` | `10` | Max single file size |
| `MAX_FILES_PER_BATCH` | `50` | Max files per upload |

## API Endpoints

All endpoints (except `/api/health` and `/api/auth/*`) require `x-session-token` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/health` | Service status |
| GET    | `/api/auth/check` | Is current session valid? |
| POST   | `/api/auth/login` | Login with `{pin: "1234"}` |
| POST   | `/api/auth/logout` | End session |
| POST   | `/api/upload` | Upload files (multipart/form-data) |
| GET    | `/api/files` | List all files |
| GET    | `/api/files/download?path=...` | Download a file |
| DELETE | `/api/files?path=...` | Delete a file |
| GET    | `/api/stats` | File counts and storage stats |

## Using from Tesla

1. Park at home, connect Tesla to your home Wi-Fi
2. Open the Tesla browser
3. Navigate to `http://<NAS-IP>:3000`
4. Enter your PIN
5. Tap **BROWSE FILES** or drag & drop dashcam files from a USB drive
6. Tap **UPLOAD TO NAS**

> **Tip:** Bookmark the URL in Tesla's browser for one-tap access.

## Updating the Stack

### Via Portainer
1. Go to your stack → click **Pull and redeploy**
2. Portainer pulls the latest commits from GitHub and rebuilds

### Via SSH
```bash
cd /volume1/docker/tesla-nas-upload
git pull
sudo docker compose up -d --build
```

## Troubleshooting

### "no such file or directory" on volume mount
Create the folder before deploying:
```bash
sudo mkdir -p /volume1/docker/Tesla
sudo chmod 755 /volume1/docker/Tesla
```

### PIN keypad doesn't respond on Tesla
Clear the Tesla browser cache (Browser → Settings → Clear browser data) and reload.

### Port 3000 already in use
Change `FRONTEND_PORT=3000` in `.env` to something else like `3500`.

### Backend can't write files
Check folder permissions:
```bash
sudo chown -R 1000:1000 /volume1/docker/Tesla
```

## License

MIT
