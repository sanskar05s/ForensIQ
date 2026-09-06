import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children, hideSidebar = false }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: hideSidebar ? "1fr" : "240px 1fr",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      {!hideSidebar && <Sidebar />}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <TopBar />

        <main
          style={{
            flex: 1,
            padding: "24px",
            background: "var(--bg)",
            overflowY: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
