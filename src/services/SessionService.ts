
// This is a mock service for demonstration purposes
// In a real implementation, this would use WebRTC, WebSockets,
// or a backend service to facilitate communication

export interface Session {
  id: string;
  user: string;
  device: string;
  startTime: Date;
  
  // In seconds
  getDuration(): number;
  // Formatted as "5m" or "1h 5m"
  getFormattedDuration(): string;
}

class SessionImpl implements Session {
  id: string;
  user: string;
  device: string;
  startTime: Date;
  
  constructor(id: string, user: string, device: string) {
    this.id = id;
    this.user = user;
    this.device = device;
    this.startTime = new Date();
  }
  
  getDuration(): number {
    return Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
  }
  
  getFormattedDuration(): string {
    const seconds = this.getDuration();
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }
}

class SessionService {
  private activeSessions: Map<string, Session> = new Map();
  private listeners: ((sessions: Session[]) => void)[] = [];
  
  constructor() {
    // Create some mock sessions for demonstration
    this.createSession("User 1", "BT Serial Module");
    this.createSession("User 2", "HC-05 Module");
    
    // Update session durations periodically
    setInterval(() => {
      if (this.activeSessions.size > 0) {
        this.notifyListeners();
      }
    }, 60000); // Update every minute
  }
  
  createSession(user: string, device: string): Session {
    const id = Math.random().toString(36).substring(2, 10);
    const session = new SessionImpl(id, user, device);
    this.activeSessions.set(id, session);
    this.notifyListeners();
    return session;
  }
  
  getSession(id: string): Session | undefined {
    return this.activeSessions.get(id);
  }
  
  getAllSessions(): Session[] {
    return Array.from(this.activeSessions.values());
  }
  
  closeSession(id: string): boolean {
    const result = this.activeSessions.delete(id);
    if (result) {
      this.notifyListeners();
    }
    return result;
  }
  
  addSessionsListener(callback: (sessions: Session[]) => void): void {
    this.listeners.push(callback);
    // Call immediately with current sessions
    callback(this.getAllSessions());
  }
  
  removeSessionsListener(callback: (sessions: Session[]) => void): void {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }
  
  private notifyListeners(): void {
    const sessions = this.getAllSessions();
    this.listeners.forEach(listener => listener(sessions));
  }
}

// Create a singleton instance
const sessionService = new SessionService();
export default sessionService;
