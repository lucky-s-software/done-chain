"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ActionRail } from "@/components/rail/ActionRail";

export default function Home() {
  const [pulse, setPulse] = useState(0);

  const handleDataChange = () => {
    setPulse((prev) => prev + 1);
  };

  return (
    <main className="w-full h-screen flex">
      {/* Left Panel: Chat (60%) */}
      <section className="flex-[6] min-w-[400px] h-full relative">
        <ChatPanel onDataChange={handleDataChange} />
      </section>

      {/* Right Panel: Action Rail (40%) */}
      <section className="flex-[4] min-w-[300px] max-w-[500px] h-full">
        <ActionRail refreshPulse={pulse} />
      </section>
    </main>
  );
}
