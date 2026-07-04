import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

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
      <h1>ForensIQ</h1>

      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <br />
        <br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <br />
        <br />

        <button type="submit">Sign In</button>
      </form>
    </div>
  );
}
