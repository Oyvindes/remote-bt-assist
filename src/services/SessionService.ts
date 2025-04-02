
// This service facilitates session management for remote support
// In a production environment, this would integrate with a backend service

export interface Session {
  id: string;
  name: string;
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
  name: string;
  user: string;
  device: string;
  startTime: Date;
  
  constructor(id: string, name: string, user: string, device: string) {
    this.id = id;
    this.name = name;
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
    // Update session durations periodically
    setInterval(() => {
      if (this.activeSessions.size > 0) {
        this.notifyListeners();
      }
    }, 30000); // Update every 30 seconds
    
    // Initialize with mock sessions for testing if needed
    // this.createSession("Test Session", "John Doe", "HC-05 Bluetooth Module");
    
    // Log session info for debugging
    console.log("[SessionService] Initialized");
  }
  
  createSession(name: string, user: string, device: string): Session {
    // Generate a unique ID (more readable for debugging)
    const id = Math.random().toString(36).substring(2, 10);
    const session = new SessionImpl(id, name, user, device);
    this.activeSessions.set(id, session);
    console.log(`[SessionService] Session created: ${id} - ${name} (total: ${this.activeSessions.size})`);
    this.notifyListeners();
    return session;
  }
  
  getSession(id: string): Session | undefined {
    return this.activeSessions.get(id);
  }
  
  getAllSessions(): Session[] {
    const sessions = Array.from(this.activeSessions.values());
    console.log(`[SessionService] Getting all sessions: found ${sessions.length}`);
    return sessions;
  }
  
  closeSession(id: string): boolean {
    console.log(`[SessionService] Attempting to close session: ${id}`);
    const result = this.activeSessions.delete(id);
    if (result) {
      console.log(`[SessionService] Session closed: ${id} (remaining: ${this.activeSessions.size})`);
      this.notifyListeners();
    } else {
      console.log(`[SessionService] Failed to close session: ${id} (not found)`);
    }
    return result;
  }
  
  addSessionsListener(callback: (sessions: Session[]) => void): void {
    console.log(`[SessionService] Adding listener (total: ${this.listeners.length + 1})`);
    this.listeners.push(callback);
    // Call immediately with current sessions
    const sessions = this.getAllSessions();
    callback(sessions);
  }
  
  removeSessionsListener(callback: (sessions: Session[]) => void): void {
    const initialCount = this.listeners.length;
    this.listeners = this.listeners.filter(listener => listener !== callback);
    console.log(`[SessionService] Removed listener (${initialCount} → ${this.listeners.length})`);
  }
  
  private notifyListeners(): void {
    const sessions = this.getAllSessions();
    console.log(`[SessionService] Notifying ${this.listeners.length} listeners with ${sessions.length} sessions`);
    this.listeners.forEach(listener => listener(sessions));
  }
  
  // For debugging - dump all sessions to console
  debugDumpSessions(): void {
    console.log(`[SessionService] DEBUG - Active Sessions (${this.activeSessions.size}):`);
    this.activeSessions.forEach((session, id) => {
      console.log(`  - ID: ${id}, Name: ${session.name}, User: ${session.user}, Device: ${session.device}, Duration: ${session.getFormattedDuration()}`);
    });
  }
}

// Create a singleton instance
const sessionService = new SessionService();
export default sessionService;
