import { platform } from "node:process";
import { join } from "node:path";
import { homedir } from "node:os";

const APP_NAME = "remembrance";

export function getMemoryBaseDir(override?: string): string {
  if (override) return override;

  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) throw new Error("APPDATA environment variable not set");
    return join(appData, APP_NAME);
  }

  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  // Linux / other POSIX: XDG Base Directory spec
  const xdgData =
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(xdgData, APP_NAME);
}

export function deriveProjectKey(absolutePath: string): string {
  if (
    !absolutePath ||
    absolutePath.trim() === "/" ||
    absolutePath.trim() === ""
  ) {
    throw new Error(
      `Cannot derive project key from empty or root path: "${absolutePath}"`,
    );
  }

  const segments = absolutePath
    .replace(/\\/g, "/") // normalise Windows separators
    .split("/")
    .filter(Boolean) // remove empty segments from leading/trailing slashes
    .map(
      (s) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric runs with single hyphen
          .replace(/^-+|-+$/g, ""), // strip leading/trailing hyphens within segment
    )
    .filter(Boolean); // remove any segments that collapsed to empty

  if (segments.length === 0) {
    throw new Error(`Cannot derive project key from path: "${absolutePath}"`);
  }

  return segments.join("--"); // double-hyphen separates path segments
}

export function resolveProjectDir(projectKey: string, baseDir: string): string {
  return join(baseDir, projectKey);
}
