import { useEffect, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "associate_sidebar_collapsed";

const readStoredSidebarState = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
};

const usePersistedSidebarState = () => {
  const [isSideBarCollapsed, setIsSideBarCollapsed] = useState(
    readStoredSidebarState,
  );

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_KEY,
      isSideBarCollapsed ? "1" : "0",
    );
  }, [isSideBarCollapsed]);

  return { isSideBarCollapsed, setIsSideBarCollapsed };
};

export default usePersistedSidebarState;
