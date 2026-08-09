# AquaGuard Windows Client Deployment

This guide describes AquaGuard's initial Windows UAT deployment. The public application remains on Vercel; the Windows monitoring computer runs only the local Camera Agent.

## Deployment architecture

```text
https://aquaguard-live.vercel.app
        |-- Supabase authentication and database
        |-- Open-Meteo weather data
        `-- http://127.0.0.1:5000
              AquaGuard Camera Agent on this Windows PC
              |-- USB webcam or RTSP CCTV
              |-- OpenCV and YOLO
              |-- virtual gauge and calibration
              |-- MJPEG video and SSE detections
              `-- automatic detector writes and alerts
```

Vercel serves the React application. Flask/Waitress does not serve React, and normal client use does not require a local `dist` folder, Vite, npm, VS Code, or a terminal.

The Camera Agent binds to `127.0.0.1:5000` for this deployment. It is available only to a browser on the same Windows computer and is not exposed to other LAN or internet devices.

## One-time technical preparation

A developer or system administrator performs these steps once. They are not part of the operator's daily workflow.

1. Install the AquaGuard project/backend files on the monitoring PC.
2. Install the supported Python runtime.
3. Create or restore `detector\.venv` and install `detector\requirements.txt`, including Waitress.
4. Install the YOLO model and required detector assets.
5. Configure the detector's backend environment and Supabase service credentials securely.
6. Ensure the Windows account can write to `detector\data`.
7. Test `START_AQUAGUARD.bat` and create a Desktop shortcut named **AquaGuard** that points to it.
8. Keep `STOP_AQUAGUARD.bat` available to authorized operators or support staff.

Do not place camera passwords in Vercel variables, React code, browser storage, screenshots, support tickets, or documentation. The local Camera Agent stores the selected camera configuration in `detector\data\camera_config.json`; restrict that folder to authorized Windows users.

## Normal daily use - USB webcam

1. Plug the configured USB webcam into the AquaGuard monitoring PC.
2. Turn on the PC.
3. Double-click **AquaGuard**.
4. Wait for the Camera Agent health check to finish.
5. The browser opens `https://aquaguard-live.vercel.app`.
6. Sign in and open Live Monitoring.
7. The saved USB camera index reconnects automatically.

If the webcam is unplugged or unavailable, the Camera Agent still starts and the web application still opens. The camera should show as disconnected until it becomes available or an Admin changes Camera Settings.

## Normal daily use - IP CCTV / RTSP

1. Turn on the router and CCTV camera.
2. Turn on the AquaGuard monitoring PC.
3. Double-click **AquaGuard**.
4. Wait for the browser to open `https://aquaguard-live.vercel.app`.
5. Sign in and open Live Monitoring.
6. The local Camera Agent loads the saved RTSP configuration and reconnects automatically.

Use a DHCP reservation for a permanent CCTV installation so the camera's LAN address does not unexpectedly change.

## What the launcher does

`START_AQUAGUARD.bat` resolves the installation relative to its own location and checks `http://127.0.0.1:5000/health`.

- If a valid AquaGuard Camera Agent is already healthy, it does not start another process. It only opens the Vercel application.
- If the Agent is not running, it validates the detector virtual environment and production entry point, starts the Agent with the project's Python runtime, and waits for service health.
- It does not wait for a connected camera. An unplugged webcam or offline CCTV does not block startup.
- It never runs npm, Vite, a React build, or the Flask development server.
- If startup fails, it shows a safe message and points to `detector\data\camera_agent.log`.

The production Agent also holds a process lock. This prevents two quick launcher clicks from loading two YOLO models, opening the camera twice, or creating duplicate detector writes.

## First-time camera setup

Camera setup requires an AquaGuard account whose profile is exactly active and whose role is Admin.

### USB webcam

1. Plug the webcam into the monitoring PC.
2. Sign in as Admin on `https://aquaguard-live.vercel.app`.
3. Open **Camera Settings**.
4. Select **USB Webcam**.
5. Select **Detect Connected Webcams**.
6. Select the correct USB camera index.
7. Select **Test Connection**.
8. Select **Save Configuration**.
9. Confirm the Agent is online and the camera becomes connected.
10. Open Live Monitoring and verify the feed and YOLO detections.

If Windows later assigns a different index, repeat detection, testing, and saving.

### IP CCTV / RTSP

1. Connect the camera and monitoring PC to the same trusted LAN.
2. Enable the camera's local/RTSP account using the manufacturer's application.
3. Configure a DHCP reservation in the router.
4. Sign in as Admin on `https://aquaguard-live.vercel.app`.
5. Open **Camera Settings** and select **IP Camera / RTSP**.
6. Enter the local camera IP/host, camera username, camera password, and RTSP stream path.
7. Select **Test Connection**.
8. Select **Save Configuration**.
9. Confirm the Agent is online and the camera becomes connected.
10. Open Live Monitoring and verify the feed and YOLO detections.

The password stays in the trusted local Camera Agent configuration and is never returned to the browser. Leaving the password field blank during a later edit preserves the saved password.

## Safe stopping and restart

Double-click `STOP_AQUAGUARD.bat` to stop the production Camera Agent. The script reads `detector\data\camera_agent.pid` and stops a process only when Windows confirms all of the following:

- the PID exists;
- the executable is the exact AquaGuard virtual-environment Python;
- the command line contains the exact AquaGuard `run_camera_agent.py` entry point.

If any identity check fails, the script refuses to stop the process. It never performs a broad `python.exe` process kill.

After stopping, double-click **AquaGuard** again to restart. The saved USB or RTSP configuration loads without reconfiguration.

## Optional start with Windows

Startup is optional and must not be installed silently.

1. Press **Win + R**.
2. Enter `shell:startup`.
3. Place a shortcut to `START_AQUAGUARD.bat` in that folder.

At the next Windows sign-in, the shortcut starts the local Agent and opens the Vercel application.

## Same-device and remote-device behavior

On the monitoring PC, `127.0.0.1` reaches the Camera Agent running on that PC. On another phone or laptop, `127.0.0.1` refers to that other device, not the monitoring PC.

Therefore:

- Live Monitoring and Camera Settings are local-Agent features intended for the monitoring PC.
- Cloud-backed dashboards, alerts, announcements, advisories, reports, weather, and other Supabase pages remain available remotely.
- A remote device without an Agent should show an Agent-unavailable state instead of stale camera data or repeated aggressive requests.
- AquaGuard does not expose raw CCTV or the local Agent over the public internet in this deployment.

## Browser and local-network permission

The Vercel page uses HTTPS while the loopback Camera Agent uses local HTTP. Chrome or Edge may ask permission for local application, loopback, or private-network access. Allow access only for the official AquaGuard production site when testing on the monitoring PC.

Browser policies for HTTPS-to-loopback requests, Private Network Access, local-network permission, MJPEG, and SSE can change. Automated backend tests do not prove this integration in every browser version. Complete the real Chrome/Edge UAT below before client acceptance; do not bypass browser security or install a self-signed certificate for this phase.

## Internet requirements

- The Vercel frontend requires internet access.
- Supabase authentication and database features require internet access.
- Open-Meteo refreshes require internet access.
- USB camera capture is local to the monitoring PC.
- RTSP CCTV normally uses the local LAN.
- The Camera Agent itself is local to the Windows PC.

Do not claim full offline operation. If internet access is lost, the Vercel-hosted interface may be unavailable even though local camera hardware is still powered.

## Supabase password recovery

The Supabase project administrator must configure the production Site URL and allowed redirect URLs to include:

- `https://aquaguard-live.vercel.app`
- `https://aquaguard-live.vercel.app/reset-password`

Development redirect URLs may remain allowed for development. Do not hardcode a localhost password-recovery destination for production.

## Development workflow

The production launcher does not replace development mode. Developers can still run:

```text
npm run dev
python stream_api.py
```

The existing `start-detector.bat` is a developer convenience for the Flask development server. Client operators should use `START_AQUAGUARD.bat` instead.

## Gauge note

Changing camera source does not erase saved gauge values, but calibration is tied to the camera view. Changing the camera, lens, resolution, angle, or physical position may require running the 4-point gauge calibration again.

## Troubleshooting

- **Camera Agent offline:** Run `START_AQUAGUARD.bat`. If it times out, review `detector\data\camera_agent.log` or contact the system administrator.
- **Port 5000 belongs to another service:** Close the conflicting local application. The launcher refuses to treat an unrelated service as AquaGuard.
- **Agent online, camera disconnected:** Check the USB cable, camera index, CCTV/router power, LAN address, credentials, and Camera Settings. The Agent does not need to be restarted just because the camera is offline.
- **RTSP test fails:** Verify LAN connectivity, DHCP reservation, RTSP support, the local camera account, credentials, and stream path.
- **No USB webcam found:** Close other applications using the webcam, reconnect it, and detect devices again.
- **Gauge is misaligned:** Run the 4-point calibration again for the current camera view.
- **Another computer cannot show the live camera:** This is expected in the loopback-only deployment. Use Live Monitoring on the AquaGuard monitoring PC.
- **Browser blocks local access:** Review Chrome/Edge site permissions for the official Vercel domain and complete the browser checks below.

## Required Windows UAT

### Test A - USB startup

1. Save a USB webcam through Admin Camera Settings.
2. Close the Vite development server.
3. Close any manually started `stream_api.py` process.
4. Close VS Code if desired.
5. Keep internet access active.
6. Double-click `START_AQUAGUARD.bat` without entering commands.
7. Confirm `https://aquaguard-live.vercel.app` opens.
8. Sign in as Admin and open Camera Settings.
9. Confirm Agent Online, Camera Connected, and USB selected.
10. Open Live Monitoring and verify the USB feed, gauge, and YOLO detections.

### Test B - restart persistence and duplicate launch

1. Stop the Agent with `STOP_AQUAGUARD.bat`.
2. Start it again with `START_AQUAGUARD.bat` without reconfiguring the webcam.
3. Confirm the saved webcam reconnects.
4. Double-click `START_AQUAGUARD.bat` again.
5. Confirm it opens AquaGuard without starting another Agent or opening the camera twice.

### Test C - Agent offline

1. Stop the local Agent.
2. Keep the Vercel application open.
3. Confirm the application does not crash.
4. Confirm Live Monitoring clearly reports that the Camera Agent is unavailable on this device.
5. Confirm Supabase-backed pages continue to work.

### Test D - camera disconnected

1. Start the Agent.
2. Unplug the USB webcam.
3. Confirm the Agent remains online while the camera becomes disconnected.
4. Confirm the backend and web application do not crash.
5. Reconnect the webcam and confirm reconnect behavior.

### Test E - RTSP persistence

1. Configure the RTSP camera in Admin Camera Settings.
2. Test and save the connection.
3. Stop and restart the Agent.
4. Confirm the saved RTSP source reconnects without re-entering its password.
5. Verify Live Monitoring, gauge alignment, SSE updates, and YOLO detections.

### Test F - non-monitoring device

1. Open `https://aquaguard-live.vercel.app` on another phone or laptop.
2. Sign in and verify cloud-backed pages.
3. Open Live Monitoring.
4. Confirm it reports that a local Camera Agent is unavailable instead of crashing or showing misleading data.

### Browser acceptance checks

On the monitoring PC, complete the following in the supported Chrome and/or Edge version:

1. Accept only the appropriate local-network permission for the official AquaGuard domain if prompted.
2. Verify `/health`-based Agent status.
3. Verify the MJPEG video feed.
4. Verify one SSE connection with clean reconnect behavior.
5. Verify controlled polling fallback if SSE is interrupted.
6. Verify authenticated Camera Settings GET, POST, PUT, and OPTIONS requests.
7. Confirm arbitrary websites are not granted camera-management access.

Record any browser permission, mixed-content, Private Network Access, CORS, MJPEG, or SSE issue before declaring the deployment ready for client use.
