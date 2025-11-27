"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function ShadowModeToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("shadow:enabled");
    if (stored) {
      setEnabled(stored === "true");
    }
  }, []);

  const toggle = (checked: boolean) => {
    setEnabled(checked);
    localStorage.setItem("shadow:enabled", String(checked));
    // Trigger a custom event or use context if needed to notify other components immediately
    window.dispatchEvent(new Event("shadow-mode-changed"));
  };

  return (
    <div className="flex items-center space-x-2">
      <Switch id="shadow-mode" checked={enabled} onChange={toggle} />
      <Label htmlFor="shadow-mode">Shadow Mode (Simulation)</Label>
    </div>
  );
}
