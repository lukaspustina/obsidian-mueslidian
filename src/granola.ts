import type { HttpTransport, ListResponse, Note, NoteWithBody, GranolaNoteId } from './types.js';

const BASE_URL = 'https://public-api.granola.ai/v1';

export class GranolaHttpError extends Error {
  public readonly status: number;
  constructor(status: number) {
    super(`GranolaHttpError: HTTP ${status}`);
    this.name = 'GranolaHttpError';
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class GranolaClient {
  constructor(
    private readonly apiKey: string,
    private readonly transport: HttpTransport
  ) {}

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
  }

  private async request(
    path: string,
    query: Record<string, string> = {}
  ): Promise<unknown> {
    const headers = this.buildHeaders();
    const qs = Object.keys(query).length > 0
      ? '?' + new URLSearchParams(query).toString()
      : '';
    const url = `${BASE_URL}${path}${qs}`;

    const MAX_ATTEMPTS = 3;
    const DELAYS_MS = [250, 500];
    let response: { status: number; body: unknown } = { status: 0, body: {} };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await this.transport(url, { method: 'GET', headers });
      if (response.status !== 429) break;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(DELAYS_MS[attempt - 1]);
    }

    if (response.status === 401) {
      throw new Error('InvalidApiKey');
    }
    if (response.status >= 200 && response.status < 300) {
      return response.body;
    }
    throw new GranolaHttpError(response.status);
  }

  async listNotes(params: { createdAfter?: string; cursor?: string }): Promise<ListResponse> {
    const query: Record<string, string> = {};
    if (params.cursor != null) query['cursor'] = params.cursor;
    if (params.createdAfter != null) query['created_after'] = params.createdAfter;
    const body = await this.request('/notes', query);
    return body as ListResponse;
  }

  async *listAllNotes(params: { createdAfter?: string }): AsyncGenerator<Note> {
    let cursor: string | undefined = undefined;
    while (true) {
      const page = await this.listNotes({ createdAfter: params.createdAfter, cursor });
      for (const note of page.notes) yield note;
      if (!page.hasMore || page.cursor == null) return;
      cursor = page.cursor;
    }
  }

  async getNote(id: GranolaNoteId, opts: { includeTranscript: boolean }): Promise<NoteWithBody | null> {
    const query: Record<string, string> = {};
    if (opts.includeTranscript) query['include'] = 'transcript';
    try {
      const body = await this.request(`/notes/${id}`, query);
      return body as NoteWithBody;
    } catch (err) {
      if (err instanceof GranolaHttpError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }
}
