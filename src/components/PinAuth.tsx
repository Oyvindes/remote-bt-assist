
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";

type PinAuthProps = {
  onSuccess: (mode: 'device' | 'support' | 'both') => void;
};

export const PinAuth = ({ onSuccess }: PinAuthProps) => {
  const [pin, setPin] = useState<string>("");
  const correctPin = "4242";

  const handlePinComplete = (value: string) => {
    setPin(value);
    
    if (value.length === 4) {
      if (value === correctPin) {
        toast.success("PIN accepted!");
        onSuccess('both');
      } else {
        toast.error("Invalid PIN. Please try again.");
        setPin("");
      }
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6 p-4">
      <h2 className="text-2xl font-bold text-center">Enter PIN</h2>
      <p className="text-muted-foreground text-center">
        Enter PIN code 4242 to access both Device and Support views
      </p>
      
      <div className="flex justify-center">
        <InputOTP
          maxLength={4}
          value={pin}
          onChange={handlePinComplete}
          render={({ slots }) => (
            <InputOTPGroup>
              {slots.map((slot, index) => (
                <InputOTPSlot key={index} {...slot} />
              ))}
            </InputOTPGroup>
          )}
        />
      </div>
      
      <Button
        className="mt-6"
        onClick={() => onSuccess('device')}
      >
        Request Support
      </Button>
      
      <div className="text-center text-sm text-muted-foreground mt-4">
        <p>PIN 4242: Unlock both Device & Support views</p>
        <p>"Request Support" button: Open Device view only</p>
      </div>
    </div>
  );
};
