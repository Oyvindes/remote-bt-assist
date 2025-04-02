
// This is a mock service for demonstration purposes
// For a real implementation, you would use the Web Bluetooth API
// which is available in supported browsers

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

  async scanForDevices(timeout: number = 5000): Promise<BluetoothDevice[]> {
    // If already scanning, return current list
    if (this.isScanning) {
      return this.availableDevices;
    }

    // Clear previous devices list
    this.availableDevices = [];
    this.isScanning = true;

    // In a real implementation, this would use navigator.bluetooth.requestDevice()
    // with acceptAllDevices set to true and optionalServices for serial communication
    return new Promise((resolve) => {
      // Mock device scanning process
      setTimeout(() => {
        // Populate with mock devices
        this.availableDevices = [
          { id: Math.random().toString(36).substring(2, 10), name: "BT Serial Device #1" },
          { id: Math.random().toString(36).substring(2, 10), name: "HC-05" },
          { id: Math.random().toString(36).substring(2, 10), name: "Arduino BT" },
          { id: Math.random().toString(36).substring(2, 10), name: "ESP32-BT" },
        ];
        this.isScanning = false;
        resolve(this.availableDevices);
      }, timeout);
    });
  }

  cancelScan(): void {
    this.isScanning = false;
  }

  getAvailableDevices(): BluetoothDevice[] {
    return this.availableDevices;
  }

  async requestDevice(): Promise<BluetoothDevice> {
    // In a real implementation, this would use navigator.bluetooth.requestDevice()
    return new Promise((resolve) => {
      // Mock device selection
      setTimeout(() => {
        const mockDevice = {
          id: Math.random().toString(36).substring(2, 10),
          name: "BT Serial Device"
        };
        this.device = mockDevice;
        resolve(mockDevice);
      }, 1000);
    });
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

    return new Promise((resolve) => {
      // Mock connection process
      setTimeout(() => {
        this.connected = true;
        
        // Simulate receiving data periodically
        setInterval(() => {
          if (this.connected) {
            this.notifyListeners(`DATA: ${new Date().toLocaleTimeString()}`);
          }
        }, 5000);
        
        resolve(true);
      }, 1000);
    });
  }

  disconnect(): void {
    this.connected = false;
    this.device = null;
    this.shareSession = null;
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected to any device");
    }

    // In a real implementation, this would send data to the device
    console.log(`Sending command: ${command}`);
    
    // Simulate response after sending command
    return new Promise((resolve) => {
      setTimeout(() => {
        if (command.includes("AT+")) {
          let response = "OK";
          if (command.includes("VERSION")) {
            response = "VERSION: BT-SERIAL-v1.2";
          } else if (command.includes("STATUS")) {
            response = "STATUS: READY";
          }
          this.notifyListeners(response);
        }
        resolve();
      }, 500);
    });
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
