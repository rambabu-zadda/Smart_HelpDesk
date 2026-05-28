import { push, ref, onValue, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { db } from "./firebase-config.js";
import { attachLogout, requireStaff } from "./auth-utils.js";
import { getLocalComplaints, updateLocalComplaint } from "./local-store.js";

const tableBody = document.getElementById("complaintTable");
const adminSearch = document.getElementById("adminSearch");
const statusFilter = document.getElementById("statusFilter");
const categoryFilter = document.getElementById("categoryFilter");
const departmentFilter = document.getElementById("departmentFilter");
const categoryChart = document.getElementById("categoryChart");
const statusChart = document.getElementById("statusChart");
const areaChart = document.getElementById("areaChart");
const monthlyChart = document.getElementById("monthlyChart");
const resolutionMetric = document.getElementById("resolutionMetric");
const adminMessage = document.getElementById("adminMessage");
const adminEmail = document.getElementById("adminEmail");
const logoutButton = document.getElementById("logoutButton");
const rolePanel = document.getElementById("rolePanel");
const userTable = document.getElementById("userTable");
const summary = {
  total: document.getElementById("totalCount"),
  pending: document.getElementById("pendingCount"),
  progress: document.getElementById("progressCount"),
  resolved: document.getElementById("resolvedCount")
};

const statusOptions = ["Pending", "Assigned", "In Progress", "Resolved", "Feedback Submitted", "Rejected"];
const roleOptions = ["citizen", "department_officer", "admin"];
let allComplaints = [];

const staffSession = await requireStaff();
if (!staffSession) {
  throw new Error("Staff access required");
}
adminEmail.textContent = `${staffSession.role}: ${staffSession.user.email}`;
attachLogout(logoutButton);
rolePanel.hidden = staffSession.role !== "admin";

function setAdminMessage(message, tone = "muted") {
  adminMessage.textContent = message;
  adminMessage.className = `helper admin-message ${tone}`;
}

function formatDate(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
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

function updateSummary(complaints) {
  summary.total.textContent = complaints.length;
  summary.pending.textContent = complaints.filter((item) => item.status === "Pending").length;
  summary.progress.textContent = complaints.filter((item) => ["Assigned", "In Progress"].includes(item.status)).length;
  summary.resolved.textContent = complaints.filter((item) => ["Resolved", "Feedback Submitted"].includes(item.status)).length;
}

function populateFilter(select, values, allLabel) {
  const currentValue = select.value;
  const uniqueValues = [...new Set(values)].filter(Boolean).sort();

  select.innerHTML = `<option value="">${allLabel}</option>`;
  uniqueValues.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = uniqueValues.includes(currentValue) ? currentValue : "";
}

function renderBarChart(container, complaints, getKey, emptyText) {
  if (!complaints.length) {
    container.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }

  const counts = complaints.reduce((acc, complaint) => {
    const key = getKey(complaint) || "Not specified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const max = Math.max(...Object.values(counts));

  container.innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => `
      <div class="bar-row">
        <span>${escapeHtml(label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width: ${(count / max) * 100}%"></div></div>
        <strong>${count}</strong>
      </div>
    `)
    .join("");
}

function renderResolutionMetric(complaints) {
  const resolved = complaints.filter((item) => item.createdAt && item.updatedAt && ["Resolved", "Feedback Submitted"].includes(item.status));
  if (!resolved.length) {
    resolutionMetric.textContent = "No resolved data";
    return;
  }

  const averageMs = resolved.reduce((sum, item) => sum + (item.updatedAt - item.createdAt), 0) / resolved.length;
  const averageHours = Math.max(1, Math.round(averageMs / 36e5));
  resolutionMetric.textContent = `${averageHours} hour average`;
}

function getFilteredComplaints() {
  const search = adminSearch.value.trim().toLowerCase();
  const status = statusFilter.value;
  const category = categoryFilter.value;
  const department = departmentFilter.value;

  return allComplaints.filter(({ data }) => {
    const haystack = [
      data.complaintId,
      data.issue,
      data.area,
      data.town,
      data.district,
      data.state,
      data.category,
      data.department,
      data.assignedTo
    ].join(" ").toLowerCase();

    return (!search || haystack.includes(search))
      && (!status || data.status === status)
      && (!category || (data.category || "General") === category)
      && (!department || (data.department || data.assignedTo || "General Helpdesk") === department);
  });
}

function renderStatusSelect(key, currentStatus) {
  if (staffSession.role !== "admin") {
    return "<span class=\"helper\">View only</span>";
  }

  const options = statusOptions
    .map((status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${status}</option>`)
    .join("");

  return `<select class="status-select" data-key="${key}" aria-label="Update complaint status">${options}</select>`;
}

function renderRoleSelect(uid, currentRole) {
  const options = roleOptions
    .map((role) => `<option value="${role}" ${role === currentRole ? "selected" : ""}>${role}</option>`)
    .join("");

  return `<select class="role-select" data-uid="${uid}" aria-label="Update user role">${options}</select>`;
}

function refreshDashboard() {
  const filtered = getFilteredComplaints();
  const data = filtered.map((item) => item.data);
  updateSummary(data);
  renderBarChart(categoryChart, data, (item) => item.category || "General", "No category data yet.");
  renderBarChart(statusChart, data, (item) => item.status || "Pending", "No status data yet.");
  renderBarChart(areaChart, data, (item) => item.area || item.town, "No area data yet.");
  renderBarChart(monthlyChart, data, (item) => {
    const date = item.createdAt ? new Date(item.createdAt) : null;
    return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "Unknown";
  }, "No monthly data yet.");
  renderResolutionMetric(data);
  renderComplaints(filtered);
}

function renderComplaints(complaints) {
  if (!complaints.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">No complaints submitted yet.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = complaints
    .map(({ key, data }) => `
      <tr>
        <td>
          <strong>${escapeHtml(data.complaintId || key)}</strong>
          <span>${escapeHtml(data.category || "General")}</span>
          <small>${Math.round((data.aiConfidence || 0) * 100)}% AI confidence</small>
        </td>
        <td>
          ${escapeHtml(data.issue || "")}
          <small>${escapeHtml(data.aiSummary || "")}</small>
          ${data.duplicateHint ? `<small>${escapeHtml(data.duplicateHint)}</small>` : ""}
          ${data.photoUrl ? `<a class="evidence-link" href="${escapeHtml(data.photoUrl)}" target="_blank" rel="noreferrer">View photo</a>` : ""}
        </td>
        <td>${escapeHtml(data.area || "")}, ${escapeHtml(data.town || "")}<br><small>${escapeHtml(data.district || "")}, ${escapeHtml(data.state || "")}</small></td>
        <td><span class="status-badge">${escapeHtml(data.status || "Pending")}</span></td>
        <td>${escapeHtml(data.priority || "Normal")}</td>
        <td>${escapeHtml(data.department || data.assignedTo || "General Helpdesk")}</td>
        <td>${formatDate(data.createdAt)}</td>
        <td>${renderStatusSelect(key, data.status || "Pending")}</td>
      </tr>
    `)
    .join("");
}

async function createNotification(complaint, status) {
  if (!complaint?.userId) return;

  await push(ref(db, `notifications/${complaint.userId}`), {
    complaintId: complaint.complaintId,
    message: `Your complaint is now ${status}.`,
    status,
    read: false,
    createdAt: Date.now()
  });
}

tableBody.addEventListener("change", async (event) => {
  if (!event.target.matches(".status-select")) return;

  if (staffSession.role !== "admin") {
    setAdminMessage("Only admins can update complaint status.", "error");
    return;
  }

  const key = event.target.dataset.key;
  const select = event.target;
  const complaint = allComplaints.find((item) => item.key === key)?.data;
  select.disabled = true;
  setAdminMessage("Updating complaint status...");

  try {
    if (key.startsWith("local:")) {
      updateLocalComplaint(key.replace("local:", ""), { status: select.value });
      allComplaints = allComplaints.map((item) => item.key === key
        ? { ...item, data: { ...item.data, status: select.value, updatedAt: Date.now() } }
        : item);
      refreshDashboard();
    } else {
      await update(ref(db, `complaints/${key}`), {
        status: select.value,
        updatedAt: Date.now(),
        resolvedAt: ["Resolved", "Feedback Submitted"].includes(select.value) ? Date.now() : null
      });
      await createNotification(complaint, select.value);
    }
    setAdminMessage("Status updated successfully.", "success");
  } catch (error) {
    console.error("Status update failed", error);
    setAdminMessage(`Status update failed: ${error.message || "Please check Firebase rules and internet connection."}`, "error");
  } finally {
    select.disabled = false;
  }
});

[adminSearch, statusFilter, categoryFilter, departmentFilter].forEach((control) => {
  control.addEventListener("input", refreshDashboard);
});

onValue(ref(db, "complaints"), (snapshot) => {
  const complaints = [];

  snapshot.forEach((child) => {
    complaints.push({
      key: child.key,
      data: child.val()
    });
  });

  getLocalComplaints().forEach((complaint) => {
    const existsInFirebase = complaints.some((item) => item.data.complaintId === complaint.complaintId);
    if (!existsInFirebase) {
      complaints.push({
        key: `local:${complaint.complaintId}`,
        data: complaint
      });
    }
  });

  complaints.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0));
  allComplaints = complaints;
  populateFilter(categoryFilter, allComplaints.map((item) => item.data.category || "General"), "All Categories");
  populateFilter(departmentFilter, allComplaints.map((item) => item.data.department || item.data.assignedTo || "General Helpdesk"), "All Departments");
  refreshDashboard();
});

if (staffSession.role === "admin") {
  onValue(ref(db, "users"), (snapshot) => {
    const users = [];
    snapshot.forEach((child) => {
      users.push({ uid: child.key, data: child.val() });
    });

    if (!users.length) {
      userTable.innerHTML = "<tr><td colspan=\"3\" class=\"empty-state\">No users found.</td></tr>";
      return;
    }

    userTable.innerHTML = users
      .sort((a, b) => (a.data.email || "").localeCompare(b.data.email || ""))
      .map(({ uid, data }) => `
        <tr>
          <td>
            <strong>${escapeHtml(data.email || uid)}</strong>
            <small>${escapeHtml(uid)}</small>
          </td>
          <td><span class="status-badge">${escapeHtml(data.role || "citizen")}</span></td>
          <td>${renderRoleSelect(uid, data.role || "citizen")}</td>
        </tr>
      `)
      .join("");
  });

  userTable.addEventListener("change", async (event) => {
    if (!event.target.matches(".role-select")) return;

    const uid = event.target.dataset.uid;
    const role = event.target.value;
    event.target.disabled = true;
    setAdminMessage("Updating user role...");

    try {
      await update(ref(db, `users/${uid}`), {
        role,
        updatedAt: Date.now()
      });
      setAdminMessage("User role updated successfully.", "success");
    } catch (error) {
      console.error("Role update failed", error);
      setAdminMessage(`Role update failed: ${error.message || "Please check database rules."}`, "error");
    } finally {
      event.target.disabled = false;
    }
  });
}
