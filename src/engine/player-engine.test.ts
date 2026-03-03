import { describe, it, expect, vi } from "vitest";
import { PlayerEngine } from "./player-engine";
import type { PlaylistRepository } from "../core/ports/playlist-repository.port";
import type { Renderer } from "../core/ports/renderer.port";
import type { Timer } from "../core/ports/timer.port";
import type { Playlist, PlaylistItem } from "../core/domain/playlist";


const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));


function imageItem(url = "/a.jpg", durationMs = 3000): PlaylistItem {
  return { kind: "image", url, durationMs };
}

function videoItem(url = "/b.mp4"): PlaylistItem {
  return { kind: "video", url };
}

function makePlaylist(...items: PlaylistItem[]): Playlist {
  return { items };
}

function makeRepo(playlist: Playlist): PlaylistRepository {
  return { getPlaylist: vi.fn().mockResolvedValue(playlist) };
}

function makeTimer() {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();

  const timer: Timer = {
    setTimeout(handler, _delay) {
      const id = nextHandle++;
      pending.set(id, handler);
      return id;
    },
    clearTimeout(h) {
      pending.delete(h);
    },
  };

  return {
    timer,
    triggerNext() {
      for (const [id, fn] of pending) {
        pending.delete(id);
        fn();
        break;
      }
    },
    hasPending() {
      return pending.size > 0;
    },
  };
}

function makeRenderer() {
  let onVideoEndedCb: (() => void) | undefined;

  return {
    render: vi.fn().mockResolvedValue({ ok: true }),
    clear: vi.fn(),
    onVideoEnded(handler: () => void) {
      onVideoEndedCb = handler;
    },
    triggerVideoEnded() {
      onVideoEndedCb?.();
    },
  };
}

function makeEngine(
  playlist: Playlist,
  rendererOverride?: ReturnType<typeof makeRenderer>,
  options?: { loop?: boolean; maxConsecutiveErrors?: number },
) {
  const repo = makeRepo(playlist);
  const renderer = rendererOverride ?? makeRenderer();
  const { timer, triggerNext, hasPending } = makeTimer();
  const engine = new PlayerEngine(
    repo,
    renderer as unknown as Renderer,
    timer,
    { loop: true, maxConsecutiveErrors: 5, ...options },
  );
  return { engine, repo, renderer, timer, triggerNext, hasPending };
}


describe("PlayerEngine", () => {
  describe("start()", () => {
    it("fetches playlist and renders the first item", async () => {
      const playlist = makePlaylist(imageItem(), videoItem());
      const { engine, repo, renderer } = makeEngine(playlist);

      await engine.start();

      expect(repo.getPlaylist).toHaveBeenCalledOnce();
      expect(renderer.render).toHaveBeenCalledOnce();
      expect(renderer.render).toHaveBeenCalledWith(playlist.items[0]);
    });

    it("is a no-op when called again while already playing", async () => {
      const { engine, repo } = makeEngine(makePlaylist(imageItem()));

      await engine.start();
      await engine.start();

      expect(repo.getPlaylist).toHaveBeenCalledOnce();
    });

    it("sets image timer after rendering an image item", async () => {
      const { engine, hasPending } = makeEngine(makePlaylist(imageItem()));

      await engine.start();

      expect(hasPending()).toBe(true);
    });

    it("transitions to ERROR when playlist fetch throws", async () => {
      const repo: PlaylistRepository = {
        getPlaylist: vi.fn().mockRejectedValue(new Error("network error")),
      };
      const renderer = makeRenderer();
      const { timer } = makeTimer();
      const engine = new PlayerEngine(repo, renderer as unknown as Renderer, timer);

      const states: string[] = [];
      engine.onEvent((ev) => {
        if (ev.type === "STATE_CHANGED") states.push(ev.state.status);
      });

      await engine.start();

      expect(states).toContain("ERROR");
    });

    it("transitions to ERROR when playlist is empty", async () => {
      const { engine } = makeEngine({ items: [] });

      const states: string[] = [];
      engine.onEvent((ev) => {
        if (ev.type === "STATE_CHANGED") states.push(ev.state.status);
      });

      await engine.start();

      expect(states).toContain("ERROR");
    });
  });

  describe("next()", () => {
    it("advances to the next item", async () => {
      const playlist = makePlaylist(imageItem(), videoItem());
      const { engine, renderer } = makeEngine(playlist);

      await engine.start();
      engine.next();
      await flushPromises();

      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(renderer.render).toHaveBeenLastCalledWith(playlist.items[1]);
    });

    it("loops back to index 0 when end is reached and loop=true", async () => {
      const playlist = makePlaylist(imageItem());
      const { engine, renderer } = makeEngine(playlist, undefined, { loop: true });

      await engine.start();
      engine.next();
      await flushPromises();

      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(renderer.render).toHaveBeenLastCalledWith(playlist.items[0]);
    });

    it("stops when end is reached and loop=false", async () => {
      const playlist = makePlaylist(imageItem());
      const { engine } = makeEngine(playlist, undefined, { loop: false });

      const states: string[] = [];
      engine.onEvent((ev) => {
        if (ev.type === "STATE_CHANGED") states.push(ev.state.status);
      });

      await engine.start();
      engine.next();

      expect(states).toContain("IDLE");
    });

    it("is ignored when paused", async () => {
      const playlist = makePlaylist(imageItem(), videoItem());
      const { engine, renderer } = makeEngine(playlist);

      await engine.start();
      await engine.pause();
      engine.next();
      await flushPromises();

      expect(renderer.render).toHaveBeenCalledOnce();
    });

    it("advances when image timer fires", async () => {
      const playlist = makePlaylist(imageItem(), videoItem());
      const { engine, renderer, triggerNext } = makeEngine(playlist);

      await engine.start();
      triggerNext();
      await flushPromises();

      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(renderer.render).toHaveBeenLastCalledWith(playlist.items[1]);
    });

    it("advances when video ends", async () => {
      const playlist = makePlaylist(videoItem(), imageItem());
      const { engine, renderer } = makeEngine(playlist);

      await engine.start();
      renderer.triggerVideoEnded();
      await flushPromises();

      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(renderer.render).toHaveBeenLastCalledWith(playlist.items[1]);
    });
  });

  describe("pause() and play()", () => {
    it("clears image timer on pause", async () => {
      const { engine, hasPending } = makeEngine(makePlaylist(imageItem("/a.jpg", 5000)));

      await engine.start();
      expect(hasPending()).toBe(true);

      await engine.pause();
      expect(hasPending()).toBe(false);
    });

    it("restores image timer on play() and fires next() after the remaining duration", async () => {
      const { engine, renderer, triggerNext, hasPending } = makeEngine(
        makePlaylist(imageItem("/a.jpg", 5000)),
      );

      await engine.start();
      await engine.pause();
      expect(hasPending()).toBe(false);

      await engine.play();
      expect(hasPending()).toBe(true);

      triggerNext();
      await flushPromises();

      expect(renderer.render).toHaveBeenCalledTimes(2);
    });

    it("is a no-op when pause() called twice", async () => {
      const { engine, hasPending } = makeEngine(makePlaylist(imageItem()));

      await engine.start();
      await engine.pause();

      const pendingAfterFirstPause = hasPending();
      await engine.pause();

      expect(hasPending()).toBe(pendingAfterFirstPause);
    });

    it("is a no-op when play() called while not paused", async () => {
      const { engine, hasPending } = makeEngine(makePlaylist(imageItem()));

      await engine.start();
      const pendingBefore = hasPending();
      await engine.play();

      expect(hasPending()).toBe(pendingBefore);
    });
  });

  describe("reloadPlaylist()", () => {
    it("fetches a new playlist and renders from index 0", async () => {
      const playlist1 = makePlaylist(imageItem("/old.jpg"));
      const playlist2 = makePlaylist(videoItem("/new.mp4"));
      const repo: PlaylistRepository = {
        getPlaylist: vi.fn()
          .mockResolvedValueOnce(playlist1)
          .mockResolvedValueOnce(playlist2),
      };
      const renderer = makeRenderer();
      const { timer } = makeTimer();
      const engine = new PlayerEngine(repo, renderer as unknown as Renderer, timer);

      await engine.start();
      await engine.reloadPlaylist();

      const lastCall = (renderer.render as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
      expect(lastCall).toEqual(playlist2.items[0]);
    });

    it("keeps the current playlist when reload returns empty", async () => {
      const playlist = makePlaylist(videoItem());
      const repo: PlaylistRepository = {
        getPlaylist: vi.fn()
          .mockResolvedValueOnce(playlist)
          .mockResolvedValueOnce({ items: [] }),
      };
      const renderer = makeRenderer();
      const { timer } = makeTimer();
      const engine = new PlayerEngine(repo, renderer as unknown as Renderer, timer);

      await engine.start();
      const countBefore = (renderer.render as ReturnType<typeof vi.fn>).mock.calls.length;
      await engine.reloadPlaylist();
      const countAfter = (renderer.render as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(countAfter).toBe(countBefore);
    });

    it("logs a warning when reload fetch fails", async () => {
      const repo: PlaylistRepository = {
        getPlaylist: vi.fn()
          .mockResolvedValueOnce(makePlaylist(videoItem()))
          .mockRejectedValueOnce(new Error("network error")),
      };
      const renderer = makeRenderer();
      const { timer } = makeTimer();
      const engine = new PlayerEngine(repo, renderer as unknown as Renderer, timer);

      const warnings: string[] = [];
      engine.onEvent((ev) => {
        if (ev.type === "LOG" && ev.level === "warn") warnings.push(ev.message);
      });

      await engine.start();
      await engine.reloadPlaylist();

      expect(warnings.some((m) => m.includes("Playlist reload failed"))).toBe(true);
    });
  });

  describe("consecutive error handling", () => {
    it("skips a failed item and continues to the next", async () => {
      const playlist = makePlaylist(imageItem("/fail.jpg"), videoItem("/ok.mp4"));
      const renderer = makeRenderer();
      (renderer.render as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: false, reason: "load error" })
        .mockResolvedValue({ ok: true });

      const { timer } = makeTimer();
      const repo = makeRepo(playlist);
      const engine = new PlayerEngine(repo, renderer as unknown as Renderer, timer);

      const warnings: string[] = [];
      engine.onEvent((ev) => {
        if (ev.type === "LOG" && ev.level === "warn") warnings.push(ev.message);
      });

      await engine.start();
      await flushPromises();

      expect(warnings.some((m) => m.includes("Render failed"))).toBe(true);
      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(renderer.render).toHaveBeenLastCalledWith(playlist.items[1]);
    });

    it("transitions to ERROR after maxConsecutiveErrors failures", async () => {
      const playlist = makePlaylist(imageItem(), imageItem(), imageItem());
      const renderer = makeRenderer();
      (renderer.render as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: "fail" });

      const { timer } = makeTimer();
      const engine = new PlayerEngine(
        makeRepo(playlist),
        renderer as unknown as Renderer,
        timer,
        { loop: true, maxConsecutiveErrors: 3 },
      );

      const states: string[] = [];
      engine.onEvent((ev) => {
        if (ev.type === "STATE_CHANGED") states.push(ev.state.status);
      });

      await engine.start();
      await flushPromises();

      expect(states.at(-1)).toBe("ERROR");
    });

    it("resets consecutive error counter after a successful render", async () => {
      const playlist = makePlaylist(imageItem(), videoItem(), imageItem());
      const renderer = makeRenderer();
      (renderer.render as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: false, reason: "fail" })
        .mockResolvedValue({ ok: true });

      const { timer } = makeTimer();
      const engine = new PlayerEngine(
        makeRepo(playlist),
        renderer as unknown as Renderer,
        timer,
        { loop: true, maxConsecutiveErrors: 2 },
      );

      const states: string[] = [];
      engine.onEvent((ev) => {
        if (ev.type === "STATE_CHANGED") states.push(ev.state.status);
      });

      await engine.start();
      await flushPromises();

      expect(states.at(-1)).not.toBe("ERROR");
    });
  });
});
