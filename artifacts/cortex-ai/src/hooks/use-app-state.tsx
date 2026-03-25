import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useGetMe, AuthUser } from "@workspace/api-client-react";

interface AppState {
  isGuest: boolean;
  user: AuthUser | null;
  isAuthLoading: boolean;
  activeConversationId: number | null;
  sidebarOpen: boolean;
  setGuestMode: (val: boolean) => void;
  setActiveConversationId: (id: number | null) => void;
  setSidebarOpen: (val: boolean) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem("cx_guest") === "true");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: user, isLoading: isAuthLoading, error } = useGetMe({
    query: {
      retry: false,
      enabled: !isGuest, // Don't fetch if in guest mode
      staleTime: Infinity
    }
  });

  const setGuestMode = (val: boolean) => {
    setIsGuest(val);
    if (val) {
      localStorage.setItem("cx_guest", "true");
    } else {
      localStorage.removeItem("cx_guest");
    }
  };

  const contextValue: AppState = {
    isGuest,
    user: isGuest ? { id: 0, name: "Vendég", email: "guest@cortex.ai", role: "guest", createdAt: new Date().toISOString() } : (user || null),
    isAuthLoading,
    activeConversationId,
    sidebarOpen,
    setGuestMode,
    setActiveConversationId,
    setSidebarOpen,
  };

  return (
    <AppStateContext.Provider value={contextValue}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}
