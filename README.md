# Smart TV Signage Player

## 1. Overview

Production-oriented Smart TV signage player built with **Vite + TypeScript** using **Hexagonal Architecture (Ports & Adapters)**.

### Key capabilities

- Fetches and validates remote playlists over HTTP.
- Plays image and video media in a continuous loop.
- Handles remote commands over MQTT with idempotency via `correlationId`.
- Publishes `command_ack`, `command_result`, and `heartbeat` events.
- Supports offline-first behavior with LocalStorage playlist cache.
- Caches image assets with the browser Cache API.
- Captures screenshots and returns base64-encoded output.
- Retries MQTT publish operations with exponential backoff.

---

## 2. Architecture

```text
src/
├── core/
│  ├── domain/        # Pure domain models, rules, validators
│  ├── ports/         # Interfaces for adapters (MQTT, storage, renderer, time, etc.)
│  └── application/   # Command mapping, validation, dispatch, gateway logic
├── engine/           # Playback engine (state, sequencing, timers, recovery)
├── infrastructure/   # HTTP, MQTT, renderer, storage, timer adapters
└── main.ts           # Composition root / wiring
```

### Why this architecture

- Core business logic is isolated from framework and platform details.
- Adapters can be replaced (MQTT broker, renderer, storage implementation) without changing domain logic.
- Testability improves because `core` depends on ports, not concrete infrastructure.

---

## 3. Case Coverage Checklist

### Playlist and playback

- Playlist fetch from HTTP endpoint.
- DTO/schema validation before runtime usage.
- Domain mapping and normalization.
- Image playback with explicit duration.
- Video playback until `ended`.
- Playlist loop restart when complete.
- Failed media skip and continue.
- Guard against excessive consecutive playback errors.

### MQTT command pipeline

- Parse incoming command JSON.
- DTO-to-domain mapping.
- Command validation.
- Idempotency check via `correlationId`.
- Publish `command_ack`.
- Execute command.
- Publish `command_result`.
- Persist result with TTL for duplicate replay.

### Offline-first behavior

- Last valid playlist hash + content stored in LocalStorage.
- Fallback to cached playlist when HTTP fails.
- Image cache using Cache API.
- Cached media re-used when network is unavailable.
- Cache limits and TTL enforcement.

### Reliability

- MQTT publish retry with exponential backoff.
- Heartbeat publication for liveness and observability.

---

## 4. MQTT Topics

### Subscribe

```text
players/{deviceId}/commands
```

### Publish

```text
players/{deviceId}/events
```

### Supported commands

- `reload_playlist`
- `restart_player`
- `play`
- `pause`
- `set_volume`
- `screenshot`

### Published event types

- `command_ack`
- `command_result`
- `heartbeat`

---

## 5. Message Contracts (JSON examples)

### Command (incoming)

```json
{
  "command": "reload_playlist",
  "correlationId": "abc12345",
  "timestamp": 1700000000000,
  "payload": {}
}
```

### `command_ack` (outgoing)

```json
{
  "type": "command_ack",
  "timestamp": 1700000000000,
  "payload": {
    "correlationId": "abc12345",
    "command": "reload_playlist",
    "status": "received"
  }
}
```

### `command_ack` statuses

- `received`
- `duplicate`
- `rejected`

### `command_result` success (outgoing)

```json
{
  "type": "command_result",
  "timestamp": 1700000000000,
  "payload": {
    "correlationId": "abc12345",
    "command": "set_volume",
    "status": "success",
    "result": {
      "volume": 50
    }
  }
}
```

### `command_result` error (outgoing)

```json
{
  "type": "command_result",
  "timestamp": 1700000000000,
  "payload": {
    "correlationId": "abc12345",
    "command": "screenshot",
    "status": "error",
    "error": {
      "code": "SCREENSHOT_FAILED",
      "message": "Screenshot failed"
    }
  }
}
```

### `heartbeat` (outgoing)

```json
{
  "type": "heartbeat",
  "timestamp": 1700000000000,
  "payload": {
    "status": "online",
    "deviceId": "tizen-001",
    "uptimeSec": 123,
    "version": "dev"
  }
}
```
---

## 6. Reliability & Design Decisions


MQTT QoS Strategy

The application uses QoS 1 (at least once delivery) for both command consumption and event publishing.

QoS 1 guarantees that a message is delivered at least once, which provides reliability in unstable network conditions. In a signage scenario, losing a command (e.g. restart_player or set_volume) is more critical than processing it twice.

However, QoS 1 may result in duplicate message delivery.
To safely handle this, the application implements an idempotency mechanism based on correlationId.

For every incoming command:

A unique correlationId is required.

The result of the command execution is stored with a TTL (24h).

If a duplicate command with the same correlationId is received:

The command is not executed again.

The previously stored result is re-published.

This design provides:

Reliability (no lost commands)

Safety (no double execution)

Predictable behavior in reconnect/retry scenarios

QoS 0 was rejected because it may silently drop commands.
QoS 2 was considered unnecessary for this use case, as idempotency already guarantees safe duplicate handling without the additional protocol overhead.


Reconnect Strategy

In this project, MQTT disconnection is treated as an expected scenario rather than an exception. Smart TV signage devices typically operate in unstable network environments, so the system must be able to recover automatically without crashing.

The MQTT client uses automatic reconnection. When the connection is restored, the device publishes a heartbeat event to signal that it is online again. Additionally, message publishing implements an exponential backoff retry mechanism to reduce message loss during transient network failures.

This approach ensures:

No manual intervention is required after disconnections

The device can recover from temporary broker unavailability

Improved resilience in command and event delivery

Reconnect behavior is a critical reliability requirement for long-running field devices.


Error Handling Strategy

The error handling strategy in this project is based on a “never crash on bad input” principle. The goal is not to ignore errors but to handle them in a controlled way while keeping the system operational.

The following scenarios are explicitly handled:

Invalid JSON → command rejected

Unsupported command → command_ack: rejected

Payload validation errors → validation error response

Duplicate correlationId → not executed again, previous result returned

Playlist fetch failure → fallback to cached playlist

Media load failure → skip item + consecutive error limit

MQTT publish failure → retry mechanism

This ensures that:

The system does not crash due to malformed input

Invalid data is rejected safely

The player continues operating even under network instability

This reflects a defensive programming mindset expected in production systems.

Logging Strategy

The logging architecture is designed to ensure system observability. Events from the domain and engine layers are categorized using log levels (info, warn, error).

Each log message may include contextual data, enabling traceability. In particular, command flows can be tracked using correlationId.

This design enables:

Traceable command lifecycle

Visibility into retry and failure scenarios

Easier debugging in production environments

Since logging is abstracted through a port, it can easily be extended to support remote logging systems in the future.

---

## 7. Environment Variables

Create a `.env` file in the project root:

```bash
VITE_MQTT_URL=mqtt://localhost:1883
VITE_DEVICE_ID=tizen-001
VITE_APP_VERSION=dev
```

---

## 8. Local Development


### Install dependencies

```bash
npm install
```

### Run development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

---

## 9. Playlist Format

Expected payload:

```json
{
  "playlist": [
    { "type": "image", "url": "/media/a.jpg", "duration": 5 },
    { "type": "video", "url": "/media/b.mp4" }
  ]
}
```

### Notes

- `duration` is required for `image` items (seconds).
- `video` items play until media end.
- Invalid items are rejected during validation.

---

## 10. Known Limitations

- Screenshot capture may fail for cross-origin media without proper CORS headers.
- MQTT reconnection behavior depends on `mqtt.js` reconnect settings.
- Video offline caching is not implemented yet.
- Device-level restart behavior depends on target platform capabilities.
- **Tizen localStorage quota**: On some Samsung TV models the available `localStorage` quota can be below 1 MB. Both `LocalStorageIdempotencyStore` and `LocalStoragePlaylistCache` are affected by this limit. At bootstrap, the application probes `localStorage` availability and automatically falls back to `MemoryIdempotencyStore` if access fails. For the playlist cache, keeping `playlistCacheMaxBytes` low (e.g. 256 KB) is recommended on Tizen targets to avoid quota errors.

---

## 11. Future Improvements

- Publish structured log events over MQTT.
- Add advanced reconnect and circuit-breaker strategy.
- Implement offline video caching strategy.
- Expand automated tests for engine, application gateway, and adapters.
- Add observability metrics (command latency, playback failures, cache hit rates).

---

## 12. Tizen Studio Setup

### Prerequisites

Tizen Studio requires **JDK 8** (not JDK 11 or 17). Using a newer JDK version will cause the IDE to fail at launch or during build.

1. Download and install **JDK 8** from the Oracle archive or use a distribution such as Adoptium Temurin 8.
2. Set `JAVA_HOME` to the JDK 8 directory and ensure it is first on your `PATH`.
3. Verify with:

```bash
java -version
# Expected: openjdk version "1.8.x" or "java version "1.8.x""
```

### Installing Tizen Studio

1. Download **Tizen Studio** (latest stable) from the official Tizen developer site.
2. Run the installer and complete the base IDE installation.
3. After installation, open the **Package Manager** from the Tizen Studio launcher or the `Tools → Package Manager` menu.

### Installing required packages via Package Manager

Open the **Extension SDK** tab in Package Manager and install:

| Package | Required for |
|---|---|
| **TV Extensions** (e.g. `TV Extensions-10.0`) | Samsung TV platform SDK, emulator image, and device profile |
| **Samsung Certificate Extension** | Generating author and distributor certificates for Samsung devices |

After installation, restart Tizen Studio.

---

## 13. Samsung Certificate Manager — Author & Distributor Certificates

Certificates are required to sign the `.wgt` package before it can be installed on a real device or submitted to the Samsung Smart TV app store.

### Creating the author certificate

1. In Tizen Studio, open `Tools → Certificate Manager`.
2. Click the **+** button to create a new certificate profile.
3. Select **Samsung** as the certificate type.
4. Choose **Create a new certificate profile** and give it a name (e.g. `signage-player-cert`).
5. On the **Author Certificate** step, select **Create a new author certificate**.
6. Fill in the required fields (name, country, organization, etc.).
7. Set a password and save the `.p12` file in a secure location.
8. Log in with your Samsung Developer account when prompted (required for distributor signing).

### Creating the distributor certificate

1. After the author certificate step, you will be taken to the **Distributor Certificate** step automatically.
2. Select **Create a new distributor certificate**.
3. Choose privilege level **Public** (sufficient for most signage use cases).
4. The DUID (Device Unique ID) of the target TV must be added here if you are deploying to a specific device.
   - Obtain the DUID from the TV: `Settings → Support → Device Care → Self Diagnosis → TV Device Manager → Device ID`.
5. Complete the wizard. The certificate profile is now active.

> The active certificate profile is used automatically when building a signed package.

---

## 14. Tizen Emulator Manager — TV Emulator Setup

### Creating the emulator

1. Open `Tools → Emulator Manager` in Tizen Studio.
2. Click **Create**.
3. Select platform: **tv-samsung-10.0** (or the version matching your installed TV Extensions).
4. Choose a template (e.g. `HD1080`).
5. Adjust resources (RAM, CPU cores) if needed.
6. Click **Finish**.

### Starting the emulator

1. Select the emulator you just created in the list.
2. Click **Launch**.
3. Wait for the Samsung TV home screen to appear in the emulator window.
4. The emulator exposes a remote debug port (default: `26101`). Tizen Studio connects to it automatically when you run or debug the app.

> The emulator can also be used as a deployment target in the same way as a real device.

---

## 15. Importing the Project into Tizen Studio

### Building the web app

Before importing, build the production bundle:

```bash
npm install
npm run build
```

This produces the `dist/` directory containing `index.html` and all bundled assets.

### Importing the project

1. In Tizen Studio, go to `File → Import → Tizen → Tizen Project`.
2. Select **Import from local file system**, choose the project root directory (`signage-player/`).
3. Click **Finish**. The project appears in the **Project Explorer**.

### Copying dist/ into the project

Tizen Studio serves and packages files from the project root. The `dist/` output must be copied to the project root so `index.html` and all assets are at the top level.

```bash
# From the project root
cp -r dist/* .
```

Or configure the build tool to output directly to the project root by setting `build.outDir` in [vite.config.ts](vite.config.ts):

```ts
build: {
  outDir: '.',   // outputs index.html and assets/ directly to project root
  emptyOutDir: false,
}
```

> `config.xml` references `<content src="index.html"/>`, so `index.html` must be at the root level of the Tizen project, not inside a subdirectory.

---

## 16. Running in the Tizen Web Simulator

The Tizen Web Simulator provides a quick in-browser preview without a full emulator.

1. In **Project Explorer**, right-click the project root.
2. Select `Run As → Tizen Web Simulator Application (Samsung TV)`.
3. The simulator opens in a Chromium-based browser window with a Samsung TV frame.
4. Use the simulator controls to navigate and interact with the app.

> The simulator does not support all Tizen device APIs (e.g. `tizen.systeminfo`). Use the emulator or a real device for full API coverage.

---

## 17. Building a Signed Package (.wgt)

A `.wgt` file is a ZIP archive signed with your Samsung certificates. It is the deployable artifact for both real devices and store submission.

### Steps

1. Ensure the active certificate profile in `Tools → Certificate Manager` is the one created in [Section 13](#13-samsung-certificate-manager--author--distributor-certificates).
2. In **Project Explorer**, right-click the project root.
3. Select `Build → Build Signed Package`.
4. Tizen Studio compiles and signs the project.
5. The output file `signagePlayerProject.wgt` is created in the project root.

### Installing on a real device

```bash
# Connect to the TV via SDB (Samsung Debug Bridge)
sdb connect <TV_IP_ADDRESS>

# Verify connection
sdb devices

# Install the package
tizen install -n signagePlayerProject.wgt -t <device_serial>
```

> The device must have Developer Mode enabled: `Settings → Support → Developer Mode → ON`, then enter the PC IP address.

---

## 18. config.xml Reference

[config.xml](config.xml) is the Tizen application manifest. It controls packaging, permissions, display behavior, and platform targeting.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget
  xmlns="http://www.w3.org/ns/widgets"
  xmlns:tizen="http://tizen.org/ns/widgets"
  id="http://yourdomain/signagePlayerProject"
  version="1.0.0"
  viewmodes="maximized">
```

| Attribute | Value | Description |
|---|---|---|
| `id` | `http://yourdomain/signagePlayerProject` | Unique application identifier URI |
| `version` | `1.0.0` | Application version shown in the package manager |
| `viewmodes` | `maximized` | Launches the app in full-screen mode |

---

```xml
<tizen:application id="eE15rwf0yT.signagePlayerProject" package="eE15rwf0yT" required_version="2.3"/>
```

| Attribute | Value | Description |
|---|---|---|
| `id` | `eE15rwf0yT.signagePlayerProject` | Full Tizen application ID (`package.appname`) |
| `package` | `eE15rwf0yT` | 10-character package ID, must match your Samsung developer account |
| `required_version` | `2.3` | Minimum Tizen API version required to run the app |

---

```xml
<content src="index.html"/>
```

Entry point of the application. Tizen loads this file on launch. The Vite build output (`dist/`) must be copied so that `index.html` is at the project root.

---

```xml
<feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
```

Declares that the app requires a 1080×1920 (portrait Full HD) screen capability. For landscape Samsung TV deployment the actual rendering is controlled by `screen-orientation` below; this feature tag is part of the standard Tizen TV profile declaration.

---

```xml
<tizen:metadata key="http://tizen.org/metadata/app_ui_type/base_screen_resolution" value="extensive"/>
```

Sets the base screen resolution handling to `extensive`, which tells the platform to scale the app layout to fit the actual display resolution rather than locking to a fixed size.

---

```xml
<tizen:profile name="tv-samsung"/>
```

Targets the Samsung TV platform. Combined with the **TV Extensions-10.0** SDK installed in Package Manager, this ensures the correct APIs and device profile are applied during build and packaging.

---

```xml
<tizen:setting
  screen-orientation="landscape"
  context-menu="enable"
  background-support="disable"
  encryption="disable"
  install-location="auto"
  hwkey-event="enable"/>
```

| Attribute | Value | Description |
|---|---|---|
| `screen-orientation` | `landscape` | Forces landscape layout — standard for TV displays |
| `context-menu` | `enable` | Allows right-click / long-press context menus (useful during development) |
| `background-support` | `disable` | App is suspended when moved to background, conserving resources |
| `encryption` | `disable` | Application resources are not encrypted; enables faster load and easier debugging |
| `install-location` | `auto` | Platform decides install location (internal or external storage) |
| `hwkey-event` | `enable` | Enables hardware remote control key events (needed for TV navigation) |
