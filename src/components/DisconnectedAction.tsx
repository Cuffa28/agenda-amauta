import { PlugZap } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/** Acción de integración deshabilitada hasta que el servicio esté conectado. */
export function DisconnectedAction({ children, reason }: { children: ReactNode; reason: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" disabled aria-disabled="true">
        <PlugZap />
        {children}
      </Button>
      <span className="text-xs text-muted-foreground">{reason}</span>
    </div>
  );
}

