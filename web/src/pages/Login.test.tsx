import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const login = vi.fn().mockResolvedValue(undefined);

// Mock the auth hook so we can assert login() is invoked without spinning up
// the real provider / network.
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, login, logout: vi.fn() }),
}));

import { Login } from "./Login";

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login", () => {
  it("renders the guest CTA", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: /play as guest/i })).toBeInTheDocument();
  });

  it("calls login when the guest button is clicked", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: /play as guest/i }));

    expect(login).toHaveBeenCalledTimes(1);
  });
});
