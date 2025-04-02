
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

// Serialize and deserialize session data for storage
const serializeSession = (session: Session): string => {
  return JSON.stringify({
    id: session.id,
    name: session.name,
    user: session.user,
    device: session.device,
    startTime: session.startTime.toISOString()
  });
};

const deserializeSession = (json: string): Session => {
  const data = JSON.parse(json);
  const session = new SessionImpl(
    data.id, 
    data.name, 
    data.user, 
    data.device
  );
  session.startTime = new Date(data.startTime);
  return session;
};

class SessionService {
  private activeSessions: Map<string, Session> = new Map();
  private listeners: ((sessions: Session[]) => void)[] = [];
  private updateIntervalId: number | null = null;
  private storageKey = 'remote-bt-assist-sessions';
  
  constructor() {
    // Load any sessions from localStorage on initialization
    this.loadSessionsFromStorage();
    
    // Setup window storage event listener for cross-tab/window coordination
    window.addEventListener('storage', this.handleStorageChange);
    
    // Update session durations periodically and notify listeners
    this.updateIntervalId = window.setInterval(() => {
      if (this.activeSessions.size > 0) {
        this.notifyListeners();
      }
    }, 10000); // Update every 10 seconds for more frequent checks
    
    // Log session info for debugging
    console.log("[SessionService] Initialized");
    
    // Verify if any sessions are loaded on startup
    if (this.activeSessions.size > 0) {
      console.log(`[SessionService] Loaded ${this.activeSessions.size} sessions from storage`);
      this.debugDumpSessions();
      
      // Notify listeners immediately if we have sessions
      setTimeout(() => this.notifyListeners(), 100);
    }
  }
  
  private loadSessionsFromStorage(): void {
    try {
      const storedSessions = localStorage.getItem(this.storageKey);
      if (storedSessions) {
        const sessionData: Record<string, string> = JSON.parse(storedSessions);
        
        Object.entries(sessionData).forEach(([id, serializedSession]) => {
          try {
            const session = deserializeSession(serializedSession);
            this.activeSessions.set(id, session);
          } catch (error) {
            console.error(`[SessionService] Error deserializing session ${id}:`, error);
          }
        });
      }
    } catch (error) {
      console.error('[SessionService] Error loading sessions from storage:', error);
    }
  }
  
  private saveSessionsToStorage(): void {
    try {
      const sessionData: Record<string, string> = {};
      
      this.activeSessions.forEach((session, id) => {
        sessionData[id] = serializeSession(session);
      });
      
      localStorage.setItem(this.storageKey, JSON.stringify(sessionData));
      
      // Dispatch a storage event to notify other tabs/windows
      // This is needed because localStorage events don't fire in the same window that made the change
      window.dispatchEvent(new StorageEvent('storage', {
        key: this.storageKey,
        newValue: JSON.stringify(sessionData),
        storageArea: localStorage
      }));
    } catch (error) {
      console.error('[SessionService] Error saving sessions to storage:', error);
    }
  }
  
  private handleStorageChange = (event: StorageEvent): void => {
    if (event.key === this.storageKey && event.newValue !== null) {
      console.log('[SessionService] Detected storage change, reloading sessions');
      this.loadSessionsFromStorage();
      this.notifyListeners();
    }
  };
  
  createSession(name: string, user: string, device: string): Session {
    // Generate a unique ID (more readable for debugging)
    const id = Math.random().toString(36).substring(2, 10);
    const session = new SessionImpl(id, name, user, device);
    this.activeSessions.set(id, session);
    console.log(`[SessionService] Session created: ${id} - ${name} (total: ${this.activeSessions.size})`);
    
    // Save to localStorage
    this.saveSessionsToStorage();
    
    // Ensure we notify listeners about the new session
    setTimeout(() => this.notifyListeners(), 0);
    
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
      
      // Update localStorage
      this.saveSessionsToStorage();
      
      // Ensure we notify listeners about the closed session
      setTimeout(() => this.notifyListeners(), 0);
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
    setTimeout(() => callback(sessions), 0);
  }
  
  removeSessionsListener(callback: (sessions: Session[]) => void): void {
    const initialCount = this.listeners.length;
    this.listeners = this.listeners.filter(listener => listener !== callback);
    console.log(`[SessionService] Removed listener (${initialCount} → ${this.listeners.length})`);
  }
  
  private notifyListeners(): void {
    const sessions = this.getAllSessions();
    console.log(`[SessionService] Notifying ${this.listeners.length} listeners with ${sessions.length} sessions`);
    
    // Use setTimeout to ensure this happens asynchronously
    setTimeout(() => {
      this.listeners.forEach(listener => {
        try {
          listener(sessions);
        } catch (error) {
          console.error("[SessionService] Error in listener callback:", error);
        }
      });
    }, 0);
  }
  
  // Clean up when service is destroyed
  destroy(): void {
    if (this.updateIntervalId !== null) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    
    // Remove storage event listener
    window.removeEventListener('storage', this.handleStorageChange);
  }
  
  // For debugging - dump all sessions to console
  debugDumpSessions(): void {
    console.log(`[SessionService] DEBUG - Active Sessions (${this.activeSessions.size}):`);
    this.activeSessions.forEach((session, id) => {
      console.log(`  - ID: ${id}, Name: ${session.name}, User: ${session.user}, Device: ${session.device}, Duration: ${session.getFormattedDuration()}`);
    });
  }
  
  // Force check storage for sessions (useful for manual refresh)
  forceRefreshFromStorage(): void {
    console.log('[SessionService] Forcing refresh from storage');
    this.loadSessionsFromStorage();
    this.notifyListeners();
  }
}

// Create a singleton instance
const sessionService = new SessionService();
export default sessionService;
