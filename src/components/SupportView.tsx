
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, UserCircle, Users } from "lucide-react";
import sessionService, { Session } from "@/services/SessionService";

export const SupportView = () => {
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [connectedSession, setConnectedSession] = useState<string | null>(null);
  const [serialOutput, setSerialOutput] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const { toast } = useToast();

  // Subscribe to session updates
  useEffect(() => {
    const handleSessionsUpdate = (sessions: Session[]) => {
      setActiveSessions(sessions);
    };

    sessionService.addSessionsListener(handleSessionsUpdate);

    return () => {
      sessionService.removeSessionsListener(handleSessionsUpdate);
    };
  }, []);

  const connectToSession = (sessionId: string) => {
    const session = sessionService.getSession(sessionId);
    if (!session) {
      toast({
        title: "Session not found",
        description: "The selected session is no longer available",
        variant: "destructive",
      });
      return;
    }

    setConnectedSession(sessionId);
    
    // Initialize empty serial output
    setSerialOutput([]);
    
    toast({
      title: "Connected to Session",
      description: `You are now connected to ${session.name}`,
    });
  };

  const disconnectSession = () => {
    setConnectedSession(null);
    setSerialOutput([]);
    toast({
      title: "Disconnected",
      description: "You have disconnected from the session",
    });
  };

  const sendCommand = () => {
    if (command.trim() === "" || !connectedSession) return;
    
    // Add the command to the serial output
    setSerialOutput(prev => [...prev, `Support sent: ${command}`]);
    
    // Here is where real implementation would send the command to the connected session
    // This would involve sending the command to a backend service or directly to the user's device
    
    setCommand("");
  };

  return (
    <div className="space-y-4">
      {!connectedSession ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Support Sessions
            </CardTitle>
            <CardDescription>
              Connect to an active user session to provide remote support
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeSessions.length > 0 ? (
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
                    <Button onClick={() => connectToSession(session.id)}>
                      Connect
                    </Button>
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
              <CardTitle>Remote Serial Monitor</CardTitle>
              <CardDescription>
                View serial data and send commands to the user's device
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] border rounded-md p-4 bg-black text-green-400 font-mono text-sm">
                {serialOutput.length > 0 ? (
                  serialOutput.map((line, index) => (
                    <div key={index} className="py-1">
                      {line.startsWith("Support sent:") ? (
                        <span className="text-blue-400">{line}</span>
                      ) : line.startsWith("User sent:") ? (
                        <span className="text-yellow-400">{line}</span>
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
