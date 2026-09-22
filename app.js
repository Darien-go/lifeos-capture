(() => {
  "use strict";
  const labels = { mood: "Mood", meal: "Meals", habit: "Habit", task: "Task", note: "Quick note", journal: "Journal", english: "English", workout: "Workout", sleep: "Sleep", nap: "Nap" };
  const types = ["mood", "meal", "habit", "task", "note", "journal", "english", "workout", "sleep", "nap"];
  const protocol = self.LifeOSOfflineProtocol;
  const { BundleSyncTransport, DirectLocalSyncTransport } = self.LifeOSSyncTransports;
  const { secureUuid, initializeCaptureRuntime } = self.LifeOSCaptureRuntime;
  const bundleTransport = new BundleSyncTransport();
  let activeTab = "mood";
  let toastTimer;
  const $ = selector => document.querySelector(selector);
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const uuid = secureUuid;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const { open: openDb, get, all, put, remove, clearBatch } = self.LifeOSCaptureStore;
  async function getDeviceId() { let row = await get("state", "deviceId"); if (!row) { row = { key: "deviceId", value: uuid() }; await put("state", row); } return row.value; }
  function diagnostic(id, state, detail = "") { const node = $(`#diagnostic-${id}`); if (node) { node.textContent = detail ? `${state} · ${detail}` : state; node.dataset.state = state.toLowerCase().replaceAll(" ", "-"); } }
  function showInitializationError(label, error) { const message = error instanceof Error ? error.message : String(error); $("#connection").textContent = `${label}: ${message}`; $("#connection").classList.add("offline"); toast(`${label}: ${message}`); }
  async function addEvent(type, payload, occurredAt = new Date()) {
    const now = new Date().toISOString();
    const event = { id: uuid(), deviceId: await getDeviceId(), type, payload, occurredAt: occurredAt.toISOString(), createdAt: now, version: 1 };
    await put("events", event); await renderQueue(); toast("Saved on this device.");
  }
  function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2600); }
  function field(label, name, kind = "text", options = {}) {
    const full = options.full ? " full" : "";
    if (kind === "textarea") return `<label class="field${full}">${esc(label)}<textarea name="${esc(name)}" ${options.required ? "required" : ""} maxlength="${options.max || 10000}" placeholder="${esc(options.placeholder || "")}"></textarea></label>`;
    if (kind === "select") return `<label class="field${full}">${esc(label)}<select name="${esc(name)}">${options.options.map(item => { const option = typeof item === "string" ? { value: item, label: item } : item; return `<option value="${esc(option.value)}">${esc(option.label)}</option>`; }).join("")}</select></label>`;
    if (kind === "check") return `<label class="field check-field${full}"><input name="${esc(name)}" type="checkbox" ${options.checked ? "checked" : ""}>${esc(label)}</label>`;
    return `<label class="field${full}">${esc(label)}<input name="${esc(name)}" type="${esc(kind)}" ${options.required ? "required" : ""} ${options.min != null ? `min="${esc(options.min)}"` : ""} ${options.max != null ? `max="${esc(options.max)}"` : ""} ${options.step ? `step="${esc(options.step)}"` : ""} value="${esc(options.value ?? "")}" placeholder="${esc(options.placeholder || "")}"></label>`;
  }
  function options(list, fallback) { return (list?.length ? list : fallback).map(value => ({ value, label: value })); }
  function formFor(tab, profile) {
    const habitOptions = (profile?.habits || []).map(habit => ({ value: habit.id, label: habit.name }));
    let fields = "";
    if (tab === "mood") fields = field("Score · 1–10", "score", "number", { min: 1, max: 10, value: 7, required: true }) + field("Tags · comma separated", "tags", "text", { placeholder: "Calm, focused" }) + field("Note · optional", "note", "textarea", { full: true, placeholder: "A few words, if useful…", max: 10000 });
    if (tab === "meal") fields = field("Date", "date", "date", { value: localDate(), required: true }) + field("Meal", "field", "select", { options: [{ value: "breakfast", label: "Breakfast" }, { value: "lunch", label: "Lunch" }, { value: "dinner", label: "Dinner" }, { value: "snackCount", label: "Snack count" }] }) + `<label class="field check-field" id="meal-toggle"><input name="value" type="checkbox" checked>Mark this meal complete</label><label class="field hidden" id="snack-count">Snack count<input name="valueCount" type="number" min="0" max="100" step="1" value="0"></label>`;
    if (tab === "habit") fields = field("Habit", "habitId", "select", { options: habitOptions.length ? habitOptions : [{ value: "", label: "Import a Capture Profile first" }] }) + field("Date", "date", "date", { value: localDate(), required: true });
    if (tab === "task") fields = field("Title", "title", "text", { full: true, required: true, max: 300 }) + field("Due date · optional", "dueDate", "date") + field("Priority", "priority", "select", { options: ["low", "medium", "high"] }) + field("Description · optional", "description", "textarea", { full: true, max: 10000 });
    if (tab === "note") fields = field("Title · optional", "title", "text", { full: true, max: 300 }) + field("Content", "content", "textarea", { full: true, required: true, max: 100000 }) + field("Tags · comma separated", "tags", "text", { full: true });
    if (tab === "journal") fields = field("Date", "date", "date", { value: localDate(), required: true }) + field("Mood · optional", "mood", "number", { min: 1, max: 10 }) + field("Title · optional", "title", "text", { full: true, max: 300 }) + field("Content", "content", "textarea", { full: true, required: true, max: 100000 }) + field("Tags · comma separated", "tags", "text", { full: true });
    if (["english", "workout", "sleep", "nap"].includes(tab)) fields = `<p class="hint full">Start a local timer now. Finish time is captured from the device clock; LifeOS recalculates duration from these timestamps during import.</p>`;
    const action = ["english", "workout", "sleep", "nap"].includes(tab) ? `<button class="button primary" type="button" id="start-timer">Start ${esc(labels[tab])}</button>` : `<button class="button primary" type="submit">Save ${esc(labels[tab])}</button>`;
    return `<form id="capture-form"><div class="form-grid">${fields}</div><div class="actions">${action}</div></form>`;
  }
  async function renderForm() {
    const profile = await get("state", "profile");
    $("#tabs").innerHTML = types.map(type => `<button type="button" class="tab ${type === activeTab ? "active" : ""}" data-tab="${type}">${esc(labels[type])}</button>`).join("");
    $("#form-area").innerHTML = formFor(activeTab, profile?.value);
    $("#tabs").querySelectorAll("button").forEach(button => button.addEventListener("click", () => { activeTab = button.dataset.tab; renderForm(); }));
    $("#capture-form").addEventListener("submit", saveForm);
    if (activeTab === "meal") $("#capture-form [name=field]").addEventListener("change", event => { const snacks = event.target.value === "snackCount"; $("#meal-toggle").classList.toggle("hidden", snacks); $("#snack-count").classList.toggle("hidden", !snacks); });
    $("#start-timer")?.addEventListener("click", startTimer);
  }
  const splitTags = value => value.split(",").map(item => item.trim()).filter(Boolean).slice(0, 20);
  function valueOf(form, name) { return new FormData(form).get(name)?.toString().trim() || ""; }
  async function saveForm(event) {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const date = valueOf(form, "date");
    switch (activeTab) {
      case "mood": await addEvent("mood.log", { score: Number(valueOf(form, "score")), tags: splitTags(valueOf(form, "tags")), note: valueOf(form, "note") || undefined }); break;
      case "meal": {
        const fieldName = valueOf(form, "field");
        const value = fieldName === "snackCount" ? Number(valueOf(form, "valueCount")) : form.elements.namedItem("value").checked;
        if (fieldName === "snackCount" && (!Number.isInteger(value) || value < 0 || value > 100)) { toast("Snack count must be a whole number from 0–100."); return; }
        await addEvent("meal.update", { date, field: fieldName, value }); break;
      }
      case "habit": if (!valueOf(form, "habitId")) { toast("Import a current Capture Profile first."); return; } await addEvent("habit.complete", { habitId: valueOf(form, "habitId"), date }); break;
      case "task": await addEvent("task.create", { title: valueOf(form, "title"), description: valueOf(form, "description") || undefined, dueDate: valueOf(form, "dueDate") || undefined, priority: valueOf(form, "priority") || undefined }); break;
      case "note": await addEvent("note.create", { title: valueOf(form, "title") || undefined, content: valueOf(form, "content"), tags: splitTags(valueOf(form, "tags")) }); break;
      case "journal": await addEvent("journal.create", { date, title: valueOf(form, "title") || undefined, content: valueOf(form, "content"), mood: valueOf(form, "mood") ? Number(valueOf(form, "mood")) : undefined, tags: splitTags(valueOf(form, "tags")) }); break;
    }
    if (!["english", "workout", "sleep", "nap"].includes(activeTab)) { form.reset(); if (form.elements.date) form.elements.date.value = localDate(); }
  }
  async function startTimer() {
    const existing = await get("state", "activeTimer");
    if (existing) { toast("A timer is already running. Finish it before starting another."); return; }
    const startedAt = new Date().toISOString();
    const timer = { key: "activeTimer", value: { kind: activeTab, startedAt, metadata: {} } };
    await put("state", timer); await renderTimer(); toast(`${labels[activeTab]} timer started.`);
  }
  async function finishTimer() {
    const row = await get("state", "activeTimer"); if (!row) return;
    const timer = row.value; const endedAt = new Date().toISOString();
    if (Date.parse(endedAt) <= Date.parse(timer.startedAt)) { toast("Device time must be later than the start time."); return; }
    const fields = timer.kind === "english" ? `<h3>Finish English</h3>${field("Course name", "courseName", "text", { value: "English", max: 300 })}${field("Category", "category", "select", { options: ["course", "listening", "speaking", "reading", "vocabulary", "writing", "youtube", "podcast", "other"] })}${field("Note · optional", "note", "textarea")}`
      : timer.kind === "workout" ? `<h3>Finish workout</h3>${field("Body part", "bodyPart", "select", { options: options((await get("state", "profile"))?.value?.workoutBodyParts, ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio", "Other"]) })}${field("Quality · optional", "quality", "number", { min: 1, max: 5 })}${field("Note · optional", "note", "textarea")}`
      : `<h3>Finish ${esc(timer.kind)}</h3>${field("Quality · optional", "quality", "number", { min: 1, max: 5 })}${field("Note · optional", "note", "textarea")}`;
    $("#finish-fields").innerHTML = fields;
    const dialog = $("#finish-dialog"); dialog.showModal();
    $("#finish-save").onclick = async click => {
      click.preventDefault(); const form = $("#finish-form");
      if (!form.reportValidity()) return;
      const numberOpt = key => valueOf(form, key) ? Number(valueOf(form, key)) : undefined;
      let type, payload;
      if (timer.kind === "english") { type = "english.session"; payload = { startedAt: timer.startedAt, endedAt, courseName: valueOf(form, "courseName") || "English", category: valueOf(form, "category") || undefined, note: valueOf(form, "note") || undefined }; }
      else if (timer.kind === "workout") { type = "workout.session"; payload = { startedAt: timer.startedAt, endedAt, bodyPart: valueOf(form, "bodyPart"), quality: numberOpt("quality"), note: valueOf(form, "note") || undefined }; }
      else { type = "sleep.session"; payload = { kind: timer.kind, startedAt: timer.startedAt, endedAt, quality: numberOpt("quality"), note: valueOf(form, "note") || undefined }; }
      await addEvent(type, payload, new Date(endedAt)); await remove("state", "activeTimer"); dialog.close(); await renderTimer();
    };
  }
  async function renderTimer() {
    const row = await get("state", "activeTimer"); const panel = $("#timer-panel");
    if (!row) { panel.classList.add("hidden"); panel.innerHTML = ""; return; }
    panel.classList.remove("hidden"); const timer = row.value; const elapsed = Math.max(0, Date.now() - Date.parse(timer.startedAt)); const time = new Date(elapsed).toISOString().slice(11, 19);
    const finishLabel = timer.kind === "sleep" ? "Wake Up" : timer.kind === "nap" ? "Finish Nap" : "Finish";
    panel.innerHTML = `<div class="timer-inner"><div><div class="timer-type">${esc(labels[timer.kind])} · in progress</div><div class="timer-clock">${time}</div><div class="event-meta">Started ${esc(new Date(timer.startedAt).toLocaleString())} · stored locally</div></div><button id="finish-timer" class="button primary">${finishLabel}</button></div>`;
    $("#finish-timer").addEventListener("click", finishTimer);
  }
  function summarize(event) {
    const p = event.payload;
    if (event.type === "mood.log") return `Mood ${p.score}/10`;
    if (event.type === "meal.update") return `${p.field} · ${p.date}`;
    if (event.type === "habit.complete") return `Habit · ${p.date}`;
    if (event.type === "task.create") return p.title;
    if (event.type === "note.create" || event.type === "journal.create") return p.title || p.content.split(/\r?\n/)[0];
    if (event.type === "english.session") return `${p.courseName || "English"} · ${duration(p)}`;
    if (event.type === "workout.session") return `${p.bodyPart} · ${duration(p)}`;
    if (event.type === "sleep.session") return `${p.kind} · ${duration(p)}`;
    return event.type;
  }
  function duration(payload) { return `${Math.max(0, Math.round((Date.parse(payload.endedAt) - Date.parse(payload.startedAt)) / 60000))} min`; }
  async function renderQueue() {
    const events = (await all("events")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#pending-count").textContent = String(events.length);
    diagnostic("pending", String(events.length));
    $("#queue").innerHTML = events.length ? events.map(item => `<article class="queue-item"><div class="min-w-0"><div class="event-title">${esc(summarize(item)).slice(0, 160)}</div><div class="event-meta">${esc(item.type)} · ${esc(new Date(item.occurredAt).toLocaleString())}</div></div><button class="delete" data-delete="${esc(item.id)}">Remove</button></article>`).join("") : `<p class="hint">Nothing waiting. Captures you make offline will appear here.</p>`;
    $("#queue").querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", async () => { if (confirm("Remove this pending capture from this device?")) { await remove("events", button.dataset.delete); await renderQueue(); toast("Capture removed."); } }));
    await renderBatches();
  }
  async function exportBundle() {
    const events = (await all("events")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!events.length) { toast("There are no pending captures to export."); return; }
    if (events.length > 500) { toast("A sync bundle can contain at most 500 captures. Export, sync, then export the remainder."); return; }
    const deviceId = await getDeviceId(); let bundle;
    try { bundle = bundleTransport.createBundle(events, deviceId); } catch (error) { toast(error.message); return; }
    const { batchId, exportedAt } = bundle.meta;
    const batch = { batchId, eventIds: events.map(item => item.id), exportedAt, eventCount: events.length };
    await put("batches", batch);
    downloadJson(bundle, `lifeos-sync-${stamp(new Date())}.json`);
    await renderBatches(); toast("Bundle exported. Import it in LifeOS → Settings → Data.");
  }
  function stamp(date) { return `${localDate(date)}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`; }
  function downloadJson(data, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
  async function renderBatches() {
    const batches = (await all("batches")).sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
    $("#batch-area").innerHTML = batches.length ? batches.map(batch => `<div class="batch-item"><span class="event-meta">Batch ${esc(batch.batchId.slice(0, 8))} · ${batch.eventCount} captures · ${esc(new Date(batch.exportedAt).toLocaleString())}</span></div>`).join("") : "";
    $("#manual-batch").innerHTML = batches.length ? batches.map(batch => `<option value="${esc(batch.batchId)}">${esc(new Date(batch.exportedAt).toLocaleString())} · ${batch.eventCount} captures · ${esc(batch.batchId.slice(0, 8))}</option>`).join("") : `<option value="">No exported batches</option>`;
    $("#manual-confirm").disabled = !batches.length;
  }
  async function parseFile(file) { if (!file || file.size > 2 * 1024 * 1024) throw new Error("Choose a JSON file smaller than 2 MB."); return JSON.parse(await file.text()); }
  async function importProfile(file) {
    try { const profile = await parseFile(file); if (!protocol.validProfile(profile)) throw new Error("This is not a valid LifeOS Capture Profile."); await put("state", { key: "profile", value: profile }); await renderForm(); $("#profile-status").textContent = `${profile.habits.length} active habits · profile from ${new Date(profile.generatedAt).toLocaleString()}.`; toast("Capture profile imported."); }
    catch (error) { toast(error.message || "Unable to import profile."); }
    finally { $("#profile-file").value = ""; }
  }
  async function importReceipt(file) {
    try {
      const receipt = await parseFile(file);
      if (!protocol.validReceipt(receipt)) throw new Error("This is not a successful LifeOS import receipt.");
      const batch = await get("batches", receipt.meta.batchId); const device = await getDeviceId();
      if (!batch || !protocol.receiptMatchesBatch(receipt, batch, device)) throw new Error("Receipt does not match this exported batch and device; nothing was removed.");
      await clearBatch(batch);
      await renderQueue(); toast(`Confirmed ${batch.eventCount} synced captures.`);
    } catch (error) { toast(error.message || "Unable to import receipt."); }
    finally { $("#receipt-file").value = ""; }
  }
  async function markBatch() {
    const batch = await get("batches", $("#manual-batch").value); if (!batch) return;
    if (!confirm(`Only mark this batch synced after LifeOS confirms import.\n\nRemove ${batch.eventCount} local captures from this device?`)) return;
    const answer = prompt("Type SYNCED to confirm the LifeOS import was successful."); if (answer !== "SYNCED") { toast("Batch kept pending."); return; }
    await clearBatch(batch);
    await renderQueue(); toast("Batch marked synced.");
  }
  async function pairingState() { return (await get("state", "localSync"))?.value || null; }
  async function savePairing(value) { await put("state", { key: "localSync", value }); }
  function directTransport(state) { return new DirectLocalSyncTransport(state.hostUrl, state.syncToken); }
  async function setComputerStatus(message, available = false) {
    $("#computer-status").textContent = message;
    $("#computer-status").classList.toggle("warning", !available);
    $("#sync-now").disabled = !available;
    diagnostic("computer", available ? "Available" : "Unavailable");
  }
  async function checkComputer({ retry = true, auto = false } = {}) {
    const state = await pairingState();
    if (!state) { await setComputerStatus("Not paired · sync bundles remain available."); return false; }
    try {
      const health = await directTransport(state).health(retry ? 3 : 1);
      if (health.serverId !== state.serverId) { await setComputerStatus("A different LifeOS installation answered. Pair again before syncing."); return false; }
      state.lastSeenAt = new Date().toISOString(); await savePairing(state);
      const pending = (await all("events")).length; const last = state.lastSyncAt ? ` · last sync ${new Date(state.lastSyncAt).toLocaleString()}` : "";
      await setComputerStatus(`Computer available · ${pending ? `${pending} pending` : "all synced"}${last}`, true);
      $("#open-lifeos").href = `${state.hostUrl}/today`; $("#open-lifeos").classList.remove("hidden");
      if (auto && $("#auto-sync").checked && (await all("events")).length) await beginDirectSync(true);
      return true;
    } catch (error) {
      const browserBlocked = isSecureContext && state.hostUrl.startsWith("http:");
      const pending = (await all("events")).length;
      const network = !navigator.onLine ? "Computer unavailable · this device is offline" : browserBlocked ? "Direct sync unavailable in this browser · use Sync Bundle" : "Computer unavailable; its address may have changed";
      await setComputerStatus(`${network} · ${pending} pending. Your captures are safe on this device and can be synced later.${error.message ? ` ${error.message}` : ""}`);
      return false;
    }
  }
  async function buildPendingBundle() {
    const events = (await all("events")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!events.length) throw new Error("There are no pending captures to sync.");
    if (events.length > 500) throw new Error("Direct sync supports at most 500 captures at a time.");
    const bundle = bundleTransport.createBundle(events, await getDeviceId());
    const batch = { batchId: bundle.meta.batchId, eventIds: events.map(item => item.id), exportedAt: bundle.meta.exportedAt, eventCount: events.length };
    await put("batches", batch); return { bundle, batch };
  }
  async function beginDirectSync(auto = false) {
    const button = $("#sync-now"); button.disabled = true;
    try {
      const state = await pairingState(); if (!state) throw new Error("Pair this device first.");
      const { bundle, batch } = await buildPendingBundle(); const transport = directTransport(state); const preview = await transport.preview(bundle);
      const panel = $("#sync-preview"); panel.classList.remove("hidden");
      panel.innerHTML = `<h3>Review direct sync</h3><p>${preview.eventCount} captures · ${preview.new} new · ${preview.alreadyProcessed} already processed · ${preview.invalid} invalid</p><p>${esc(Object.entries(preview.counts).map(([key,value]) => `${key}: ${value}`).join(" · ") || "No new records")}</p><div class="actions"><button id="cancel-direct" class="button secondary">Keep pending</button><button id="confirm-direct" class="button primary">Confirm sync</button></div>`;
      const commit = async () => {
        $("#confirm-direct").disabled = true;
        try {
          const result = await transport.commit(bundle);
          if (!protocol.receiptMatchesBatch(result.receipt, batch, await getDeviceId())) throw new Error("LifeOS returned a receipt that does not exactly match this batch; captures were kept.");
          await clearBatch(batch); state.lastSyncAt = new Date().toISOString(); await savePairing(state); panel.classList.add("hidden"); await renderQueue(); toast(`Synced ${batch.eventCount} captures to LifeOS.`);
        } catch (error) { toast(`${error.message || "Sync failed."} Captures remain on this device.`); $("#confirm-direct").disabled = false; }
      };
      $("#cancel-direct").onclick = () => panel.classList.add("hidden"); $("#confirm-direct").onclick = commit;
      if (auto) await commit();
    } catch (error) { toast(error.message || "Unable to sync. Captures remain on this device."); }
    finally { button.disabled = false; }
  }
  async function pairComputer(event) {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    const submit = $("#pair-save"); submit.disabled = true;
    try {
      const hostUrl = valueOf(form, "hostUrl"); const serverId = valueOf(form, "serverId"); const code = valueOf(form, "code"); const existing = await pairingState(); const transport = new DirectLocalSyncTransport(hostUrl); const health = await transport.health(1);
      if (health.serverId !== serverId) throw new Error("Server ID does not match the LifeOS computer at this address.");
      if (!code) {
        if (!existing?.syncToken || existing.serverId !== serverId) throw new Error("Enter a fresh pairing code for this LifeOS installation.");
        await savePairing({ ...existing, hostUrl: transport.hostUrl, lastSeenAt: new Date().toISOString() });
        $("#pair-dialog").close(); toast("Computer address updated."); await checkComputer({ retry: false }); return;
      }
      const paired = await transport.pair(serverId, await getDeviceId(), code);
      await savePairing({ hostUrl: transport.hostUrl, serverId: paired.serverId, syncToken: paired.syncToken, pairedAt: paired.pairedAt, lastSeenAt: new Date().toISOString(), lastSyncAt: null });
      $("#pair-dialog").close(); toast("Capture Client paired with LifeOS."); await checkComputer({ retry: false });
    } catch (error) { toast(error.message || "Pairing failed."); }
    finally { submit.disabled = false; }
  }
  async function openPairDialog() {
    const state = await pairingState(); const form = $("#pair-form"); if (state) { form.elements.hostUrl.value = state.hostUrl; form.elements.serverId.value = state.serverId; } $("#pair-dialog").showModal();
  }
  async function updateConnection() { const node = $("#connection"); const auto = (await get("state", "autoSync"))?.value === true; node.textContent = navigator.onLine ? `On this device · auto-sync ${auto ? "on" : "off"}` : "Offline ready · captures stay here"; node.classList.toggle("offline", !navigator.onLine); }
  async function waitForOfflineShell(registration) {
    if (!isSecureContext || !navigator.serviceWorker) return "unavailable:service worker API unavailable";
    try {
      await Promise.race([
        registration?.active?.state === "activated" ? Promise.resolve() : new Promise((resolve, reject) => {
          const worker = registration?.installing || registration?.waiting || registration?.active;
          if (!worker) { reject(new Error("no service worker instance")); return; }
          const timer = setTimeout(() => reject(new Error("activation timed out")), 3000);
          const changed = () => { if (worker.state === "activated") { clearTimeout(timer); worker.removeEventListener("statechange", changed); resolve(); } };
          worker.addEventListener("statechange", changed); changed();
        })
      ]);
      if (!registration?.active || registration.active.state !== "activated" || !self.caches) return `unavailable:registration=${Boolean(registration)}, active=${registration?.active?.state || "none"}, cacheAPI=${Boolean(self.caches)}`;
      const shell = await caches.match(new URL("./index.html", location.href).href);
      return shell ? "ready" : "missing";
    } catch (error) { return `unavailable:${error instanceof Error ? error.message : String(error)}`; }
  }
  async function init() {
    diagnostic("secure", isSecureContext ? "Yes" : "No");
    diagnostic("service-worker", "Checking"); diagnostic("indexeddb", "Checking"); diagnostic("device", "Checking");
    const runtime = await initializeCaptureRuntime({ secureContext: isSecureContext, indexedDbAvailable: Boolean(self.indexedDB), openDatabase: openDb, readDeviceId: getDeviceId, registerServiceWorker: self.navigator?.serviceWorker ? () => navigator.serviceWorker.register("./service-worker.js", { scope: "./" }) : undefined });
    diagnostic("indexeddb", runtime.indexedDb === "available" ? "Available" : "Unavailable");
    diagnostic("device", runtime.deviceId === "ready" ? "Ready" : "Unavailable");
    if (runtime.storageError) {
      diagnostic("storage-error", "Error", runtime.storageError);
      if (runtime.indexedDb !== "available") diagnostic("indexeddb", "Unavailable", runtime.storageError);
      showInitializationError(runtime.indexedDb === "available" ? "Device ID unavailable" : "Storage unavailable", new Error(runtime.storageError)); return;
    }
    diagnostic("storage-error", "None");
    const profile = await get("state", "profile"); if (profile) $("#profile-status").textContent = `${profile.value.habits.length} active habits · profile from ${new Date(profile.value.generatedAt).toLocaleString()}.`;
    await renderForm(); await renderQueue(); await renderTimer(); await updateConnection();
    const syncPreference = await get("state", "autoSync"); $("#auto-sync").checked = syncPreference?.value === true;
    $("#export-button").addEventListener("click", exportBundle);
    $("#profile-file").addEventListener("change", event => importProfile(event.target.files[0]));
    $("#receipt-file").addEventListener("change", event => importReceipt(event.target.files[0]));
    $("#manual-confirm").addEventListener("click", markBatch);
    $("#pair-button").addEventListener("click", openPairDialog); $("#pair-form").addEventListener("submit", pairComputer); $("#sync-now").addEventListener("click", () => beginDirectSync(false));
    $("#auto-sync").addEventListener("change", async event => { await put("state", { key: "autoSync", value: event.target.checked }); await updateConnection(); if (event.target.checked) await checkComputer({ retry: false, auto: true }); });
    addEventListener("online", updateConnection); addEventListener("offline", updateConnection); setInterval(renderTimer, 1000);
    addEventListener("online", () => checkComputer({ retry: false, auto: true })); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkComputer({ retry: true, auto: true }); });
    await checkComputer({ retry: true, auto: true });
    if (runtime.serviceWorker === "offline-install-unavailable-http") diagnostic("service-worker", "Offline install unavailable on HTTP");
    else if (runtime.serviceWorker === "available") {
      const shell = await waitForOfflineShell(runtime.serviceWorkerRegistration);
      diagnostic("service-worker", shell === "ready" ? "Registered / Active" : "Registered");
      const detail = shell === "ready" ? "" : shell === "missing" ? "shell cache is empty" : shell.startsWith("unavailable:") ? shell.slice("unavailable:".length) : "service worker is not active";
      diagnostic("offline-shell", shell === "ready" ? "Ready" : "Offline shell unavailable", detail);
    }
    else diagnostic("service-worker", "Offline shell unavailable", runtime.serviceWorker.replace("offline-shell-unavailable: ", ""));
    if (runtime.serviceWorker === "offline-install-unavailable-http") diagnostic("offline-shell", "Offline install unavailable on HTTP");
    else if (runtime.serviceWorker !== "available") diagnostic("offline-shell", "Unavailable");
  }
  init().catch(error => { diagnostic("storage-error", "Initialization error", error instanceof Error ? error.message : String(error)); showInitializationError("Capture initialization failed", error); });
})();
