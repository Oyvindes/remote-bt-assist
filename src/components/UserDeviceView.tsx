import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, BluetoothSearching, Send, Share2, RefreshCw, Settings, AlertTriangle, Shield, Terminal, Trash2, UserCircle, Copy, List } from "lucide-react";
import bluetoothService, { BluetoothDevice, ShareSession, SerialConfig, BluetoothError } from "@/services/BluetoothService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import sessionService from "@/services/SessionService";
import { supabase } from "@/integrations/supabase/client";

// AT Commands reference
const atCommands = [
  {
    command: "AT+PRO=",
    description: "Set to use MQTT protocol to uplink, Payload Type select Hex payload."
  },
  {
    command: "AT+SERVADDR=",
    description: "Set MQTT server address and port"
  },
  {
    command: "AT+CLIENT=",
    description: "Set up the CLIENT of MQTT"
  },
  {
    command: "AT+UNAME=",
    description: "Set the username of MQTT"
  },
  {
    command: "AT+PWD=",
    description: "Set the password of MQTT"
  },
  {
    command: "AT+PUBTOPIC=",
    description: "Set the sending topic of MQTT"
  },
  {
    command: "AT+SUBTOPIC=",
    description: "Set the subscription topic of MQTT"
  }
];

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
  const [showCommandReference, setShowCommandReference] = useState(true);
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

  // Function to handle copying a command to the input field
  const copyCommandToInput = (commandText: string) => {
    setCommand(commandText);
    toast({
      title: "Command Copied",
      description: `${commandText} ready to send`,
    });
  };

  const toggleCommandReference = () => {
    setShowCommandReference(!showCommandReference);
  };

  return (
    <div className="space-y-4">
      {/* Error display */}
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

      {/* Device connection card */}
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
                            <span className="inline-block w-1.5 h-1.5
