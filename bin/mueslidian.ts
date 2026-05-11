import type { HttpTransport as FunctionTransport } from '../src/types.js';
import type { HttpTransport as ObjectTransport } from '../src/transport.js';
import { GranolaClient } from '../src/granola.js';

export type RunCliTransport = FunctionTransport | ObjectTransport;

export interface RunCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function normalizeFn(transport: RunCliTransport): FunctionTransport {
  if (typeof transport === 'function') return transport;
  return transport.request;
}

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
  transport: RunCliTransport
): Promise<RunCliResult> {
  let stdout = '';
  let stderr = '';

  const apiKey = env['GRANOLA_API_KEY'];
  if (!apiKey) {
    stderr += 'error: GRANOLA_API_KEY is required\n';
    return { exitCode: 1, stdout, stderr };
  }

  // R8: warn (non-blocking) when key doesn't match grn_* format.
  if (!/^grn_[a-zA-Z0-9]+$/.test(apiKey)) {
    stderr += 'warning: GRANOLA_API_KEY does not match expected format (grn_*)\n';
  }

  const fn = normalizeFn(transport);
  const client = new GranolaClient(apiKey, fn);
  const subcommand = argv[0];

  try {
    switch (subcommand) {
      case 'test': {
        let count = 0;
        for await (const _note of client.listAllNotes({})) {
          count++;
        }
        stdout += count === 1 ? 'OK (1 note)\n' : `OK (${count} notes)\n`;
        break;
      }

      case 'list': {
        let createdAfter: string | undefined;
        let json = false;
        for (let i = 1; i < argv.length; i++) {
          if (argv[i] === '--after' && i + 1 < argv.length) {
            createdAfter = argv[++i];
          } else if (argv[i] === '--json') {
            json = true;
          }
        }
        for await (const note of client.listAllNotes({ createdAfter })) {
          if (json) {
            stdout += JSON.stringify(note) + '\n';
          } else {
            stdout += `${note.id}\t${note.title ?? ''}\n`;
          }
        }
        break;
      }

      case 'get': {
        const id = argv[1];
        if (!id) {
          stderr += 'error: get requires an <id> argument\n';
          return { exitCode: 1, stdout, stderr };
        }
        let includeTranscript = false;
        let json = false;
        for (let i = 2; i < argv.length; i++) {
          if (argv[i] === '--transcript') includeTranscript = true;
          if (argv[i] === '--json') json = true;
        }
        const note = await client.getNote(id, { includeTranscript });
        if (note == null) {
          stdout += 'Note not found (still processing)\n';
        } else {
          stdout += (json ? JSON.stringify(note) : JSON.stringify(note, null, 2)) + '\n';
        }
        break;
      }

      case 'dump': {
        const id = argv[1];
        if (!id) {
          stderr += 'error: dump requires an <id> argument\n';
          return { exitCode: 1, stdout, stderr };
        }
        const note = await client.getNote(id, { includeTranscript: true });
        if (note == null) {
          stdout += 'Note not found (still processing)\n';
        } else {
          stdout += JSON.stringify(note, null, 2) + '\n';
        }
        break;
      }

      default: {
        stderr += `usage: mueslidian <test|list|get|dump> [options]\n`;
        return { exitCode: 1, stdout, stderr };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr += message + '\n';
    return { exitCode: 1, stdout, stderr };
  }

  return { exitCode: 0, stdout, stderr };
}

// Entry point when executed directly
import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const defaultFetchTransport: FunctionTransport = async (url, opts) => {
    const r = await fetch(url, opts);
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  };
  const result = await runCli(process.argv.slice(2), process.env, defaultFetchTransport);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
