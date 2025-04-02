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

  // Check if Web Bluetooth API is available
  isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && 
           navigator.bluetooth !== undefined;
  }

  // Get available Bluetooth devices
  async scanForDevices(): Promise<BluetoothDevice[]> {
    if (!this.isWebBluetoothAvailable()) {
      console.error("Web Bluetooth API is not available in this browser/environment");
      return [];
    }

    try {
      console.log("Requesting Bluetooth device...");
      const device = await navigator.bluetooth.requestDevice({
        // Accept all devices that have a Generic Access service
        acceptAllDevices: true,
        optionalServices: ['generic_access', '0000ffe0-0000-1000-8000-00805f9b34fb'] // Common UUID for HC-05, HC-06
      });

      if (device) {
        return [{
          id: device.id,
          name: device.name || "Unknown Device",
          device: device
        }];
      }
      return [];
    } catch (error) {
      console.error("Error scanning for Bluetooth devices:", error);
      return [];
    }
  }

  // Connect to a selected Bluetooth device
  async connectToDevice(deviceId: string): Promise<void> {
    if (!this.isWebBluetoothAvailable()) {
      throw new Error("Web Bluetooth API is not available in this browser/environment");
    }

    // Find the device with matching ID from the available devices
    // In a real app, you might want to store the available devices after scanning
    const devices = await navigator.bluetooth.getDevices();
    const matchingDevice = devices.find(d => d.id === deviceId);

    if (!matchingDevice) {
      throw new Error(`Device with ID ${deviceId} not found`);
    }

    try {
      console.log(`Connecting to device: ${deviceId}`);
      
      // Connect to the GATT server
      const server = await matchingDevice.gatt?.connect();
      if (!server) {
        throw new Error("Failed to connect to GATT server");
      }

      // Discover serial service (common UUID for BLE Serial services)
      // This might differ depending on your specific Bluetooth device
      const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      
      // Get the characteristic for serial communication
      const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
      
      // Store the characteristic for later use
      this.characteristic = characteristic;
      
      // Set up notifications for incoming data
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (value) {
          const decoder = new TextDecoder('utf-8');
          const data = decoder.decode(value);
          this.notifyDataListeners(data);
        }
      });

      // Store the connected device
      this.connectedDevice = {
        id: matchingDevice.id,
        name: matchingDevice.name || "Unknown Device",
        device: matchingDevice
      };
      
      console.log(`Successfully connected to ${this.connectedDevice.name}`);
    } catch (error) {
      console.error("Error connecting to Bluetooth device:", error);
      throw new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Disconnect from the device
  disconnect(): void {
    if (this.connectedDevice?.device?.gatt?.connected) {
      this.connectedDevice.device.gatt.disconnect();
    }
    
    if (this.characteristic) {
      try {
        this.characteristic.stopNotifications();
      } catch (error) {
        console.error("Error stopping notifications:", error);
      }
      this.characteristic = null;
    }
    
    this.connectedDevice = null;
    console.log("Disconnected from device");
  }

  isConnected(): boolean {
    return !!this.connectedDevice?.device?.gatt?.connected;
  }

  getConnectedDevice(): BluetoothDevice | null {
    return this.connectedDevice;
  }

  // Send command to the connected device
  async sendCommand(command: string): Promise<void> {
    if (!this.isConnected() || !this.characteristic) {
      throw new Error("No device connected or characteristic not available");
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command + '\r\n'); // Add carriage return and line feed for AT commands
      await this.characteristic.writeValue(data);
      console.log(`Command sent: ${command}`);
    } catch (error) {
      console.error("Error sending command:", error);
      throw new Error(`Failed to send command: ${error instanceof Error ? error.message : String(error)}`);
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
    
    const session: ShareSession = {
      id: Math.random().toString(36).substring(2, 10),
      name: sessionName
    };
    
    this.sharedSession = session;
    
    // Add the session to SessionService so it appears in the support view
    sessionService.createSession(
      sessionName,
      "Remote User", // We could make this configurable
      this.connectedDevice.name || "Unknown Device"
    );
    
    console.log(`Device session shared: ${session.id} - ${sessionName}`);
    return session;
  }

  stopSharingSession(): void {
    if (this.sharedSession) {
      // Close the session in SessionService
      sessionService.closeSession(this.sharedSession.id);
      this.sharedSession = null;
      console.log("Device session sharing stopped");
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
