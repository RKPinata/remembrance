import { describe, it, expect } from "vitest";
import {
  getMemoryBaseDir,
  deriveProjectKey,
  resolveProjectDir,
} from "../src/paths.js";

describe("getMemoryBaseDir", () => {
  it("returns a non-empty string", () => {
    const dir = getMemoryBaseDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("returns a path ending in remembrance", () => {
    const dir = getMemoryBaseDir();
    expect(dir).toMatch(/remembrance$/);
  });

  it("accepts a baseDir override", () => {
    const dir = getMemoryBaseDir("/tmp/custom");
    expect(dir).toBe("/tmp/custom");
  });
});

describe("deriveProjectKey", () => {
  it("lowercases the path", () => {
    const key = deriveProjectKey("/Users/Alice/MyProject");
    expect(key).toBe(key.toLowerCase());
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    const key = deriveProjectKey("/Users/alice/my project");
    expect(key).not.toContain(" ");
  });

  it("produces key with -- segment separators", () => {
    const key = deriveProjectKey("/home/user/repo");
    expect(key).not.toMatch(/^-/);
  });

  it("produces stable output for the same input", () => {
    const key1 = deriveProjectKey("/Users/danish/Repo/remembrance");
    const key2 = deriveProjectKey("/Users/danish/Repo/remembrance");
    expect(key1).toBe(key2);
  });

  it("produces a non-empty key", () => {
    const key = deriveProjectKey("/Users/danish/Repo/remembrance");
    expect(key.length).toBeGreaterThan(0);
  });

  it("uses -- as segment separator to distinguish structurally different paths", () => {
    const keyA = deriveProjectKey("/home/user/project-a");
    const keyB = deriveProjectKey("/home/user/project/a");
    expect(keyA).toBe("home--user--project-a");
    expect(keyB).toBe("home--user--project--a");
    expect(keyA).not.toBe(keyB);
  });

  it("throws for root path /", () => {
    expect(() => deriveProjectKey("/")).toThrow();
  });

  it("throws for empty string", () => {
    expect(() => deriveProjectKey("")).toThrow();
  });
});

describe("resolveProjectDir", () => {
  it("joins baseDir and projectKey", () => {
    const dir = resolveProjectDir("my-key", "/tmp/base");
    expect(dir).toBe("/tmp/base/my-key");
  });
});
