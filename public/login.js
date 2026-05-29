import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { ref, set, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { auth, db } from "./firebase-config.js";

const form = document.getElementById("authForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authMessage = document.getElementById("authMessage");
const submitButton = document.getElementById("authSubmit");
const loginMode = document.getElementById("loginMode");
const signupMode = document.getElementById("signupMode");

let mode = "login";
const AUTH_TIMEOUT_MS = 12000;

function setMode(nextMode) {
  mode = nextMode;
  loginMode.classList.toggle("active", mode === "login");
  signupMode.classList.toggle("active", mode === "signup");
  submitButton.textContent = mode === "login" ? "Login" : "Create account";
  authMessage.textContent = "";
}

function setMessage(message, tone = "muted") {
  authMessage.textContent = message;
  authMessage.className = `helper ${tone}`;
}

function getRedirectTarget() {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  return redirect && !redirect.startsWith("http") ? redirect : "index.html";
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function createUserProfile(user) {
  await set(ref(db, `users/${user.uid}`), {
    email: user.email,
    role: "citizen",
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}

async function touchUserProfile(user) {
  await update(ref(db, `users/${user.uid}`), {
    email: user.email,
    lastLoginAt: Date.now(),
    updatedAt: Date.now()
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = mode === "login" ? "Signing in..." : "Creating...";
  setMessage(mode === "login" ? "Signing you in..." : "Creating your account...");

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const credential = await withTimeout(
      mode === "login"
        ? signInWithEmailAndPassword(auth, email, password)
        : createUserWithEmailAndPassword(auth, email, password),
      AUTH_TIMEOUT_MS,
      "Firebase Authentication did not respond. Check if Email/Password sign-in is enabled and try again."
    );

    if (mode === "signup") {
      await withTimeout(
        createUserProfile(credential.user),
        AUTH_TIMEOUT_MS,
        "Account was created, but profile setup timed out. Try logging in again."
      );
    } else {
      await withTimeout(
        touchUserProfile(credential.user),
        AUTH_TIMEOUT_MS,
        "Login worked, but profile update timed out. Opening the app now."
      );
    }

    window.location.href = getRedirectTarget();
  } catch (error) {
    console.error("Authentication failed", error);
    setMessage(error.message || "Authentication failed. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = mode === "login" ? "Login" : "Create account";
  }
});

loginMode.addEventListener("click", () => setMode("login"));
signupMode.addEventListener("click", () => setMode("signup"));
