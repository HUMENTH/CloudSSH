import { Env, SSHConnectionConfig } from '../types';
import { SSHSession } from './ssh-session';

export class SSHSessionDO {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, SSHSession> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Use Hibernation API for long-lived WebSocket connections
    this.state.acceptWebSocket(server);

    // Set a timeout for receiving credentials
    const timeout = setTimeout(() => {
      try {
        server.send(JSON.stringify({ type: 'error', message: 'Connection timeout' }));
        server.close(1011, 'Timeout');
      } catch {}
    }, 10000);

    // Store timeout ID so we can clear it when credentials arrive
    server.serializeAttachment({ state: 'waiting', timeout: null });
    // Note: we can't serialize setTimeout, so we store it in a map
    this._pendingTimeouts.set(server, timeout);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as any);
  }

  private _pendingTimeouts: Map<WebSocket, ReturnType<typeof setTimeout>> = new Map();

  // Hibernation API: called when a WebSocket message is received
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const session = this.sessions.get(ws);

    if (session) {
      // Session already established, forward input
      try {
        if (typeof message === 'string') {
          await session.handleWebSocketMessage(message);
        } else {
          await session.handleWebSocketMessage(message);
        }
      } catch (e) {
        console.error('[WS] Input error:', e instanceof Error ? e.message : String(e));
      }
      return;
    }

    // No session yet — this should be the credentials message
    const timeout = this._pendingTimeouts.get(ws);
    if (timeout) {
      clearTimeout(timeout);
      this._pendingTimeouts.delete(ws);
    }

    try {
      const config = JSON.parse(message as string) as SSHConnectionConfig;

      if (!config.host || !config.username || !config.password) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing credentials' }));
        ws.close(1011, 'Invalid credentials');
        return;
      }

      await this.initSSHSession(ws, config);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid credentials format' }));
      ws.close(1011, 'Invalid format');
    }
  }

  // Hibernation API: called when a WebSocket is closed
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const session = this.sessions.get(ws);
    if (session) {
      session.close();
      this.sessions.delete(ws);
    }
    const timeout = this._pendingTimeouts.get(ws);
    if (timeout) {
      clearTimeout(timeout);
      this._pendingTimeouts.delete(ws);
    }
  }

  // Hibernation API: called when a WebSocket error occurs
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const session = this.sessions.get(ws);
    if (session) {
      session.close();
      this.sessions.delete(ws);
    }
  }

  private async initSSHSession(
    ws: WebSocket,
    config: SSHConnectionConfig
  ): Promise<void> {
    try {
      const BLOCKED_PORTS = [80, 443, 25, 465, 587, 3306, 6379, 27017, 11211];
      if (BLOCKED_PORTS.includes(config.port)) {
        throw new Error(`端口 ${config.port} 存在安全风险，已被禁止连接`);
      }

      const isPrivateIP = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(config.host);
      const isLocalhost = config.host.toLowerCase() === 'localhost';
      if (isPrivateIP || isLocalhost) {
        throw new Error('禁止连接内网或本地回环地址 (SSRF 防护)');
      }
      const { connect } = await import('cloudflare:sockets');
      const socket = connect({ hostname: config.host, port: config.port });

      await socket.opened;

      const session = new SSHSession(ws, socket, config);
      this.sessions.set(ws, session);

      await session.startHandshake();

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[SSH] Session error:', errMsg);
      try {
        ws.send(JSON.stringify({ type: 'error', message: `连接失败: ${errMsg}` }));
        ws.close(1011, 'SSH connection failed');
      } catch {}
    }
  }
}
