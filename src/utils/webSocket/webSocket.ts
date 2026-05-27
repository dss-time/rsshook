export class WebSocketManager {
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
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event: MessageEvent) => {
      this.messageListeners.forEach(listener => listener(event));
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, this.reconnectInterval);
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  public sendMessage(message: string) {
    if (this.isConnected && this.socket) {
      this.socket.send(message);
    }
  }

  public addMessageListener(listener: (message: MessageEvent) => void) {
    this.messageListeners.push(listener);
  }

  public removeMessageListener(listener: (message: MessageEvent) => void) {
    this.messageListeners = this.messageListeners.filter(l => l !== listener);
  }

  public close() {
    this.socket?.close();
    this.isConnected = false;
  }
}
