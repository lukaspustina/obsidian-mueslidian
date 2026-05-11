import type { HttpTransport as FunctionTransport } from './types.js';

export interface HttpTransport {
  request: FunctionTransport;
}
