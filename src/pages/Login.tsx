
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bluetooth } from "lucide-react";
import { PinAuth } from "@/components/PinAuth";

const Login = () => {
  const navigate = useNavigate();
  
  const handleAuthSuccess = (mode: 'device' | 'support' | 'both') => {
    // Store the access mode in session storage
    sessionStorage.setItem('accessMode', mode);
    
    // Navigate to the main page
    navigate('/');
  };
  
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
      <main className="flex-1 container mx-auto p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <PinAuth onSuccess={handleAuthSuccess} />
          </div>
        </div>
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

export default Login;
