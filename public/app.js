import { ref, push, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getDownloadURL, ref as storageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { db, storage } from "./firebase-config.js";
import { attachLogout, waitForUser } from "./auth-utils.js";
import { getLocalComplaints, saveLocalComplaint } from "./local-store.js";

const districtData = {
  "Andhra Pradesh": ["Anantapur", "Guntur", "Nellore"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai"],
  "Karnataka": ["Bengaluru", "Mysuru", "Hubballi"],
  "Maharashtra": ["Mumbai", "Pune", "Nagpur"]
};

const form = document.getElementById("complaintForm");
const stateSelect = document.getElementById("state");
const districtSelect = document.getElementById("district");
const locationStatus = document.getElementById("locationStatus");
const successPanel = document.getElementById("successPanel");
const complaintIdOutput = document.getElementById("complaintIdOutput");
const copyComplaintId = document.getElementById("copyComplaintId");
const issueInput = document.getElementById("issue");
const categorySelect = document.getElementById("category");
const charCounter = document.getElementById("charCounter");
const suggestedCategory = document.getElementById("suggestedCategory");
const suggestedPriority = document.getElementById("suggestedPriority");
const suggestedDepartment = document.getElementById("suggestedDepartment");
const previewLocation = document.getElementById("previewLocation");
const readinessScore = document.getElementById("readinessScore");
const previewIssue = document.getElementById("previewIssue");
const duplicateHint = document.getElementById("duplicateHint");
const issuePhoto = document.getElementById("issuePhoto");
const formMessage = document.getElementById("formMessage");
const submitButton = form.querySelector("button[type=\"submit\"]");
const trackStatusLink = document.getElementById("trackStatusLink");
const userEmail = document.getElementById("userEmail");
const logoutButton = document.getElementById("logoutButton");

let userLocation = null;
let latestComplaintId = "";
let currentUser = null;

const triageRules = [
  { category: "Water Supply", keywords: ["water", "tap", "pipe", "leak", "drinking"] },
  { category: "Electricity", keywords: ["light", "power", "electric", "wire", "transformer"] },
  { category: "Waste Management", keywords: ["garbage", "waste", "trash", "dump", "clean"] },
  { category: "Drainage", keywords: ["drain", "sewage", "gutter", "overflow", "stagnant"] },
  { category: "Roads", keywords: ["road", "pothole", "street", "traffic", "footpath"] },
  { category: "Public Safety", keywords: ["danger", "accident", "fire", "unsafe", "emergency"] }
];

const urgentKeywords = ["emergency", "danger", "fire", "accident", "unsafe", "injury", "overflow", "broken wire"];
const FIREBASE_TIMEOUT_MS = 8000;
const departmentMap = {
  Roads: "Public Works",
  "Water Supply": "Water Department",
  Electricity: "Electricity Board",
  "Waste Management": "Sanitation Team",
  Drainage: "Drainage Team",
  "Public Safety": "Safety Cell",
  Other: "General Helpdesk"
};

function setLocationMessage(message, tone = "muted") {
  locationStatus.textContent = message;
  locationStatus.className = `helper ${tone}`;
}

function setFormMessage(message, tone = "muted") {
  formMessage.textContent = message;
  formMessage.className = `helper ${tone}`;
}

function detectLocation() {
  if (!navigator.geolocation) {
    setLocationMessage("Location is not supported by this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      setLocationMessage("Location detected successfully.", "success");
    },
    () => {
      setLocationMessage("Location permission denied. You can still submit the complaint.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function loadDistricts() {
  const state = stateSelect.value;
  districtSelect.innerHTML = "<option value=\"\">Select District</option>";

  const districts = districtData[state] || (state ? ["Other / Not listed"] : []);

  districts.forEach((district) => {
    const option = document.createElement("option");
    option.value = district;
    option.textContent = district;
    districtSelect.appendChild(option);
  });

  if (districts.length === 1) {
    districtSelect.value = districts[0];
  }

  updatePreview();
}

function inferCategory(text) {
  const normalized = text.toLowerCase();
  const matchedRule = triageRules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)));
  return matchedRule?.category || "Other";
}

function inferPriority(text) {
  const normalized = text.toLowerCase();
  if (urgentKeywords.some((keyword) => normalized.includes(keyword))) return "High";
  if (normalized.length > 180) return "Medium";
  return "Normal";
}

function assignDepartment(category) {
  return departmentMap[category] || "General Helpdesk";
}

function summarizeIssue(text) {
  const trimmed = text.trim();
  if (!trimmed) return "No summary available.";
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function getDuplicateHint(text, area) {
  if (!text || text.length < 12) return "Add more issue details for duplicate detection.";

  const words = text.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const localMatches = getLocalComplaints().filter((complaint) => {
    const sameArea = area && complaint.area?.toLowerCase() === area.toLowerCase();
    const issueText = (complaint.issue || "").toLowerCase();
    const overlap = words.filter((word) => issueText.includes(word)).length;
    return sameArea && overlap >= 2;
  });

  return localMatches.length
    ? `Possible duplicate: ${localMatches[0].complaintId}`
    : "No local duplicate found.";
}

async function uploadIssuePhoto(complaintId) {
  const file = issuePhoto.files?.[0];
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Photo must be smaller than 5 MB.");
  }

  const extension = file.name.split(".").pop() || "jpg";
  const path = `complaints/${currentUser.uid}/${complaintId}.${extension}`;
  const photoRef = storageRef(storage, path);
  await withTimeout(
    uploadBytes(photoRef, file),
    FIREBASE_TIMEOUT_MS,
    "Firebase Storage did not respond in time. Complaint will be saved without a cloud photo."
  );
  return getDownloadURL(photoRef);
}

function updatePreview() {
  const issue = issueInput.value.trim();
  const category = issue ? inferCategory(issue) : "Waiting for details";
  const priority = issue ? inferPriority(issue) : "Normal";
  const department = assignDepartment(categorySelect.value || category);
  const completedFields = ["state", "district", "town", "area", "category", "issue"].filter((id) => getFormValue(id)).length;
  const readiness = Math.round((completedFields / 6) * 100);
  const town = getFormValue("town");
  const area = getFormValue("area");

  if (issue && !categorySelect.value && category !== "Other") {
    categorySelect.value = category;
  }

  charCounter.textContent = `${issueInput.value.length} / 500`;
  suggestedCategory.textContent = categorySelect.value || category;
  suggestedPriority.textContent = priority;
  suggestedDepartment.textContent = department;
  previewLocation.textContent = area || town ? [area, town].filter(Boolean).join(", ") : "Not selected";
  readinessScore.textContent = `${readiness}%`;
  duplicateHint.textContent = getDuplicateHint(issue, area);
  previewIssue.textContent = issue ? summarizeIssue(issue) : "Start typing the complaint details to see a quick summary.";
}

function getFormValue(id) {
  return document.getElementById(id).value.trim();
}

function buildComplaintId() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SCH-${datePart}-${randomPart}`;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function showSubmissionSuccess(complaint, message) {
  latestComplaintId = complaint.complaintId;
  complaintIdOutput.textContent = complaint.complaintId;
  trackStatusLink.href = `status.html?id=${encodeURIComponent(complaint.complaintId)}`;
  successPanel.hidden = false;
  form.reset();
  loadDistricts();
  updatePreview();
  setFormMessage(message, "success");
  successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function submitIssue(event) {
  event.preventDefault();
  setFormMessage("");

  const complaintId = buildComplaintId();
  const category = getFormValue("category");
  const issue = getFormValue("issue");
  const complaint = {
    complaintId,
    state: getFormValue("state"),
    district: getFormValue("district"),
    town: getFormValue("town"),
    area: getFormValue("area"),
    category,
    issue,
    userId: currentUser.uid,
    userEmail: currentUser.email,
    location: userLocation,
    status: "Pending",
    priority: inferPriority(issue),
    assignedTo: assignDepartment(category),
    department: assignDepartment(category),
    aiSummary: summarizeIssue(issue),
    aiConfidence: category === "Other" ? 0.52 : 0.82,
    duplicateHint: getDuplicateHint(issue, getFormValue("area")),
    photoUrl: "",
    photoPath: "",
    feedback: "",
    rating: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  if (!complaint.state || !complaint.district || !complaint.town || !complaint.area || !complaint.category || !complaint.issue) {
    setFormMessage("Please fill all required fields.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  setFormMessage("Submitting your complaint...", "muted");

  try {
    const uploadedPhotoUrl = await uploadIssuePhoto(complaint.complaintId);
    if (uploadedPhotoUrl) {
      complaint.photoUrl = uploadedPhotoUrl;
      complaint.photoPath = `complaints/${currentUser.uid}/${complaint.complaintId}`;
    }

    const complaintRef = push(ref(db, "complaints"));
    await withTimeout(
      set(complaintRef, complaint),
      FIREBASE_TIMEOUT_MS,
      "Firebase did not respond in time. Saved this complaint locally for demo/testing."
    );
    saveLocalComplaint({ ...complaint, source: "firebase" });
    showSubmissionSuccess(complaint, "Complaint submitted successfully.");
  } catch (error) {
    console.error("Complaint submission failed", error);
    saveLocalComplaint({ ...complaint, source: "local" });
    showSubmissionSuccess(
      complaint,
      `${error.message || "Firebase is unavailable."} You can still track this complaint on this browser.`
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Complaint";
  }
}

stateSelect.addEventListener("change", loadDistricts);
form.addEventListener("input", updatePreview);
form.addEventListener("change", updatePreview);
form.addEventListener("submit", submitIssue);
copyComplaintId.addEventListener("click", async () => {
  if (!latestComplaintId) return;
  await navigator.clipboard.writeText(latestComplaintId);
  copyComplaintId.textContent = "Copied";
  setTimeout(() => {
    copyComplaintId.textContent = "Copy ID";
  }, 1600);
});
detectLocation();
updatePreview();
attachLogout(logoutButton);

currentUser = await waitForUser();
if (!currentUser) {
  window.location.href = "login.html?redirect=complaint.html";
} else {
  userEmail.textContent = `Signed in as ${currentUser.email}`;
}
