import "./style.css";

import { MqttJsClientAdapter } from "./infrastructure/mqtt/mqttjs-client";
import { ConsoleLogger } from "./infrastructure/logging/console-logger";
import { LocalStorageIdempotencyStore } from "./infrastructure/storage/idempotency-localstorage.store";
import { CommandDispatcher } from "./core/application/command-dispatcher";
import { MqttCommandGateway } from "./core/application/mqtt-command-gateway";
import { ReloadPlaylistHandler } from "./core/application/handlers/reload-playlist.handler";

import { PlayerEngine } from "./engine/player-engine";
import { PlayerEngineAdapter } from "./engine/player-engine.adapter";
import { HttpPlaylistRepository } from "./infrastructure/network/http-playlist-repository";
import { BrowserTimer } from "./infrastructure/time/browser-timer";
import { DomRenderer } from "./infrastructure/render/dom-renderer";
import { RestartPlayerHandler } from "./core/application/handlers/restart-player.handler";
import { PlayHandler } from "./core/application/handlers/play.handler";
import { PauseHandler } from "./core/application/handlers/pause.handler";
import { SetVolumeHandler } from "./core/application/handlers/set-volume.handler";

const PLAYLIST_URL = "/playlist.json";

const deviceId =
  (import.meta.env.VITE_DEVICE_ID as string | undefined) ?? "tizen-001";

async function bootstrap() {
  const logger = new ConsoleLogger();
  const mqtt = new MqttJsClientAdapter();

  const eventsTopic = `players/${deviceId}/events`;
  const commandsTopic = `players/${deviceId}/commands`;

  const repo = new HttpPlaylistRepository(PLAYLIST_URL, 10_000);
  const renderer = new DomRenderer("app");
  const timer = new BrowserTimer();

  const engine = new PlayerEngine(repo, renderer, timer, {
    loop: true,
    maxConsecutiveErrors: 5,
  });

  engine.onEvent((ev) => {
    if (ev.type === "LOG") {
      const prefix = `[ENGINE ${ev.level.toUpperCase()}]`;
      console.log(prefix, ev.message);
    }
    if (ev.type === "STATE_CHANGED") {
      console.log("[ENGINE STATE]", ev.state);
    }
  });

  void engine.start();

  (window as any).reloadPlaylist = () => engine.reloadPlaylist();

  setInterval(() => {
    void engine.reloadPlaylist();
  }, 60_000);

  const playerPort = new PlayerEngineAdapter(engine);

  const dispatcher = new CommandDispatcher([
    new ReloadPlaylistHandler(playerPort),
    new RestartPlayerHandler(playerPort),
    new PlayHandler(playerPort),
    new PauseHandler(playerPort),
    new SetVolumeHandler(playerPort),
  ]);

  const store = new LocalStorageIdempotencyStore<any>({
    namespace: `signage:idempo:${deviceId}`,
    maxKeys: 500,
  });
  const gateway = new MqttCommandGateway({
    mqtt,
    logger,
    store,
    dispatcher,
    deviceId,
    topics: { commands: commandsTopic, events: eventsTopic },
  });

  mqtt.onStatusChange((s) => logger.info("MQTT status", { status: s }));

  await mqtt.connect({
    clientId: `player-${deviceId}`,
    lastWill: {
      topic: eventsTopic,
      payload: JSON.stringify({
        type: "heartbeat",
        timestamp: Date.now(),
        payload: { status: "offline", deviceId },
      }),
      qos: 1,
      retain: false,
    },
    reconnect: { enabled: true, minDelayMs: 1000, maxDelayMs: 10_000 },
  });

  await mqtt.subscribe(commandsTopic, { qos: 1 });
  gateway.start();

  await mqtt.publish(
    eventsTopic,
    JSON.stringify({
      type: "heartbeat",
      timestamp: Date.now(),
      payload: { status: "online", deviceId },
    }),
    { qos: 1 },
  );

  logger.info("Bootstrap complete", { deviceId, commandsTopic, eventsTopic });
}

bootstrap().catch((e) => console.error("BOOTSTRAP FAILED", e));
