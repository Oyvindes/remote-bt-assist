
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, BluetoothSearching, Send, Share2, RefreshCw } from "lucide-react";
import bluetoothService, { BluetoothDevice, ShareSession } from "@/services/BluetoothService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

// Form schema for session naming
const sessionFormSchema = z.object({
  sessionName: z.string().min(3, {
    message: "Session name must be at least 3 characters.",
  }).max(30, {
    message: "Session name must not be longer than 30 characters.",
  }),
});

export const UserDeviceView = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [isSharingSession, setIsSharingSession] = useState(false);
  const [activeSession, setActiveSession] = useState<ShareSession | null>(null);
  const [serialOutput, setSerialOutput] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [availableDevices, setAvailableDevices] = useState<BluetoothDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const { toast } = useToast();

  // Initialize form
  const form = useForm<z.infer<typeof sessionFormSchema>>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      sessionName: "",
    },
  });

  // Handle serial data updates
  useEffect(() => {
    const handleSerialData = (data: string) => {
      setSerialOutput(prev => [...prev, data]);
    };

    bluetoothService.addDataListener(handleSerialData);

    return () => {
      bluetoothService.removeDataListener(handleSerialData);
    };
  }, []);

  const scanForDevices = async () => {
    try {
      setIsScanning(true);
      toast({
        title: "Scanning for devices...",
        description: "Please wait while we search for nearby Bluetooth devices",
      });
      
      const devices = await bluetoothService.scanForDevices();
      setAvailableDevices(devices);
      
      toast({
        title: "Scan Complete",
        description: `Found ${devices.length} Bluetooth devices`,
      });
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: "Could not scan for Bluetooth devices",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const connectToDevice = async (deviceId: string) => {
    try {
      toast({
        title: "Connecting to device...",
        description: "Please wait while we establish a connection",
      });
      
      await bluetoothService.connectToDevice(deviceId);
      setIsConnected(true);
      setDevice(bluetoothService.getConnectedDevice());
      
      toast({
        title: "Connected!",
        description: "Successfully connected to your Bluetooth device",
      });
      
      // Add some initial data to the serial output
      setSerialOutput([
        "AT+VERSION?",
        "VERSION: BT-SERIAL-v1.2",
        "AT+STATUS?",
        "STATUS: READY"
      ]);
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Could not connect to Bluetooth device",
        variant: "destructive",
      });
    }
  };

  const disconnectDevice = () => {
    bluetoothService.disconnect();
    setIsConnected(false);
    setDevice(null);
    setIsSharingSession(false);
    setActiveSession(null);
    toast({
      title: "Disconnected",
      description: "Device has been disconnected",
    });
  };

  const openShareDialog = () => {
    // Set a default session name based on the connected device
    form.setValue("sessionName", device ? `${device.name} Session` : "My Session");
    setIsSessionDialogOpen(true);
  };

  const onShareSessionSubmit = (values: z.infer<typeof sessionFormSchema>) => {
    try {
      const session = bluetoothService.shareDeviceSession(values.sessionName);
      setActiveSession(session);
      setIsSharingSession(true);
      setIsSessionDialogOpen(false);
      
      toast({
        title: "Session Shared",
        description: `Session ID: ${session.id}. A support agent can now connect to your device.`,
      });
    } catch (error) {
      toast({
        title: "Sharing Failed",
        description: "Could not share device session",
        variant: "destructive",
      });
    }
  };

  const stopSharingSession = () => {
    bluetoothService.stopSharingSession();
    setIsSharingSession(false);
    setActiveSession(null);
    
    toast({
      title: "Session Ended",
      description: "Remote sharing has been stopped",
    });
  };

  const sendCommand = async () => {
    if (command.trim() === "") return;
    
    // Add the command to the serial output
    setSerialOutput(prev => [...prev, `> ${command}`]);
    
    try {
      await bluetoothService.sendCommand(command);
    } catch (error) {
      toast({
        title: "Command Failed",
        description: "Could not send command to the device",
        variant: "destructive",
      });
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
                {isSharingSession ? (
                  <Button 
                    variant="destructive"
                    onClick={stopSharingSession}
                    className="flex items-center gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Stop Sharing
                  </Button>
                ) : (
                  <Button 
                    variant="default"
                    onClick={openShareDialog}
                    className="flex items-center gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Share with Support
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={scanForDevices} 
                  className="w-full flex items-center gap-2"
                  disabled={isScanning}
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <BluetoothSearching className="h-4 w-4" />
                      Scan for Devices
                    </>
                  )}
                </Button>
              </div>
              
              {availableDevices.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Available Devices</h3>
                  <div className="border rounded-md divide-y">
                    {availableDevices.map((device) => (
                      <div key={device.id} className="p-3 flex justify-between items-center hover:bg-accent">
                        <div className="flex items-center gap-2">
                          <Bluetooth className="h-4 w-4 text-primary" />
                          <span>{device.name}</span>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => connectToDevice(device.id)}
                        >
                          Connect
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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

      {isSharingSession && activeSession && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-yellow-800">
          <p className="font-medium">Session "{activeSession.name}" is currently being shared with support</p>
          <p className="text-sm mt-1">Session ID: {activeSession.id}</p>
          <p className="text-sm mt-1">All serial data is visible to the support agent</p>
        </div>
      )}

      {/* Session naming dialog */}
      <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Share with Support</DialogTitle>
            <DialogDescription>
              Name your session so support can easily identify your device
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onShareSessionSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="sessionName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Device Session" {...field} />
                    </FormControl>
                    <FormDescription>
                      Give your session a descriptive name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsSessionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Share Session</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
