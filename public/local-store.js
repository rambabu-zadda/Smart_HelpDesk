const STORAGE_KEY = "smart-helpdesk-complaints";

export function getLocalComplaints() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveLocalComplaint(complaint) {
  const complaints = getLocalComplaints();
  const existingIndex = complaints.findIndex((item) => item.complaintId === complaint.complaintId);

  if (existingIndex >= 0) {
    complaints[existingIndex] = complaint;
  } else {
    complaints.unshift(complaint);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
}

export function updateLocalComplaint(complaintId, updates) {
  const complaints = getLocalComplaints();
  const index = complaints.findIndex((item) => item.complaintId === complaintId);

  if (index === -1) return false;

  complaints[index] = {
    ...complaints[index],
    ...updates,
    updatedAt: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
  return true;
}

export function findLocalComplaint(complaintId) {
  return getLocalComplaints().find((item) => item.complaintId === complaintId) || null;
}
