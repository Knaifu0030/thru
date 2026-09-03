import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig, motion } from "framer-motion";
import { THRUProvider, RegistryProvider, UIProvider } from "@/lib/store";
import { AppShell } from "@/components/shell/AppShell";
import { SkillDrawer } from "@/components/skills/SkillDrawer";
import { THRUModal } from "@/components/teaching/THRUModal";
import { Dashboard } from "@/screens/Dashboard";
import { Marketplace } from "@/screens/Marketplace";
import { Activity } from "@/screens/Activity";
import { ConnectAgent } from "@/screens/ConnectAgent";
import { Settings } from "@/screens/Settings";

function AnimatedRoutes() {
  const location = useLocation();
  // Mount-only fade+slide per route. No exit-phase AnimatePresence: screens
  // contain layout-animated cards, which deadlock exiting presence trees.
  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <Routes location={location}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/connect" element={<ConnectAgent />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </motion.div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <RegistryProvider>
          <THRUProvider>
            <UIProvider>
              <AppShell>
                <AnimatedRoutes />
              </AppShell>
              <SkillDrawer />
              <THRUModal />
            </UIProvider>
          </THRUProvider>
        </RegistryProvider>
      </MotionConfig>
    </BrowserRouter>
  );
}
