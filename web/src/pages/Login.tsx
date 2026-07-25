import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate("/collection", { replace: true });
  }, [isAuthenticated, navigate]);

  const onPlay = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await login();
      navigate("/collection", { replace: true });
    } catch {
      setError("Could not start a guest session. Is the backend running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page--center">
      <div className="hero">
        <h1 className="hero__title">⚔️ FP Clash</h1>
        <p className="hero__subtitle">
          Build a deck, storm the queue, break the siege.
        </p>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={onPlay}
          disabled={busy}
        >
          {busy ? "Starting…" : "Play as Guest"}
        </button>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
