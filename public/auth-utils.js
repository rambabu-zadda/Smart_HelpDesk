import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { auth, db } from "./firebase-config.js";

export function waitForUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function getUserRole(uid) {
  if (!uid) return "guest";
  const snapshot = await get(ref(db, `users/${uid}/role`));
  return snapshot.exists() ? snapshot.val() : "citizen";
}

export async function requireAdmin() {
  const user = await waitForUser();

  if (!user) {
    window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname.split("/").pop())}`;
    return null;
  }

  const role = await getUserRole(user.uid);
  if (role !== "admin") {
    document.body.innerHTML = `
      <main class="page-shell">
        <section class="panel status-panel">
          <p class="eyebrow">Access denied</p>
          <h1>Admin access required</h1>
          <p class="hero-copy">You are signed in as ${user.email}, but this account is not marked as an admin.</p>
          <div class="action-row">
            <a href="index.html" class="btn secondary">Home</a>
            <a href="login.html" class="btn neutral">Switch account</a>
          </div>
        </section>
      </main>
    `;
    return null;
  }

  return { user, role };
}

export async function requireStaff() {
  const user = await waitForUser();

  if (!user) {
    window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname.split("/").pop())}`;
    return null;
  }

  const role = await getUserRole(user.uid);
  if (!["admin", "department_officer"].includes(role)) {
    document.body.innerHTML = `
      <main class="page-shell">
        <section class="panel status-panel">
          <p class="eyebrow">Access denied</p>
          <h1>Staff access required</h1>
          <p class="hero-copy">You are signed in as ${user.email}, but this account is not assigned to the helpdesk team.</p>
          <div class="action-row">
            <a href="index.html" class="btn secondary">Home</a>
            <a href="login.html" class="btn neutral">Switch account</a>
          </div>
        </section>
      </main>
    `;
    return null;
  }

  return { user, role };
}

export function attachLogout(button) {
  button?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}
