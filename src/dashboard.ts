import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

import {
  getAllChats,
  getAllRegisteredGroups,
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from './db.js';
import { DATA_DIR, GROUPS_DIR } from './config.js';
import { dashboardEvents, DashboardEvent } from './dashboard-events.js';
import { logger } from './logger.js';
import { readEnvFile } from './env.js';
import { Channel } from './types.js';
import { findChannel } from './router.js';

const DASHBOARD_PORT = 3333;
const startTime = Date.now();

// SSE clients
const sseClients = new Set<http.ServerResponse>();

// Channel refs (set during startup)
let channelRefs: Channel[] = [];

export function setDashboardChannels(channels: Channel[]): void {
  channelRefs = channels;
}

function getOrCreateToken(): string {
  const envPath = path.join(process.cwd(), '.env');
  const existing = readEnvFile(['DASHBOARD_TOKEN']);
  if (existing.DASHBOARD_TOKEN) return existing.DASHBOARD_TOKEN;

  const token = crypto.randomBytes(24).toString('hex');
  try {
    const content = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, 'utf-8')
      : '';
    const line = `\nDASHBOARD_TOKEN=${token}\n`;
    fs.writeFileSync(envPath, content + line);
  } catch {
    logger.warn('Could not write DASHBOARD_TOKEN to .env');
  }
  return token;
}

function checkAuth(req: http.IncomingMessage, token: string): boolean {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const queryToken = url.searchParams.get('token');
  if (queryToken === token) return true;
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${token}`) return true;
  return false;
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > 1_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseRoute(pathname: string): {
  base: string;
  param?: string;
  sub?: string;
} {
  // /api/tasks/abc123/runs -> { base: 'tasks', param: 'abc123', sub: 'runs' }
  const parts = pathname
    .replace(/^\/api\//, '')
    .split('/')
    .filter(Boolean);
  return { base: parts[0], param: parts[1], sub: parts[2] };
}

export function startDashboard(): void {
  const token = getOrCreateToken();

  // Forward dashboard events to SSE clients
  dashboardEvents.on('dashboard', (event: DashboardEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(data);
      } catch {
        sseClients.delete(client);
      }
    }
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth check
    if (!checkAuth(req, token)) {
      json(res, { error: 'Unauthorized' }, 401);
      return;
    }

    try {
      // Serve dashboard HTML
      if (pathname === '/' && method === 'GET') {
        const htmlPath = path.join(
          process.cwd(),
          'container',
          'dashboard.html',
        );
        if (fs.existsSync(htmlPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(fs.readFileSync(htmlPath));
        } else {
          res.writeHead(404);
          res.end('Dashboard HTML not found');
        }
        return;
      }

      // SSE endpoint
      if (pathname === '/events' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('data: {"type":"connected"}\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // API routes
      if (pathname.startsWith('/api/')) {
        const route = parseRoute(pathname);

        // GET /api/status
        if (route.base === 'status' && method === 'GET') {
          const groups = getAllRegisteredGroups();
          const tasks = getAllTasks();
          const channelStatus = channelRefs.map((ch) => ({
            name: ch.name,
            connected: ch.isConnected(),
          }));
          json(res, {
            uptime: Date.now() - startTime,
            channels: channelStatus,
            groups: Object.keys(groups).length,
            activeTasks: tasks.filter((t) => t.status === 'active').length,
            totalTasks: tasks.length,
          });
          return;
        }

        // GET /api/chats
        if (route.base === 'chats' && method === 'GET') {
          const chats = getAllChats();
          const registered = getAllRegisteredGroups();
          json(
            res,
            chats
              .filter((c) => c.jid !== '__group_sync__')
              .map((c) => ({
                ...c,
                registered: c.jid in registered,
                folder: registered[c.jid]?.folder,
              })),
          );
          return;
        }

        // GET /api/messages/:jid
        if (route.base === 'messages' && route.param && method === 'GET') {
          const jid = decodeURIComponent(route.param);
          const limit = parseInt(url.searchParams.get('limit') || '50', 10);
          const offset = parseInt(url.searchParams.get('offset') || '0', 10);
          // Direct SQL for paginated messages (db.ts doesn't have this exact query)
          // We'll use getAllChats pattern - import the db module directly
          const Database = (await import('better-sqlite3')).default;
          const dbPath = path.join(process.cwd(), 'store', 'messages.db');
          const db = new Database(dbPath, { readonly: true });
          const messages = db
            .prepare(
              `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
               FROM messages WHERE chat_jid = ?
               ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
            )
            .all(jid, limit, offset);
          db.close();
          json(res, messages);
          return;
        }

        // GET /api/tasks, POST /api/tasks
        if (route.base === 'tasks' && !route.param) {
          if (method === 'GET') {
            json(res, getAllTasks());
            return;
          }
          if (method === 'POST') {
            const body = JSON.parse(await readBody(req));
            const id = crypto.randomUUID();
            createTask({
              id,
              group_folder: body.group_folder,
              chat_jid: body.chat_jid,
              prompt: body.prompt,
              schedule_type: body.schedule_type,
              schedule_value: body.schedule_value,
              context_mode: body.context_mode || 'isolated',
              next_run: body.next_run || null,
              status: 'active',
              created_at: new Date().toISOString(),
            });
            json(res, { id }, 201);
            return;
          }
        }

        // PATCH /api/tasks/:id, DELETE /api/tasks/:id
        if (route.base === 'tasks' && route.param && !route.sub) {
          if (method === 'PATCH') {
            const body = JSON.parse(await readBody(req));
            updateTask(route.param, body);
            json(res, { ok: true });
            return;
          }
          if (method === 'DELETE') {
            deleteTask(route.param);
            json(res, { ok: true });
            return;
          }
          if (method === 'GET') {
            const task = getTaskById(route.param);
            if (!task) {
              json(res, { error: 'Not found' }, 404);
              return;
            }
            json(res, task);
            return;
          }
        }

        // GET /api/tasks/:id/runs
        if (route.base === 'tasks' && route.param && route.sub === 'runs') {
          const Database = (await import('better-sqlite3')).default;
          const dbPath = path.join(process.cwd(), 'store', 'messages.db');
          const db = new Database(dbPath, { readonly: true });
          const runs = db
            .prepare(
              'SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY run_at DESC LIMIT 20',
            )
            .all(route.param);
          db.close();
          json(res, runs);
          return;
        }

        // GET /api/souls, GET /api/souls/:folder, PUT /api/souls/:folder
        if (route.base === 'souls') {
          if (!route.param && method === 'GET') {
            // List all CLAUDE.md files
            const souls: { folder: string; exists: boolean }[] = [];
            if (fs.existsSync(GROUPS_DIR)) {
              for (const dir of fs.readdirSync(GROUPS_DIR)) {
                const claudePath = path.join(GROUPS_DIR, dir, 'CLAUDE.md');
                souls.push({
                  folder: dir,
                  exists: fs.existsSync(claudePath),
                });
              }
            }
            json(res, souls);
            return;
          }
          if (route.param && method === 'GET') {
            const claudePath = path.join(GROUPS_DIR, route.param, 'CLAUDE.md');
            if (fs.existsSync(claudePath)) {
              json(res, {
                folder: route.param,
                content: fs.readFileSync(claudePath, 'utf-8'),
              });
            } else {
              json(res, { folder: route.param, content: '' });
            }
            return;
          }
          if (route.param && method === 'PUT') {
            const body = JSON.parse(await readBody(req));
            const claudePath = path.join(GROUPS_DIR, route.param, 'CLAUDE.md');
            fs.mkdirSync(path.dirname(claudePath), { recursive: true });
            fs.writeFileSync(claudePath, body.content);
            json(res, { ok: true });
            return;
          }
        }

        // GET /api/config
        if (route.base === 'config' && method === 'GET') {
          // Return non-secret config values
          const safe = readEnvFile([
            'ASSISTANT_NAME',
            'TELEGRAM_ONLY',
            'GHOSTCLAW_MODEL',
            'ASSISTANT_HAS_OWN_NUMBER',
          ]);
          json(res, safe);
          return;
        }

        // POST /api/send/:jid
        if (route.base === 'send' && route.param && method === 'POST') {
          const jid = decodeURIComponent(route.param);
          const body = JSON.parse(await readBody(req));
          const channel = findChannel(channelRefs, jid);
          if (!channel) {
            json(res, { error: 'No channel for this JID' }, 400);
            return;
          }
          await channel.sendMessage(jid, body.text);
          dashboardEvents.emit('dashboard', {
            type: 'bot_message',
            data: { jid, text: body.text, source: 'dashboard' },
            timestamp: new Date().toISOString(),
          });
          json(res, { ok: true });
          return;
        }

        // GET /api/logs/:folder
        if (route.base === 'logs' && route.param && method === 'GET') {
          const logsDir = path.join(GROUPS_DIR, route.param, 'logs');
          if (!fs.existsSync(logsDir)) {
            json(res, []);
            return;
          }
          const files = fs.readdirSync(logsDir).sort().reverse().slice(0, 10);
          const logs = files.map((f) => ({
            filename: f,
            content: fs
              .readFileSync(path.join(logsDir, f), 'utf-8')
              .slice(0, 5000),
          }));
          json(res, logs);
          return;
        }

        // GET /api/ralph — list all Ralph runs
        if (route.base === 'ralph' && !route.param && method === 'GET') {
          const ralphDir = path.join(DATA_DIR, 'ralph');
          if (!fs.existsSync(ralphDir)) {
            json(res, []);
            return;
          }
          const runs = fs
            .readdirSync(ralphDir)
            .filter((d) => fs.existsSync(path.join(ralphDir, d, 'config.json')))
            .map((d) => {
              try {
                const config = JSON.parse(
                  fs.readFileSync(
                    path.join(ralphDir, d, 'config.json'),
                    'utf-8',
                  ),
                );
                let outputFiles: { name: string; size: number }[] = [];
                try {
                  const runStart = new Date(config.startedAt).getTime();
                  outputFiles = fs
                    .readdirSync(config.workDir)
                    .filter(
                      (f: string) => f.endsWith('.md') || f.endsWith('.txt'),
                    )
                    .map((f: string) => {
                      const stat = fs.statSync(path.join(config.workDir, f));
                      return { name: f, size: stat.size, mtime: stat.mtimeMs };
                    })
                    .filter((f) => f.mtime >= runStart)
                    .map(({ name, size }) => ({ name, size }));
                } catch {
                  /* workDir may not exist */
                }
                return { ...config, outputFiles };
              } catch {
                return null;
              }
            })
            .filter(Boolean)
            .sort(
              (a: any, b: any) =>
                new Date(b.startedAt).getTime() -
                new Date(a.startedAt).getTime(),
            );
          json(res, runs);
          return;
        }

        // GET /api/ralph/:runId/progress
        if (
          route.base === 'ralph' &&
          route.param &&
          route.sub === 'progress' &&
          method === 'GET'
        ) {
          const progressPath = path.join(
            DATA_DIR,
            'ralph',
            route.param,
            'progress.txt',
          );
          try {
            const content = fs.readFileSync(progressPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(content);
          } catch {
            res.writeHead(404);
            res.end('Not found');
          }
          return;
        }

        // GET/PUT /api/ralph/:runId/file?name=research.md
        if (
          route.base === 'ralph' &&
          route.param &&
          route.sub === 'file'
        ) {
          const filename = url.searchParams.get('name');
          if (!filename || filename.includes('..') || filename.includes('/')) {
            json(res, { error: 'Invalid filename' }, 400);
            return;
          }
          const ralphConfigPath = path.join(
            DATA_DIR,
            'ralph',
            route.param,
            'config.json',
          );

          if (method === 'GET') {
            try {
              const config = JSON.parse(
                fs.readFileSync(ralphConfigPath, 'utf-8'),
              );
              const filePath = path.join(config.workDir, filename);
              const content = fs.readFileSync(filePath, 'utf-8');

              // Download mode
              if (url.searchParams.get('download') === '1') {
                const ext = path.extname(filename).toLowerCase();
                const contentType =
                  ext === '.md'
                    ? 'text/markdown'
                    : ext === '.txt'
                      ? 'text/plain'
                      : 'application/octet-stream';
                res.writeHead(200, {
                  'Content-Type': contentType,
                  'Content-Disposition': `attachment; filename="${filename}"`,
                });
                res.end(content);
              } else {
                json(res, { name: filename, content });
              }
            } catch {
              json(res, { error: 'File not found' }, 404);
            }
            return;
          }

          if (method === 'PUT') {
            try {
              const config = JSON.parse(
                fs.readFileSync(ralphConfigPath, 'utf-8'),
              );
              const filePath = path.join(config.workDir, filename);
              const body = JSON.parse(await readBody(req));
              fs.writeFileSync(filePath, body.content);
              json(res, { ok: true });
            } catch {
              json(res, { error: 'Save failed' }, 500);
            }
            return;
          }
        }
      }

      // 404
      json(res, { error: 'Not found' }, 404);
    } catch (err) {
      logger.error({ err }, 'Dashboard API error');
      json(res, { error: 'Internal error' }, 500);
    }
  });

  server.listen(DASHBOARD_PORT, '0.0.0.0', () => {
    const hostname = os.hostname();
    logger.info(
      `Dashboard: http://${hostname}:${DASHBOARD_PORT}?token=${token}`,
    );
    console.log('');
    console.log(
      `  👻 Dashboard: http://${hostname}:${DASHBOARD_PORT}?token=${token}`,
    );
    console.log(
      `     Local:     http://127.0.0.1:${DASHBOARD_PORT}?token=${token}`,
    );
    console.log('');
  });
}
