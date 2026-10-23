export class WebSocketManager {
  private closed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private url: string;
  private socket: WebSocket | null = null;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private messageListeners: Array<(message: MessageEvent) => void> = [];
  private isConnected: boolean = false;

  constructor(
    url: string,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  ) {
    this.url = url;
    this.reconnectInterval = reconnectInterval;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event: MessageEvent) => {
      for (const listener of [...this.messageListeners]) {
        try {
          listener(event);
        } catch {
          /* One subscriber must not suppress others. */
        }
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      if (!this.closed && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, this.reconnectInterval);
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  /** True means accepted by the local socket, not acknowledged by the server. */
  public trySendMessage(message: string): boolean {
    if (!this.isConnected || !this.socket || this.socket.readyState !== 1)
      return false;
    this.socket.send(message);
    return true;
  }

  /** Legacy fire-and-forget API; use trySendMessage to inspect connection availability. */
  public sendMessage(message: string): void {
    this.trySendMessage(message);
  }

  public addMessageListener(listener: (message: MessageEvent) => void) {
    this.messageListeners.push(listener);
  }

  public removeMessageListener(listener: (message: MessageEvent) => void) {
    this.messageListeners = this.messageListeners.filter(l => l !== listener);
  }

  public close() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.isConnected = false;
    if (this.socket) {
      this.socket.onopen =
        this.socket.onmessage =
        this.socket.onclose =
        this.socket.onerror =
          null;
      this.socket.close();
      this.socket = null;
    }
    this.messageListeners = [];
  }
}
