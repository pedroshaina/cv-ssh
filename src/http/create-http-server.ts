import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadContent } from '../content/load-content.js';
import type { CvContent } from '../content/content.types.js';
import type { Logger } from '../logging/create-logger.js';
import { listen } from '../net/listen.js';
import { parseColumns } from '../web/parse-columns.js';
import { renderCvView } from '../web/render-cv-view.js';
import { renderPage } from '../web/render-page.js';
import { resolveAsset } from '../web/serve-asset.js';
import { DEFAULT_WEB_COLUMNS } from '../web/web.constants.js';
import { PAGE_HEADERS } from './response-headers.constants.js';

export interface HttpServer {
  listen(port: number, host: string): Promise<AddressInfo>;
  close(): Promise<void>;
}

export interface HttpServerOptions {
  isReady: () => boolean;
  contentDir: string;
  logger: Logger;
}

export function createHttpServer({ isReady, contentDir, logger }: HttpServerOptions): HttpServer {
  /** Read per request, like SSH sessions, so content edits need no restart. */
  const loadContentOrFail = (response: ServerResponse, request: IncomingMessage): CvContent | undefined => {
    try {
      return loadContent(contentDir);
    } catch (error: unknown) {
      logger.error({ err: error }, 'could not load content');
      send(request, response, 500, { 'content-type': 'text/plain' }, 'internal error\n');
      return undefined;
    }
  };

  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/health') {
      send(request, response, 200, { 'content-type': 'text/plain' }, 'ok\n');
    } else if (url.pathname === '/ready') {
      const ready = isReady();
      send(request, response, ready ? 200 : 503, { 'content-type': 'text/plain' }, ready ? 'ready\n' : 'not ready\n');
    } else if (url.pathname === '/') {
      const content = loadContentOrFail(response, request);
      if (!content) return;
      const page = renderPage(renderCvView(content, DEFAULT_WEB_COLUMNS));
      send(request, response, 200, { ...PAGE_HEADERS, 'content-type': 'text/html; charset=utf-8' }, page);
    } else if (url.pathname.startsWith('/assets/')) {
      void serveAsset(request, response, url.pathname);
    } else if (url.pathname === '/cv.json') {
      const cols = parseColumns(url.searchParams.get('cols'));
      if (cols === undefined) {
        send(request, response, 400, { 'content-type': 'text/plain' }, 'cols must be an integer\n');
        return;
      }
      const content = loadContentOrFail(response, request);
      if (!content) return;
      const body = JSON.stringify(renderCvView(content, cols));
      send(request, response, 200, { ...PAGE_HEADERS, 'content-type': 'application/json; charset=utf-8' }, body);
    } else {
      response.writeHead(404).end();
    }
  });

  return {
    listen: (port, host) => listen(server, port, host),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function serveAsset(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
  const asset = resolveAsset(pathname);
  const body = asset && (await readFile(asset.filePath).catch(() => undefined));
  if (!asset || !body) {
    response.writeHead(404).end();
    return;
  }
  send(request, response, 200, { ...PAGE_HEADERS, 'content-type': asset.contentType }, body);
}

function send(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  headers: OutgoingHttpHeaders,
  body: string | Buffer,
): void {
  response.writeHead(status, { ...headers, 'content-length': Buffer.byteLength(body) });
  response.end(request.method === 'HEAD' ? undefined : body);
}
