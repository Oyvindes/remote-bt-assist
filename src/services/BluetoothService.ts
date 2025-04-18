import sessionService from './SessionService';
import { supabase } from "@/integrations/supabase/client";

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
  permissionState?: 'granted' | 'denied' | 'prompt' | 'unknown';
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

  // No predefined devices - we'll filter real devices instead

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

  // Request Bluetooth permissions explicitly
  async requestBluetoothPermission(): Promise<boolean> {
    // Log Bluetooth availability but don't block the request
    const isAvailable = this.isWebBluetoothAvailable();
    console.log("Web Bluetooth availability check (bypassing):", isAvailable);

    // Continue even if isWebBluetoothAvailable returns false

    try {
      console.log("Attempting to request Bluetooth permission...");

      // Wrap everything in try-catch blocks to prevent crashes

      // Try to get Bluetooth availability first
      try {
        // Check if the method exists before calling it
        if (navigator.bluetooth && typeof navigator.bluetooth.getAvailability === 'function') {
          const isAvailable = await navigator.bluetooth.getAvailability();
          console.log(`Bluetooth availability check: ${isAvailable ? 'Available' : 'Not available'}`);

          if (!isAvailable) {
            console.warn("Bluetooth is not available on this device according to getAvailability()");
            // Continue anyway as some devices report false but still work
          }
        } else {
          console.warn("getAvailability method not available on this browser");
        }
      } catch (availabilityError) {
        console.warn("Could not check Bluetooth availability:", availabilityError);
        // Continue anyway as this might fail but permission request could still work
      }

      // Check if requestDevice method exists
      if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== 'function') {
        console.error("requestDevice method not available on this browser");
        return false;
      }

      // This will trigger the browser's permission prompt
      // Wrap in a try-catch to prevent crashes
      let device;
      try {
        console.log("Calling navigator.bluetooth.requestDevice...");

        device = await navigator.bluetooth.requestDevice({
          // Accept any Bluetooth device to make it easier
          acceptAllDevices: true,
          // Include all possible services we might need
          optionalServices: [
            'generic_access',
            '0000ffe0-0000-1000-8000-00805f9b34fb',
            '0000ffe1-0000-1000-8000-00805f9b34fb',
            '0000180a-0000-1000-8000-00805f9b34fb', // Device Information Service
            '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
          ]
        });

        console.log("Bluetooth permission granted for device:", device);
      } catch (requestError) {
        console.error("Error in requestDevice:", requestError);
        return false;
      }

      // If we get here, permission was granted

      // Try to connect to the device to verify everything works
      try {
        console.log("Testing connection to device...");
        const server = await device.gatt?.connect();
        if (server) {
          console.log("Successfully connected to GATT server - Bluetooth is fully working");
          // Disconnect immediately since this is just a test
          device.gatt?.disconnect();
        }
      } catch (connectError) {
        console.warn("Could not connect to device during permission test:", connectError);
        // Still return true as permission was granted even if connection failed
      }

      return true;
    } catch (error) {
      console.error("Error requesting Bluetooth permission:", error);

      // Check if user denied permission
      if (error instanceof Error) {
        if (error.message.includes('User cancelled')) {
          console.warn("User denied Bluetooth permission");
        } else if (error.message.includes('Bluetooth adapter is not available')) {
          console.warn("Bluetooth is not enabled on this device");
        } else if (error.message.includes('SecurityError') || error.message.includes('secure context')) {
          console.warn("Security error - make sure you're using HTTPS or localhost");
        }
      }

      return false;
    }
  }

  // Check if Bluetooth is enabled on the device
  async checkBluetoothStatus(): Promise<{ enabled: boolean; error?: BluetoothError }> {
    if (!this.isWebBluetoothAvailable()) {
      return {
        enabled: false,
        error: this.parseBluetoothError(new Error("Web Bluetooth API is not available"))
      };
    }

    try {
      // Try to get available devices - this will fail if Bluetooth is disabled
      // or if permission is not granted
      await navigator.bluetooth.getAvailability();

      // If we get here without error, Bluetooth is likely enabled
      return { enabled: true };
    } catch (error) {
      console.error("Error checking Bluetooth status:", error);
      return {
        enabled: false,
        error: this.parseBluetoothError(error)
      };
    }
  }

  // Check if Web Bluetooth API is available
  isWebBluetoothAvailable(): boolean {
    // Basic check for Web Bluetooth API
    const hasBluetoothAPI = typeof navigator !== 'undefined' &&
      navigator.bluetooth !== undefined;

    // Check if we're in a secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext;

    // Additional check for mobile devices
    const userAgent = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent);
    const isAndroid = /Android/.test(userAgent);

    // Log detailed information for debugging
    console.log("Web Bluetooth availability check:", {
      hasBluetoothAPI,
      isSecureContext,
      userAgent,
      isIOS,
      isSafari,
      isAndroid,
      protocol: window.location.protocol
    });

    // Web Bluetooth requires a secure context
    if (!isSecureContext) {
      console.warn("Web Bluetooth requires a secure context (HTTPS or localhost)");
      return false;
    }

    // iOS doesn't support Web Bluetooth in any browser due to Apple restrictions
    if (isIOS) {
      console.warn("iOS detected - Web Bluetooth is not supported on iOS devices");
      return false;
    }

    // Safari doesn't support Web Bluetooth
    if (isSafari) {
      console.warn("Safari detected - Web Bluetooth is not supported in Safari");
      return false;
    }

    return hasBluetoothAPI;
  }

  // Get browser compatibility information
  getBrowserCompatibilityInfo(): { compatible: boolean; message: string } {
    const userAgent = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isChrome = /Chrome/i.test(userAgent);
    const isEdge = /Edg/i.test(userAgent);
    const isOpera = /OPR/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent);
    const isFirefox = /Firefox/i.test(userAgent);

    if (isIOS) {
      return {
        compatible: false,
        message: "Web Bluetooth is not supported on iOS devices (iPhone/iPad) in any browser due to Apple restrictions. Please use an Android device with Chrome or a desktop computer."
      };
    }

    if (isAndroid) {
      if (isChrome || isOpera) {
        return {
          compatible: true,
          message: "Your browser supports Web Bluetooth. Make sure Bluetooth is enabled on your device."
        };
      } else {
        return {
          compatible: false,
          message: "Please use Chrome or Opera on Android for Bluetooth support. Your current browser doesn't support Web Bluetooth."
        };
      }
    }

    if (isChrome || isEdge || isOpera) {
      return {
        compatible: true,
        message: "Your browser supports Web Bluetooth. Make sure Bluetooth is enabled on your device."
      };
    }

    if (isSafari) {
      return {
        compatible: false,
        message: "Safari doesn't support Web Bluetooth. Please use Chrome or Edge instead."
      };
    }

    if (isFirefox) {
      return {
        compatible: false,
        message: "Firefox doesn't support Web Bluetooth. Please use Chrome, Edge, or Opera instead."
      };
    }

    return {
      compatible: false,
      message: "Your browser doesn't appear to support Web Bluetooth. Please use Chrome, Edge, or Opera on a compatible device."
    };
  }

  // Get available Bluetooth devices - shows browser dialog but filters for '86' devices
  async scanForDevices(): Promise<BluetoothDevice[]> {
    if (!this.isWebBluetoothAvailable()) {
      console.error("Web Bluetooth API is not available in this browser/environment");
      throw this.parseBluetoothError(new Error("Web Bluetooth API is not available in this browser/environment"));
    }

    try {
      console.log("Scanning for '86' devices...");

      // Use the browser's native dialog to scan for devices
      const device = await navigator.bluetooth.requestDevice({
        // Accept all devices to ensure we can filter for '86' prefix
        acceptAllDevices: true,
        optionalServices: [
          'generic_access',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000ffe1-0000-1000-8000-00805f9b34fb',
          '0000180a-0000-1000-8000-00805f9b34fb', // Device Information Service
          '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
        ]
      });

      if (device) {
        // Check if the device name starts with '86'
        const deviceName = device.name || "Unknown Device";

        if (deviceName.startsWith('86')) {
          const bluetoothDevice = {
            id: device.id,
            name: deviceName,
            device: device
          };

          // Store the device for later use during connect
          this.scannedDevices = [bluetoothDevice];
          return [bluetoothDevice];
        } else {
          // If the device doesn't start with '86', return an empty array
          console.log(`Device ${deviceName} doesn't start with '86', filtering out`);
          this.scannedDevices = [];
          return [];
        }
      }
      return [];
    } catch (error) {
      console.error("Error scanning for Bluetooth devices:", error);
      throw this.parseBluetoothError(error);
    }
  }

  // Original method kept for reference or fallback
  async scanForDevicesWithDialog(): Promise<BluetoothDevice[]> {
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
            const rawData = decoder.decode(target.value);
            
            // Format the data: replace spaces with newlines
            const formattedData = this.formatBluetoothData(rawData);
            
            this.notifyDataListeners(formattedData);

            // If we have an active shared session, send to the support view via database
            if (this.sharedSession) {
              this.saveReceivedDataToDb(formattedData);
            }
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

  // Enhanced method to format bluetooth data with better line detection
  private formatBluetoothData(data: string): string {
    // Start with clean data
    let formattedData = data;
    
    // Make sure AT+ commands start on a new line
    formattedData = formattedData.replace(/AT\+/g, '\nAT+');
    
    // Handle special OK response on its own line
    formattedData = formattedData.replace(/OK/g, '\n\nOK');
    
    // Break at each AT command parameter
    formattedData = formattedData.replace(/(\s)AT\+/g, '\nAT+');
    
    // Break lines on these common delimiters
    const delimiters = ["=", " "];
    delimiters.forEach(delimiter => {
      // Replace each delimiter with the delimiter followed by a newline
      const regex = new RegExp(`${delimiter}`, 'g');
      formattedData = formattedData.replace(regex, `${delimiter}\n`);
    });
    
    // Fix line breaks for error messages
    formattedData = formattedData.replace(/ERROR/g, '\nERROR\n');
    
    // Remove any empty lines at the beginning
    formattedData = formattedData.replace(/^\n+/, '');
    
    // Clean up multiple consecutive newlines
    formattedData = formattedData.replace(/\n{3,}/g, '\n\n');
    
    // Fix any lines with just a single character (usually remnants)
    formattedData = formattedData.replace(/\n(.)\n/g, '\n$1');
    
    return formattedData;
  }

  // Save device data to the database for support view
  private async saveReceivedDataToDb(data: string): Promise<void> {
    if (!this.sharedSession) return;

    try {
      const { error } = await supabase
        .from('session_commands')
        .insert([
          {
            session_id: this.sharedSession.id,
            command: data,
            sender: 'device' // Indicate this came from the device
          }
        ]);

      if (error) {
        console.error("Error saving device data to database:", error);
      }
    } catch (err) {
      console.error("Error in saveReceivedDataToDb:", err);
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

      // If we have an active shared session, log this command to the database
      if (this.sharedSession) {
        await this.saveCommandToDb(command, 'user');
      }
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

  private async saveCommandToDb(command: string, sender: 'user' | 'support'): Promise<void> {
    if (!this.sharedSession) return;

    try {
      console.log(`Saving command to DB: ${command} from ${sender}`);
      const { error } = await supabase
        .from('session_commands')
        .insert([
          {
            session_id: this.sharedSession.id,
            command: command,
            sender: sender
          }
        ]);

      if (error) {
        console.error("Error saving command to database:", error);
      }
    } catch (err) {
      console.error("Error in saveCommandToDb:", err);
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

  shareDeviceSession(sessionName: string, sessionId: string): ShareSession {
    if (!this.connectedDevice) {
      throw new Error("No device connected");
    }

    // Use the session ID that was already created in UserDeviceView
    // Create the session object
    const session: ShareSession = {
      id: sessionId,
      name: sessionName
    };

    this.sharedSession = session;

    console.log(`Device session shared: ${sessionId} - ${sessionName}`);

    // Explicitly fetch and log sessions to debug - fix Promise handling
    sessionService.getAllSessions().then(sessions => {
      console.log(`After sharing, session count: ${sessions.length}`);
      sessionService.debugDumpSessions();
    });

    return session;
  }

  stopSharingSession(): void {
    if (this.sharedSession) {
      // Close the session in SessionService
      const sessionId = this.sharedSession.id;
      sessionService.closeSession(sessionId);
      console.log(`Session sharing stopped, session closed: ${sessionId}`);

      this.sharedSession = null;

      // Verify sessions after closing - fix Promise handling
      sessionService.getAllSessions().then(sessions => {
        console.log(`After stopping sharing, remaining sessions: ${sessions.length}`);
      });
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

  // Method for support to send commands to the user's device
  async receiveSupportCommand(command: string): Promise<void> {
    console.log(`Support command received: ${command}`);

    // Check if a device is connected to execute the command
    if (this.isConnected()) {
      try {
        // Don't use sendCommand as it might be saving to DB as 'user'
        // Instead, directly send the command to the device
        if (!this.characteristic) {
          throw new Error("Bluetooth characteristic not available");
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(command + '\r\n'); // Add carriage return and line feed for AT commands
        await this.characteristic.writeValue(data);
        console.log(`Support command sent to device: ${command}`);

        // Save the command to the database as 'support'
        if (this.sharedSession) {
          await this.saveCommandToDb(command, 'support');
        }
      } catch (error) {
        console.error("Error executing support command:", error);
        throw this.parseBluetoothError(error);
      }
    } else {
      console.error("Cannot execute support command - no device connected");
      throw this.parseBluetoothError(new Error("No device connected to execute command"));
    }
  }
}

const bluetoothService = new BluetoothService();
export default bluetoothService;
