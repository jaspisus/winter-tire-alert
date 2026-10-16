import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Tires } from './config.ts';

export interface LastAlert {
  kind: Tires;
  /** Onset date the alert (or its reminder) announced. */
  onset: string;
  sentAt: string;
  /** Whether the one reminder for this alert has been sent. */
  reminded: boolean;
}

export interface State {
  currentTires: Tires;
  lastAlert: LastAlert | null;
}

const isTires = (value: unknown): value is Tires => value === 'summer' || value === 'winter';

function parseState(raw: string, file: string): State {
  const invalid = (reason: string) =>
    new Error(`Invalid state file ${file}: ${reason}. Reset it as described in the README.`);

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw invalid('not valid JSON');
  }
  if (typeof data !== 'object' || data === null) throw invalid('not an object');

  const { currentTires, lastAlert } = data as Record<string, unknown>;
  if (!isTires(currentTires)) throw invalid('currentTires must be "summer" or "winter"');
  if (lastAlert === null || lastAlert === undefined) return { currentTires, lastAlert: null };

  const alert = lastAlert as Record<string, unknown>;
  if (!isTires(alert.kind) || typeof alert.onset !== 'string' || typeof alert.sentAt !== 'string') {
    throw invalid('lastAlert must have kind, onset and sentAt');
  }
  return {
    currentTires,
    lastAlert: {
      kind: alert.kind,
      onset: alert.onset,
      sentAt: alert.sentAt,
      reminded: alert.reminded === true,
    },
  };
}

/** Returns null when there is no state file yet. */
export async function readState(file: string): Promise<State | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return parseState(raw, file);
}

export async function writeState(file: string, state: State): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  // Write to a temporary file first so a crash never leaves a half-written state file.
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}
