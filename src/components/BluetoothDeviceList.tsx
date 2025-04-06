
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BluetoothSearching } from "lucide-react";
import { BluetoothDevice } from "@/services/BluetoothService";
import bluetoothService from "@/services/BluetoothService";
import { toast } from "sonner";

interface BluetoothDeviceListProps {
  onDeviceSelected: (device: BluetoothDevice) => void;
}

export const BluetoothDeviceList = ({ onDeviceSelected }: BluetoothDeviceListProps) => {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      // Check if Bluetooth is available
      const compatibility = bluetoothService.getBrowserCompatibilityInfo();
      if (!compatibility.compatible) {
        throw new Error(compatibility.message);
      }
      
      // Request Bluetooth permissions first
      const permissionGranted = await bluetoothService.requestBluetoothPermission();
      if (!permissionGranted) {
        throw new Error("Bluetooth permission was denied or not available.");
      }
      
      // Scan for devices
      const foundDevices = await bluetoothService.scanForDevicesWithoutDialog();
      setDevices(foundDevices);
      
      if (foundDevices.length === 0) {
        toast("No compatible '86' devices found nearby. Make sure your device is powered on and in range.");
      }
    } catch (error) {
      console.error("Scan error:", error);
      setError(error instanceof Error ? error.message : "Unknown error occurred");
      toast.error("Failed to scan for devices. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const connectToDevice = (device: BluetoothDevice) => {
    onDeviceSelected(device);
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Available Bluetooth Devices</h2>
        <Button 
          onClick={handleScan} 
          disabled={isScanning}
          variant="outline"
          className="flex items-center gap-2"
        >
          <BluetoothSearching size={16} />
          {isScanning ? "Scanning..." : "Scan for Devices"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {devices.length > 0 ? (
        <div className="grid gap-3">
          {devices.map((device) => (
            <Card 
              key={device.id}
              className="p-3 cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => connectToDevice(device)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{device.name || "Unknown Device"}</p>
                  <p className="text-xs text-muted-foreground">{device.id}</p>
                </div>
                <Button variant="secondary" size="sm">
                  Connect
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          {isScanning ? (
            <div className="flex flex-col items-center gap-2">
              <BluetoothSearching className="animate-pulse h-10 w-10" />
              <p>Scanning for devices...</p>
            </div>
          ) : (
            <p>No devices found. Click scan to search for devices.</p>
          )}
        </div>
      )}
    </div>
  );
};
