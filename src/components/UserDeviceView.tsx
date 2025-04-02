import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, BluetoothSearching, Send, Share2, RefreshCw, Settings, AlertTriangle } from "lucide-react";
import bluetoothService, { BluetoothDevice, ShareSession, SerialConfig, BluetoothError } from "@/services/BluetoothService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import sessionService from "@/services/SessionService";

const sessionFormSchema = z.object({
  sessionName: z.string().min(3, {
    message: "Session name must be at least 3 characters.",
  }).max(30, {
    message: "Session name must not be longer than 30 characters.",
  }),
});

const serialConfigFormSchema = z.object({
  baudRate: z.coerce.number().positive(),
  dataBits: z.coerce.number().int().min(5).max(9),
  stopBits: z.coerce.number().int().min(1).max(2),
  parity: z.enum(["none", "even", "odd"]),
  flowControl: z.enum(["none", "hardware"])
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
  const [isSending, setIsSending] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isSerialConfigDialogOpen, setIsSerialConfigDialogOpen] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<BluetoothError | null>(null);
  const { toast } = useToast();

  const sessionForm = useForm<z.infer<typeof sessionFormSchema>>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      sessionName: "",
    },
  });

  const serialConfigForm = useForm<z.infer<typeof serialConfigFormSchema>>({
    resolver: zodResolver(serialConfigFormSchema),
    defaultValues: {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none"
    },
  });

  useEffect(() => {
    let connectionCheckInterval: NodeJS.Timeout;
    
    if (isConnected) {
      connectionCheckInterval = setInterval(async () => {
        const stillConnected = await bluetoothService.verifyConnection();
        if (!stillConnected && isConnected) {
          setIsConnected(false);
          toast({
            title: "Device Disconnected",
            description: "The Bluetooth connection was lost",
            variant: "destructive",
          });
        }
      }, 5000);
    }
    
    return () => {
      if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
      }
    };
  }, [isConnected, toast]);

  useEffect(() => {
    const config = bluetoothService.getSerialConfig();
    serialConfigForm.reset(config);
  }, []);

  useEffect(() => {
    const handleSerialData = (data: string) => {
      setSerialOutput(prev => [...prev, data]);
      console.log("Received data:", data);
    };

    bluetoothService.addDataListener(handleSerialData);

    return () => {
      bluetoothService.removeDataListener(handleSerialData);
    };
  }, []);

  const scanForDevices = async () => {
    try {
      setIsScanning(true);
      setBluetoothError(null);
      
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
      console.error("Scan error:", error);
      if ('type' in error) {
        setBluetoothError(error as BluetoothError);
      } else {
        setBluetoothError({
          type: 'unknown',
          message: 'Failed to scan for devices',
        });
      }
      
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
      setSerialOutput([]);
      setBluetoothError(null);
      
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
    } catch (error) {
      console.error("Connection error:", error);
      if ('type' in error) {
        setBluetoothError(error as BluetoothError);
      } else {
        setBluetoothError({
          type: 'connection-failed',
          message: 'Failed to connect to device',
        });
      }
      
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
    sessionForm.setValue("sessionName", device ? `${device.name} Session` : "My Session");
    setIsSessionDialogOpen(true);
  };

  const onShareSessionSubmit = async (values: z.infer<typeof sessionFormSchema>) => {
    try {
      const deviceIdentifier = device ? device.name : "Unknown Device";
      
      const session = await sessionService.createSession(
        values.sessionName,
        "User",
        deviceIdentifier
      );
      
      const bluetoothSession = bluetoothService.shareDeviceSession(session.name);
      
      setActiveSession(bluetoothSession);
      setIsSharingSession(true);
      setIsSessionDialogOpen(false);
      
      toast({
        title: "Session Shared",
        description: `Session ID: ${session.id}. A support agent can now connect to your device.`,
      });
    } catch (error) {
      console.error("Error sharing session:", error);
      toast({
        title: "Sharing Failed",
        description: "Could not share device session. Please try again.",
        variant: "destructive",
      });
    }
  };

  const stopSharingSession = async () => {
    if (activeSession) {
      try {
        await sessionService.closeSession(activeSession.id);
        
        bluetoothService.stopSharingSession();
        setIsSharingSession(false);
        setActiveSession(null);
        
        toast({
          title: "Session Ended",
          description: "Remote sharing has been stopped",
        });
      } catch (error) {
        console.error("Error stopping session:", error);
        toast({
          title: "Error Ending Session",
          description: "Could not properly end the session. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const sendCommand = async () => {
    if (command.trim() === "") return;
    
    setSerialOutput(prev => [...prev, `> ${command}`]);
    setIsSending(true);
    
    try {
      const connected = await bluetoothService.verifyConnection();
      if (!connected) {
        setIsConnected(false);
        throw new Error("Device is no longer connected");
      }
      
      await bluetoothService.sendCommand(command);
      
      toast({
        title: "Command Sent",
        description: "Command was sent to the device",
      });
    } catch (error) {
      console.error("Command error:", error);
      
      if ('type' in error && (error as BluetoothError).type === 'device-disconnected') {
        setIsConnected(false);
      }
      
      let errorMessage = "Could not send command to the device";
      if ('type' in error) {
        const btError = error as BluetoothError;
        errorMessage = btError.message;
        setBluetoothError(btError);
      }
      
      toast({
        title: "Command Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      setCommand("");
    }
  };

  const openSerialConfigDialog = () => {
    const config = bluetoothService.getSerialConfig();
    serialConfigForm.reset(config);
    setIsSerialConfigDialogOpen(true);
  };

  const onSerialConfigSubmit = (values: z.infer<typeof serialConfigFormSchema>) => {
    try {
      const serialConfig: SerialConfig = {
        baudRate: values.baudRate,
        dataBits: values.dataBits,
        stopBits: values.stopBits,
        parity: values.parity,
        flowControl: values.flowControl
      };
      
      bluetoothService.setSerialConfig(serialConfig);
      setIsSerialConfigDialogOpen(false);
      
      toast({
        title: "Serial Configuration Updated",
        description: `Baud: ${values.baudRate}, Data bits: ${values.dataBits}, Stop bits: ${values.stopBits}`,
      });
    } catch (error) {
      toast({
        title: "Configuration Failed",
        description: "Could not update serial configuration",
        variant: "destructive",
      });
    }
  };

  const getErrorGuidance = (error: BluetoothError): string => {
    switch (error.type) {
      case 'not-supported':
        return "Try using a browser that supports Web Bluetooth (Chrome, Edge, or Opera) on a compatible device.";
      case 'security-error':
        return "Web Bluetooth requires a secure connection (HTTPS) and works only on trusted sites.";
      case 'user-cancelled':
        return "You cancelled the Bluetooth operation. Please try again if this was not intentional.";
      case 'permission-denied':
        return "Please allow Bluetooth permissions when prompted by your browser.";
      case 'service-not-found':
        return "This device doesn't provide the required Bluetooth services. Make sure you're connecting to a compatible device.";
      case 'characteristic-not-found':
        return "The device doesn't support the expected communications protocol. Check device compatibility.";
      case 'connection-failed':
        return "Make sure your Bluetooth device is powered on, in range, and in pairing mode.";
      case 'device-disconnected':
        return "The device was disconnected. Check if it's still powered on and in range.";
      default:
        return "Try restarting your Bluetooth device, refresh the page, or try a different browser.";
    }
  };

  const clearError = () => {
    setBluetoothError(null);
  };

  const reconnectDevice = async () => {
    if (!device) return;
    
    try {
      toast({
        title: "Reconnecting...",
        description: "Attempting to reconnect to the device",
      });
      
      await bluetoothService.connectToDevice(device.id);
      setIsConnected(true);
      setBluetoothError(null);
      
      toast({
        title: "Reconnected!",
        description: "Successfully reconnected to your Bluetooth device",
      });
    } catch (error) {
      console.error("Reconnection error:", error);
      
      toast({
        title: "Reconnection Failed",
        description: "Could not reconnect to the device",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {bluetoothError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{bluetoothError.message}</AlertTitle>
          <AlertDescription>
            <p className="mt-2">{getErrorGuidance(bluetoothError)}</p>
            <div className="flex gap-2 mt-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearError}
              >
                Dismiss
              </Button>
              {bluetoothError.type === 'device-disconnected' && device && (
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={reconnectDevice}
                >
                  Attempt Reconnect
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      
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
          {bluetoothService.isWebBluetoothAvailable() ? (
            isConnected ? (
              <div className="flex flex-col gap-2">
                <div className="bg-green-50 text-green-700 p-3 rounded-md flex items-center gap-2">
                  <Bluetooth className="h-4 w-4" />
                  <p>Connected to: {device?.name}</p>
                </div>
                <div className="flex justify-between mt-2">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={disconnectDevice}>Disconnect</Button>
                    <Button 
                      variant="outline" 
                      onClick={openSerialConfigDialog}
                      className="flex items-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Serial Config
                    </Button>
                  </div>
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
            )
          ) : (
            <Alert variant="destructive" className="animate-pulse">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Bluetooth Not Available</AlertTitle>
              <AlertDescription>
                Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera on a compatible device.
              </AlertDescription>
            </Alert>
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
              {serialOutput.length > 0 ? (
                serialOutput.map((line, index) => (
                  <div key={index} className="py-1">
                    {line.startsWith(">") ? (
                      <span className="text-blue-400">{line}</span>
                    ) : (
                      <span>{line}</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-gray-500 italic">
                  No data received yet. Try sending a command below.
                </div>
              )}
            </ScrollArea>
          </CardContent>
          <CardFooter>
            <div className="flex w-full gap-2">
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter AT command..."
                onKeyDown={(e) => e.key === "Enter" && sendCommand()}
                disabled={isSending}
              />
              <Button 
                onClick={sendCommand} 
                disabled={isSending || !command.trim()}
              >
                {isSending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
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

      <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Share with Support</DialogTitle>
            <DialogDescription>
              Name your session so support can easily identify your device
            </DialogDescription>
          </DialogHeader>
          
          <Form {...sessionForm}>
            <form onSubmit={sessionForm.handleSubmit(onShareSessionSubmit)} className="space-y-4">
              <FormField
                control={sessionForm.control}
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

      <Dialog open={isSerialConfigDialogOpen} onOpenChange={setIsSerialConfigDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Serial Configuration</DialogTitle>
            <DialogDescription>
              Configure the serial communication parameters
            </DialogDescription>
          </DialogHeader>
          
          <Form {...serialConfigForm}>
            <form onSubmit={serialConfigForm.handleSubmit(onSerialConfigSubmit)} className="space-y-4">
              <FormField
                control={serialConfigForm.control}
                name="baudRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Baud Rate</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select baud rate" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1200">1200</SelectItem>
                        <SelectItem value="2400">2400</SelectItem>
                        <SelectItem value="4800">4800</SelectItem>
                        <SelectItem value="9600">9600</SelectItem>
                        <SelectItem value="19200">19200</SelectItem>
                        <SelectItem value="38400">38400</SelectItem>
                        <SelectItem value="57600">57600</SelectItem>
                        <SelectItem value="115200">115200</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Communication speed in bits per second
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={serialConfigForm.control}
                name="dataBits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Bits</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select data bits" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="7">7</SelectItem>
                        <SelectItem value="8">8</SelectItem>
                        <SelectItem value="9">9</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Number of data bits per frame
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={serialConfigForm.control}
                name="stopBits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stop Bits</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select stop bits" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Number of stop bits
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={serialConfigForm.control}
                name="parity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parity</FormLabel>
                    <Select 
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select parity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="even">Even</SelectItem>
                        <SelectItem value="odd">Odd</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Type of parity checking
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={serialConfigForm.control}
                name="flowControl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Flow Control</FormLabel>
                    <Select 
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select flow control" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="hardware">Hardware</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Flow control method
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsSerialConfigDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Apply Settings</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
