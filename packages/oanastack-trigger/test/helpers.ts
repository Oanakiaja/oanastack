import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveTriggerLocation, type TriggerLocation } from "../src/paths.js";

export function tempHome(): { home: string; env: NodeJS.ProcessEnv; location: TriggerLocation } {
  const home = mkdtempSync(path.join(tmpdir(), "oanastack-trigger-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    OANASTACK_HOME: path.join(home, ".oanastack"),
  };
  delete env.GROKBOT_WEBHOOK;
  delete env.GROKBOT_AUTH;
  delete env.OANASTACK_TRIGGER_DB;
  delete env.OANASTACK_TRIGGER_URL;
  delete env.OANASTACK_TRIGGER_PORT;
  delete env.HERDR_BIN;
  return { home, env, location: resolveTriggerLocation(env) };
}

export interface WebhookHit {
  authorization: string | undefined;
  body: unknown;
}

export async function fakeWebhook(failTimes = 0): Promise<{
  url: string;
  hits: WebhookHit[];
  close: () => Promise<void>;
}> {
  const hits: WebhookHit[] = [];
  let remaining = failTimes;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      hits.push({
        authorization: req.headers.authorization,
        body: raw ? (JSON.parse(raw) as unknown) : null,
      });
      if (remaining > 0) {
        remaining -= 1;
        res.writeHead(500);
        res.end("no");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake webhook did not bind");
  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    hits,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
