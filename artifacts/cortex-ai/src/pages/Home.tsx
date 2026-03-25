import { useAppState } from "@/hooks/use-app-state";
import { AuthScreen } from "@/components/AuthScreen";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { Loader2 } from "lucide-react";

export function Home() {
  const { isGuest, user, isAuthLoading } = useAppState();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <div className="font-mono text-xs tracking-widest uppercase">Cortex Core Loading...</div>
      </div>
    );
  }

  // If not guest and no user data, show login
  if (!isGuest && !user) {
    return <AuthScreen />;
  }

  // Main App Layout
  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden relative">
      {/* Global Background Blobs for depth */}
      <div className="cyber-blob bg-primary w-[40vw] h-[40vh] top-[20%] left-[10%]" />
      <div className="cyber-blob bg-secondary w-[50vw] h-[50vh] bottom-[10%] right-[-10%]" />
      <div className="cyber-blob bg-[#ff2e7e] w-[30vw] h-[30vh] top-[-10%] right-[30%] opacity-10" />

      <Sidebar />
      <ChatArea />
    </div>
  );
}
