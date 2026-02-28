import { PlayerEngine } from "./engine/player-engine";
import { HttpPlaylistRepository } from "./infrastructure/network/http-playlist-repository";
import { BrowserTimer } from "./infrastructure/time/browser-timer";
import { DomRenderer } from "./infrastructure/render/dom-renderer";

const PLAYLIST_URL = "/playlist.json";

const repo = new HttpPlaylistRepository(PLAYLIST_URL, 10_000);
const renderer = new DomRenderer("app");
const timer = new BrowserTimer();

const engine = new PlayerEngine(repo, renderer, timer, {
  loop: true,
  maxConsecutiveErrors: 5,
});

  setInterval(() => {
    void engine.reloadPlaylist();
  }, 60_000);

engine.onEvent((ev) => {
  if (ev.type === "LOG") {
    const prefix = `[${ev.level.toUpperCase()}]`;
    console.log(prefix, ev.message);
  }

  if (ev.type === "STATE_CHANGED") {
    console.log("[STATE]", ev.state);
  }
});

void engine.start();

(window as any).reloadPlaylist = () => engine.reloadPlaylist();
