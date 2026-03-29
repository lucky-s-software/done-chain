"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ActionRail } from "@/components/rail/ActionRail";
import {
  detectUserTimeZone,
  isValidTimeZone,
  TIMEZONE_STORAGE_KEY,
} from "@/lib/timezone";

export default function Home() {
  const [pulse, setPulse] = useState(0);
  const [timezone, setTimezone] = useState("UTC");

  const handleDataChange = () => {
    setPulse((prev) => prev + 1);
  };

  useEffect(() => {
    const detected = detectUserTimeZone();
    const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
    setTimezone(stored && isValidTimeZone(stored) ? stored : detected);
  }, []);

  useEffect(() => {
    if (!timezone) return;
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone);
  }, [timezone]);

  return (
    <main className="w-full h-screen flex">
      {/* Left Panel: Chat (60%) */}
      <section className="flex-[6] min-w-[400px] h-full relative">
        <ChatPanel onDataChange={handleDataChange} timezone={timezone} />
      </section>

      {/* Right Panel: Action Rail (40%) */}
      <section className="flex-[4] min-w-[300px] max-w-[500px] h-full">
        <ActionRail
          refreshPulse={pulse}
          timezone={timezone}
          onTimezoneChange={setTimezone}
        />
      </section>
    </main>
  );
}
