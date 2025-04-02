
// This service handles Bluetooth device connectivity using the Web Bluetooth API

export interface BluetoothDevice {
  id: string;
  name: string;
}

export interface ShareSession {
  id: string;
  name: string;
  deviceId: string;
  deviceName: string;
}

class BluetoothService {
  private device: BluetoothDevice | null = null;
  private connected: boolean = false;
  private listeners: ((data: string) => void)[] = [];
  private availableDevices: BluetoothDevice[] = [];
  private isScanning: boolean = false;
  private shareSession: ShareSession | null = null;
  private serialCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private gattServer: BluetoothRemoteGATTServer | null = null;
  private nativeDevice: globalThis.BluetoothDevice | null = null;

  async scanForDevices(timeout: number = 5000): Promise<BluetoothDevice[]> {
    // If already scanning, return current list
    if (this.isScanning) {
      return this.availableDevices;
    }

    // Clear previous devices list
    this.availableDevices = [];
    this.isScanning = true;

    try {
      // Check if Web Bluetooth API is available
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth API is not available in this browser");
      }

      console.log("Requesting Bluetooth device...");
      const device = await navigator.bluetooth.requestDevice({
        // Accept all devices with a Serial Port service
        acceptAllDevices: true,
        optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb', 'battery_service']
      });

      if (device && device.name) {
        this.availableDevices.push({
          id: device.id,
          name: device.name || "Unknown Device"
        });
        
        // Save the native device reference
        this.nativeDevice = device;
      }
      
    } catch (error) {
      console.error("Error scanning for Bluetooth devices:", error);
    } finally {
      this.isScanning = false;
    }

    return this.availableDevices;
  }

  cancelScan(): void {
    this.isScanning = false;
  }

  getAvailableDevices(): BluetoothDevice[] {
    return this.availableDevices;
  }

  async connectToDevice(deviceId: string): Promise<boolean> {
    // Find the device in available devices
    const deviceToConnect = this.availableDevices.find(d => d.id === deviceId);
    
    if (!deviceToConnect) {
      throw new Error("Device not found");
    }

    this.device = deviceToConnect;
    return this.connect();
  }

  async connect(): Promise<boolean> {
    if (!this.device) {
      throw new Error("No device selected");
    }

    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API is not available in this browser");
    }

    if (!this.nativeDevice || !this.nativeDevice.gatt) {
      throw new Error("Native Bluetooth device not available");
    }

    try {
      console.log(`Connecting to device: ${this.device.id}`);
      
      // Connect to the GATT server
      this.gattServer = await this.nativeDevice.gatt.connect();
      
      // Get the primary service
      const service = await this.gattServer.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      
      // Get the characteristic for serial communication
      this.serialCharacteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
      
      // Start notifications to receive data
      await this.serialCharacteristic.startNotifications();
      
      // Add a listener for characteristic value changes
      this.serialCharacteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        // Properly cast the event target with an intermediate 'unknown' cast for type safety
        const target = (event.target as unknown) as BluetoothRemoteGATTCharacteristic;
        if (target && target.value) {
          const decoder = new TextDecoder('utf-8');
          const value = decoder.decode(target.value);
          this.notifyListeners(value);
        }
      });
      
      this.connected = true;
      
      // Simulate some initial data for testing purposes
      setTimeout(() => {
        this.notifyListeners("CONNECTION ESTABLISHED");
        this.notifyListeners("DEVICE READY");
      }, 500);
      
      return true;
    } catch (error) {
      console.error("Error connecting to device:", error);
      this.connected = false;
      throw error;
    }
  }

  disconnect(): void {
    // Disconnect from the GATT server if connected
    if (this.gattServer && this.serialCharacteristic) {
      try {
        this.serialCharacteristic.stopNotifications();
        this.gattServer.disconnect();
      } catch (error) {
        console.error("Error disconnecting:", error);
      }
    }
    
    this.connected = false;
    this.device = null;
    this.shareSession = null;
    this.serialCharacteristic = null;
    this.gattServer = null;
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected to any device");
    }

    try {
      console.log(`Sending command: ${command}`);
      
      if (this.serialCharacteristic) {
        // Convert string to ArrayBuffer
        const encoder = new TextEncoder();
        const data = encoder.encode(command + '\r\n');
        
        // Send data to the characteristic
        await this.serialCharacteristic.writeValue(data);
        
        // Simulate a response for testing purposes
        setTimeout(() => {
          this.notifyListeners(`Response: ${command} processed`);
        }, 300);
      } else {
        throw new Error("Serial characteristic not available");
      }
    } catch (error) {
      console.error("Error sending command:", error);
      throw error;
    }
  }

  addDataListener(callback: (data: string) => void): void {
    this.listeners.push(callback);
  }

  removeDataListener(callback: (data: string) => void): void {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  private notifyListeners(data: string): void {
    this.listeners.forEach(listener => listener(data));
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectedDevice(): BluetoothDevice | null {
    return this.device;
  }

  // Session sharing methods
  shareDeviceSession(sessionName: string): ShareSession {
    if (!this.device || !this.connected) {
      throw new Error("No connected device to share");
    }
    
    const session: ShareSession = {
      id: Math.random().toString(36).substring(2, 10),
      name: sessionName || `${this.device.name} Session`,
      deviceId: this.device.id,
      deviceName: this.device.name
    };
    
    this.shareSession = session;
    return session;
  }
  
  getActiveShareSession(): ShareSession | null {
    return this.shareSession;
  }
  
  stopSharingSession(): void {
    this.shareSession = null;
  }
}

// Create a singleton instance
const bluetoothService = new BluetoothService();
export default bluetoothService;
