import { describe, it, expect } from "vitest";
import { validatePlaylistResponseDto, PlaylistValidationError } from "./playlist";

describe("validatePlaylistResponseDto", () => {
  describe("valid inputs", () => {
    it("accepts a valid image item", () => {
      const input = { playlist: [{ type: "image", url: "/a.jpg", duration: 5 }] };
      expect(validatePlaylistResponseDto(input)).toEqual(input);
    });

    it("accepts a valid video item", () => {
      const input = { playlist: [{ type: "video", url: "/b.mp4" }] };
      expect(validatePlaylistResponseDto(input)).toEqual(input);
    });

    it("accepts mixed image and video items", () => {
      const input = {
        playlist: [
          { type: "image", url: "/a.jpg", duration: 3 },
          { type: "video", url: "/b.mp4" },
        ],
      };
      expect(() => validatePlaylistResponseDto(input)).not.toThrow();
    });

    it("accepts an empty playlist array", () => {
      expect(() => validatePlaylistResponseDto({ playlist: [] })).not.toThrow();
    });
  });

  describe("invalid top-level shape", () => {
    it("throws for null input", () => {
      expect(() => validatePlaylistResponseDto(null)).toThrow(PlaylistValidationError);
    });

    it("throws for string input", () => {
      expect(() => validatePlaylistResponseDto("string")).toThrow(PlaylistValidationError);
    });

    it("throws for number input", () => {
      expect(() => validatePlaylistResponseDto(42)).toThrow(PlaylistValidationError);
    });

    it("throws when playlist field is missing", () => {
      expect(() => validatePlaylistResponseDto({})).toThrow('Missing "playlist" field.');
    });

    it("throws when playlist is not an array", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: {} })
      ).toThrow('"playlist" must be an array.');
    });

    it("throws when playlist is a string", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: "items" })
      ).toThrow(PlaylistValidationError);
    });
  });

  describe("invalid playlist items", () => {
    it("throws for null item", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [null] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws for item with invalid type", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "audio", url: "/a.mp3" }] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws for item missing type", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ url: "/a.jpg" }] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws for item with empty url", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "video", url: "   " }] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws for item with non-string url", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "video", url: 123 }] })
      ).toThrow(PlaylistValidationError);
    });
  });

  describe("image item duration validation", () => {
    it("throws when duration is missing", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "image", url: "/a.jpg" }] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws when duration is zero", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "image", url: "/a.jpg", duration: 0 }] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws when duration is negative", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "image", url: "/a.jpg", duration: -1 }] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws when duration is a string", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "image", url: "/a.jpg", duration: "5" }] })
      ).toThrow(PlaylistValidationError);
    });

    it("throws when duration is Infinity", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "image", url: "/a.jpg", duration: Infinity }] })
      ).toThrow(PlaylistValidationError);
    });

    it("accepts a positive fractional duration for image", () => {
      expect(() =>
        validatePlaylistResponseDto({ playlist: [{ type: "image", url: "/a.jpg", duration: 0.5 }] })
      ).not.toThrow();
    });
  });
});
