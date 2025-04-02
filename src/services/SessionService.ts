// This service facilitates session management for remote support
// Uses Supabase for persistent storage to work across different networks and devices

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  
  constructor(id: string, name: string, user: string, device: string, startTime: Date = new Date()) {
    this.id = id;
    this.name = name;
    this.user = user;
    this.device = device;
    this.startTime = startTime;
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
  private updateIntervalId: number | null = null;
  private isFetching: boolean = false;
  
  constructor() {
    console.log("[SessionService] Initialized with Supabase integration");
    
    // Setup periodic updates to keep session data fresh
    this.updateIntervalId = window.setInterval(() => {
      if (this.activeSessions.size > 0) {
        this.updateSessionsInDb();
        this.notifyListeners();
      } else {
        this.fetchSessionsFromDb();
      }
    }, 10000); // Update every 10 seconds
    
    // Do an initial fetch of sessions from the database
    this.fetchSessionsFromDb();
  }
  
  private async fetchSessionsFromDb(): Promise<void> {
    if (this.isFetching) return;
    
    try {
      this.isFetching = true;
      console.log("[SessionService] Fetching sessions from Supabase");
      
      const { data, error } = await supabase
        .from('remote_sessions')
        .select('*')
        .eq('is_active', true);
      
      if (error) {
        console.error('[SessionService] Error fetching sessions:', error);
        return;
      }
      
      // Convert the DB records to Session objects
      this.activeSessions.clear();
      data.forEach(record => {
        const session = new SessionImpl(
          record.id,
          record.name,
          record.user_name,
          record.device,
          new Date(record.start_time)
        );
        this.activeSessions.set(record.id, session);
      });
      
      console.log(`[SessionService] Loaded ${this.activeSessions.size} sessions from Supabase`);
      this.notifyListeners();
    } catch (error) {
      console.error('[SessionService] Error in fetchSessionsFromDb:', error);
    } finally {
      this.isFetching = false;
    }
  }
  
  private async updateSessionsInDb(): Promise<void> {
    try {
      // Update last_active timestamp for all active sessions
      for (const [id, _] of this.activeSessions) {
        await supabase
          .from('remote_sessions')
          .update({ last_active: new Date().toISOString() })
          .eq('id', id);
      }
    } catch (error) {
      console.error('[SessionService] Error updating sessions in DB:', error);
    }
  }
  
  async createSession(name: string, user: string, device: string): Promise<Session> {
    console.log(`[SessionService] Creating new session: ${name}`);
    
    try {
      // Insert new session into the database
      const { data, error } = await supabase
        .from('remote_sessions')
        .insert([
          { 
            name, 
            user_name: user, 
            device,
            start_time: new Date().toISOString(),
            last_active: new Date().toISOString(),
            is_active: true
          }
        ])
        .select();
      
      if (error) {
        console.error('[SessionService] Error creating session:', error);
        toast({
          title: "Session Creation Failed",
          description: "Could not create support session. Please try again.",
          variant: "destructive"
        });
        throw error;
      }
      
      if (!data || data.length === 0) {
        throw new Error('No data returned from session creation');
      }
      
      const newSession = new SessionImpl(
        data[0].id,
        data[0].name,
        data[0].user_name,
        data[0].device,
        new Date(data[0].start_time)
      );
      
      // Add to local cache
      this.activeSessions.set(newSession.id, newSession);
      console.log(`[SessionService] Session created with ID: ${newSession.id}`);
      
      // Notify listeners
      setTimeout(() => this.notifyListeners(), 0);
      
      return newSession;
    } catch (error) {
      console.error('[SessionService] Error in createSession:', error);
      toast({
        title: "Session Creation Failed",
        description: "Could not create support session. Please try again.",
        variant: "destructive"
      });
      throw error;
    }
  }
  
  async getSession(id: string): Promise<Session | undefined> {
    // First check local cache
    if (this.activeSessions.has(id)) {
      return this.activeSessions.get(id);
    }
    
    // If not in cache, try to fetch from database
    try {
      const { data, error } = await supabase
        .from('remote_sessions')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) {
        console.error(`[SessionService] Error fetching session ${id}:`, error);
        return undefined;
      }
      
      if (!data) {
        return undefined;
      }
      
      const session = new SessionImpl(
        data.id,
        data.name,
        data.user_name,
        data.device,
        new Date(data.start_time)
      );
      
      // Add to local cache
      this.activeSessions.set(id, session);
      
      return session;
    } catch (error) {
      console.error(`[SessionService] Error getting session ${id}:`, error);
      return undefined;
    }
  }
  
  async getAllSessions(): Promise<Session[]> {
    // First refresh from DB to make sure we have the latest data
    await this.fetchSessionsFromDb();
    
    const sessions = Array.from(this.activeSessions.values());
    console.log(`[SessionService] Getting all sessions: found ${sessions.length}`);
    return sessions;
  }
  
  async closeSession(id: string): Promise<boolean> {
    console.log(`[SessionService] Attempting to close session: ${id}`);
    
    try {
      // Mark session as inactive in the database
      const { error } = await supabase
        .from('remote_sessions')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) {
        console.error(`[SessionService] Error closing session ${id}:`, error);
        return false;
      }
      
      // Remove from local cache
      const result = this.activeSessions.delete(id);
      
      if (result) {
        console.log(`[SessionService] Session closed: ${id}`);
        
        // Notify listeners
        setTimeout(() => this.notifyListeners(), 0);
      } else {
        console.log(`[SessionService] Session not found in local cache: ${id}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[SessionService] Error in closeSession ${id}:`, error);
      return false;
    }
  }
  
  addSessionsListener(callback: (sessions: Session[]) => void): void {
    console.log(`[SessionService] Adding listener (total: ${this.listeners.length + 1})`);
    this.listeners.push(callback);
    
    // Call immediately with current sessions
    const sessions = Array.from(this.activeSessions.values());
    setTimeout(() => callback(sessions), 0);
  }
  
  removeSessionsListener(callback: (sessions: Session[]) => void): void {
    const initialCount = this.listeners.length;
    this.listeners = this.listeners.filter(listener => listener !== callback);
    console.log(`[SessionService] Removed listener (${initialCount} → ${this.listeners.length})`);
  }
  
  private notifyListeners(): void {
    const sessions = Array.from(this.activeSessions.values());
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
  }
  
  // Force refresh from database (useful for manual refresh)
  async forceRefreshFromDb(): Promise<void> {
    console.log('[SessionService] Forcing refresh from database');
    await this.fetchSessionsFromDb();
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
