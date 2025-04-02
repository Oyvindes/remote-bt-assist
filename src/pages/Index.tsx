
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserDeviceView } from "@/components/UserDeviceView";
import { SupportView } from "@/components/SupportView";
import { Bluetooth } from "lucide-react";

const Index = () => {
  const [currentTab, setCurrentTab] = useState<string>("user");

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-primary p-4 text-primary-foreground shadow-md">
        <div className="container mx-auto flex items-center gap-2">
          <Bluetooth className="h-6 w-6" />
          <h1 className="text-xl font-bold">Remote BT Assist</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-6">
        <Tabs defaultValue="user" value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="user">Device (User)</TabsTrigger>
            <TabsTrigger value="support">Support (Helper)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="user" className="space-y-4">
            <UserDeviceView />
          </TabsContent>
          
          <TabsContent value="support" className="space-y-4">
            <SupportView />
          </TabsContent>
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
