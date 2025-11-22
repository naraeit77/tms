"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60} // Refetch session every 5 minutes
      refetchOnWindowFocus={true}
      // Reduce initial fetch errors by adding base path
      basePath="/api/auth"
    >
      {children}
    </SessionProvider>
  );
}
