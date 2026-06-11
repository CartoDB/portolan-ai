import { Route, Routes } from "react-router-dom";
import Chat from "@/app/chat/page";
import ExplorePage from "@/app/explore/page";
import Home from "@/app/page";
import { Analytics } from "@/components/analytics";
import { useThemeEffect } from "@/lib/use-theme-effect";

export function App() {
  useThemeEffect();

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:slug" element={<ExplorePage />} />
        <Route path="/:slug/chat" element={<Chat />} />
      </Routes>
      <Analytics />
    </>
  );
}
