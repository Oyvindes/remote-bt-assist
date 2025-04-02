
export interface Session {
  id: string;
  name: string;
  user: string;
  device: string;
  startTime: Date;
  
  getDuration(): number;
  getFormattedDuration(): string;
}

export interface DatabaseSession {
  id: string;
  name: string;
  user_name: string;
  device: string;
  start_time: string;
  last_active: string;
  is_active: boolean;
  created_at: string;
}
