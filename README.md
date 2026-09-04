# AquaGuard

AquaGuard is a role-based flood monitoring and disaster response information system developed for barangay disaster risk reduction and management. The system integrates local CCTV/USB video monitoring, YOLO-assisted flood/water detection, virtual gauge level estimation, real-time weather data, automated alerts, and emergency coordination.

---

## Main Features

- **Role-Based Workspaces**: Tailored workflows and role-scoped interfaces for Admins, Barangay Officers, Disaster Responders, and Residents.
- **Local Camera Agent**: Standalone edge-monitoring service interfacing directly with local USB webcams and RTSP IP cameras.
- **AI-Assisted Flood Detection**: Ultralytics YOLO segmentation model (`flood_best.pt`) identifying surface water coverage in real time.
- **Virtual Water-Level Gauge**: Pixel-to-metric geometric waterline tracking and staff gauge estimation.
- **Real-Time Video & Telemetry**: Low-latency Server-Sent Events (SSE) telemetry and MJPEG live stream.
- **Rule-Based Decision Support**: Multi-factor heuristic calculating flood risk indicators from water level, visual coverage, and weather data.
- **Real-Time Sound & Visual Alerts**: Audible alarm system utilizing the browser Web Audio API (gentle 2-tone chime for Warning, pulsing siren for Critical) with sticky alert banners.
- **Weather Integration**: Precipitation metrics, hourly rainfall history, and weather conditions via Open-Meteo.
- **Emergency Operations & Coordination**: Evacuation advisory broadcasting, community announcements, and responder response logging.

> [!IMPORTANT]
> **Engineering Decision-Support Disclaimer**:
> - AquaGuard's combined flood risk indicator is a prototype rule-based engineering heuristic, **not** a scientifically validated hydrological simulation model.
> - YOLO detection confidence represents neural network confidence in segmented water pixels, **not** a calibrated statistical probability of impending flood.
> - Station water-level thresholds, physical gauge measurements, and official disaster-management protocols remain the primary authority for public safety decisions.

---

## System Architecture

AquaGuard utilizes a hybrid architecture combining a high-availability cloud web portal with a local loopback-bound camera processing agent:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Cloud & Infrastructure Services                          │
│                                                                             │
│   Vercel Deployment (https://aquaguard-live.vercel.app)                     │
│       │                                                                     │
│       ├── Supabase Cloud (PostgreSQL, Auth, RLS Policies, Realtime Engine)  │
│       └── Open-Meteo API (Weather and Precipitation Telemetry)              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    Direct Browser Loopback Interface (CORS Restricted)
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│             Local Windows Monitoring Station (Barangay Operations)          │
│                                                                             │
│   AquaGuard Camera Agent (http://127.0.0.1:5000)                            │
│       ├── Production Server: Waitress WSGI (Multi-threaded)                 │
│       ├── Vision & AI Pipeline: OpenCV + Ultralytics YOLOv8 (CPU/DirectShow)│
│       ├── Video Sources: Local USB Webcam or On-Premises RTSP IP Camera     │
│       ├── Telemetry: Server-Sent Events (SSE) + MJPEG Video Stream          │
│       └── Database Synchronizer: Direct Supabase Ingestion (Service Role)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

> [!NOTE]
> The Camera Agent intentionally binds to loopback (`127.0.0.1:5000`) on the local monitoring computer. Live camera feeds are accessible to operators logged in on that physical computer, preventing raw RTSP streams and camera credentials from being exposed across external networks.

---

## Technology Stack

### Frontend Application
- **Framework & Build**: React 18, Vite, React Router v6
- **State & UI**: Lucide React, Recharts, Custom CSS Dashboard Design System
- **Integration**: Supabase JS Client (`@supabase/supabase-js`)
- **Hosting**: Vercel (`https://aquaguard-live.vercel.app`)

### Local Camera Agent
- **Runtime**: CPython 3.12 (CPython 3.12.10 AMD64 embeddable for portable deployments)
- **Web API & Server**: Flask, Waitress production WSGI server
- **Computer Vision**: OpenCV (`opencv-python`), Ultralytics YOLO (`torch` CPU)
- **Database & Auth**: Supabase Python Client, PyJWT, `python-dotenv`

### Cloud Services & Storage
- **Database & Auth**: Supabase (PostgreSQL 15 with Row-Level Security and Realtime)
- **Weather API**: Open-Meteo Free Weather API

---

## Roles and Access Control

AquaGuard enforces strict authorization through Supabase Row-Level Security (RLS) policies at the database layer:

| Role | Workspace Description | Key Capabilities |
| --- | --- | --- |
| **Admin** | System Administration & Configuration | Manage monitoring stations, configure USB/RTSP camera sources, manage user accounts, review reports, system settings. |
| **Barangay Officer** | Operations & Community Coordination | Monitor live camera, issue evacuation advisories, broadcast announcements, manage dispatch logs, acknowledge/resolve alerts. |
| **Disaster Responder** | Field Operations & Incident Response | View active emergency alerts, log on-the-ground response operations, acknowledge alerts, view evacuation advisories. |
| **Resident** | Public Information & Safety Portal | View community flood alerts, monitor water level histories, receive evacuation advisories, read announcements and safety tips. |

For the complete technical policy and RPC specification, see the [Role Access Matrix](docs/ROLE_ACCESS_MATRIX.md).

---

## Portable Windows Client Deployment

For production deployment on barangay monitoring PCs, AquaGuard provides a standalone, zero-dependency portable package.

### Key Advantages
- **Private Python Runtime**: Bundles official CPython 3.12.10 AMD64 embeddable runtime.
- **Zero Prerequisites**: Does **not** require system Python, `pip`, virtual environments, Node.js, npm, or developer tools on the client machine.
- **Single-Click Operation**: Managed completely through `AquaGuard.bat` and `STOP_AQUAGUARD.bat`.

### Daily Staff Workflow
1. Turn on the monitoring PC.
2. Ensure the configured CCTV/router is powered on OR the USB webcam is plugged in.
3. Double-click the **AquaGuard** shortcut on the Desktop.
4. The local Camera Agent initializes and opens `https://aquaguard-live.vercel.app` in the default browser.
5. Log in with barangay credentials and open **Live Monitoring**.

For full installation and one-time administrator provisioning instructions, refer to the [Client Deployment Guide](docs/CLIENT_DEPLOYMENT.md).

---

## Camera Configuration

Camera setup is managed through the web interface under **Admin > Camera Settings**:

- **USB Webcam**: Click **Detect Connected Webcams**, select the target camera index, click **Test Connection**, and click **Save Configuration**.
- **RTSP IP Camera**: Enter the camera's local IP address, RTSP port, username, password, and stream path (e.g., `/stream2` for Tapo cameras), click **Test Connection**, and save.

Camera credentials are saved locally to `detector/data/camera_config.json` on the monitoring PC and are never transmitted to the browser or stored in cloud databases.

---

## Development Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.12.10 AMD64 with `pip`

### Frontend Setup
```bash
# Clone the repository
git clone https://github.com/rachorachelirene-beep/aquaguard.git
cd aquaguard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and supply your Supabase URL and Publishable/Anon Key

# Start development server
npm run dev
```

### Local Agent Setup (Development Mode)
```bash
cd detector

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and supply your SUPABASE_URL and SUPABASE_SECRET_KEY (service-role key)

# Run the Camera Agent
python run_camera_agent.py
```

Developers on Windows can also use `START_AQUAGUARD.bat` and `STOP_AQUAGUARD.bat` at the repository root to launch and stop the `.venv`-based detector environment.

---

## Security Architecture

- **Separation of Keys**: The browser frontend uses only public Supabase credentials (`VITE_SUPABASE_PUBLISHABLE_KEY`). The elevated `SUPABASE_SECRET_KEY` (service role) is strictly confined to the backend Camera Agent.
- **Authorization Boundary**: Frontend routes use `ProtectedRoute` guards for user experience, but PostgreSQL Row-Level Security (RLS) is the actual security boundary.
- **Credential Isolation**: Local camera passwords and RTSP URLs are stored only in `detector/data/camera_config.json` on the physical machine.
- **Process Guarding**: `STOP_AQUAGUARD.bat` validates the exact process identity, executable path, and PID file before stopping services, preventing accidental termination of unrelated Python processes.

---

## Testing & Verification

The project maintains comprehensive test suites for frontend and backend components:

```bash
# Frontend ESLint validation
npm run lint

# Frontend production build verification
npm run build

# Backend and detector test suite (90 unit & contract tests)
python -m unittest discover -s detector/tests

# Windows launcher contracts
python -m unittest detector/tests/test_windows_launchers.py

# Portable build contracts
python -m unittest detector/tests/test_portable_build.py
```

---

## Documentation Index

- [Client Deployment Guide](docs/CLIENT_DEPLOYMENT.md) — Comprehensive technical guide for portable client provisioning and daily operations.
- [Role Access Matrix](docs/ROLE_ACCESS_MATRIX.md) — Database Row-Level Security, RPC specifications, and permission definitions.
