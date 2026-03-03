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

## 6. Environment Variables


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

---

## 11. Future Improvements

- Publish structured log events over MQTT.
- Add advanced reconnect and circuit-breaker strategy.
- Implement offline video caching strategy.
- Expand automated tests for engine, application gateway, and adapters.
- Add observability metrics (command latency, playback failures, cache hit rates).
