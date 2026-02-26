export type PlaylistResponseDto = {
  playlist: PlaylistItemDto[];
};

export type PlaylistItemDto =
  | {
      type: "image";
      url: string;
      duration: number;
    }
  | {
      type: "video";
      url: string;
    };

export type Playlist = {
  items: PlaylistItem[];
};

export type PlaylistItem =
  | {
      kind: "image";
      url: string;
      durationMs: number;
    }
  | {
      kind: "video";
      url: string;
    };


export class PlaylistValidationError extends Error {
  public readonly code = "PLAYLIST_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "PlaylistValidationError";
  }
}

export function validatePlaylistResponseDto(input: unknown): PlaylistResponseDto {
  if (typeof input !== "object" || input === null) {
    throw new PlaylistValidationError("Playlist response must be an object.");
  }

  const obj = input as Record<string, unknown>;
  if (!("playlist" in obj)) {
    throw new PlaylistValidationError('Missing "playlist" field.');
  }

  const playlist = obj.playlist;
  if (!Array.isArray(playlist)) {
    throw new PlaylistValidationError('"playlist" must be an array.');
  }

  for (let i = 0; i < playlist.length; i++) {
    const item = playlist[i];
    if (typeof item !== "object" || item === null) {
      throw new PlaylistValidationError(`playlist[${i}] must be an object.`);
    }

    const it = item as Record<string, unknown>;
    const type = it.type;
    const url = it.url;

    if (type !== "image" && type !== "video") {
      throw new PlaylistValidationError(
        `playlist[${i}].type must be "image" or "video".`
      );
    }

    if (typeof url !== "string" || url.trim().length === 0) {
      throw new PlaylistValidationError(`playlist[${i}].url must be a non-empty string.`);
    }

    if (type === "image") {
      const duration = it.duration;
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
        throw new PlaylistValidationError(
          `playlist[${i}].duration must be a positive number (seconds) for images.`
        );
      }
    }
  }

  return obj as PlaylistResponseDto;
}

export function mapPlaylistDtoToDomain(dto: PlaylistResponseDto): Playlist {
  const items: PlaylistItem[] = dto.playlist.map((it) => {
    if (it.type === "image") {
      return {
        kind: "image",
        url: it.url,
        durationMs: Math.round(it.duration * 1000),
      };
    }
    return {
      kind: "video",
      url: it.url,
    };
  });

  return { items };
}