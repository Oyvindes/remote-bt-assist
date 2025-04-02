import sessionService from './SessionService';

export interface BluetoothDevice {
  id: string;
  name: string;
  device?: any; // Store the actual Web Bluetooth device
}

export interface SerialConfig {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware";
}

export interface ShareSession {
  id: string;
  name: string;
}

// Error types to provide more specific information about Bluetooth errors
export type BluetoothErrorType = 
  | 'not-supported' 
  | 'user-cancelled' 
  | 'security-error'
  | 'connection-failed'
  | 'device-disconnected'
  | 'permission-denied'
  | 'service-not-found'
  | 'characteristic-not-found'
  | 'write-failed'
  | 'notification-failed'
  | 'unknown';

export interface BluetoothError {
  type: BluetoothErrorType;
  message: string;
  originalError?: Error;
}

class BluetoothService {
  private connectedDevice: BluetoothDevice | null = null;
  private dataListeners: ((data: string) => void)[] = [];
  private sharedSession: ShareSession | null = null;
  private serialConfig: SerialConfig = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none"
  };
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private scannedDevices: BluetoothDevice[] = []; // Store devices from scan to use during connect
  private isConnectionActive = false; // Track active connection state

  // Helper to categorize Bluetooth errors
  private parseBluetoothError(error: any): BluetoothError {
    console.error("Bluetooth error:", error);
    
    // Default unknown error
    let errorInfo: BluetoothError = {
      type: 'unknown',
      message: 'An unknown error occurred',
      originalError: error instanceof Error ? error : undefined
    };
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for specific error types
    if (errorMessage.includes('User cancelled')) {
      errorInfo = {
        type: 'user-cancelled',
        message: 'Operation was cancelled by the user',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('Bluetooth adapter is not available')) {
      errorInfo = {
        type: 'not-supported',
        message: 'Bluetooth is not available on this device or browser',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('GATT Server is disconnected')) {
      errorInfo = {
        type: 'device-disconnected',
        message: 'The Bluetooth device was disconnected',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('NotFoundError') || errorMessage.includes('no such service')) {
      errorInfo = {
        type: 'service-not-found',
        message: 'Required Bluetooth service not found on this device',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('SecurityError') || errorMessage.includes('secure context')) {
      errorInfo = {
        type: 'security-error',
        message: 'Bluetooth access requires a secure context (HTTPS)',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
      errorInfo = {
        type: 'permission-denied',
        message: 'Permission to access Bluetooth was denied',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('Failed to connect')) {
      errorInfo = {
        type: 'connection-failed',
        message: 'Failed to connect to the Bluetooth device',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('getDevices is not a function')) {
      errorInfo = {
        type: 'not-supported',
        message: 'This browser does not fully support the Web Bluetooth API',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('No device connected')) {
      errorInfo = {
        type: 'device-disconnected',
        message: 'No Bluetooth device is connected',
        originalError: error instanceof Error ? error : undefined
      };
    } else if (errorMessage.includes('characteristic not available')) {
      errorInfo = {
        type: 'characteristic-not-found',
        message: 'Required Bluetooth characteristic not available',
        originalError: error instanceof Error ? error : undefined
      };
    }
    
    return errorInfo;
  }

  // Check if Web Bluetooth API is available
  isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && 
           navigator.bluetooth !== undefined;
  }

  // Get available Bluetooth devices
  async scanForDevices(): Promise<BluetoothDevice[]> {
    if (!this.isWebBluetoothAvailable()) {
      console.error("Web Bluetooth API is not available in this browser/environment");
      throw this.parseBluetoothError(new Error("Web Bluetooth API is not available in this browser/environment"));
    }

    try {
      console.log("Requesting Bluetooth device...");
      const device = await navigator.bluetooth.requestDevice({
        // Accept all devices that have a Serial Port Profile service
        filters: [
          { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }, // HC-05/HC-06 service UUID
          { services: ['0000180a-0000-1000-8000-00805f9b34fb'] }, // Device Information Service
          { services: ['0000180f-0000-1000-8000-00805f9b34fb'] }, // Battery Service
          { namePrefix: 'HC-' }, // Common prefix for HC-05, HC-06
          { namePrefix: 'BT' }, // Common prefix for Bluetooth modules
        ],
        optionalServices: [
          'generic_access', 
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000ffe1-0000-1000-8000-00805f9b34fb'
        ]
      });

      if (device) {
        const bluetoothDevice = {
          id: device.id,
          name: device.name || "Unknown Device",
          device: device
        };
        
        // Store the device for later use during connect
        this.scannedDevices = [bluetoothDevice];
        
        return [bluetoothDevice];
      }
      return [];
    } catch (error) {
      console.error("Error scanning for Bluetooth devices:", error);
      throw this.parseBluetoothError(error);
    }
  }

  // Connect to a selected Bluetooth device
  async connectToDevice(deviceId: string): Promise<void> {
    if (!this.isWebBluetoothAvailable()) {
      throw this.parseBluetoothError(new Error("Web Bluetooth API is not available in this browser/environment"));
    }

    try {
      // Find the device with matching ID from our stored devices from scan
      const matchingDevice = this.scannedDevices.find(d => d.id === deviceId);

      if (!matchingDevice || !matchingDevice.device) {
        throw new Error(`Device with ID ${deviceId} not found`);
      }

      console.log(`Connecting to device: ${deviceId}`);
      
      // Connect to the GATT server
      const server = await matchingDevice.device.gatt?.connect();
      if (!server) {
        throw new Error("Failed to connect to GATT server");
      }

      // Set connection as active
      this.isConnectionActive = true;

      // Discover serial service (common UUID for BLE Serial services)
      // We'll try with the common HC-05/HC-06 service UUID first
      let service;
      try {
        service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      } catch (error) {
        console.warn("Could not find HC-05/HC-06 service, trying generic access:", error);
        try {
          // Try to find the generic access service as fallback
          service = await server.getPrimaryService('generic_access');
        } catch (fallbackError) {
          console.error("Could not find any compatible service:", fallbackError);
          throw new Error("No compatible Bluetooth service found on this device");
        }
      }
      
      // Get the characteristic for serial communication
      let characteristic;
      try {
        characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
      } catch (error) {
        console.error("Could not find characteristic:", error);
        throw new Error("Bluetooth characteristic not found");
      }
      
      // Store the characteristic for later use
      this.characteristic = characteristic;
      
      // Set up notifications for incoming data
      try {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
          // Fix for TypeScript error: Cast event.target to unknown first, then to BluetoothRemoteGATTCharacteristic
          const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
          if (target.value) {
            const decoder = new TextDecoder('utf-8');
            const data = decoder.decode(target.value);
            this.notifyDataListeners(data);
          }
        });
      } catch (error) {
        console.error("Failed to set up notifications:", error);
        throw new Error("Failed to set up device notifications");
      }

      // Store the connected device
      this.connectedDevice = matchingDevice;
      
      console.log(`Successfully connected to ${this.connectedDevice.name}`);
    } catch (error) {
      this.isConnectionActive = false;
      this.characteristic = null;
      console.error("Error connecting to Bluetooth device:", error);
      throw this.parseBluetoothError(error);
    }
  }

  // Check connection state more reliably
  async verifyConnection(): Promise<boolean> {
    if (!this.isConnectionActive || !this.connectedDevice?.device?.gatt) {
      return false;
    }
    
    try {
      // Test if the device is still connected
      const connected = this.connectedDevice.device.gatt.connected;
      if (!connected) {
        this.isConnectionActive = false;
        this.characteristic = null;
        return false;
      }
      
      // Verify characteristic is still valid
      if (!this.characteristic) {
        console.warn("Characteristic is null but device is connected");
        this.isConnectionActive = false;
        return false;
      }
      
      return true;
    } catch (error) {
      console.error("Error verifying connection:", error);
      this.isConnectionActive = false;
      this.characteristic = null;
      return false;
    }
  }

  // Disconnect from the device
  disconnect(): void {
    console.log("Attempting to disconnect from device");
    
    // First, clean up the characteristic
    if (this.characteristic) {
      try {
        // Only attempt to stop notifications if the device is still connected
        if (this.connectedDevice?.device?.gatt?.connected) {
          this.characteristic.stopNotifications()
            .catch(err => {
              // Log but don't throw - we're cleaning up anyway
              console.warn("Error stopping notifications during disconnect:", err);
            });
        }
      } catch (error) {
        console.warn("Error during stopNotifications:", error);
      }
      this.characteristic = null;
    }
    
    // Then disconnect from the device if still connected
    if (this.connectedDevice?.device?.gatt?.connected) {
      try {
        this.connectedDevice.device.gatt.disconnect();
      } catch (error) {
        console.warn("Error disconnecting from GATT server:", error);
      }
    }
    
    // Always reset the connection state
    this.isConnectionActive = false;
    this.connectedDevice = null;
    console.log("Disconnected from device");
  }

  isConnected(): boolean {
    return this.isConnectionActive && 
           !!this.connectedDevice?.device?.gatt?.connected && 
           !!this.characteristic;
  }

  getConnectedDevice(): BluetoothDevice | null {
    return this.connectedDevice;
  }

  // Send command to the connected device
  async sendCommand(command: string): Promise<void> {
    // Verify connection is still active before sending
    const isConnected = await this.verifyConnection();
    
    if (!isConnected || !this.characteristic) {
      throw this.parseBluetoothError(new Error("No device connected or characteristic not available"));
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command + '\r\n'); // Add carriage return and line feed for AT commands
      await this.characteristic.writeValue(data);
      console.log(`Command sent: ${command}`);
    } catch (error) {
      console.error("Error sending command:", error);
      // Reset connection state on error
      if (error instanceof Error && error.message.includes('GATT Server is disconnected')) {
        this.isConnectionActive = false;
        this.characteristic = null;
      }
      throw this.parseBluetoothError(error);
    }
  }

  addDataListener(callback: (data: string) => void): void {
    this.dataListeners.push(callback);
  }

  removeDataListener(callback: (data: string) => void): void {
    this.dataListeners = this.dataListeners.filter(listener => listener !== callback);
  }

  private notifyDataListeners(data: string): void {
    this.dataListeners.forEach(listener => listener(data));
  }
  
  shareDeviceSession(sessionName: string): ShareSession {
    if (!this.connectedDevice) {
      throw new Error("No device connected");
    }
    
    const sessionId = Math.random().toString(36).substring(2, 10);
    
    // Create the session object
    const session: ShareSession = {
      id: sessionId,
      name: sessionName
    };
    
    this.sharedSession = session;
    
    // Add the session to SessionService to make it visible in the support view
    const createdSession = sessionService.createSession(
      sessionName,
      "Remote User", // We could make this configurable
      this.connectedDevice.name || "Unknown Device"
    );
    
    console.log(`Device session shared: ${sessionId} - ${sessionName}`);
    
    // Explicitly fetch and log sessions to debug
    const allSessions = sessionService.getAllSessions();
    console.log(`After sharing, session count: ${allSessions.length}`);
    sessionService.debugDumpSessions();
    
    return session;
  }

  stopSharingSession(): void {
    if (this.sharedSession) {
      // Close the session in SessionService
      const sessionId = this.sharedSession.id;
      const result = sessionService.closeSession(sessionId);
      console.log(`Session sharing stopped, session closed: ${result}`);
      
      this.sharedSession = null;
      
      // Verify sessions after closing
      const remainingSessions = sessionService.getAllSessions();
      console.log(`After stopping sharing, remaining sessions: ${remainingSessions.length}`);
    }
  }

  getSharedSession(): ShareSession | null {
    return this.sharedSession;
  }

  setSerialConfig(config: SerialConfig): void {
    this.serialConfig = config;
    console.log("Serial config updated:", config);
  }

  getSerialConfig(): SerialConfig {
    return this.serialConfig;
  }
}

const bluetoothService = new BluetoothService();
export default bluetoothService;
