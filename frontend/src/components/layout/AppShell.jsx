import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children, hideSidebar = false }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <TopBar />

      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {!hideSidebar && <Sidebar />}

        <main
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            overflowY: "auto",
            padding: "24px",
            background: "var(--bg)",
            boxSizing: "border-box",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
