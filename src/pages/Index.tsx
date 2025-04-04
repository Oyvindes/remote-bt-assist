
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserDeviceView } from "@/components/UserDeviceView";
import { SupportView } from "@/components/SupportView";
import { Bluetooth } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [currentTab, setCurrentTab] = useState<string>("user");
  const [accessMode, setAccessMode] = useState<string | null>(null);
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
            className="text-white hover:text-white"
          >
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-6">
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
            <UserDeviceView />
          </TabsContent>
          
          {accessMode === 'both' && (
            <TabsContent value="support" className="space-y-4">
              <SupportView />
            </TabsContent>
          )}
        </Tabs>
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
