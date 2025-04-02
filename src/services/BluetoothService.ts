import sessionService from './SessionService';

export interface BluetoothDevice {
  id: string;
  name: string;
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

  // Mock implementation for scanning devices
  async scanForDevices(): Promise<BluetoothDevice[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockDevices: BluetoothDevice[] = [
          { id: "1", name: "HC-05" },
          { id: "2", name: "ESP32 Bluetooth" },
          { id: "3", name: "RN42" },
        ];
        resolve(mockDevices);
      }, 1500);
    });
  }

  // Mock implementation for connecting to a device
  async connectToDevice(deviceId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const mockDevice = { id: deviceId, name: `Device ${deviceId}` };
        this.connectedDevice = mockDevice;
        console.log(`Connected to device: ${deviceId}`);
        resolve();
      }, 1000);
    });
  }

  disconnect(): void {
    this.connectedDevice = null;
    console.log("Disconnected from device");
  }

  isConnected(): boolean {
    return !!this.connectedDevice;
  }

  getConnectedDevice(): BluetoothDevice | null {
    return this.connectedDevice;
  }

  // Mock implementation for sending data
  async sendCommand(command: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockResponse = `Response to ${command}`;
        this.notifyDataListeners(mockResponse);
        resolve();
      }, 500);
    });
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
