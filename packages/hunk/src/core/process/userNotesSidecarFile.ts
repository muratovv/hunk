/** Disk I/O for the `--store-notes` review-notes sidecar. */
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { UserNotesSidecar } from "../review/userNotesSidecar";

interface SidecarRead {
  sidecar: UserNotesSidecar;
  /** The file exists with bytes that are not a sidecar; they must survive the next write. */
  corrupt: boolean;
}

function readSidecarFile(path: string): SidecarRead {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      debugSidecar("read", path, error);
    }
    return { sidecar: {}, corrupt: false };
  }
  if (contents.trim().length === 0) {
    return { sidecar: {}, corrupt: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    debugSidecar("parse", path, error);
    return { sidecar: {}, corrupt: true };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { sidecar: {}, corrupt: true };
  }
  const sidecar: UserNotesSidecar = {};
  for (const [runtimeId, entries] of Object.entries(parsed)) {
    if (Array.isArray(entries)) {
      sidecar[runtimeId] = entries;
    }
  }
  return { sidecar, corrupt: false };
}

function debugSidecar(action: string, path: string, error: unknown) {
  if (process.env.HUNK_DEBUG === "1") {
    process.stderr.write(`hunk: failed to ${action} review notes at ${path}: ${String(error)}\n`);
  }
}

/** Read the sidecar; a missing, empty, or unparsable file reads as no notes. */
export function readUserNotesSidecar(path: string): UserNotesSidecar {
  return readSidecarFile(path).sidecar;
}

/** Atomically replace the sidecar; returns the failure message instead of throwing. */
export function writeUserNotesSidecar(path: string, sidecar: UserNotesSidecar): string | undefined {
  const tempPath = `${path}.${process.pid}.tmp`;
  try {
    if (readSidecarFile(path).corrupt) {
      renameSync(path, `${path}.corrupt`);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tempPath, JSON.stringify(sidecar, null, 2), { encoding: "utf8" });
    renameSync(tempPath, path);
    return undefined;
  } catch (error) {
    rmSync(tempPath, { force: true });
    debugSidecar("write", path, error);
    return `hunk: could not save review notes to ${path}: ${String(error)}`;
  }
}

function nearestExistingDir(path: string): string {
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  return dir;
}

/** Warn up front when notes saved this session could not reach `path`. */
export function userNotesSidecarWriteWarning(path: string): string | undefined {
  const target = existsSync(path) ? path : nearestExistingDir(path);
  try {
    accessSync(target, constants.W_OK);
    return undefined;
  } catch {
    return `hunk: cannot write review notes to ${path}; notes from this session will not be saved.`;
  }
}
