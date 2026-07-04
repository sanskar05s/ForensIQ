import Button from "../components/ui/Button";
import Input from "../components/ui/Input";

import { useState } from "react";

import { useAuth } from "../hooks/useAuth";

import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const { signIn, user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // 👇 Add these two lines here
  console.log({ user, loading });

  const handleLogin = async (e) => {
    e.preventDefault();

    const { data, error } = await signIn(email, password);

    if (error) {
      alert(error.message);
      return;
    }

    console.log("Login successful:", data);
    alert("Login successful!");
  };

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
