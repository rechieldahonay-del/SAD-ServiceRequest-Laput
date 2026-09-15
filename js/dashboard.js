const db = supabaseClient;
const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let equipment = [];
let borrowingRequests = [];
let maintenanceRequests = [];

const roleNames = {
    admin: "Administrator",
    staff: "Laboratory Staff",
    requester: "Requester / Viewer"
};

function role() {
    return currentProfile?.role || "requester";
}

function isAdmin() {
    return role() === "admin";
}

function isStaffOrAdmin() {
    return ["staff", "admin"].includes(role());
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

function showMessage(message, isError = false) {
    const element = $("globalMessage");
    element.textContent = message;
    element.className = isError ? "notice error" : "notice success";
    window.setTimeout(() => {
        element.textContent = "";
        element.className = "notice";
    }, 5000);
}

function formatDate(value) {
    return value ? new Date(value).toLocaleString() : "-";
}

function formatDateInput(value) {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function setDueDateMinimum() {
    $("borrowingDueAt").min = formatDateInput(Date.now() + 5 * 60 * 1000);
}

async function requireUser() {
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) {
        window.location.href = "login.html";
        return null;
    }
    currentUser = data.user;
    return currentUser;
}

async function loadProfile() {
    const { data, error } = await db
        .from("profiles")
        .select("id, full_name, role, account_status, created_at")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (data) {
        currentProfile = data;
        return;
    }

    const { data: created, error: createError } = await db
        .rpc("ensure_my_profile");

    if (createError) {
        throw createError;
    }
    currentProfile = created;
}

function isAccountApproved() {
    return currentProfile?.account_status === "Approved";
}

function applyRoleVisibility() {
    $("roleBadge").textContent = roleNames[role()];
    document.querySelectorAll(".admin-only").forEach((element) => {
        element.classList.toggle("hidden", !isAdmin());
    });

    const allowed = {
        admin: ["overview", "borrowing", "equipment", "maintenance", "audit", "users"],
        staff: ["overview", "borrowing", "equipment", "maintenance"],
        requester: ["overview", "borrowing", "equipment"]
    }[role()];

    document.querySelectorAll(".nav-button").forEach((button) => {
        button.hidden = !allowed.includes(button.dataset.view);
    });

    const firstView = allowed.includes("overview") ? "overview" : allowed[0];
    showView(firstView);

    const capabilities = {
        admin: ["Approve or reject requests", "Release and process returns", "Manage equipment and users", "Review maintenance and audit logs"],
        staff: ["View equipment availability", "Release approved equipment", "Process returns", "Submit and track maintenance"],
        requester: ["View available equipment", "Submit borrowing requests", "Submit maintenance requests", "View your request history"]
    }[role()];
    $("roleCapabilities").innerHTML = capabilities.map((item) => `<p>${escapeHTML(item)}</p>`).join("");
}

function showView(viewName) {
    const button = document.querySelector(`.nav-button[data-view="${viewName}"]`);
    if (!button || button.hidden) {
        showMessage("Access denied for this role.", true);
        return;
    }
    document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.add("hidden"));
    $(`${viewName}View`).classList.remove("hidden");
    document.querySelectorAll(".nav-button").forEach((item) => item.classList.toggle("active", item === button));

    if (viewName === "audit" && isAdmin()) loadAuditLogs();
    if (viewName === "users" && isAdmin()) loadUsers();
}

async function loadEquipment() {
    const { data, error } = await db
        .from("equipment")
        .select("*")
        .order("asset_code");
    if (error) throw error;
    equipment = data || [];

    const available = equipment.filter((item) => item.status === "Available");
    $("borrowingEquipment").innerHTML = available.length
        ? available.map((item) => `<option value="${item.id}">${escapeHTML(item.asset_code)} - ${escapeHTML(item.name)}</option>`).join("")
        : `<option value="">No available equipment</option>`;
    $("borrowingEquipment").disabled = available.length === 0;
    $("submitBorrowingBtn").disabled = available.length === 0;
    $("submitBorrowingBtn").title = available.length === 0
        ? "No available equipment can be requested"
        : "Submit borrowing request for approval";
    $("maintenanceEquipment").innerHTML = equipment.filter((item) => item.status !== "Retired")
        .map((item) => `<option value="${item.id}">${escapeHTML(item.asset_code)} - ${escapeHTML(item.name)}</option>`).join("");

    $("equipmentTableBody").innerHTML = equipment.map((item) => `
        <tr>
            <td><strong>${escapeHTML(item.asset_code)}</strong></td>
            <td>${escapeHTML(item.name)}</td>
            <td>${escapeHTML(item.category)}</td>
            <td>${escapeHTML(item.location)}</td>
            <td><span class="status status-${item.status.toLowerCase()}">${escapeHTML(item.status)}</span></td>
            <td>${isAdmin() ? `<select class="equipment-status" data-id="${item.id}">
                ${["Available", "Borrowed", "Maintenance", "Retired"].map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}
            </select>` : "View only"}</td>
        </tr>
    `).join("") || `<tr><td colspan="6">No equipment registered.</td></tr>`;
}

async function loadBorrowingRequests() {
    const { data, error } = await db
        .from("borrowing_requests")
        .select("*, equipment(asset_code, name)")
        .order("created_at", { ascending: false });
    if (error) throw error;
    borrowingRequests = data || [];
    $("borrowingCount").textContent = `${borrowingRequests.length} request(s)`;
    $("borrowingTableBody").innerHTML = borrowingRequests.map((request) => {
        const actions = [`<button class="table-action" data-action="view-borrowing" data-id="${request.id}">View</button>`];
        if (isAdmin() && request.status === "Pending") {
            actions.push(`<button class="table-action" data-action="approve" data-id="${request.id}">Approve</button>`);
            actions.push(`<button class="table-action danger-text" data-action="reject" data-id="${request.id}">Reject</button>`);
        }
        if (isStaffOrAdmin() && request.status === "Approved") {
            actions.push(`<button class="table-action" data-action="release" data-id="${request.id}">Release</button>`);
        }
        if (isStaffOrAdmin() && ["Released", "Overdue"].includes(request.status)) {
            actions.push(`<button class="table-action" data-action="return" data-id="${request.id}">Process return</button>`);
        }
        if (isAdmin() && request.status === "Returned") {
            actions.push(`<button class="table-action" data-action="close" data-id="${request.id}">Close</button>`);
        }
        return `<tr data-borrowing-status="${escapeHTML(request.status)}">
            <td>${escapeHTML(request.equipment?.asset_code || "Unknown")}<small>${escapeHTML(request.equipment?.name || "")}</small></td>
            <td>${request.requester_id === currentUser.id ? "You" : escapeHTML(request.requester_id.slice(0, 8))}</td>
            <td>${formatDate(request.due_at)}</td>
            <td><span class="status">${escapeHTML(request.status)}</span></td>
            <td class="actions-cell">${actions.join(" ") || "-"}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="5">No borrowing requests found.</td></tr>`;

    const recent = borrowingRequests.slice(0, 5);
    $("recentBorrowingList").innerHTML = recent.map((request) => `<p><strong>${escapeHTML(request.equipment?.asset_code || "Equipment")}</strong><span>${escapeHTML(request.status)} · ${formatDate(request.created_at)}</span></p>`).join("") || "<p>No activity yet.</p>";
}

async function loadMaintenanceRequests() {
    const { data, error } = await db
        .from("maintenance_requests")
        .select("*, equipment(asset_code, name)")
        .order("created_at", { ascending: false });
    if (error) throw error;
    maintenanceRequests = data || [];
    $("maintenanceTableBody").innerHTML = maintenanceRequests.map((request) => `<tr>
        <td>${escapeHTML(request.equipment?.asset_code || "Unknown")}</td>
        <td>${escapeHTML(request.issue)}</td>
        <td>${request.requester_id === currentUser.id ? "You" : escapeHTML(request.requester_id.slice(0, 8))}</td>
        <td><span class="status">${escapeHTML(request.status)}</span></td>
        <td>${isStaffOrAdmin() ? `<select class="maintenance-status" data-id="${request.id}">
            ${["Submitted", "In Progress", "Completed", "Cancelled"].map((status) => `<option ${status === request.status ? "selected" : ""}>${status}</option>`).join("")}
        </select>` : "View only"}</td>
    </tr>`).join("") || `<tr><td colspan="5">No maintenance requests found.</td></tr>`;
}

async function loadOverview() {
    const [equipmentResult, borrowingResult, maintenanceResult] = await Promise.all([
        db.from("equipment").select("id, status"),
        db.from("borrowing_requests").select("id, status"),
        db.from("maintenance_requests").select("id, status")
    ]);
    const errors = [equipmentResult, borrowingResult, maintenanceResult].map((result) => result.error).filter(Boolean);
    if (errors.length) throw errors[0];
    const equipmentRows = equipmentResult.data || [];
    const borrowingRows = borrowingResult.data || [];
    const maintenanceRows = maintenanceResult.data || [];
    const cards = [
        ["Available equipment", equipmentRows.filter((item) => item.status === "Available").length],
        ["Borrowed equipment", equipmentRows.filter((item) => item.status === "Borrowed").length],
        ["Pending approvals", borrowingRows.filter((item) => item.status === "Pending").length],
        ["Open maintenance", maintenanceRows.filter((item) => !["Completed", "Cancelled"].includes(item.status)).length]
    ];
    $("summaryGrid").innerHTML = cards.map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

async function loadAuditLogs() {
    const { data, error } = await db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    $("auditTableBody").innerHTML = (data || []).map((log) => `<tr><td>${formatDate(log.created_at)}</td><td><strong>${escapeHTML(log.action)}</strong></td><td>${escapeHTML(log.module)}</td><td>${escapeHTML(log.record_id)}</td><td>${escapeHTML(log.description)}</td></tr>`).join("") || `<tr><td colspan="5">No audit entries found.</td></tr>`;
}

async function loadUsers() {
    const { data, error } = await db.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    $("usersTableBody").innerHTML = (data || []).map((profile) => `<tr>
        <td>${escapeHTML(profile.full_name || "Unnamed")}</td><td>${escapeHTML(profile.id.slice(0, 12))}</td>
        <td><select class="user-role" data-id="${profile.id}">${["admin", "staff", "requester"].map((item) => `<option value="${item}" ${item === profile.role ? "selected" : ""}>${roleNames[item]}</option>`).join("")}</select></td>
        <td><span class="status">${escapeHTML(profile.account_status || "Pending")}</span></td>
        <td>${formatDate(profile.created_at)}</td>
        <td>${profile.account_status === "Pending" ? `<button class="table-action" data-action="approve-user" data-id="${profile.id}">Accept</button><button class="table-action danger-text" data-action="reject-user" data-id="${profile.id}">Reject</button>` : "-"}</td>
    </tr>`).join("") || `<tr><td colspan="6">No users found.</td></tr>`;

    const { data: invites, error: inviteError } = await db.from("user_invites").select("*").order("created_at", { ascending: false });
    if (inviteError) throw inviteError;
    $("invitesTableBody").innerHTML = (invites || []).map((invite) => `<tr><td>${escapeHTML(invite.email)}</td><td>${escapeHTML(roleNames[invite.requested_role])}</td><td>${escapeHTML(invite.status)}</td><td>${formatDate(invite.created_at)}</td></tr>`).join("") || `<tr><td colspan="4">No invites found.</td></tr>`;
}

async function callWorkflow(functionName, args) {
    const { error } = await db.rpc(functionName, args);
    if (error) throw error;
    showMessage("Operation completed and recorded in the audit log.");
    await refreshAll();
}

async function refreshAll() {
    if (isStaffOrAdmin()) {
        const { error } = await db.rpc("mark_overdue_borrowing_requests");
        if (error) throw error;
    }
    await Promise.all([loadEquipment(), loadBorrowingRequests(), loadMaintenanceRequests(), loadOverview()]);
    if (isAdmin()) {
        await Promise.all([loadAuditLogs(), loadUsers()]);
    }
}

$("mainNav").addEventListener("click", (event) => {
    const button = event.target.closest(".nav-button");
    if (button) showView(button.dataset.view);
});

$("logoutBtn").addEventListener("click", async () => {
    await db.auth.signOut();
    window.location.href = "login.html";
});

$("refreshOverviewBtn").addEventListener("click", () => refreshAll().catch((error) => showMessage(error.message, true)));

$("borrowingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = $("submitBorrowingBtn");
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
    const equipmentId = Number($("borrowingEquipment").value);
    const selected = equipment.find((item) => item.id === equipmentId);
    if (!selected || selected.status !== "Available") {
        showMessage("Only available equipment may be requested.", true);
        submitButton.disabled = false;
        submitButton.textContent = "Submit for approval";
        return;
    }
    const dueAt = new Date($("borrowingDueAt").value);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now() + 60 * 1000) {
        showMessage("Choose a return date at least one minute in the future.", true);
        submitButton.disabled = false;
        submitButton.textContent = "Submit for approval";
        return;
    }
    const { error } = await db.from("borrowing_requests").insert({
        equipment_id: equipmentId,
        requester_id: currentUser.id,
        purpose: $("borrowingPurpose").value.trim(),
        due_at: dueAt.toISOString()
    });
    if (error) {
        showMessage(error.message, true);
        submitButton.disabled = false;
        submitButton.textContent = "Submit for approval";
    } else {
        $("borrowingForm").reset();
        showMessage("Borrowing request submitted as Pending.");
        submitButton.textContent = "Submit for approval";
        await refreshAll();
    }
});

$("borrowingStatusFilter").addEventListener("change", (event) => {
    const selectedStatus = event.target.value;
    document.querySelectorAll("#borrowingTableBody tr[data-borrowing-status]").forEach((row) => {
        row.hidden = Boolean(selectedStatus && row.dataset.borrowingStatus !== selectedStatus);
    });
});

$("equipmentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
        showMessage("Only administrators may add equipment.", true);
        return;
    }

    const submitButton = $("addEquipmentBtn");
    const assetCode = $("assetCode").value.trim().toUpperCase();
    const equipmentName = $("equipmentName").value.trim();
    const equipmentCategory = $("equipmentCategory").value.trim();
    if (!assetCode || !equipmentName || !equipmentCategory) {
        showMessage("Asset code, equipment name, and category are required.", true);
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Adding...";
    const { error } = await db.from("equipment").insert({
        asset_code: assetCode,
        name: equipmentName,
        category: equipmentCategory,
        location: $("equipmentLocation").value.trim(),
        description: $("equipmentDescription").value.trim()
    });
    if (error) {
        const message = error.code === "23505"
            ? "That asset code already exists. Use a unique code."
            : error.message;
        showMessage(message, true);
        submitButton.disabled = false;
        submitButton.textContent = "Add equipment";
    } else {
        $("equipmentForm").reset();
        showMessage("Equipment added.");
        submitButton.disabled = false;
        submitButton.textContent = "Add equipment";
        await refreshAll();
    }
});

$("maintenanceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { error } = await db.from("maintenance_requests").insert({
        equipment_id: Number($("maintenanceEquipment").value), requester_id: currentUser.id, issue: $("maintenanceIssue").value.trim()
    });
    if (error) showMessage(error.message, true);
    else {
        $("maintenanceForm").reset();
        showMessage("Maintenance request submitted.");
        await refreshAll();
    }
});

$("userInviteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) {
        showMessage("Only administrators may add users.", true);
        return;
    }
    const { error } = await db.rpc("create_user_invite", {
        p_email: $("inviteEmail").value.trim(),
        p_role: $("inviteRole").value
    });
    if (error) {
        showMessage(error.message, true);
        return;
    }
    $("userInviteForm").reset();
    showMessage("User invite added. The user must register with this email, then an administrator can accept the account.");
    await loadUsers();
});

document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = Number(button.dataset.id);
    try {
        if (button.dataset.action === "approve") await callWorkflow("approve_borrowing_request", { p_request_id: id });
        if (button.dataset.action === "reject") await callWorkflow("reject_borrowing_request", { p_request_id: id, p_reason: prompt("Reason for rejection:") || "" });
        if (button.dataset.action === "release") await callWorkflow("release_borrowing_request", { p_request_id: id });
        if (button.dataset.action === "return") await callWorkflow("return_borrowing_request", { p_request_id: id, p_condition: prompt("Condition on return: Good or Damaged", "Good") || "Good" });
        if (button.dataset.action === "close") await callWorkflow("close_borrowing_request", { p_request_id: id });
        if (button.dataset.action === "view-borrowing") {
            const request = borrowingRequests.find((item) => item.id === id);
            if (request) {
                showMessage(`Request #${request.id}: ${request.status} | ${request.purpose} | Due ${formatDate(request.due_at)}`);
            }
        }
        if (button.dataset.action === "approve-user" || button.dataset.action === "reject-user") {
            if (!isAdmin()) throw new Error("Only administrators may approve users.");
            const accountStatus = button.dataset.action === "approve-user" ? "Approved" : "Rejected";
            const { error } = await db.from("profiles").update({ account_status: accountStatus }).eq("id", id);
            if (error) throw error;
            showMessage(`User account ${accountStatus.toLowerCase()}.`);
            await loadUsers();
        }
    } catch (error) {
        showMessage(error.message, true);
    }
});

document.addEventListener("change", async (event) => {
    try {
        if (event.target.matches(".equipment-status")) {
            if (!isAdmin()) throw new Error("Only administrators may manage equipment.");
            const { error } = await db.from("equipment").update({ status: event.target.value, updated_at: new Date().toISOString() }).eq("id", event.target.dataset.id);
            if (error) throw error;
            showMessage("Equipment status updated.");
            await refreshAll();
        }
        if (event.target.matches(".maintenance-status")) {
            if (!isStaffOrAdmin()) throw new Error("Access denied.");
            const { error } = await db.from("maintenance_requests").update({ status: event.target.value, completed_at: event.target.value === "Completed" ? new Date().toISOString() : null }).eq("id", event.target.dataset.id);
            if (error) throw error;
            showMessage("Maintenance status updated.");
            await refreshAll();
        }
        if (event.target.matches(".user-role")) {
            if (!isAdmin()) throw new Error("Only administrators may manage users.");
            const { error } = await db.from("profiles").update({ role: event.target.value }).eq("id", event.target.dataset.id);
            if (error) throw error;
            showMessage("User role updated. The user must sign in again if their session needs refreshing.");
            await loadUsers();
        }
    } catch (error) {
        showMessage(error.message, true);
    }
});

(async function initialize() {
    try {
        const user = await requireUser();
        if (!user) return;
        await loadProfile();
        if (!isAccountApproved()) {
            showMessage("Your account is pending administrator approval.", true);
            await db.auth.signOut();
            window.setTimeout(() => { window.location.href = "login.html"; }, 1200);
            return;
        }
        applyRoleVisibility();
        setDueDateMinimum();
        await refreshAll();
    } catch (error) {
        showMessage(error.message || "Unable to load the dashboard.", true);
    }
})();
