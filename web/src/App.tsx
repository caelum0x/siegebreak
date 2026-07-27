import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Collection } from "./pages/Collection";
import { Queue } from "./pages/Queue";
import { Leaderboard } from "./pages/Leaderboard";
import { History } from "./pages/History";

export function App() {
  return (
    <div className="app">
      <NavBar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/collection"
          element={
            <ProtectedRoute>
              <Collection />
            </ProtectedRoute>
          }
        />
        <Route
          path="/queue"
          element={
            <ProtectedRoute>
              <Queue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Leaderboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/collection" replace />} />
        <Route path="*" element={<Navigate to="/collection" replace />} />
      </Routes>
    </div>
  );
}
