
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserDeviceView } from "@/components/UserDeviceView";
import { SupportView } from "@/components/SupportView";
import { Bluetooth } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BluetoothDeviceList } from "@/components/BluetoothDeviceList";
import { BluetoothDevice } from "@/services/BluetoothService";
import bluetoothService from "@/services/BluetoothService";
import { toast } from "sonner";

const Index = () => {
  const [currentTab, setCurrentTab] = useState<string>("user");
  const [accessMode, setAccessMode] = useState<string | null>(null);
  const [showDeviceList, setShowDeviceList] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Get the access mode from session storage
    const mode = sessionStorage.getItem('accessMode');
    setAccessMode(mode);
    
    // If mode is 'device', ensure we start on the user tab
    if (mode === 'device') {
      setCurrentTab('user');
    }
  }, []);

  // Ensure session state is updated when switching tabs
  const handleTabChange = (value: string) => {
    // If trying to access support tab when in device-only mode, block it
    if (value === 'support' && accessMode === 'device') {
      return;
    }
    
    setCurrentTab(value);
    console.log(`Switched to ${value} tab`);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('accessMode');
    navigate('/login');
  };

  const handleDeviceSelected = async (device: BluetoothDevice) => {
    try {
      await bluetoothService.connectToDevice(device.id);
      setShowDeviceList(false);
      toast.success(`Connected to ${device.name}`);
    } catch (error) {
      console.error("Error connecting to device:", error);
      toast.error("Failed to connect to device. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-primary p-4 text-primary-foreground shadow-md">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bluetooth className="h-6 w-6" />
            <h1 className="text-xl font-bold">Remote BT Assist</h1>
          </div>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="text-primary hover:text-primary"
          >
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-6">
        {showDeviceList ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Connect to Bluetooth Device</h2>
              <Button variant="ghost" onClick={() => setShowDeviceList(false)}>
                Cancel
              </Button>
            </div>
            <BluetoothDeviceList onDeviceSelected={handleDeviceSelected} />
          </div>
        ) : (
          <Tabs 
            defaultValue="user" 
            value={currentTab} 
            onValueChange={handleTabChange} 
            className="w-full"
          >
            <TabsList className={`grid w-full ${accessMode === 'both' ? 'grid-cols-2' : 'grid-cols-1'} mb-8`}>
              <TabsTrigger value="user">Device (User)</TabsTrigger>
              {accessMode === 'both' && (
                <TabsTrigger value="support">Support (Helper)</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="user" className="space-y-4">
              <Button 
                variant="outline"
                className="mb-4 flex gap-2"
                onClick={() => setShowDeviceList(true)}
              >
                <Bluetooth size={16} />
                Search for Bluetooth Devices
              </Button>
              <UserDeviceView />
            </TabsContent>
            
            {accessMode === 'both' && (
              <TabsContent value="support" className="space-y-4">
                <SupportView />
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-muted p-4 text-center text-sm text-muted-foreground">
        <div className="container mx-auto">
          Remote BT Assist &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
};

export default Index;
