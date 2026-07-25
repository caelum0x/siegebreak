import { useEffect, useState } from "react";
import { getWallet } from "../api/client";
import type { Wallet } from "../types";

export function WalletBadge() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getWallet()
      .then((w) => {
        if (active) setWallet(w);
      })
      .catch(() => {
        if (active) setError("wallet unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <span className="wallet wallet--error">{error}</span>;
  if (!wallet) return <span className="wallet">…</span>;

  return (
    <span className="wallet" aria-label="wallet balance">
      <span className="wallet__item" title="Gold">
        🪙 {wallet.gold}
      </span>
      <span className="wallet__item" title="Gems">
        💎 {wallet.gems}
      </span>
    </span>
  );
}
