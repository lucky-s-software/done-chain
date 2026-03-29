"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ActionRail } from "@/components/rail/ActionRail";

export default function Home() {
  const [memoryPulse, setMemoryPulse] = useState(0);

  const handleMemoriesCreated = (count: number) => {
    // Pulse the rail to potentially refresh streak/credits if needed, 
    // or just trigger re-renders on relevant side components
    setMemoryPulse((prev) => prev + count);
  };

  return (
    <main className="w-full h-screen flex">
      {/* Left Panel: Chat (60%) */}
      <section className="flex-[6] min-w-[400px] h-full relative">
        <ChatPanel onMemoriesCreated={handleMemoriesCreated} />
      </section>

      {/* Right Panel: Action Rail (40%) */}
      <section className="flex-[4] min-w-[300px] max-w-[500px] h-full">
        <ActionRail memoryPulse={memoryPulse} />
      </section>
    </main>
  );
}
