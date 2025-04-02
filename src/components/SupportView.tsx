
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, UserCircle, Users, RefreshCw, Loader2, Trash2 } from "lucide-react";
import sessionService, { Session } from "@/services/SessionService";
import { supabase } from "@/integrations/supabase/client";

export const SupportView = () => {
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [connectedSession, setConnectedSession] = useState<string | null>(null);
  const [serialOutput, setSerialOutput] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollArea = scrollAreaRef.current;
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [serialOutput]);

  // Subscribe to session updates
  useEffect(() => {
    console.log("SupportView: Setting up session listener");

    const handleSessionsUpdate = (sessions: Session[]) => {
      console.log("SupportView: Received sessions update:", sessions);
      setActiveSessions(sessions);
      setIsLoading(false);

      // Check if our connected session is still active
      if (connectedSession && !sessions.some(s => s.id === connectedSession)) {
        toast({
          title: "Session Ended",
          description: "The user has ended the support session.",
          variant: "destructive",
        });
        setConnectedSession(null);
        setSerialOutput([]);
      }
    };

    // Register listener with SessionService
    sessionService.addSessionsListener(handleSessionsUpdate);

    // Force a refresh from database
    const fetchSessions = async () => {
      try {
        await sessionService.forceRefreshFromDb();
      } catch (error) {
        console.error("Error fetching sessions:", error);
        setIsLoading(false);
      }
    };
    fetchSessions();

    return () => {
      console.log("SupportView: Removing session listener");
      sessionService.removeSessionsListener(handleSessionsUpdate);
    };
  }, [connectedSession, toast]);

  // Function to refresh commands from the database
  const refreshCommands = async () => {
    if (!connectedSession) return;

    try {
      console.log(`Refreshing commands for session: ${connectedSession}`);
      const { data, error } = await supabase
        .from('session_commands')
        .select('*')
        .eq('session_id', connectedSession)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error("Error refreshing commands:", error);
        return;
      }

      if (data && data.length > 0) {
        const commandOutput = data.map(cmd =>
          cmd.sender === 'support'
            ? `Support sent: ${cmd.command}`
            : cmd.sender === 'user'
              ? `User sent: ${cmd.command}`
              : `Device response: ${cmd.command}`
        );
        setSerialOutput(commandOutput);
        setLastRefreshTime(new Date());
      }
    } catch (error) {
      console.error("Error in refreshCommands:", error);
    }
  };

  // Load existing commands when connecting to a session
  useEffect(() => {
    if (connectedSession) {
      // Initial fetch of commands
      refreshCommands();

      // Set up interval to refresh commands every second
      refreshIntervalRef.current = setInterval(() => {
        refreshCommands();
      }, 1000);

      // Subscribe to real-time updates for new commands
      const channel = supabase
        .channel('session-commands')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'session_commands',
          filter: `session_id=eq.${connectedSession}`
        }, (payload) => {
          console.log("Real-time command update received:", payload);
          const newCommand = payload.new as any;
          let formattedCommand = '';

          if (newCommand.sender === 'support') {
            formattedCommand = `Support sent: ${newCommand.command}`;
          } else if (newCommand.sender === 'user') {
            formattedCommand = `User sent: ${newCommand.command}`;
          } else if (newCommand.sender === 'device') {
            formattedCommand = `Device response: ${newCommand.command}`;
          }

          setSerialOutput(prev => [...prev, formattedCommand]);
        })
        .subscribe((status) => {
          console.log(`Subscription status for session commands: ${status}`);
        });

      return () => {
        console.log("Cleaning up subscription and refresh interval");
        supabase.removeChannel(channel);

        // Clear the refresh interval
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
  }, [connectedSession]);

  const refreshSessions = async () => {
    setIsRefreshing(true);
    console.log("SupportView: Manually refreshing sessions");

    try {
      // Force a refresh from database
      await sessionService.forceRefreshFromDb();

      // Dump current sessions to console for debugging
      sessionService.debugDumpSessions();

      toast({
        title: "Refreshed Sessions",
        description: `Found ${activeSessions.length} active sessions`,
      });
    } catch (error) {
      console.error("Error refreshing sessions:", error);
      toast({
        title: "Refresh Failed",
        description: "Could not refresh sessions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        toast({
          title: "Session not found",
          description: "The selected session is no longer available",
          variant: "destructive",
        });
        return;
      }

      // Confirm deletion
      if (!window.confirm(`Are you sure you want to delete the session for ${session.user}?`)) {
        return;
      }

      const success = await sessionService.closeSession(sessionId);

      if (success) {
        toast({
          title: "Session Deleted",
          description: `Session for ${session.user} has been deleted`,
        });
      } else {
        toast({
          title: "Deletion Failed",
          description: "Could not delete the session. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting session:", error);
      toast({
        title: "Deletion Failed",
        description: "Could not delete the session",
        variant: "destructive",
      });
    }
  };

  const connectToSession = async (sessionId: string) => {
    try {
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        toast({
          title: "Session not found",
          description: "The selected session is no longer available",
          variant: "destructive",
        });
        return;
      }

      setConnectedSession(sessionId);

      // Initialize empty serial output (will be populated from useEffect)
      setSerialOutput([]);

      toast({
        title: "Connected to Session",
        description: `You are now connected to ${session.name}`,
      });
    } catch (error) {
      console.error("Error connecting to session:", error);
      toast({
        title: "Connection Failed",
        description: "Could not connect to the session",
        variant: "destructive",
      });
    }
  };

  const disconnectSession = async () => {
    if (connectedSession) {
      setConnectedSession(null);
      setSerialOutput([]);

      toast({
        title: "Disconnected",
        description: "You have disconnected from the session",
      });
    }
  };

  const sendCommand = async () => {
    if (command.trim() === "" || !connectedSession) return;

    try {
      // Send the command directly without any special format
      // Log the command being sent
      console.log(`Support sending command: ${command}`);

      // Add the command to the database with a unique timestamp to ensure it's processed
      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from('session_commands')
        .insert([
          {
            session_id: connectedSession,
            command: command,
            sender: 'support',
            timestamp: timestamp
          }
        ]);

      if (error) {
        console.error("Error saving command:", error);
        toast({
          title: "Command Failed",
          description: "Could not send the command",
          variant: "destructive",
        });
        return;
      }

      // Clear the command input
      setCommand("");

      toast({
        title: "Command Sent",
        description: "Command was sent to the device",
      });
    } catch (error) {
      console.error("Error in sendCommand:", error);
      toast({
        title: "Command Failed",
        description: "Could not send the command",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {!connectedSession ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>Active Support Sessions</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshSessions}
                disabled={isRefreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <CardDescription>
              Connect to an active user session to provide remote support
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading sessions...</p>
                </div>
              </div>
            ) : activeSessions.length > 0 ? (
              <div className="space-y-2">
                {activeSessions.map((session) => (
                  <div
                    key={session.id}
                    className="border rounded-md p-4 flex justify-between items-center hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{session.user}</p>
                        <p className="text-sm text-muted-foreground">
                          Device: {session.device} • Active: {session.getFormattedDuration()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteSession(session.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Delete session"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button onClick={() => connectToSession(session.id)}>
                        Connect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No active sessions at the moment</p>
                <p className="text-sm mt-1">
                  Users need to connect their device and share their session
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium">
                Connected to Session: {connectedSession}
              </h2>
              <p className="text-sm text-muted-foreground">
                You are now providing remote support
              </p>
            </div>
            <Button variant="outline" onClick={disconnectSession}>
              Disconnect
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Remote Serial Monitor</CardTitle>
                  <CardDescription>
                    View serial data and send commands to the user's device
                  </CardDescription>
                </div>
                <div className="text-xs text-muted-foreground">
                  {lastRefreshTime && (
                    <div className="flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Auto-refreshing every second</span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea
                className="h-[300px] border rounded-md p-4 bg-black text-green-400 font-mono text-sm"
                ref={scrollAreaRef}
              >
                {serialOutput.length > 0 ? (
                  serialOutput.map((line, index) => (
                    <div key={index} className="py-1">
                      {line.startsWith("Support sent:") ? (
                        <span className="text-blue-400">{line}</span>
                      ) : line.startsWith("User sent:") ? (
                        <span className="text-yellow-400">{line}</span>
                      ) : line.startsWith("Device response:") ? (
                        <span className="text-green-400">{line}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-1 text-gray-500 italic">
                    Waiting for device data...
                  </div>
                )}
              </ScrollArea>
            </CardContent>
            <CardFooter>
              <div className="flex w-full gap-2">
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Enter AT command to send to device..."
                  onKeyDown={(e) => e.key === "Enter" && sendCommand()}
                />
                <Button onClick={sendCommand}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-blue-800">
            <p className="font-medium">Support Tips</p>
            <ul className="list-disc list-inside text-sm mt-1 space-y-1">
              <li>Use "AT+VERSION?" to check firmware version</li>
              <li>Use "AT+RESET" to restart the device if unresponsive</li>
              <li>Use "AT+BAUD?" to check current baud rate</li>
              <li>Use "AT+CONFIG=parameter,value" for configuration changes</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};
