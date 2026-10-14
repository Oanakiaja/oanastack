import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { createApp, resolveWebRoot } from "./api.js";
import { StoreError } from "./errors.js";
import type { Store } from "./store.js";
import { DEFAULT_PORT } from "./version.js";

export interface RunningServer {
  port: number;
  hostname: string;
  url: string;
  close: () => Promise<void>;
}

export function assertLoopback(hostname: string): void {
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") {
    throw new StoreError("refusing non-loopback host; the dashboard stays on localhost", "invalid");
  }
}

export function startServer(options: {
  store: Store;
  port?: number;
  hostname?: string;
  webRoot?: string | null;
}): Promise<RunningServer> {
  const hostname = options.hostname ?? "127.0.0.1";
  assertLoopback(hostname);
  const port = options.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new StoreError("port must be an integer from 0 to 65535", "invalid");
  }
  const webRoot = options.webRoot === undefined ? resolveWebRoot() : options.webRoot;
  const app = createApp(options.store, { webRoot });

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
      if (settled) return;
      settled = true;
      const bound = info.port;
      const host = hostname === "::1" ? "[::1]" : hostname;
      resolve({
        port: bound,
        hostname,
        url: `http://${host}:${bound}`,
        close: () => closeServer(server),
      });
    });
    server.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
