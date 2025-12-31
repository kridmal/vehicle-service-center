import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "./Login.css";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        setPassword("");
        navigate("/dashboard", { replace: true });
      } else {
        setError(result.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <h1>Vehicle Service Center</h1>
          <p>Management System Login</p>
        </div>
        {error ? <div className="login-error">{error}</div> : null}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-button" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
