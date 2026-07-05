import ThemeToggle from "../ThemeToggle";
import { useAuth } from "../../hooks/useAuth";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function TopBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <header
      style={{
        height: "64px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 24px",
      }}
    >
      <h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontWeight: 700,
            fontSize: "22px",
            color: "var(--text-primary)",
          }}
        >
          <div
            style={{
              width: "18px",
              height: "18px",
              background: "var(--accent)",
              clipPath: "polygon(25% 6%,75% 6%,100% 50%,75% 94%,25% 94%,0 50%)",
            }}
          />
          ForensIQ
        </div>
      </h3>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <ThemeToggle />

        <div style={{ position: "relative" }}>
          <button
            aria-label="User menu"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              background: "var(--accent)",
              color: "white",
              fontWeight: "bold",
              fontSize: "18px",
            }}
          >
            {user?.email?.charAt(0).toUpperCase()}
          </button>

          {menuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                marginTop: "10px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                minWidth: "160px",
                boxShadow: "var(--shadow-md)",
                overflow: "hidden",
              }}
            >
              <button
                onClick={handleSignOut}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
