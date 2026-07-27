import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { WalletBadge } from "./WalletBadge";

export function NavBar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) return null;

  const onLogout = (): void => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav className="nav">
      <div className="nav__brand">⚔️ FP Clash</div>
      <div className="nav__links">
        <NavLink to="/collection" className="nav__link">
          Collection
        </NavLink>
        <NavLink to="/queue" className="nav__link">
          Queue
        </NavLink>
        <NavLink to="/leaderboard" className="nav__link">
          Leaderboard
        </NavLink>
        <NavLink to="/history" className="nav__link">
          History
        </NavLink>
      </div>
      <div className="nav__right">
        <WalletBadge />
        <button type="button" className="btn btn--ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
