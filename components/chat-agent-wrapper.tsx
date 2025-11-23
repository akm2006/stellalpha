"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ChatAgent } from "@/components/chat-agent";

export default function ChatAgentWrapper() {
  const pathname = usePathname();

  // Do not render the chat/bot on the landing page (root path)
  if (!pathname || pathname === "/") return null;

  return <ChatAgent />;
}
