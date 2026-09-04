# AquaGuard Windows Client Deployment

This guide describes the deployment of the AquaGuard monitoring client on a barangay Windows computer. The primary production deployment uses a **zero-dependency portable client** that bundles its own private Python runtime.

---

## 1. System Architecture & Topology

```text
https://aquaguard-live.vercel.app (Cloud Web Portal)
        |
        |-- Supabase Cloud (Authentication, PostgreSQL Database, RLS, Realtime Engine)
        |-- Open-Meteo API (Regional Weather & Forecasts)
        `-- http://127.0.0.1:5000 (Loopback Interface)
              AquaGuard Camera Agent (Running on Local Monitoring PC)
              |-- Private Bundled CPython 3.12.10 (No system Python required)
              |-- Video Capture: Local USB Webcam or On-Premises RTSP CCTV
              |-- Vision Processing: OpenCV & Ultralytics YOLOv8 (flood_best.pt)
              |-- Virtual Gauge Water-Level Calculation
              |-- Telemetry: Server-Sent Events (SSE) & MJPEG Stream
              `-- Cloud Synchronizer: Direct Ingestion to Supabase via Service Key
```

- **Vercel** hosts the React web application.
- **Waitress WSGI** on `http://127.0.0.1:5000` serves the local Camera Agent API.
- The Camera Agent binds strictly to loopback (`127.0.0.1`) for physical security. Camera feeds, RTSP credentials, and USB capture interfaces are accessible only to an operator logged in on that specific physical computer.

---

## 2. Production Portable Client Deployment (Primary Method)

The production client requires **no** system Python, **no** `pip`, **no** virtual environment (`.venv`), **no** Node.js/npm, **no** VS Code, and **no** terminal commands on the client PC.

### Step 2.1 — Package Acquisition
1. Obtain the official `AquaGuard-Portable.zip` build artifact created by the system administrator using `python scripts/build_portable_client.py --zip`.
2. Extract the folder to a permanent location on the monitoring computer (for example: `C:\AquaGuard` or `C:\Users\<Operator>\AquaGuard`). Paths containing spaces are supported.

### Step 2.2 — One-Time Administrative Credential Provisioning
Before handing the PC over to barangay operators, an authorized installer or system administrator must securely provision the backend credentials:

1. Open `AquaGuard-Portable\detector\.env` with a text editor (Notepad).
2. Configure the production Supabase credentials for this monitoring station:
   ```ini
   # Required Backend Connection
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=your-actual-service-role-secret-key

   # Station Identification
   DEFAULT_STATION_ID=1
   ```
3. Save and close `detector\.env`.
4. Ensure the Windows user account has read/write permissions to the `detector\data` folder.

> [!CAUTION]
> **Security Mandate**:
> - Never commit real `SUPABASE_SECRET_KEY` values to Git.
> - Never include real secrets in distributable public ZIP files.
> - Distributable ZIPs must contain only clean placeholder templates.
> - Camera passwords entered in the web interface are saved locally to `detector\data\camera_config.json` and are never synced to the cloud.

### Step 2.3 — Create Desktop Shortcut
1. Right-click `AquaGuard.bat` in the extracted `AquaGuard-Portable` root directory.
2. Select **Show more options > Send to > Desktop (create shortcut)**.
3. Rename the shortcut on the Desktop to **AquaGuard**.
4. (Optional) Keep a shortcut to `STOP_AQUAGUARD.bat` available in an administrative tools folder.

---

## 3. Daily Staff Operations (Barangay Operators)

For normal daily use, barangay personnel follow these simple steps without touching any developer tools or command prompts:

1. **Power on** the monitoring computer.
2. Ensure the video source is connected:
   - For **USB Webcam**: Plug the USB webcam into the computer.
   - For **IP CCTV**: Ensure the camera and LAN router/switch are powered on.
3. Double-click the **AquaGuard** shortcut on the Desktop.
4. The system automatically:
   - Validates that port 5000 is available.
   - Starts the background Camera Agent using the bundled private Python runtime.
   - Verifies the service health endpoint (`http://127.0.0.1:5000/health`).
   - Automatically opens `https://aquaguard-live.vercel.app` in the default web browser.
5. Log in with your authorized credentials.
6. Open **Live Monitoring** to view the live camera stream, water levels, and YOLO detections.

---

## 4. First-Time Camera Configuration (Admin Only)

Camera configuration is performed once through the web interface by an **Admin** user.

### Option A — USB Webcam
1. Connect the USB webcam to the monitoring PC.
2. Sign in as Admin at `https://aquaguard-live.vercel.app`.
3. Navigate to **Camera Settings** in the Admin sidebar.
4. Select **USB Webcam**.
5. Click **Detect Connected Webcams**.
6. Choose the detected camera index (typically `0` for default webcam).
7. Click **Test Connection** to preview the feed.
8. Click **Save Configuration**.
9. Verify that the Camera Agent status reports **Online** and Camera Status reports **Connected**.
10. Navigate to **Live Monitoring** to calibrate the virtual gauge and verify YOLO flood detection.

### Option B — IP CCTV Camera (RTSP)
1. Connect the IP camera and monitoring computer to the same local network router.
2. Assign a static IP or DHCP reservation for the camera in the router settings (e.g., `192.168.1.100`).
3. Ensure RTSP streaming and local ONVIF/RTSP account credentials are enabled in the camera's setup app (e.g., Tapo app).
4. Sign in as Admin at `https://aquaguard-live.vercel.app`.
5. Navigate to **Camera Settings > IP Camera / RTSP**.
6. Enter:
   - **Camera IP / Host**: e.g., `192.168.1.100`
   - **RTSP Port**: `554` (default)
   - **Username**: Camera RTSP username
   - **Password**: Camera RTSP password
   - **Stream Path**: e.g., `/stream2` (recommended sub-stream for stable 720p/15fps AI inference)
7. Click **Test Connection**.
8. Click **Save Configuration**.

> [!NOTE]
> The RTSP credentials are encrypted/stored locally on the PC in `detector\data\camera_config.json`. The web interface never exposes the password back to the browser on subsequent page loads.

---

## 5. Safe Service Shutdown

To stop the Camera Agent safely:

1. Double-click `STOP_AQUAGUARD.bat`.
2. The script securely reads `detector\data\camera_agent.pid` and validates:
   - That the process exists in Windows.
   - That the executable path matches the exact bundled Python binary.
   - That the command line matches `run_camera_agent.py`.
3. If validated, the process is safely terminated and the PID file is cleared.
4. If process verification fails, the script safely halts and never performs a blanket `taskkill /im python.exe`.

---

## 6. Same-Device vs. Remote Device Access

| Feature | Monitoring PC (Same Device) | Remote PC / Tablet / Smartphone |
| --- | --- | --- |
| **Cloud Dashboard** | Available | Available |
| **Flood Alerts & Audio** | Available | Available |
| **Evacuation Advisories** | Available | Available |
| **Weather & Rainfall** | Available | Available |
| **Live CCTV / Webcam Feed** | **Active** (via `127.0.0.1:5000`) | Offline / Agent Unavailable |
| **Camera Configuration** | **Active** | Read-Only Status |

> [!IMPORTANT]
> The Camera Agent binds to `127.0.0.1` (loopback) to guarantee that unencrypted RTSP streams and camera control APIs are never exposed to the public internet or unauthorized LAN devices.

---

## 7. Developer Workflow (.venv-Based Mode)

Developers working directly in the source repository can run AquaGuard using standard Python virtual environments:

```bash
# Frontend
npm install
npm run dev

# Backend
cd detector
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run_camera_agent.py
```

Development launchers in repository root:
- `START_AQUAGUARD.bat` — Starts `.venv\Scripts\python.exe` and opens the production frontend.
- `STOP_AQUAGUARD.bat` — Validates and stops the `.venv`-based agent.

---

## 8. Building the Portable Distribution

To generate a fresh portable distribution for client handover:

```bash
# Ensure development Python 3.12.10 environment is active
python scripts/build_portable_client.py --zip
```

This will:
1. Download or locate official `python-3.12.10-embed-amd64.zip` in `portable_runtime_cache/`.
2. Extract the embeddable Python runtime into `dist_portable/AquaGuard-Portable/python/`.
3. Populate `Lib/site-packages` with all dependencies (Torch, OpenCV, Flask, Waitress, Supabase).
4. Configure `python312._pth` for isolated package resolution.
5. Copy required detector backend code and `flood_best.pt`.
6. Write clean placeholder `.env`.
7. Write standalone `AquaGuard.bat` and `STOP_AQUAGUARD.bat`.
8. Package the result into `release/AquaGuard-Portable.zip`.

---

## 9. Troubleshooting Guide

- **Agent will not start:** Ensure no other application is using port 5000. Review `detector\data\camera_agent.log`.
- **Camera disconnected:** Check USB cable or verify CCTV power and LAN IP. The agent does not need a restart; it automatically reconnects once the camera signal returns.
- **Browser blocks local connection:** In Chrome/Edge, allow private network/loopback access for `https://aquaguard-live.vercel.app` if prompted.
- **YOLO detection slow:** Ensure the RTSP sub-stream (`/stream2`, 720p) is selected instead of the 4K main-stream (`/stream1`).
