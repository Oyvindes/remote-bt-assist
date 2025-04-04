
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, UserCircle, Users, RefreshCw, Loader2, Trash2, Bluetooth, Share2, AlertTriangle, Terminal } from "lucide-react";
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
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-full">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Support Dashboard</CardTitle>
                  <CardDescription className="mt-1">
                    Connect to user devices and provide remote assistance
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground mr-2">
                  {activeSessions.length > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      {activeSessions.length} active {activeSessions.length === 1 ? 'session' : 'sessions'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                      No active sessions
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshSessions}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 h-8"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
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
              <div className="grid gap-3">
                {activeSessions.map((session) => (
                  <div
                    key={session.id}
                    className="border rounded-lg p-4 hover:border-primary/30 hover:shadow-sm transition-all group"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-100 p-2 rounded-full">
                          <UserCircle className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium group-hover:text-primary transition-colors">{session.user}</h3>
                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                              Live
                            </span>
                          </div>
                          <div className="mt-1 space-y-1">
                            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                              <Bluetooth className="h-3.5 w-3.5" />
                              <span>{session.device}</span>
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Active for {session.getFormattedDuration()}</span>
                            </p>
                          </div>
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{session.id.substring(0, 8)}...</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(session.id);
                                  toast({
                                    title: "Session ID Copied",
                                    description: "Session ID has been copied to clipboard",
                                  });
                                }}
                              >
                                Copy ID
                              </Button>
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteSession(session.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-3"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                        <Button
                          onClick={() => connectToSession(session.id)}
                          className="gap-1.5 h-8"
                          size="sm"
                        >
                          <Share2 className="h-4 w-4" />
                          Connect
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-700 mb-1">No Active Sessions</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
                  There are no users currently sharing their devices. Users need to connect their Bluetooth device and start a sharing session.
                </p>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 max-w-md mx-auto text-left">
                  <h4 className="text-sm font-medium text-blue-800 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-blue-500" />
                    How to get started
                  </h4>
                  <ul className="text-xs text-blue-700 list-disc list-inside space-y-1">
                    <li>Ask the user to connect their Bluetooth device</li>
                    <li>Have them click "Share with Support" button</li>
                    <li>They should provide you with the session ID</li>
                    <li>Sessions will appear here automatically when shared</li>
                  </ul>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshSessions}
                  className="mt-4"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Check for Sessions
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4 border-green-200 bg-gradient-to-r from-green-50 to-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="bg-green-100 p-2 rounded-full mt-1">
                    <Share2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium text-green-800">Connected Support Session</h2>
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        Active
                      </span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      You are providing remote support to this device
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-mono bg-green-100 px-2 py-0.5 rounded text-green-700 text-xs">
                        {connectedSession?.substring(0, 12)}...
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs text-green-600 hover:text-green-800 hover:bg-green-100"
                        onClick={() => {
                          if (connectedSession) {
                            navigator.clipboard.writeText(connectedSession);
                            toast({
                              title: "Session ID Copied",
                              description: "Session ID has been copied to clipboard",
                            });
                          }
                        }}
                      >
                        Copy ID
                      </Button>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disconnectSession}
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  Disconnect
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Terminal className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Remote Serial Monitor</CardTitle>
                    <CardDescription className="mt-1">
                      View device data and send commands remotely
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {lastRefreshTime && (
                    <div className="flex items-center gap-1.5 text-xs text-primary/70 bg-primary/5 px-2 py-1 rounded-full">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Live updates</span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-900 px-3 py-1.5 flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <p className="text-xs text-slate-400">Serial Output</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                      Connected
                    </div>
                  </div>
                </div>

                <ScrollArea
                  className="h-[300px] bg-slate-950 text-green-400 font-mono text-sm p-3"
                  ref={scrollAreaRef}
                >
                  {serialOutput.length > 0 ? (
                    <div className="space-y-1">
                      {serialOutput.map((line, index) => (
                        <div key={index} className="py-0.5 leading-relaxed">
                          {line.startsWith("Support sent:") ? (
                            <div className="flex items-start gap-1.5">
                              <span className="bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded text-xs font-semibold mt-0.5">SUPPORT</span>
                              <span className="text-blue-400">{line.replace("Support sent: ", "")}</span>
                            </div>
                          ) : line.startsWith("User sent:") ? (
                            <div className="flex items-start gap-1.5">
                              <span className="bg-yellow-900/30 text-yellow-400 px-1.5 py-0.5 rounded text-xs font-semibold mt-0.5">USER</span>
                              <span className="text-yellow-400">{line.replace("User sent: ", "")}</span>
                            </div>
                          ) : line.startsWith("Device response:") ? (
                            <div className="flex items-start gap-1.5">
                              <span className="bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded text-xs font-semibold mt-0.5">DEVICE</span>
                              <span className="text-green-400">{line.replace("Device response: ", "")}</span>
                            </div>
                          ) : (
                            <span>{line}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-slate-500 italic text-center">
                        <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin opacity-30" />
                        <p>Waiting for device data...</p>
                        <p className="text-xs mt-1 opacity-70">Commands will appear here when sent or received</p>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </CardContent>
            <CardFooter className="pt-4">
              <div className="flex w-full gap-2 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Terminal className="h-4 w-4" />
                </div>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Enter AT command to send to device..."
                  onKeyDown={(e) => e.key === "Enter" && sendCommand()}
                  className="pl-9 font-mono"
                />
                <Button
                  onClick={sendCommand}
                  disabled={!command.trim()}
                  className="gap-1.5"
                >
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </CardFooter>
          </Card>

          <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="bg-blue-100 p-1.5 rounded-full">
                  <AlertTriangle className="h-4 w-4 text-blue-600" />
                </div>
                <CardTitle className="text-base text-blue-800">Support Quick Reference</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white/50 border border-blue-100 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5" />
                    Common Commands
                  </h4>
                  <div className="space-y-2">
                    {[
                      { cmd: "AT+VERSION?", desc: "Check firmware version" },
                      { cmd: "AT+RESET", desc: "Restart the device" },
                      { cmd: "AT+BAUD?", desc: "Check current baud rate" },
                      { cmd: "AT+CONFIG=param,value", desc: "Change configuration" }
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 py-0 text-xs font-mono bg-blue-100/50 text-blue-700 hover:bg-blue-200/50 hover:text-blue-800"
                          onClick={() => {
                            setCommand(item.cmd);
                          }}
                        >
                          {item.cmd}
                        </Button>
                        <span className="text-xs text-blue-700">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/50 border border-blue-100 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1.5">
                    <Share2 className="h-3.5 w-3.5" />
                    Session Tips
                  </h4>
                  <ul className="text-xs text-blue-700 space-y-1.5">
                    <li className="flex items-start gap-1.5">
                      <span className="inline-block w-1 h-1 bg-blue-500 rounded-full mt-1.5"></span>
                      <span>Commands are automatically sent to the user's device</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="inline-block w-1 h-1 bg-blue-500 rounded-full mt-1.5"></span>
                      <span>All commands and responses are logged for security</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="inline-block w-1 h-1 bg-blue-500 rounded-full mt-1.5"></span>
                      <span>The user can see all commands you send to their device</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="inline-block w-1 h-1 bg-blue-500 rounded-full mt-1.5"></span>
                      <span>Sessions automatically refresh every second</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
