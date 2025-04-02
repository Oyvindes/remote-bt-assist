
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, Send, Share2 } from "lucide-react";

export const UserDeviceView = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState<any>(null);
  const [isSharingSession, setIsSharingSession] = useState(false);
  const [serialOutput, setSerialOutput] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const { toast } = useToast();

  const connectToDevice = async () => {
    try {
      // Request Bluetooth device with serial service
      // In a real implementation, we would use the Web Bluetooth API
      // This is a mock implementation for demonstration purposes
      toast({
        title: "Connecting to Bluetooth device...",
        description: "Please select your device from the popup",
      });
      
      setTimeout(() => {
        setIsConnected(true);
        setDevice({ name: "Mock BT Serial Device" });
        toast({
          title: "Connected!",
          description: "Successfully connected to your Bluetooth device",
        });
        // Add some mock data to the serial output
        setSerialOutput([
          "AT+VERSION?",
          "VERSION: BT-SERIAL-v1.2",
          "AT+STATUS?",
          "STATUS: READY"
        ]);
      }, 1500);
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Could not connect to Bluetooth device",
        variant: "destructive",
      });
    }
  };

  const disconnectDevice = () => {
    setIsConnected(false);
    setDevice(null);
    setIsSharingSession(false);
    toast({
      title: "Disconnected",
      description: "Device has been disconnected",
    });
  };

  const toggleShareSession = () => {
    if (!isSharingSession) {
      setIsSharingSession(true);
      // Generate a random session ID (in a real app, this would come from a backend)
      const sessionId = Math.random().toString(36).substring(2, 10);
      toast({
        title: "Session Shared",
        description: `Session ID: ${sessionId}. A support agent can now connect to your device.`,
      });
    } else {
      setIsSharingSession(false);
      toast({
        title: "Session Ended",
        description: "Remote sharing has been stopped",
      });
    }
  };

  const sendCommand = () => {
    if (command.trim() === "") return;
    
    // Add the command to the serial output
    setSerialOutput([...serialOutput, `> ${command}`]);
    
    // Mock response based on common AT commands
    if (command.includes("AT+")) {
      setTimeout(() => {
        let response = "OK";
        if (command.includes("VERSION")) {
          response = "VERSION: BT-SERIAL-v1.2";
        } else if (command.includes("STATUS")) {
          response = "STATUS: READY";
        } else if (command.includes("HELP")) {
          response = "Available commands: AT+VERSION, AT+STATUS, AT+RESET";
        }
        setSerialOutput(prev => [...prev, response]);
      }, 500);
    }
    
    setCommand("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5" />
            Device Connection
          </CardTitle>
          <CardDescription>
            Connect to your Bluetooth serial device
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex flex-col gap-2">
              <div className="bg-green-50 text-green-700 p-3 rounded-md flex items-center gap-2">
                <Bluetooth className="h-4 w-4" />
                <p>Connected to: {device?.name}</p>
              </div>
              <div className="flex justify-between mt-2">
                <Button variant="outline" onClick={disconnectDevice}>Disconnect</Button>
                <Button 
                  variant={isSharingSession ? "destructive" : "default"}
                  onClick={toggleShareSession}
                  className="flex items-center gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  {isSharingSession ? "Stop Sharing" : "Share with Support"}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={connectToDevice} className="w-full">
              Connect to Bluetooth Device
            </Button>
          )}
        </CardContent>
      </Card>

      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Serial Monitor</CardTitle>
            <CardDescription>
              View serial data and send commands to your device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] border rounded-md p-4 bg-black text-green-400 font-mono text-sm">
              {serialOutput.map((line, index) => (
                <div key={index} className="py-1">
                  {line.startsWith(">") ? (
                    <span className="text-blue-400">{line}</span>
                  ) : (
                    <span>{line}</span>
                  )}
                </div>
              ))}
            </ScrollArea>
          </CardContent>
          <CardFooter>
            <div className="flex w-full gap-2">
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter AT command..."
                onKeyDown={(e) => e.key === "Enter" && sendCommand()}
              />
              <Button onClick={sendCommand}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {isSharingSession && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-yellow-800">
          <p className="font-medium">Session is currently being shared with support</p>
          <p className="text-sm mt-1">All serial data is visible to the support agent</p>
        </div>
      )}
    </div>
  );
};
