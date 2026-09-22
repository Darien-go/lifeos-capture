(() => {
  "use strict";
  const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const iso = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const date = value => typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const text = (value, max, optional = false) => optional && value === undefined || typeof value === "string" && value.length <= max;
  const tags = value => value === undefined || Array.isArray(value) && value.length <= 20 && value.every(tag => typeof tag === "string" && tag.trim().length > 0 && tag.trim().length <= 40);
  const rating = (value, max) => Number.isInteger(value) && value >= 1 && value <= max;
  function validTimes(payload) { return iso(payload.startedAt) && iso(payload.endedAt) && Date.parse(payload.endedAt) >= Date.parse(payload.startedAt); }
  function validEvent(event) {
    if (!event || !uuid(event.id) || !uuid(event.deviceId) || !iso(event.occurredAt) || !iso(event.createdAt) || event.version !== 1 || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return false;
    const p = event.payload;
    switch (event.type) {
      case "mood.log": return rating(p.score, 10) && tags(p.tags) && text(p.note, 10000, true);
      case "meal.update": return date(p.date) && ["breakfast", "lunch", "dinner", "snackCount"].includes(p.field) && (p.field === "snackCount" ? Number.isInteger(p.value) && p.value >= 0 && p.value <= 100 : typeof p.value === "boolean");
      case "habit.complete": return uuid(p.habitId) && date(p.date);
      case "task.create": return text(p.title, 300) && p.title.trim().length > 0 && text(p.description, 10000, true) && (p.priority === undefined || ["low", "medium", "high"].includes(p.priority)) && (p.dueDate === undefined || date(p.dueDate));
      case "note.create": return text(p.title, 300, true) && typeof p.content === "string" && p.content.length >= 1 && p.content.length <= 100000 && tags(p.tags);
      case "journal.create": return date(p.date) && text(p.title, 300, true) && typeof p.content === "string" && p.content.length >= 1 && p.content.length <= 100000 && (p.mood === undefined || rating(p.mood, 10)) && tags(p.tags);
      case "english.session": return validTimes(p) && text(p.courseName, 300, true) && (p.category === undefined || ["course", "listening", "speaking", "reading", "vocabulary", "writing", "youtube", "podcast", "other"].includes(p.category)) && text(p.note, 10000, true);
      case "workout.session": return validTimes(p) && typeof p.bodyPart === "string" && p.bodyPart.trim().length > 0 && p.bodyPart.length <= 80 && (p.quality === undefined || rating(p.quality, 5)) && text(p.note, 10000, true);
      case "sleep.session": return validTimes(p) && ["sleep", "nap"].includes(p.kind) && (p.quality === undefined || rating(p.quality, 5)) && text(p.note, 10000, true);
      default: return false;
    }
  }
  function validBundle(bundle) {
    if (!bundle || !bundle.meta || bundle.meta.app !== "LifeOS" || bundle.meta.kind !== "offline-sync" || bundle.meta.version !== 1 || !uuid(bundle.meta.batchId) || !uuid(bundle.meta.deviceId) || !iso(bundle.meta.exportedAt) || !Array.isArray(bundle.events) || bundle.events.length > 500) return false;
    const ids = new Set();
    return bundle.events.every(event => { if (!validEvent(event) || event.deviceId !== bundle.meta.deviceId || ids.has(event.id)) return false; ids.add(event.id); return true; });
  }
  function validProfile(profile) {
    const mealTypes = ["breakfast", "lunch", "dinner", "snackCount"];
    return profile?.app === "LifeOS" && profile.kind === "capture-profile" && profile.version === 1 && iso(profile.generatedAt) && Number.isInteger(profile.schemaVersion) && profile.schemaVersion > 0 && Array.isArray(profile.habits) && profile.habits.every(habit => uuid(habit.id) && typeof habit.name === "string" && habit.name.length > 0 && habit.name.length <= 300) && Array.isArray(profile.workoutBodyParts) && profile.workoutBodyParts.every(part => typeof part === "string" && part.length > 0 && part.length <= 80) && Array.isArray(profile.mealTypes) && profile.mealTypes.length === mealTypes.length && mealTypes.every((item, index) => profile.mealTypes[index] === item);
  }
  function validReceipt(receipt) {
    if (receipt?.meta?.app !== "LifeOS" || receipt.meta.kind !== "offline-sync-receipt" || receipt.meta.version !== 1 || !uuid(receipt.meta.batchId) || !uuid(receipt.meta.deviceId) || !iso(receipt.meta.processedAt) || receipt.meta.status !== "success" || !Array.isArray(receipt.processedEventIds) || receipt.processedEventIds.length > 500) return false;
    return receipt.processedEventIds.every(uuid) && new Set(receipt.processedEventIds).size === receipt.processedEventIds.length;
  }
  function receiptMatchesBatch(receipt, batch, deviceId) {
    if (!validReceipt(receipt) || !batch || receipt.meta.batchId !== batch.batchId || receipt.meta.deviceId !== deviceId) return false;
    const received = new Set(receipt.processedEventIds); const expected = new Set(batch.eventIds);
    return received.size === expected.size && [...expected].every(id => received.has(id));
  }
  self.LifeOSOfflineProtocol = { validEvent, validBundle, validProfile, validReceipt, receiptMatchesBatch };
})();
