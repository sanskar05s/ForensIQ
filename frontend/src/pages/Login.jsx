import Button from "../components/ui/Button";
import Input from "../components/ui/Input";

import { useEffect, useState } from "react";

import { useAuth } from "../hooks/useAuth";

import ThemeToggle from "../components/ThemeToggle";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { signIn, user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    const { data, error } = await signIn(email, password);

    if (error) {
      alert(error.message);
      return;
    }
  };
  useEffect(() => {
    if (!loading && user) {
      navigate("/cases", { replace: true });
    }
  }, [user, loading, navigate]);
  return (
    <div style={{ padding: "40px" }}>
      <ThemeToggle />
      <h1>ForensIQ</h1>

      <form onSubmit={handleLogin}>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />

        <br />
        <br />

        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <br />
        <br />

        <Button type="submit">Sign In</Button>
      </form>
    </div>
  );
}
