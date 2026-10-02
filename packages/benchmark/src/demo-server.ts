import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

/** The demo application, started and stopped without a shell. */

export interface RunningDemo {
  readonly port: number;
  readonly baseUrl: string;
  readonly logs: readonly string[];
  stop(): Promise<void>;
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

export async function startDemo(demoRoot: string, mutations = ''): Promise<RunningDemo> {
  const port = await freePort();
  const logs: string[] = [];
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: demoRoot,
    env: { ...process.env, PORT: String(port), DEMO_MUTATIONS: mutations },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  child.stdout.on('data', (chunk: Buffer) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk: Buffer) => logs.push(String(chunk)));
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${String(port)}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) {
        return {
          port,
          baseUrl,
          logs,
          async stop() {
            child.kill();
            await exited;
          },
        };
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`The demo application did not start on port ${String(port)}:\n${logs.join('')}`);
}
