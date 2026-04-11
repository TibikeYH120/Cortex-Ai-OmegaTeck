import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";

export function Home() {
  // Main App Layout - Demo mode, always show main UI
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
