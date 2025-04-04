import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, BluetoothSearching, Send, Share2, RefreshCw, Settings, AlertTriangle, Shield, Terminal, Trash2, UserCircle } from "lucide-react";
import bluetoothService, { BluetoothDevice, ShareSession, SerialConfig, BluetoothError } from "@/services/BluetoothService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import sessionService from "@/services/SessionService";
import { supabase } from "@/integrations/supabase/client";

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
  // Use a ref instead of state to track executed commands
  const executedCommandsRef = useRef<Set<string>>(new Set());
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isSerialConfigDialogOpen, setIsSerialConfigDialogOpen] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<BluetoothError | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    // Scroll to bottom when serialOutput changes
    if (scrollAreaRef.current) {
      // Use setTimeout to ensure the DOM has updated before scrolling
      setTimeout(() => {
        const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }, 0);
    }
  }, [serialOutput]);

  // Function to refresh commands from the database
  const refreshCommands = async () => {
    if (!activeSession) return;

    try {
      console.log(`Refreshing commands for session: ${activeSession.id}`);
      const { data, error } = await supabase
        .from('session_commands')
        .select('*')
        .eq('session_id', activeSession.id)
        .order('timestamp', { ascending: true });

      console.log("Fetched commands:", data);

      if (error) {
        console.error("Error refreshing commands:", error);
        return;
      }

      if (data && data.length > 0) {
        // Process and display commands
        const commandOutput = data.map(cmd =>
          cmd.sender === 'support'
            ? `> [Support] ${cmd.command}`
            : cmd.sender === 'user'
              ? `> ${cmd.command}`
              : cmd.command
        );
        setSerialOutput(commandOutput);

        // Auto-execute any support commands that haven't been executed yet
        // We'll use a Set to keep track of which commands have been executed
        for (const cmd of data) {
          // Create a unique key for this command using id
          const commandKey = cmd.id;

          console.log("Checking command:", cmd.command, "ID:", commandKey, "Already executed:", executedCommandsRef.current.has(commandKey));

          // Only execute support commands that haven't been executed yet
          if (cmd.sender === 'support' && !executedCommandsRef.current.has(commandKey)) {
            console.log("Auto-executing support command from refresh:", cmd.command);
            setDebugInfo(prev => `${prev}\n\nAuto-executing command from refresh: ${cmd.command} (ID: ${commandKey})`);

            try {
              // Execute the command
              await bluetoothService.sendCommand(cmd.command);
              console.log("Support command executed successfully from refresh");

              // Add this command to the set of executed commands
              executedCommandsRef.current.add(commandKey);
              console.log("Added to executed commands. Set now contains:", Array.from(executedCommandsRef.current));

              // Show a toast notification
              toast({
                title: "Support Command Auto-Executed",
                description: `${cmd.command} sent to device (ID: ${commandKey})`,
              });
            } catch (error) {
              console.error("Error auto-executing support command from refresh:", error);

              // Show error toast
              toast({
                title: "Command Failed",
                description: `Failed to send ${cmd.command}`,
                variant: "destructive",
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in refreshCommands:", error);
    }
  };

  useEffect(() => {
    if (activeSession) {
      // Initial fetch of commands
      refreshCommands();

      // Set up interval to refresh commands every second
      refreshIntervalRef.current = setInterval(() => {
        refreshCommands();
        setLastRefreshTime(new Date());
      }, 1000);

      // Also set up real-time subscription for immediate updates
      const channel = supabase
        .channel('support-commands')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'session_commands',
          filter: `session_id=eq.${activeSession.id} AND sender=eq.support`
        }, async (payload) => {
          console.log("Received support command:", payload);
          const newCommand = payload.new as any;

          // Log that we received a command with more details
          console.log("Received support command:", JSON.stringify(newCommand, null, 2));

          // Add to debug info for visibility
          setDebugInfo(prev => `${prev}\n\nReceived command: ${JSON.stringify(newCommand, null, 2)}`);

          // Extract the actual command from the support command
          let commandToExecute = newCommand.command;

          // Auto-execute the command immediately if it's from support
          if (newCommand.sender === 'support' && commandToExecute) {
            console.log("Auto-executing support command:", commandToExecute);
            setDebugInfo(prev => `${prev}\n\nAuto-executing command: ${commandToExecute}`);

            // Send the command directly to the device
            try {
              await bluetoothService.sendCommand(commandToExecute);
              console.log("Support command executed successfully");

              // Show a toast notification
              toast({
                title: "Support Command Auto-Executed",
                description: `${commandToExecute} sent to device`,
              });
            } catch (error) {
              console.error("Error auto-executing support command:", error);

              // Add error to serial output
              setSerialOutput(prev => [...prev, `! Error executing support command: ${commandToExecute}`]);

              // Show error toast
              toast({
                title: "Command Failed",
                description: `Failed to send ${commandToExecute}`,
                variant: "destructive",
              });
            }
          }

          // Auto-execute the command immediately
          if (newCommand.sender === 'support' && commandToExecute) {
            console.log("Auto-executing support command:", commandToExecute);

            // Send the command directly to the device
            try {
              await bluetoothService.sendCommand(commandToExecute);
              console.log("Support command executed successfully");

              // Show a toast notification
              toast({
                title: "Support Command Auto-Executed",
                description: `${commandToExecute} sent to device`,
              });
            } catch (error) {
              console.error("Error auto-executing support command:", error);

              // Add error to serial output
              setSerialOutput(prev => [...prev, `! Error executing support command: ${commandToExecute}`]);

              // Show error toast
              toast({
                title: "Command Failed",
                description: `Failed to send ${commandToExecute}`,
                variant: "destructive",
              });
            }
          }

          // Log the command for debugging
          console.log("Command to check:", commandToExecute);

          // ALWAYS execute support commands regardless of format
          // Extract the actual command - remove any prefixes if they exist
          if (commandToExecute) {
            if (commandToExecute.startsWith('AUTO_EXEC::')) {
              commandToExecute = commandToExecute.substring('AUTO_EXEC::'.length);
            } else if (commandToExecute.startsWith('##EXEC##')) {
              commandToExecute = commandToExecute.substring('##EXEC##'.length);
            }

            // Log that we're executing the command
            console.log("Executing support command:", commandToExecute);
            setDebugInfo(prev => `${prev}\n\nExecuting command: ${commandToExecute}`);

            // FORCE DIRECT EXECUTION - bypass all checks
            try {
              // Get the characteristic directly if possible
              if (bluetoothService.isConnected() && bluetoothService.getConnectedDevice()) {
                const device = bluetoothService.getConnectedDevice();
                if (device?.device?.gatt) {
                  try {
                    // Try the normal sendCommand first
                    await bluetoothService.sendCommand(commandToExecute);
                    console.log("Support command executed successfully via sendCommand");
                  } catch (sendError) {
                    console.error("Error with sendCommand, trying direct method:", sendError);

                    // If that fails, try direct method
                    const server = await device.device.gatt.connect();
                    const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
                    const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');

                    const encoder = new TextEncoder();
                    const data = encoder.encode(commandToExecute + '\r\n');
                    await characteristic.writeValue(data);
                    console.log("Support command executed successfully via direct method");
                  }

                  // Show a toast notification
                  toast({
                    title: "Support Command Executed",
                    description: `${commandToExecute} sent to device`,
                  });
                } else {
                  throw new Error("Device GATT not available");
                }
              } else {
                throw new Error("Device not connected");
              }
            } catch (error) {
              console.error("Error executing support command:", error);
              setDebugInfo(prev => `${prev}\n\nError executing command: ${commandToExecute}\n${JSON.stringify(error, null, 2)}`);

              // Add error to serial output
              setSerialOutput(prev => [...prev, `! Error executing support command: ${commandToExecute}`]);

              // Show error toast
              toast({
                title: "Command Failed",
                description: `Failed to send ${commandToExecute}`,
                variant: "destructive",
              });
            }
          } else {
            // If it's not an auto-execute command, just log it
            console.log("Received non-auto-execute command:", commandToExecute);
          }

          // Force a refresh to show the new command and response
          refreshCommands();
        })
        .subscribe((status) => {
          console.log(`Subscription status for support commands: ${status}`);
        });

      return () => {
        console.log("Cleaning up support command subscription and refresh interval");
        supabase.removeChannel(channel);

        // Clear the refresh interval
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
  }, [activeSession]);

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
      const userName = values.sessionName; // Use the session name as the user name for consistency

      const session = await sessionService.createSession(
        values.sessionName,
        userName,
        deviceIdentifier
      );

      const bluetoothSession = bluetoothService.shareDeviceSession(values.sessionName, session.id);

      setActiveSession({
        id: session.id,
        name: session.name
      });
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

  const requestBluetoothPermission = async () => {
    // Set a flag to prevent multiple requests
    setIsRequestingPermission(true);

    // Set a timeout to reset the UI if something goes wrong
    const safetyTimeout = setTimeout(() => {
      setIsRequestingPermission(false);
      setDebugInfo(prev => prev + "\n\nSafety timeout triggered - UI reset to prevent freezing");
    }, 10000);

    try {
      setBluetoothError(null);

      // Clear previous debug info
      setDebugInfo("");

      // Collect basic device info
      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        language: navigator.language,
        isSecureContext: window.isSecureContext,
        protocol: window.location.protocol,
        host: window.location.host
      };

      // Display device info in UI
      setDebugInfo(`Device Info: ${JSON.stringify(deviceInfo, null, 2)}`);

      toast({
        title: "Requesting Bluetooth Permission",
        description: "Please allow Bluetooth access when prompted by your browser",
      });

      // Add event listener to capture console logs
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      const originalConsoleWarn = console.warn;

      const logMessages: string[] = [];

      console.log = (...args) => {
        originalConsoleLog(...args);
        logMessages.push(`LOG: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
        setDebugInfo(prev => `${prev}\n\n${logMessages.join('\n')}`);
      };

      console.error = (...args) => {
        originalConsoleError(...args);
        logMessages.push(`ERROR: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
        setDebugInfo(prev => `${prev}\n\n${logMessages.join('\n')}`);
      };

      console.warn = (...args) => {
        originalConsoleWarn(...args);
        logMessages.push(`WARN: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
        setDebugInfo(prev => `${prev}\n\n${logMessages.join('\n')}`);
      };

      // Request permission
      const permissionGranted = await bluetoothService.requestBluetoothPermission();

      // Restore console functions
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;

      if (permissionGranted) {
        toast({
          title: "Permission Granted",
          description: "Bluetooth permission has been granted. You can now scan for devices.",
        });
      } else {
        toast({
          title: "Permission Denied",
          description: "Bluetooth permission was denied. Please try again and allow access when prompted.",
          variant: "destructive",
        });

        setBluetoothError({
          type: 'permission-denied',
          message: 'Bluetooth permission was denied',
        });
      }
    } catch (error) {
      console.error("Permission request error:", error);

      if ('type' in error) {
        setBluetoothError(error as BluetoothError);
      } else {
        setBluetoothError({
          type: 'unknown',
          message: 'Failed to request Bluetooth permission',
        });
      }

      // Add error details to debug info
      setDebugInfo(prev => `${prev}\n\nERROR DETAILS: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);

      toast({
        title: "Permission Request Failed",
        description: "Could not request Bluetooth permission",
        variant: "destructive",
      });
    } finally {
      // Clear the safety timeout
      clearTimeout(safetyTimeout);
      setIsRequestingPermission(false);
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
              <div className="space-y-4">
                {/* Enhanced Connection Status Card */}
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="bg-green-100 p-2 rounded-full">
                          <Bluetooth className="h-6 w-6 text-green-600" />
                        </div>
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
                      </div>
                      <div>
                        <h3 className="font-medium text-green-800">{device?.name}</h3>
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          Connected and ready
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={disconnectDevice}
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>

                {/* Device Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="border rounded-lg p-3 hover:border-primary hover:bg-primary/5 transition-colors">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Device Configuration
                    </h4>
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openSerialConfigDialog}
                        className="w-full justify-start text-sm"
                      >
                        <Settings className="h-3.5 w-3.5 mr-1.5" />
                        Serial Config
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          bluetoothService.sendCommand("AT+CFG")
                            .then(() => {
                              console.log("Test command sent successfully");
                              toast({
                                title: "Test Command Sent",
                                description: "AT+CFG command sent to device",
                              });
                            })
                            .catch(error => {
                              console.error("Error sending test command:", error);
                              toast({
                                title: "Test Command Failed",
                                description: "Failed to send AT+CFG command",
                                variant: "destructive",
                              });
                            });
                        }}
                        className="w-full justify-start text-sm"
                      >
                        <Terminal className="h-3.5 w-3.5 mr-1.5" />
                        Test Command
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 hover:border-primary hover:bg-primary/5 transition-colors">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Share2 className="h-4 w-4 text-muted-foreground" />
                      Remote Support
                    </h4>
                    <div className="space-y-2">
                      {isSharingSession ? (
                        <>
                          <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded flex items-center gap-1.5 mb-2">
                            <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                            Session active: {activeSession?.name}
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={stopSharingSession}
                            className="w-full"
                          >
                            <Share2 className="h-3.5 w-3.5 mr-1.5" />
                            Stop Sharing
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={openShareDialog}
                          className="w-full"
                        >
                          <Share2 className="h-3.5 w-3.5 mr-1.5" />
                          Share with Support
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Scanning UI with radar animation */}
                <div className="relative">
                  <Button
                    onClick={scanForDevices}
                    className="w-full flex items-center gap-2 h-12"
                    disabled={isScanning}
                    variant="default"
                  >
                    {isScanning ? (
                      <>
                        <div className="relative">
                          <BluetoothSearching className="h-5 w-5 z-10 relative" />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-primary/10 rounded-full animate-ping" />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-primary/20 rounded-full animate-ping animation-delay-300" />
                        </div>
                        <span className="font-medium">Scanning for Devices...</span>
                      </>
                    ) : (
                      <>
                        <BluetoothSearching className="h-5 w-5" />
                        <span className="font-medium">Scan for Bluetooth Devices</span>
                      </>
                    )}
                  </Button>

                  {isScanning && (
                    <div className="mt-2 text-center text-sm text-muted-foreground animate-pulse">
                      Make sure your Bluetooth device is powered on and in pairing mode
                    </div>
                  )}
                </div>

                {/* Available Devices List with Enhanced Cards */}
                {availableDevices.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium flex items-center gap-1.5">
                        <Bluetooth className="h-4 w-4 text-primary" />
                        Available Devices
                        <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                          {availableDevices.length}
                        </span>
                      </h3>
                    </div>

                    <div className="grid gap-3">
                      {availableDevices.map((device) => (
                        <div
                          key={device.id}
                          className="border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors group relative"
                        >
                          <div className="flex justify-between items-center">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="bg-primary/10 p-1.5 rounded-full text-primary">
                                  <Bluetooth className="h-5 w-5" />
                                </div>
                                <div>
                                  <h4 className="font-medium group-hover:text-primary transition-colors">{device.name}</h4>
                                  <p className="text-xs text-muted-foreground">ID: {device.id.substring(0, 8)}...</p>
                                </div>
                              </div>
                            </div>
                            <Button
                              onClick={() => connectToDevice(device.id)}
                              className="relative overflow-hidden group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                            >
                              <span className="relative z-10">Connect</span>
                              <span className="absolute inset-0 bg-primary scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300"></span>
                            </Button>
                          </div>
                          <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-green-400 mt-2 mr-2 animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No devices found state */}
                {!isScanning && availableDevices.length === 0 && (
                  <div className="border border-dashed rounded-lg p-6 text-center">
                    <BluetoothSearching className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <h3 className="text-sm font-medium mb-1">No Devices Found</h3>
                    <p className="text-xs text-muted-foreground mb-4">Try scanning again or check your device is in pairing mode</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={scanForDevices}
                      className="mx-auto"
                    >
                      Scan Again
                    </Button>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Bluetooth Not Available</AlertTitle>
                <AlertDescription>
                  {(() => {
                    const compatibility = bluetoothService.getBrowserCompatibilityInfo();
                    return (
                      <div>
                        <p>{compatibility.message}</p>
                        {compatibility.message.includes("iOS") && (
                          <p className="mt-2 font-semibold">
                            iOS devices (iPhone/iPad) do not support Web Bluetooth in any browser due to Apple restrictions.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </AlertDescription>
              </Alert>

              {/* Always show permission button regardless of compatibility detection */}
              {(
                <div className="flex flex-col items-center gap-3 p-4 border rounded-md bg-blue-50">
                  <p className="text-center text-blue-800 font-medium">
                    Try requesting Bluetooth permission directly:
                  </p>
                  <Button
                    onClick={requestBluetoothPermission}
                    disabled={isRequestingPermission}
                    className="flex items-center gap-2"
                  >
                    {isRequestingPermission ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Requesting Permission...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Request Bluetooth Permission
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-blue-600">
                    Note: Make sure Bluetooth is enabled on your device and your browser has permission to access it.
                  </p>
                </div>
              )}

              {/* Debug Information Display */}
              <div className="border border-yellow-300 bg-yellow-50 p-3 rounded-md">
                <details>
                  <summary className="font-medium text-yellow-800 cursor-pointer">
                    Debug Information (Click to expand)
                  </summary>
                  <div className="mt-2">
                    <p className="text-xs text-yellow-800 mb-2">
                      This information can help diagnose Bluetooth issues:
                    </p>
                    <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-[200px]">
                      {debugInfo || "No debug information available yet. Click 'Request Bluetooth Permission' to generate debug info."}
                    </pre>
                  </div>
                </details>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isConnected && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Serial Monitor</CardTitle>
              <div className="text-xs text-muted-foreground">
                {lastRefreshTime && (
                  <div className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Auto-refreshing every second</span>
                  </div>
                )}
              </div>
            </div>
            <CardDescription>
              View serial data and send commands to your device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea
              className="h-[300px] border rounded-md p-4 bg-black text-green-400 font-mono text-sm"
              ref={scrollAreaRef}
            >
              {serialOutput.length > 0 ? (
                serialOutput.map((line, index) => (
                  <div key={index} className="py-1">
                    {line.startsWith(">") ? (
                      line.includes("[Support]") ? (
                        <div className="flex items-center justify-between">
                          <span className="text-blue-400">{line}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 py-0 text-xs bg-blue-900 hover:bg-blue-800 border-blue-700"
                            onClick={() => {
                              // Extract the command from the line
                              const commandText = line.substring(line.indexOf("]") + 2);
                              console.log("Executing support command via button:", commandText);

                              // Send the command directly to the device
                              bluetoothService.sendCommand(commandText)
                                .then(() => {
                                  console.log("Support command executed successfully");
                                  toast({
                                    title: "Command Executed",
                                    description: `${commandText} sent to device`,
                                  });
                                })
                                .catch(error => {
                                  console.error("Error executing support command:", error);
                                  toast({
                                    title: "Command Failed",
                                    description: `Failed to send ${commandText}`,
                                    variant: "destructive",
                                  });
                                });
                            }}
                          >
                            Execute
                          </Button>
                        </div>
                      ) : (
                        <span className="text-yellow-400">{line}</span>
                      )
                    ) : line.startsWith("!") ? (
                      <span className="text-red-400">{line}</span>
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
        </Card >
      )}

      {
        isSharingSession && activeSession && (
          <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-full mt-1">
                  <Share2 className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-blue-800 flex items-center gap-2">
                      Active Support Session
                      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                        Live
                      </span>
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={stopSharingSession}
                      className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      End Session
                    </Button>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-blue-500" />
                      <p className="text-sm text-blue-700 font-medium">{activeSession.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-blue-600">
                        <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-blue-700">{activeSession.id}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs text-blue-600 hover:text-blue-800"
                          onClick={() => {
                            navigator.clipboard.writeText(activeSession.id);
                            toast({
                              title: "Session ID Copied",
                              description: "Session ID has been copied to clipboard",
                            });
                          }}
                        >
                          Copy ID
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 bg-blue-100/50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-blue-500 mt-0.5" />
                      <p>All device communication is visible to the support agent. They can send commands to your device.</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      }

      <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-blue-100 p-1.5 rounded-full">
                <Share2 className="h-5 w-5 text-blue-600" />
              </div>
              <DialogTitle>Share Device with Support</DialogTitle>
            </div>
            <DialogDescription>
              Create a secure session to allow remote support for your device
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <h4 className="text-sm font-medium text-blue-800 mb-1 flex items-center gap-1.5">
                <Bluetooth className="h-4 w-4" />
                Connected Device
              </h4>
              <p className="text-sm text-blue-700">
                {device?.name || "Unknown Device"}
              </p>
            </div>
          </div>

          <Form {...sessionForm}>
            <form onSubmit={sessionForm.handleSubmit(onShareSessionSubmit)} className="space-y-4">
              <FormField
                control={sessionForm.control}
                name="sessionName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      Session Name
                      <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded">Required</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="My Device Session"
                          {...field}
                          className="pl-9"
                        />
                        <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormDescription className="flex items-center gap-1.5 text-xs">
                      <span className="inline-block w-1 h-1 bg-blue-500 rounded-full"></span>
                      This name helps support identify your session
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-amber-800 text-sm">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium mb-1">Support Session Information</p>
                    <ul className="text-xs space-y-1 list-disc list-inside text-amber-700">
                      <li>Support will be able to send commands to your device</li>
                      <li>You can end the session at any time</li>
                      <li>All commands are logged for your security</li>
                    </ul>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setIsSessionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-1.5">
                  <Share2 className="h-4 w-4" />
                  Start Support Session
                </Button>
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
    </div >
  );
};
