import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { get, onValue, ref, update, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { auth, db } from "./firebase-config.js";
import { findLocalComplaint, updateLocalComplaint } from "./local-store.js";

const form = document.getElementById("statusForm");
const complaintIdInput = document.getElementById("complaintId");
const notificationPanel = document.getElementById("notificationPanel");
const resultPanel = document.getElementById("statusResult");
const feedbackForm = document.getElementById("feedbackForm");
const ratingInput = document.getElementById("rating");
const feedbackText = document.getElementById("feedbackText");
const feedbackMessage = document.getElementById("feedbackMessage");
const statusSteps = ["Pending", "Assigned", "In Progress", "Resolved", "Feedback Submitted"];

let activeComplaint = null;
let activeKey = null;
let activeIsLocal = false;

function formatDate(timestamp) {
  if (!timestamp) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function renderEmpty(message, tone = "") {
  feedbackForm.hidden = true;
  resultPanel.hidden = false;
  resultPanel.innerHTML = `<p class="empty-state ${tone}">${message}</p>`;
}

function escapeHtml(value = "") {
  return value
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function renderComplaint(complaint) {
  const currentIndex = Math.max(0, statusSteps.indexOf(complaint.status || "Pending"));
  const timeline = statusSteps
    .map((step, index) => `
      <li class="${index <= currentIndex ? "active" : ""}">
        <span>${index + 1}</span>
        ${step}
      </li>
    `)
    .join("");

  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <div class="result-header">
      <span class="status-badge">${escapeHtml(complaint.status || "Pending")}</span>
      <strong>${escapeHtml(complaint.complaintId)}</strong>
    </div>
    <dl class="status-grid">
      <div><dt>Category</dt><dd>${escapeHtml(complaint.category || "General")}</dd></div>
      <div><dt>Priority</dt><dd>${escapeHtml(complaint.priority || "Normal")}</dd></div>
      <div><dt>Department</dt><dd>${escapeHtml(complaint.department || complaint.assignedTo || "General Helpdesk")}</dd></div>
      <div><dt>AI Summary</dt><dd>${escapeHtml(complaint.aiSummary || "Not available")}</dd></div>
      <div><dt>Area</dt><dd>${escapeHtml(complaint.area)}, ${escapeHtml(complaint.town)}</dd></div>
      <div><dt>District</dt><dd>${escapeHtml(complaint.district)}, ${escapeHtml(complaint.state)}</dd></div>
      <div><dt>Submitted</dt><dd>${formatDate(complaint.createdAt)}</dd></div>
      <div><dt>Last Updated</dt><dd>${formatDate(complaint.updatedAt)}</dd></div>
    </dl>
    <ol class="status-timeline">${timeline}</ol>
    ${complaint.photoUrl ? `<a class="evidence-link" href="${escapeHtml(complaint.photoUrl)}" target="_blank" rel="noreferrer">View uploaded photo</a>` : ""}
    <p class="issue-preview">${escapeHtml(complaint.issue)}</p>
    ${complaint.feedback ? `<p class="issue-preview"><strong>Feedback:</strong> ${escapeHtml(complaint.feedback)} (${escapeHtml(complaint.rating || "")}/5)</p>` : ""}
  `;

  feedbackForm.hidden = !["Resolved", "Feedback Submitted"].includes(complaint.status);
}

function renderNotifications(snapshot) {
  if (!snapshot.exists()) {
    notificationPanel.hidden = true;
    return;
  }

  const notifications = [];
  snapshot.forEach((child) => {
    notifications.push(child.val());
  });

  notificationPanel.hidden = false;
  notificationPanel.innerHTML = `
    <div class="result-header">
      <strong>In-app notifications</strong>
      <span class="status-badge">${notifications.length}</span>
    </div>
    ${notifications
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5)
      .map((item) => `<p class="issue-preview">${escapeHtml(item.message)} <small>${formatDate(item.createdAt)}</small></p>`)
      .join("")}
  `;
}

async function findFirebaseComplaint(complaintId) {
  const statusQuery = query(ref(db, "complaints"), orderByChild("complaintId"), equalTo(complaintId));
  const snapshot = await get(statusQuery);
  if (!snapshot.exists()) return null;

  let match = null;
  snapshot.forEach((child) => {
    match = { key: child.key, data: child.val() };
  });
  return match;
}

async function checkStatus(event) {
  event?.preventDefault();
  const complaintId = complaintIdInput.value.trim().toUpperCase();

  activeComplaint = null;
  activeKey = null;
  activeIsLocal = false;

  if (!complaintId) {
    renderEmpty("Enter a complaint ID to check the latest status.");
    return;
  }

  renderEmpty("Checking complaint status...");

  try {
    const firebaseComplaint = await findFirebaseComplaint(complaintId);
    if (firebaseComplaint) {
      activeComplaint = firebaseComplaint.data;
      activeKey = firebaseComplaint.key;
      renderComplaint(activeComplaint);
      return;
    }

    const localComplaint = findLocalComplaint(complaintId);
    if (localComplaint) {
      activeComplaint = localComplaint;
      activeKey = localComplaint.complaintId;
      activeIsLocal = true;
      renderComplaint(activeComplaint);
      return;
    }

    renderEmpty("No complaint found with that ID. Please check the ID and try again.", "error");
  } catch (error) {
    console.error("Status lookup failed", error);
    const localComplaint = findLocalComplaint(complaintId);
    if (localComplaint) {
      activeComplaint = localComplaint;
      activeKey = localComplaint.complaintId;
      activeIsLocal = true;
      renderComplaint(activeComplaint);
      return;
    }
    renderEmpty(`Status lookup failed: ${error.message || "Please check Firebase rules and internet connection."}`, "error");
  }
}

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeComplaint || !activeKey) return;

  const updates = {
    feedback: feedbackText.value.trim(),
    rating: Number(ratingInput.value),
    status: "Feedback Submitted",
    updatedAt: Date.now()
  };

  feedbackMessage.textContent = "Submitting feedback...";
  feedbackMessage.className = "helper";

  try {
    if (activeIsLocal) {
      updateLocalComplaint(activeKey, updates);
    } else {
      await update(ref(db, `complaints/${activeKey}`), updates);
    }

    activeComplaint = { ...activeComplaint, ...updates };
    feedbackMessage.textContent = "Feedback submitted. Thank you.";
    feedbackMessage.className = "helper success";
    renderComplaint(activeComplaint);
  } catch (error) {
    console.error("Feedback failed", error);
    feedbackMessage.textContent = error.message || "Could not submit feedback.";
    feedbackMessage.className = "helper error";
  }
});

form.addEventListener("submit", checkStatus);

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  onValue(ref(db, `notifications/${user.uid}`), renderNotifications);
});

const complaintIdFromUrl = new URLSearchParams(window.location.search).get("id");
if (complaintIdFromUrl) {
  complaintIdInput.value = complaintIdFromUrl.toUpperCase();
  checkStatus();
}
