const directions = ["north", "east", "south", "west", "up", "down"];
const adminAuthForm = document.querySelector("#adminAuthForm");
const adminName = document.querySelector("#adminName");
const adminToken = document.querySelector("#adminToken");
const loadAdminButton = document.querySelector("#loadAdminButton");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const roomFilter = document.querySelector("#roomFilter");
const roomList = document.querySelector("#roomList");
const roomForm = document.querySelector("#roomForm");
const saveRoomButton = document.querySelector("#saveRoomButton");
const newRoomButton = document.querySelector("#newRoomButton");
const duplicateRoomButton = document.querySelector("#duplicateRoomButton");
const editorTitle = document.querySelector("#editorTitle");
const editorMeta = document.querySelector("#editorMeta");
const validationList = document.querySelector("#validationList");
const builderStatus = document.querySelector(".builder-status");
const validationToggle = document.querySelector("#validationToggle");
const saveStatus = document.querySelector("#saveStatus");
const builderSaveMeta = document.querySelector("#builderSaveMeta");
const exportWorldButton = document.querySelector("#exportWorldButton");
const exportConfigButton = document.querySelector("#exportConfigButton");
const exportBundleButton = document.querySelector("#exportBundleButton");
const exitGrid = document.querySelector("#exitGrid");
const quickRoomDirection = document.querySelector("#quickRoomDirection");
const quickLinkRoomButton = document.querySelector("#quickLinkRoomButton");
const worldZoneSelect = document.querySelector("#worldZoneSelect");
const worldZInput = document.querySelector("#worldZInput");
const worldMapGrid = document.querySelector("#worldMapGrid");
const worldMapHint = document.querySelector("#worldMapHint");
const worldSelectionCard = document.querySelector("#worldSelectionCard");
const worldEditRoomButton = document.querySelector("#worldEditRoomButton");
const worldDuplicateRoomButton = document.querySelector("#worldDuplicateRoomButton");
const newZoneButton = document.querySelector("#newZoneButton");
const itemFilter = document.querySelector("#itemFilter");
const npcFilter = document.querySelector("#npcFilter");
const itemPicker = document.querySelector("#itemPicker");
const npcPicker = document.querySelector("#npcPicker");
const itemSelect = document.querySelector("#itemSelect");
const newItemButton = document.querySelector("#newItemButton");
const duplicateItemButton = document.querySelector("#duplicateItemButton");
const saveItemButton = document.querySelector("#saveItemButton");
const itemStatGrid = document.querySelector("#itemStatGrid");
const consumableFields = document.querySelector("#consumableFields");
const equipmentFields = document.querySelector("#equipmentFields");
const npcSelect = document.querySelector("#npcSelect");
const newNpcButton = document.querySelector("#newNpcButton");
const duplicateNpcButton = document.querySelector("#duplicateNpcButton");
const saveNpcButton = document.querySelector("#saveNpcButton");
const npcStatGrid = document.querySelector("#npcStatGrid");
const npcDropList = document.querySelector("#npcDropList");
const addNpcDropButton = document.querySelector("#addNpcDropButton");
const npcTopicList = document.querySelector("#npcTopicList");
const addNpcTopicButton = document.querySelector("#addNpcTopicButton");
const characterList = document.querySelector("#characterList");
const refreshCharactersButton = document.querySelector("#refreshCharactersButton");
const accountList = document.querySelector("#accountList");
const refreshAccountsButton = document.querySelector("#refreshAccountsButton");
const accountEditorTitle = document.querySelector("#accountEditorTitle");
const accountEditorMeta = document.querySelector("#accountEditorMeta");
const accountUsernameInput = document.querySelector("#accountUsernameInput");
const accountPasswordInput = document.querySelector("#accountPasswordInput");
const accountPasswordConfirmInput = document.querySelector("#accountPasswordConfirmInput");
const resetAccountPasswordButton = document.querySelector("#resetAccountPasswordButton");
const accountCharactersState = document.querySelector("#accountCharactersState");
const npcMerchantItemsInput = document.querySelector("#npcMerchantItemsInput");
const tabButtons = document.querySelectorAll("[data-admin-tab]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const questSelect = document.querySelector("#questSelect");
const newQuestButton = document.querySelector("#newQuestButton");
const duplicateQuestButton = document.querySelector("#duplicateQuestButton");
const saveQuestButton = document.querySelector("#saveQuestButton");
const questStartTrigger = document.querySelector("#questStartTrigger");
const questPrereqList = document.querySelector("#questPrereqList");
const questStepList = document.querySelector("#questStepList");
const questRewardList = document.querySelector("#questRewardList");
const questStartScriptsInput = document.querySelector("#questStartScriptsInput");
const questCompleteScriptsInput = document.querySelector("#questCompleteScriptsInput");
const addQuestStepButton = document.querySelector("#addQuestStepButton");
const addQuestPrereqButton = document.querySelector("#addQuestPrereqButton");
const addQuestRewardButton = document.querySelector("#addQuestRewardButton");
const saveCharacterButton = document.querySelector("#saveCharacterButton");
const saveConfigButton = document.querySelector("#saveConfigButton");
const configList = document.querySelector("#configList");
const configEditor = document.querySelector("#configEditor");
const configEditorTitle = document.querySelector("#configEditorTitle");
const debugRoomSelect = document.querySelector("#debugRoomSelect");
const debugItemSelect = document.querySelector("#debugItemSelect");
const debugFlagInput = document.querySelector("#debugFlagInput");
const debugQuestSelect = document.querySelector("#debugQuestSelect");
const debugQuestState = document.querySelector("#debugQuestState");
const debugButtons = [
  "#debugMoveButton",
  "#debugSanctuaryButton",
  "#debugHealButton",
  "#debugAddItemButton",
  "#debugGrantFlagButton",
  "#debugRemoveFlagButton",
  "#debugCompleteQuestButton",
  "#debugResetQuestButton"
].map((selector) => document.querySelector(selector));

let world;
let characterConfig = { stats: [] };
let characters = [];
let selectedRoomId = "";
let selectedWorldZoneId = "";
let selectedWorldZ = 0;
let creatingRoom = false;
let selectedItemSpawns = new Map();
let selectedNpcs = new Set();
let selectedItemId = "";
let creatingItem = false;
let selectedNpcId = "";
let creatingNpc = false;
let npcDrops = [];
let npcTopics = [];
let npcSpecials = [];
let selectedQuestId = "";
let creatingQuest = false;
let questPrerequisites = [];
let questSteps = [];
let questRewards = [];
let selectedCharacterId = 0;
let accounts = [];
let selectedAccountId = 0;
let selectedConfigSection = "leveling";
let dirty = false;
let lastSavedAt = "";
let validationExpanded = false;

const queryAdminName = new URLSearchParams(location.search).get("name");
adminName.value = queryAdminName ?? localStorage.getItem("cardbound.adminName") ?? "";
adminToken.value = localStorage.getItem("cardbound.adminToken") ?? "";
renderExitFields();
renderTriggerFields(questStartTrigger, "quest-start");
loadWorld();

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!confirmDiscardChanges()) return;
    activateTab(button.dataset.adminTab);
  });
});
adminName.addEventListener("change", () => {
  localStorage.setItem("cardbound.adminName", adminName.value.trim());
});
adminToken.addEventListener("change", () => {
  localStorage.setItem("cardbound.adminToken", adminToken.value.trim());
});
adminAuthForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveAdminCredentials();
  loadWorld();
});
roomFilter.addEventListener("input", renderRoomList);
itemFilter.addEventListener("input", renderPlacementPickers);
npcFilter.addEventListener("input", renderPlacementPickers);
saveRoomButton.addEventListener("click", saveRoom);
newRoomButton.addEventListener("click", createDraftRoom);
duplicateRoomButton.addEventListener("click", duplicateSelectedRoom);
quickLinkRoomButton.addEventListener("click", quickCreateLinkedRoom);
worldZoneSelect?.addEventListener("change", () => {
  selectedWorldZoneId = worldZoneSelect.value;
  const firstRoomInZone = world?.rooms.find((room) => room.zoneId === selectedWorldZoneId);
  if (firstRoomInZone) {
    selectRoom(firstRoomInZone.id);
  } else {
    renderWorldEditor();
  }
});
worldZInput?.addEventListener("change", () => {
  selectedWorldZ = Number(worldZInput.value) || 0;
  renderWorldEditor();
});
worldEditRoomButton?.addEventListener("click", () => {
  if (!selectedRoomId) return;
  activateTab("rooms");
});
worldDuplicateRoomButton?.addEventListener("click", () => {
  duplicateSelectedRoom();
  activateTab("rooms");
});
newZoneButton?.addEventListener("click", createWorldZone);
exportWorldButton.addEventListener("click", () => downloadAdminExport("/api/admin/export/world", "cardbound-world.json"));
exportConfigButton.addEventListener("click", () => downloadAdminExport("/api/admin/export/character-config", "cardbound-character-config.json"));
exportBundleButton.addEventListener("click", () => downloadAdminExport("/api/admin/export/bundle", "cardbound-builder-bundle.json"));
validationToggle?.addEventListener("click", () => {
  validationExpanded = !validationExpanded;
  renderValidation();
});
itemSelect.addEventListener("change", () => {
  if (!confirmDiscardChanges()) {
    itemSelect.value = selectedItemId;
    return;
  }
  selectItem(itemSelect.value, { preserveScroll: true });
});
document.querySelector("#itemTypeInput").addEventListener("change", updateItemTypeFields);
newItemButton.addEventListener("click", createDraftItem);
duplicateItemButton.addEventListener("click", duplicateSelectedItem);
saveItemButton.addEventListener("click", saveItem);
npcSelect.addEventListener("change", () => {
  if (!confirmDiscardChanges()) {
    npcSelect.value = selectedNpcId;
    return;
  }
  selectNpc(npcSelect.value);
});
newNpcButton.addEventListener("click", createDraftNpc);
duplicateNpcButton.addEventListener("click", duplicateSelectedNpc);
saveNpcButton.addEventListener("click", saveNpc);
refreshCharactersButton.addEventListener("click", loadCharacters);
refreshAccountsButton?.addEventListener("click", loadAccounts);
questSelect.addEventListener("change", () => {
  if (!confirmDiscardChanges()) {
    questSelect.value = selectedQuestId;
    return;
  }
  selectQuest(questSelect.value);
});
newQuestButton.addEventListener("click", createDraftQuest);
duplicateQuestButton.addEventListener("click", duplicateSelectedQuest);
saveQuestButton.addEventListener("click", saveQuest);
addQuestPrereqButton.addEventListener("click", () => {
  questPrerequisites.push({ type: "level", level: 1 });
  renderQuestPrerequisites();
  markDirty();
});
addQuestStepButton.addEventListener("click", () => {
  questSteps.push({ id: uniqueQuestPartId("new-step", questSteps), label: "New quest step", objective: "Complete the next task.", trigger: { type: "talk" }, scripts: [] });
  renderQuestSteps();
  markDirty();
});
addQuestRewardButton.addEventListener("click", () => {
  questRewards.push({ type: "xp", label: "10 XP", amount: 10 });
  renderQuestRewards();
  markDirty();
});
saveCharacterButton.addEventListener("click", saveCharacter);
resetAccountPasswordButton?.addEventListener("click", resetSelectedAccountPassword);
saveConfigButton.addEventListener("click", saveConfig);
document.querySelector("#debugMoveButton").addEventListener("click", () => runCharacterDebug({ action: "moveRoom", roomId: debugRoomSelect.value }));
document.querySelector("#debugSanctuaryButton").addEventListener("click", () => runCharacterDebug({ action: "setSanctuary", roomId: debugRoomSelect.value }));
document.querySelector("#debugHealButton").addEventListener("click", () => runCharacterDebug({ action: "heal" }));
document.querySelector("#debugAddItemButton").addEventListener("click", () => runCharacterDebug({ action: "addItem", itemId: debugItemSelect.value }));
document.querySelector("#debugGrantFlagButton").addEventListener("click", () => runCharacterDebug({ action: "grantFlag", flag: debugFlagInput.value.trim() }));
document.querySelector("#debugRemoveFlagButton").addEventListener("click", () => runCharacterDebug({ action: "removeFlag", flag: debugFlagInput.value.trim() }));
document.querySelector("#debugCompleteQuestButton").addEventListener("click", () => runCharacterDebug({ action: "completeQuest", questId: debugQuestSelect.value }));
document.querySelector("#debugResetQuestButton").addEventListener("click", () => runCharacterDebug({ action: "resetQuest", questId: debugQuestSelect.value }));
addNpcDropButton.addEventListener("click", () => {
  npcDrops.push({ itemId: world.items[0]?.id ?? "", chance: 0.25, quantity: 1 });
  renderNpcDrops();
  markDirty();
});
addNpcTopicButton.addEventListener("click", () => {
  npcTopics.push({ key: uniqueTopicKey("topic"), prompt: "", aliases: [], response: ["New response line."], requiresFlag: "", setsFlag: "" });
  renderNpcTopics();
  markDirty();
});
document.querySelector(".builder-shell").addEventListener("input", (event) => {
  if (event.target.closest(".builder-editor")) markDirty();
});
document.querySelector(".builder-shell").addEventListener("change", (event) => {
  if (event.target.closest(".builder-editor")) markDirty();
});
window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function loadWorld() {
  saveAdminCredentials();
  if (!adminName.value.trim()) {
    setAdminAuthStatus("Enter the builder admin username.", "bad");
    setStatus("Enter the builder admin username.", "bad");
    return;
  }

  setAdminAuthStatus("Loading admin tools...", "");
  setStatus("Loading admin tools...", "");
  setAdminLoading(true);
  try {
    const response = await fetch(adminUrl("/api/admin/world"), adminRequestOptions());
    const configResponse = await fetch(adminUrl("/api/admin/character-config"), adminRequestOptions());
    const [data, config] = await Promise.all([response.json(), configResponse.json()]);
    if (!response.ok) throw new Error(data.error ?? "Could not load world.");
    if (!configResponse.ok) throw new Error(config.error ?? "Could not load character config.");
    world = data;
    characterConfig = config;
    selectedRoomId = selectedRoomId || world.rooms[0]?.id || "";
    creatingRoom = false;
    renderAll();
    loadCharacters();
    loadAccounts();
    clearDirty();
    setAdminAuthStatus("Admin tools loaded.", "ok");
    setStatus("World loaded.", "ok");
  } catch (error) {
    setAdminAuthStatus(error.message, "bad");
    setStatus(error.message, "bad");
  } finally {
    setAdminLoading(false);
  }
}

function saveAdminCredentials() {
  localStorage.setItem("cardbound.adminName", adminName.value.trim());
  localStorage.setItem("cardbound.adminToken", adminToken.value.trim());
}

async function loadCharacters() {
  if (!adminName.value.trim() || !characterList) return;
  try {
    const response = await fetch(adminUrl("/api/admin/characters"), adminRequestOptions());
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load characters.");
    characters = data.characters ?? [];
    renderCharacters(characters);
  } catch (error) {
    characterList.innerHTML = `<div class="placement-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderCharacters(characters) {
  characterList.innerHTML = "";
  if (!characters.length) {
    characterList.innerHTML = '<div class="placement-empty">No characters have been created yet.</div>';
    return;
  }
  for (const character of characters) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "character-row";
    item.classList.toggle("active", character.id === selectedCharacterId);
    item.innerHTML = `
      <strong>${escapeHtml(character.name)}</strong>
      <span>${escapeHtml(character.jobName)} | Level ${character.level} | ${escapeHtml(character.roomId)}</span>
      ${character.isAdmin ? "<small>Admin</small>" : ""}
    `;
    item.addEventListener("click", () => selectCharacter(character.id));
    characterList.append(item);
  }
}

async function loadAccounts() {
  if (!adminName.value.trim() || !accountList) return;
  try {
    const response = await fetch(adminUrl("/api/admin/accounts"), adminRequestOptions());
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load accounts.");
    accounts = data.accounts ?? [];
    renderAccounts(accounts);
    if (selectedAccountId) fillSelectedAccount();
  } catch (error) {
    accountList.innerHTML = `<div class="placement-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderAccounts(accounts) {
  if (!accountList) return;
  accountList.innerHTML = "";
  if (!accounts.length) {
    accountList.innerHTML = '<div class="placement-empty">No accounts have been created yet.</div>';
    return;
  }
  for (const account of accounts) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "character-row";
    item.classList.toggle("active", account.id === selectedAccountId);
    item.innerHTML = `
      <strong>${escapeHtml(account.username)}</strong>
      <span>${account.characters.length} character${account.characters.length === 1 ? "" : "s"} | Updated ${escapeHtml(formatDateTime(account.updatedAt))}</span>
    `;
    item.addEventListener("click", () => selectAccount(account.id));
    accountList.append(item);
  }
}

function selectAccount(accountId) {
  selectedAccountId = accountId;
  renderAccounts(accounts);
  fillSelectedAccount();
}

function fillSelectedAccount() {
  const account = accounts.find((candidate) => candidate.id === selectedAccountId);
  if (!account) {
    selectedAccountId = 0;
    fillAccountForm(null);
    return;
  }
  fillAccountForm(account);
}

function fillAccountForm(account) {
  if (!accountEditorTitle) return;
  accountEditorTitle.textContent = account?.username ?? "Select an account";
  accountEditorMeta.textContent = account
    ? `Created ${formatDateTime(account.createdAt)} | Updated ${formatDateTime(account.updatedAt)}`
    : "Reset passwords without exposing existing credentials.";
  accountUsernameInput.value = account?.username ?? "";
  accountPasswordInput.value = "";
  accountPasswordConfirmInput.value = "";
  resetAccountPasswordButton.disabled = !account;
  renderAccountCharacters(account);
}

function renderAccountCharacters(account) {
  if (!accountCharactersState) return;
  if (!account) {
    accountCharactersState.textContent = "Select an account to see its characters.";
    return;
  }
  if (!account.characters.length) {
    accountCharactersState.textContent = "No characters on this account yet.";
    return;
  }
  accountCharactersState.textContent = account.characters
    .map((character) => `${character.name}: ${character.jobName}, level ${character.level}${character.isAdmin ? ", admin" : ""}`)
    .join(" | ");
}

async function resetSelectedAccountPassword() {
  const account = accounts.find((candidate) => candidate.id === selectedAccountId);
  if (!account) {
    setStatus("Select an account first.", "bad");
    return;
  }
  const password = accountPasswordInput.value;
  const confirmPassword = accountPasswordConfirmInput.value;
  if (password.length < 8) {
    setStatus("New password must be at least 8 characters.", "bad");
    return;
  }
  if (password !== confirmPassword) {
    setStatus("Password confirmation does not match.", "bad");
    return;
  }
  setStatus("Resetting account password...", "");
  try {
    const response = await fetch(adminUrl(`/api/admin/accounts/${account.id}/reset-password`), {
      method: "POST",
      headers: adminHeaders(true),
      body: adminBody({ reset: { password } })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    accounts = data.accounts ?? accounts;
    renderAccounts(accounts);
    fillSelectedAccount();
    setStatus(`Password reset for ${account.username}.`, "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function renderAll() {
  renderZoneOptions();
  renderWorldZoneOptions();
  refreshExitOptions();
  renderTriggerFields(questStartTrigger, "quest-start");
  renderItemEditor();
  renderNpcEditor();
  renderQuestEditor();
  renderConfigEditor();
  renderRoomList();
  renderValidation();
  fillDebugOptions();
  const room = world.rooms.find((candidate) => candidate.id === selectedRoomId) ?? world.rooms[0];
  if (room) selectRoom(room.id);
  renderWorldEditor();
  fillCharacterRoomOptions();
}

function activateTab(tabName) {
  tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.adminTab === tabName));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.tabPanel === tabName));
}

function renderRoomList() {
  roomList.innerHTML = "";
  if (!world) return;

  const filter = roomFilter.value.trim().toLowerCase();
  const rooms = world.rooms.filter((room) => `${room.name} ${room.id} ${room.zoneId}`.toLowerCase().includes(filter));
  for (const room of rooms) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("active", room.id === selectedRoomId);
    button.innerHTML = `<span>${escapeHtml(room.name)}</span><small>${escapeHtml(room.id)}</small>`;
    button.addEventListener("click", () => {
      if (!confirmDiscardChanges()) return;
      creatingRoom = false;
      selectRoom(room.id);
    });
    roomList.append(button);
  }
}

function selectRoom(roomId) {
  const room = world.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return;
  selectedRoomId = room.id;
  selectedWorldZoneId = room.zoneId;
  selectedWorldZ = room.coords.z;
  creatingRoom = false;
  fillForm(room);
  renderRoomList();
  renderWorldEditor();
  clearDirty();
}

function fillForm(room) {
  editorTitle.textContent = room.name;
  editorMeta.textContent = `${room.id} | ${zoneName(room.zoneId)}`;
  setValue("roomId", room.id);
  document.querySelector("#roomId").disabled = !creatingRoom;
  setValue("roomNameInput", room.name);
  setValue("zoneId", room.zoneId);
  setValue("roomDescription", room.description);
  setValue("roomTags", room.tags.join(", "));
  setValue("mapLabel", room.map.label ?? "");
  setValue("mapSymbol", room.map.symbol);
  setValue("mapColor", room.map.color ?? "");
  setValue("coordX", room.coords.x);
  setValue("coordY", room.coords.y);
  setValue("coordZ", room.coords.z);
  selectedItemSpawns = new Map(itemSpawnsForRoom(room).map((spawn) => [spawn.itemId, { ...spawn }]));
  selectedNpcs = new Set(room.npcs);
  renderPlacementPickers();

  for (const direction of directions) {
    const exit = room.exits[direction] ?? {};
    setValue(`exit-${direction}-to`, exit.to ?? "");
    setValue(`exit-${direction}-label`, exit.label ?? "");
    setValue(`exit-${direction}-door`, exit.doorId ?? "");
    setValue(`exit-${direction}-item`, exit.requiredItemId ?? "");
    setChecked(`exit-${direction}-hidden`, Boolean(exit.hidden));
    setValue(`exit-${direction}-blocked`, exit.blockedMessage ?? "");
  }
}

function renderZoneOptions() {
  const zoneSelect = document.querySelector("#zoneId");
  zoneSelect.innerHTML = "";
  for (const zone of world.zones) {
    zoneSelect.append(new Option(zone.name, zone.id));
  }
}

function renderWorldZoneOptions() {
  if (!worldZoneSelect || !world) return;
  const previous = selectedWorldZoneId || worldZoneSelect.value || world.rooms.find((room) => room.id === selectedRoomId)?.zoneId || world.zones[0]?.id || "";
  worldZoneSelect.innerHTML = "";
  for (const zone of world.zones) worldZoneSelect.append(new Option(zone.name, zone.id));
  selectedWorldZoneId = world.zones.some((zone) => zone.id === previous) ? previous : world.zones[0]?.id ?? "";
  worldZoneSelect.value = selectedWorldZoneId;
  if (worldZInput) worldZInput.value = String(selectedWorldZ);
}

function renderWorldEditor() {
  if (!worldMapGrid || !world) return;
  if (!selectedWorldZoneId) selectedWorldZoneId = world.zones[0]?.id ?? "";
  selectedWorldZ = Number(worldZInput?.value ?? selectedWorldZ) || 0;
  if (worldZoneSelect && worldZoneSelect.value !== selectedWorldZoneId) worldZoneSelect.value = selectedWorldZoneId;
  if (worldZInput && worldZInput.value !== String(selectedWorldZ)) worldZInput.value = String(selectedWorldZ);

  const zoneRooms = world.rooms.filter((room) => room.zoneId === selectedWorldZoneId && room.coords.z === selectedWorldZ);
  const selectedRoom = world.rooms.find((room) => room.id === selectedRoomId);
  const selectedRoomInLayer = selectedRoom?.zoneId === selectedWorldZoneId && selectedRoom.coords.z === selectedWorldZ ? selectedRoom : null;
  const focusRooms = zoneRooms.length ? zoneRooms : selectedRoomInLayer ? [selectedRoomInLayer] : [];
  const bounds = worldGridBounds(focusRooms);
  const roomsByCoord = new Map(zoneRooms.map((room) => [coordKey(room.coords), room]));
  worldMapGrid.innerHTML = "";
  worldMapGrid.style.gridTemplateColumns = `repeat(${bounds.width}, minmax(74px, 1fr))`;

  for (let y = bounds.maxY; y >= bounds.minY; y -= 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const room = roomsByCoord.get(coordKey({ x, y, z: selectedWorldZ }));
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "world-cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.dataset.z = String(selectedWorldZ);
      if (room) {
        renderWorldRoomCell(cell, room);
        cell.addEventListener("click", () => selectRoomFromWorld(room.id));
      } else {
        renderWorldEmptyCell(cell, x, y);
        cell.addEventListener("click", () => createRoomFromWorldCell(x, y));
      }
      worldMapGrid.append(cell);
    }
  }

  renderWorldSelectionCard(selectedRoomInLayer);
}

function renderWorldRoomCell(cell, room) {
  const selected = room.id === selectedRoomId;
  cell.classList.add("world-room-cell");
  cell.classList.toggle("selected", selected);
  cell.style.borderColor = room.map?.color || "";
  const connectionMarkup = worldConnectionMarkup(room);
  cell.innerHTML = `
    ${connectionMarkup}
    <strong>${escapeHtml(room.map?.label || room.name)}</strong>
    <small>${escapeHtml(room.name)}</small>
  `;
  cell.title = `${room.name} (${room.coords.x}, ${room.coords.y}, ${room.coords.z})`;
}

function renderWorldEmptyCell(cell, x, y) {
  const relation = selectedRoomRelation(x, y);
  cell.classList.add("world-empty-cell");
  cell.classList.toggle("buildable", Boolean(relation));
  cell.innerHTML = relation ? `<span>+</span><small>${capitalize(relation)}</small>` : "";
  cell.title = relation ? `Create a room ${relation} of the selected room` : "Empty grid space";
}

function renderWorldSelectionCard(room) {
  if (!worldSelectionCard) return;
  if (!room) {
    worldSelectionCard.textContent = "Select a room on the grid.";
    if (worldEditRoomButton) worldEditRoomButton.disabled = true;
    if (worldDuplicateRoomButton) worldDuplicateRoomButton.disabled = true;
    return;
  }
  const exits = Object.entries(room.exits ?? {}).filter(([, exit]) => exit?.to);
  worldSelectionCard.innerHTML = `
    <strong>${escapeHtml(room.name)}</strong>
    <span>${escapeHtml(room.id)}</span>
    <small>${escapeHtml(zoneName(room.zoneId))} | ${room.coords.x}, ${room.coords.y}, ${room.coords.z}</small>
    <small>${exits.length ? exits.map(([direction, exit]) => `${direction}: ${exit.to}${exit.doorId ? " (door)" : ""}`).join(" | ") : "No exits yet."}</small>
  `;
  if (worldEditRoomButton) worldEditRoomButton.disabled = false;
  if (worldDuplicateRoomButton) worldDuplicateRoomButton.disabled = false;
  if (worldMapHint) {
    worldMapHint.textContent = `Selected ${room.name}. Click an adjacent empty space to create a linked room, or click an adjacent room without an exit to connect it.`;
  }
}

function worldConnectionMarkup(room) {
  const parts = [];
  for (const direction of ["north", "east", "south", "west"]) {
    const exit = room.exits?.[direction];
    if (!exit?.to) continue;
    const classes = ["world-link", `world-link-${direction}`];
    if (exit.doorId || exit.requiredItemId) classes.push("locked");
    parts.push(`<i class="${classes.join(" ")}"></i>`);
  }
  return parts.join("");
}

function worldGridBounds(rooms) {
  const xs = rooms.map((room) => room.coords.x);
  const ys = rooms.map((room) => room.coords.y);
  const minX = Math.min(...xs, 0) - 2;
  const maxX = Math.max(...xs, 0) + 2;
  const minY = Math.min(...ys, 0) - 2;
  const maxY = Math.max(...ys, 0) + 2;
  return { minX, maxX, minY, maxY, width: maxX - minX + 1 };
}

function selectRoomFromWorld(roomId) {
  const clickedRoom = world.rooms.find((room) => room.id === roomId);
  const selectedRoom = world.rooms.find((room) => room.id === selectedRoomId);
  const relation = clickedRoom && selectedRoom ? cardinalDirectionBetween(selectedRoom.coords, clickedRoom.coords) : "";
  if (clickedRoom && selectedRoom && clickedRoom.id !== selectedRoom.id && relation && selectedRoom.zoneId === clickedRoom.zoneId && selectedRoom.coords.z === clickedRoom.coords.z) {
    const existingExit = selectedRoom.exits?.[relation]?.to;
    if (!existingExit && confirm(`Connect ${selectedRoom.name} ${relation} to ${clickedRoom.name}?`)) {
      connectExistingWorldRooms(selectedRoom, clickedRoom, relation);
      return;
    }
  }
  selectRoom(roomId);
}

async function createRoomFromWorldCell(x, y) {
  if (!world || !selectedRoomId) return;
  const source = world.rooms.find((room) => room.id === selectedRoomId);
  const direction = selectedRoomRelation(x, y);
  if (!source || !direction) {
    setStatus("Select a room first, then click an adjacent empty space.", "bad");
    return;
  }
  if (source.exits?.[direction]?.to) {
    setStatus(`${source.name} already has a ${direction} exit.`, "bad");
    return;
  }
  const room = {
    id: uniqueRoomId(`${source.id}-${direction}`),
    zoneId: source.zoneId,
    name: `New ${capitalize(direction)} Room`,
    description: "An unwritten place waits for its first scene.",
    coords: { x, y, z: source.coords.z },
    tags: [],
    map: { symbol: "?", label: "New" },
    exits: {},
    items: [],
    itemSpawns: [],
    npcs: []
  };
  setStatus("Creating linked room from map...", "");

  try {
    const response = await fetch(adminUrl("/api/admin/rooms/link"), {
      method: "POST",
      headers: adminHeaders(true),
      body: adminBody({ sourceRoomId: source.id, direction, room })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedRoomId = room.id;
    selectedWorldZoneId = room.zoneId;
    selectedWorldZ = room.coords.z;
    creatingRoom = false;
    renderAll();
    recordSave();
    setStatus(`Created ${room.name} and linked it ${direction} from ${source.name}.`, "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function connectExistingWorldRooms(source, target, direction) {
  setStatus("Connecting rooms...", "");
  try {
    const response = await fetch(adminUrl("/api/admin/rooms/connect"), {
      method: "POST",
      headers: adminHeaders(true),
      body: adminBody({ sourceRoomId: source.id, targetRoomId: target.id, direction })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedRoomId = target.id;
    renderAll();
    recordSave();
    setStatus(`Connected ${source.name} ${direction} to ${target.name}.`, "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function createWorldZone() {
  if (!world) return;
  if (!confirmDiscardChanges()) return;
  const name = prompt("New zone name");
  if (!name?.trim()) return;
  const zoneId = uniqueZoneId(slugify(name));
  const roomId = uniqueRoomId(`${zoneId}-entry`);
  const zone = {
    id: zoneId,
    name: name.trim(),
    description: "A new region waiting to be charted.",
    tags: [],
    map: {
      label: name.trim(),
      color: "#d7b86f",
      danger: "low"
    },
    levelRange: { min: 1, max: 3 },
    defaultSpawnRoomId: roomId
  };
  const room = {
    id: roomId,
    zoneId,
    name: `${name.trim()} Entry`,
    description: "An unwritten threshold waits for its first scene.",
    coords: { x: 0, y: 0, z: 0 },
    tags: [],
    map: { symbol: "?", label: "Entry", color: zone.map.color },
    exits: {},
    items: [],
    itemSpawns: [],
    npcs: []
  };
  setStatus("Creating zone...", "");

  try {
    const response = await fetch(adminUrl("/api/admin/zones"), {
      method: "POST",
      headers: adminHeaders(true),
      body: adminBody({ zone, room })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedRoomId = room.id;
    selectedWorldZoneId = zone.id;
    selectedWorldZ = 0;
    creatingRoom = false;
    renderAll();
    recordSave();
    setStatus(`Created ${zone.name}. Add exits from its entry room to begin shaping it.`, "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function selectedRoomRelation(x, y) {
  const selected = world?.rooms.find((room) => room.id === selectedRoomId);
  if (!selected || selected.zoneId !== selectedWorldZoneId || selected.coords.z !== selectedWorldZ) return "";
  return cardinalDirectionBetween(selected.coords, { x, y, z: selectedWorldZ });
}

function cardinalDirectionBetween(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (dx === 0 && dy === 1) return "north";
  if (dx === 1 && dy === 0) return "east";
  if (dx === 0 && dy === -1) return "south";
  if (dx === -1 && dy === 0) return "west";
  return "";
}

function renderExitFields() {
  exitGrid.innerHTML = "";
  for (const direction of directions) {
    const card = document.createElement("div");
    card.className = "exit-card";
    card.innerHTML = `
      <strong>${capitalize(direction)}</strong>
      <label>To Room<select id="exit-${direction}-to"></select></label>
      <label>Label<input id="exit-${direction}-label" /></label>
      <label>Door<select id="exit-${direction}-door"></select></label>
      <label>Required Item<select id="exit-${direction}-item"></select></label>
      <label><span>Hidden</span><input id="exit-${direction}-hidden" type="checkbox" /></label>
      <label>Blocked Message<input id="exit-${direction}-blocked" /></label>
    `;
    exitGrid.append(card);
  }
}

function refreshExitOptions() {
  for (const direction of directions) {
    fillSelect(`exit-${direction}-to`, world.rooms, "No exit", (room) => room.name, (room) => room.id);
    fillSelect(`exit-${direction}-door`, world.doors, "No door", (door) => door.name, (door) => door.id);
    fillSelect(`exit-${direction}-item`, world.items, "No item", (item) => item.name, (item) => item.id);
  }
  if (npcMerchantItemsInput && world) {
    const selected = new Set([...npcMerchantItemsInput.selectedOptions].map((option) => option.value));
    npcMerchantItemsInput.innerHTML = "";
    for (const item of world.items) {
      const option = new Option(item.name, item.id);
      option.selected = selected.has(item.id);
      npcMerchantItemsInput.append(option);
    }
  }
}

function fillSelect(id, options, emptyLabel, labelFor, valueFor) {
  const select = document.querySelector(`#${id}`);
  const current = select.value;
  select.innerHTML = "";
  select.append(new Option(emptyLabel, ""));
  for (const option of options) select.append(new Option(labelFor(option), valueFor(option)));
  select.value = current;
}

function createDraftRoom() {
  if (!world) return;
  if (!confirmDiscardChanges()) return;
  creatingRoom = true;
  refreshExitOptions();
  const baseId = uniqueRoomId("new-room");
  const firstRoom = world.rooms[0];
  const draft = {
    id: baseId,
    zoneId: world.zones[0]?.id ?? "",
    name: "New Room",
    description: "An unwritten place waits for its first scene.",
    coords: { x: (firstRoom?.coords.x ?? 0) + 1, y: firstRoom?.coords.y ?? 0, z: firstRoom?.coords.z ?? 0 },
    tags: [],
    map: { symbol: "?", label: "New" },
    exits: {},
    items: [],
    itemSpawns: [],
    npcs: []
  };
  selectedRoomId = draft.id;
  fillForm(draft);
  renderRoomList();
  clearDirty();
}

function duplicateSelectedRoom() {
  if (!world || !selectedRoomId) return;
  if (!confirmDiscardChanges()) return;
  const source = world.rooms.find((room) => room.id === selectedRoomId);
  if (!source) return;
  creatingRoom = true;
  refreshExitOptions();
  const draft = structuredClone(source);
  draft.id = uniqueRoomId(`${source.id}-copy`);
  draft.name = `${source.name} Copy`;
  draft.coords = nextOpenCoords(source.coords);
  selectedRoomId = draft.id;
  fillForm(draft);
  renderRoomList();
  clearDirty();
  setStatus(`Duplicating ${source.name}. Edit the draft, then save it as a new room.`, "");
}

async function saveRoom() {
  if (!world) return;
  if (!confirmValidationSave("room")) return;
  const room = readRoomForm();
  const method = creatingRoom ? "POST" : "PUT";
  const url = creatingRoom ? "/api/admin/rooms" : `/api/admin/rooms/${encodeURIComponent(selectedRoomId)}`;
  setStatus("Saving...", "");

  try {
    const response = await fetch(adminUrl(url), {
      method,
      headers: adminHeaders(true),
      body: adminBody({ room })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedRoomId = room.id;
    creatingRoom = false;
    renderAll();
    recordSave();
    setStatus("Room saved and live world reloaded.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function readRoomForm() {
  const exits = {};
  for (const direction of directions) {
    const to = getValue(`exit-${direction}-to`);
    if (!to) continue;
    exits[direction] = cleanObject({
      to,
      label: getValue(`exit-${direction}-label`),
      doorId: getValue(`exit-${direction}-door`),
      requiredItemId: getValue(`exit-${direction}-item`),
      hidden: document.querySelector(`#exit-${direction}-hidden`).checked || undefined,
      blockedMessage: getValue(`exit-${direction}-blocked`)
    });
  }

  return {
    id: getValue("roomId"),
    zoneId: getValue("zoneId"),
    name: getValue("roomNameInput"),
    description: getValue("roomDescription"),
    coords: {
      x: Number(getValue("coordX")),
      y: Number(getValue("coordY")),
      z: Number(getValue("coordZ"))
    },
    tags: splitList(getValue("roomTags")),
    map: cleanObject({
      symbol: getValue("mapSymbol"),
      color: getValue("mapColor"),
      label: getValue("mapLabel")
    }),
    exits,
    items: [],
    itemSpawns: [...selectedItemSpawns.values()],
    npcs: [...selectedNpcs]
  };
}

function renderItemEditor() {
  const listScrollTop = itemSelect.scrollTop;
  itemSelect.innerHTML = "";
  for (const item of world.items) itemSelect.append(new Option(item.name, item.id));
  renderItemStatInputs();
  selectedItemId = selectedItemId || world.items[0]?.id || "";
  if (selectedItemId && world.items.some((item) => item.id === selectedItemId)) {
    itemSelect.value = selectedItemId;
    fillItemForm(world.items.find((item) => item.id === selectedItemId));
  } else if (world.items[0]) {
    selectItem(world.items[0].id);
  }
  itemSelect.scrollTop = listScrollTop;
}

function renderItemStatInputs() {
  itemStatGrid.innerHTML = "";
  for (const stat of characterConfig.stats ?? []) {
    const label = document.createElement("label");
    label.textContent = `${stat.name} Bonus`;
    const input = document.createElement("input");
    input.id = `item-stat-${stat.id}`;
    input.type = "number";
    input.value = "0";
    label.append(input);
    itemStatGrid.append(label);
  }
}

function selectItem(itemId, options = {}) {
  const pageScrollY = options.preserveScroll ? window.scrollY : undefined;
  const listScrollTop = options.preserveScroll ? itemSelect.scrollTop : undefined;
  const item = world.items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  selectedItemId = item.id;
  creatingItem = false;
  itemSelect.value = item.id;
  fillItemForm(item);
  clearDirty();
  if (listScrollTop !== undefined) itemSelect.scrollTop = listScrollTop;
  if (pageScrollY !== undefined) requestAnimationFrame(() => window.scrollTo({ top: pageScrollY }));
}

function fillItemForm(item) {
  setValue("itemIdInput", item.id);
  document.querySelector("#itemIdInput").disabled = !creatingItem;
  setValue("itemNameInput", item.name);
  setValue("itemDescriptionInput", item.description);
  setValue("itemTypeInput", item.type ?? "misc");
  setValue("itemRarityInput", item.rarity ?? "common");
  setValue("itemValueInput", item.value ?? 0);
  setValue("itemHpInput", item.consumable?.hp ?? 0);
  setValue("itemManaInput", item.consumable?.mana ?? 0);
  setValue("itemSlotInput", item.equipment?.slot ?? "trinket");
  for (const stat of characterConfig.stats ?? []) setValue(`item-stat-${stat.id}`, item.equipment?.statBonuses?.[stat.id] ?? 0);
  updateItemTypeFields();
}

function createDraftItem() {
  if (!world) return;
  if (!confirmDiscardChanges()) return;
  creatingItem = true;
  const item = {
    id: uniqueItemId("new-item"),
    name: "New Item",
    description: "A newly named object waiting for its place in the world.",
    type: "misc"
  };
  selectedItemId = item.id;
  fillItemForm(item);
  clearDirty();
}

function duplicateSelectedItem() {
  if (!world || !selectedItemId) return;
  if (!confirmDiscardChanges()) return;
  const source = world.items.find((item) => item.id === selectedItemId);
  if (!source) return;
  creatingItem = true;
  const item = structuredClone(source);
  item.id = uniqueItemId(`${source.id}-copy`);
  item.name = `${source.name} copy`;
  selectedItemId = item.id;
  fillItemForm(item);
  clearDirty();
  setStatus(`Duplicating ${source.name}. Edit the draft, then save it as a new item.`, "");
}

async function saveItem() {
  if (!world) return;
  if (!confirmValidationSave("item")) return;
  const type = getValue("itemTypeInput");
  const consumable = cleanNumberObject({ hp: Number(getValue("itemHpInput")), mana: Number(getValue("itemManaInput")) });
  const statBonuses = cleanNumberObject(Object.fromEntries((characterConfig.stats ?? []).map((stat) => [stat.id, Number(getValue(`item-stat-${stat.id}`))])));
  const item = {
    id: getValue("itemIdInput"),
    name: getValue("itemNameInput"),
    description: getValue("itemDescriptionInput"),
    type,
    rarity: getValue("itemRarityInput"),
    value: Number(getValue("itemValueInput")),
    consumable: type === "consumable" ? consumable : undefined,
    equipment:
      type === "equipment"
        ? {
            slot: getValue("itemSlotInput"),
            statBonuses
          }
        : undefined
  };
  const method = creatingItem ? "POST" : "PUT";
  const url = creatingItem ? "/api/admin/items" : `/api/admin/items/${encodeURIComponent(selectedItemId)}`;
  setStatus("Saving item...", "");

  try {
    const response = await fetch(adminUrl(url), {
      method,
      headers: adminHeaders(true),
      body: adminBody({ item })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedItemId = item.id;
    creatingItem = false;
    renderAll();
    recordSave();
    setStatus("Item saved and live world reloaded.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function updateItemTypeFields() {
  const type = getValue("itemTypeInput");
  consumableFields.hidden = type !== "consumable";
  equipmentFields.hidden = type !== "equipment";
}

function renderNpcEditor() {
  npcSelect.innerHTML = "";
  for (const npc of world.npcs) npcSelect.append(new Option(npc.name, npc.id));
  renderNpcStatInputs();
  selectedNpcId = selectedNpcId || world.npcs[0]?.id || "";
  if (selectedNpcId && world.npcs.some((npc) => npc.id === selectedNpcId)) {
    npcSelect.value = selectedNpcId;
    fillNpcForm(world.npcs.find((npc) => npc.id === selectedNpcId));
  } else if (world.npcs[0]) {
    selectNpc(world.npcs[0].id);
  }
}

function renderNpcStatInputs() {
  npcStatGrid.innerHTML = "";
  for (const stat of characterConfig.stats ?? []) {
    const label = document.createElement("label");
    label.textContent = stat.name;
    const input = document.createElement("input");
    input.id = `npc-stat-${stat.id}`;
    input.type = "number";
    input.min = "0";
    label.append(input);
    npcStatGrid.append(label);
  }
}

function selectNpc(npcId) {
  const npc = world.npcs.find((candidate) => candidate.id === npcId);
  if (!npc) return;
  selectedNpcId = npc.id;
  creatingNpc = false;
  npcSelect.value = npc.id;
  fillNpcForm(npc);
  clearDirty();
}

function fillNpcForm(npc) {
  setValue("npcIdInput", npc.id);
  document.querySelector("#npcIdInput").disabled = !creatingNpc;
  setValue("npcNameInput", npc.name);
  setValue("npcSpeciesInput", npc.species);
  setValue("npcDispositionInput", npc.disposition);
  setChecked("npcAutoEngageInput", npc.behavior?.autoEngage ?? false);
  setChecked("npcStationaryInput", npc.behavior?.stationary ?? true);
  setChecked("npcWanderEnabledInput", npc.behavior?.wander?.enabled ?? false);
  setValue("npcWanderIntervalInput", npc.behavior?.wander?.intervalSeconds ?? 60);
  setValue("npcDescriptionInput", npc.description);
  setValue("npcCardPageInput", npc.card?.page ?? "");
  setValue("npcCardRarityInput", npc.card?.rarity ?? "");
  setValue("npcCardFlavorInput", npc.card?.flavor ?? "");
  setChecked("npcCardVariantInput", npc.card?.variant ?? false);
  setValue("npcCardEventInput", npc.card?.event ?? "");
  setValue("npcHpInput", npc.hp);
  setValue("npcManaInput", npc.mana);
  setValue("npcXpInput", npc.combat.xp);
  setValue("npcTicketsInput", npc.combat.tickets);
  setValue("npcRespawnInput", npc.combat.respawnSeconds);
  setValue("npcAttackNameInput", npc.combat.attackName);
  setValue("npcEncounterInput", npc.combat.encounter ? JSON.stringify(npc.combat.encounter, null, 2) : "");
  setValue("npcDefeatMessageInput", npc.combat.defeatMessage);
  setValue("npcGreetingInput", npc.dialogue.greeting.join("\n"));
  setChecked("npcMerchantBuysInput", npc.merchant?.buys ?? false);
  setValue("npcMerchantMarkupInput", npc.merchant?.markup ?? 1);
  setValue("npcMerchantMarkdownInput", npc.merchant?.markdown ?? 0.5);
  fillMerchantItems(npc.merchant?.items ?? []);
  for (const stat of characterConfig.stats ?? []) setValue(`npc-stat-${stat.id}`, npc.stats[stat.id] ?? stat.base ?? 0);
  npcDrops = (npc.combat.drops ?? []).map((drop) => ({ ...drop }));
  npcSpecials = structuredClone(npc.combat.specials ?? []);
  npcTopics = Object.entries(npc.dialogue.topics ?? {}).map(([key, topic]) => ({
    key,
    prompt: topic.prompt ?? "",
    aliases: [...(topic.aliases ?? [])],
    response: [...(topic.response ?? [])],
    requiresFlag: topic.requiresFlag ?? "",
    setsFlag: topic.setsFlag ?? ""
  }));
  renderNpcDrops();
  renderNpcTopics();
}

function createDraftNpc() {
  if (!world) return;
  if (!confirmDiscardChanges()) return;
  creatingNpc = true;
  const stats = Object.fromEntries((characterConfig.stats ?? []).map((stat) => [stat.id, stat.base ?? 6]));
  const npc = {
    id: uniqueNpcId("new-npc"),
    name: "New NPC",
    species: "runaway card monster",
    description: "A new figure waits to be written into Cardbound City.",
    card: {
      page: "Cardbound City Page",
      rarity: "common",
      flavor: "",
      variant: false,
      event: ""
    },
    stats,
    hp: 10,
    mana: 0,
    disposition: "friendly",
    combat: {
      attackName: "careful attack",
      defeatMessage: "New NPC yields and retreats.",
      respawnSeconds: 60,
      xp: 0,
      tickets: 0,
      drops: []
    },
    dialogue: {
      greeting: ["Well met, traveler."],
      topics: {}
    },
    merchant: undefined
  };
  selectedNpcId = npc.id;
  fillNpcForm(npc);
  clearDirty();
}

function duplicateSelectedNpc() {
  if (!world || !selectedNpcId) return;
  if (!confirmDiscardChanges()) return;
  const source = world.npcs.find((npc) => npc.id === selectedNpcId);
  if (!source) return;
  creatingNpc = true;
  const npc = structuredClone(source);
  npc.id = uniqueNpcId(`${source.id}-copy`);
  npc.name = `${source.name} Copy`;
  selectedNpcId = npc.id;
  fillNpcForm(npc);
  clearDirty();
  setStatus(`Duplicating ${source.name}. Edit the draft, then save it as a new NPC.`, "");
}

async function saveNpc() {
  if (!world) return;
  if (!confirmValidationSave("NPC")) return;
  let encounter;
  try {
    encounter = parseOptionalJsonObject(getValue("npcEncounterInput"), "Boss Encounter JSON");
  } catch (error) {
    setStatus(error.message, "bad");
    return;
  }
  const existing = world.npcs.find((npc) => npc.id === selectedNpcId);
  const npc = {
    id: getValue("npcIdInput"),
    name: getValue("npcNameInput"),
    species: getValue("npcSpeciesInput"),
    description: getValue("npcDescriptionInput"),
    card: cleanObject({
      page: getValue("npcCardPageInput"),
      rarity: getValue("npcCardRarityInput"),
      flavor: getValue("npcCardFlavorInput"),
      variant: getChecked("npcCardVariantInput") || undefined,
      event: getValue("npcCardEventInput")
    }),
    stats: Object.fromEntries((characterConfig.stats ?? []).map((stat) => [stat.id, Number(getValue(`npc-stat-${stat.id}`))])),
    hp: Number(getValue("npcHpInput")),
    mana: Number(getValue("npcManaInput")),
    disposition: getValue("npcDispositionInput"),
    behavior: readNpcBehaviorForm(),
    combat: {
      attackName: getValue("npcAttackNameInput"),
      defeatMessage: getValue("npcDefeatMessageInput"),
      respawnSeconds: Number(getValue("npcRespawnInput")),
      xp: Number(getValue("npcXpInput")),
      tickets: Number(getValue("npcTicketsInput")),
      specials: npcSpecials.length ? structuredClone(npcSpecials) : undefined,
      encounter,
      drops: npcDrops.filter((drop) => drop.itemId).map((drop) => ({
        itemId: drop.itemId,
        chance: Math.max(0, Math.min(1, Number(drop.chance))),
        quantity: Math.max(1, Number(drop.quantity))
      }))
    },
    dialogue: {
      greeting: splitLines(getValue("npcGreetingInput")),
      topics: Object.fromEntries(
        npcTopics
          .map((topic) => ({
            key: topic.key.trim(),
            prompt: topic.prompt?.trim() ?? "",
            aliases: cleanList(topic.aliases),
            response: cleanList(topic.response),
            requiresFlag: topic.requiresFlag?.trim() ?? "",
            setsFlag: topic.setsFlag?.trim() ?? ""
          }))
          .filter((topic) => topic.key && topic.response.length)
          .map((topic) => [topic.key, cleanObject({ prompt: topic.prompt, aliases: topic.aliases, response: topic.response, requiresFlag: topic.requiresFlag, setsFlag: topic.setsFlag })])
      )
    },
    merchant: readMerchantForm()
  };
  const method = creatingNpc ? "POST" : "PUT";
  const url = creatingNpc ? "/api/admin/npcs" : `/api/admin/npcs/${encodeURIComponent(selectedNpcId)}`;
  setStatus("Saving NPC...", "");

  try {
    const response = await fetch(adminUrl(url), {
      method,
      headers: adminHeaders(true),
      body: adminBody({ npc })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedNpcId = npc.id;
    creatingNpc = false;
    renderAll();
    recordSave();
    setStatus("NPC saved and live world reloaded.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function parseOptionalJsonObject(value, label) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed;
}

function readNpcBehaviorForm() {
  const stationary = document.querySelector("#npcStationaryInput").checked;
  const autoEngage = document.querySelector("#npcAutoEngageInput").checked;
  const wanderEnabled = document.querySelector("#npcWanderEnabledInput").checked;
  return cleanObject({
    stationary,
    autoEngage,
    wander: wanderEnabled
      ? {
          enabled: true,
          intervalSeconds: Math.max(1, Number(getValue("npcWanderIntervalInput")) || 60)
        }
      : undefined
  });
}

function renderNpcTopics() {
  npcTopicList.innerHTML = "";
  if (!npcTopics.length) {
    npcTopicList.innerHTML = '<div class="placement-empty">No dialogue topics yet.</div>';
    return;
  }

  npcTopics.forEach((topic, index) => {
    const row = document.createElement("div");
    row.className = "quest-row dialogue-row";
    row.innerHTML = `
      <label>Topic Key<input value="${escapeHtml(topic.key)}" data-topic-field="key" /></label>
      <label>Prompt<input value="${escapeHtml(topic.prompt ?? "")}" data-topic-field="prompt" placeholder="shown in talk topic list" /></label>
      <label>Aliases<input value="${escapeHtml(topic.aliases.join(", "))}" data-topic-field="aliases" placeholder="comma-separated" /></label>
      <div class="builder-actions"><button data-topic-action="duplicate" type="button">Duplicate</button><button data-topic-action="remove" type="button">Remove</button></div>
      <label>Requires Flag<input value="${escapeHtml(topic.requiresFlag ?? "")}" data-topic-field="requiresFlag" /></label>
      <label>Sets Flag<input value="${escapeHtml(topic.setsFlag ?? "")}" data-topic-field="setsFlag" /></label>
      <label class="wide">Response Lines<textarea rows="4" data-topic-field="response">${escapeHtml(topic.response.join("\n"))}</textarea></label>
    `;
    row.querySelector('[data-topic-field="key"]').addEventListener("change", (event) => {
      npcTopics[index].key = event.target.value.trim();
    });
    row.querySelector('[data-topic-field="aliases"]').addEventListener("change", (event) => {
      npcTopics[index].aliases = splitList(event.target.value);
    });
    row.querySelector('[data-topic-field="prompt"]').addEventListener("change", (event) => {
      npcTopics[index].prompt = event.target.value.trim();
    });
    row.querySelector('[data-topic-field="requiresFlag"]').addEventListener("change", (event) => {
      npcTopics[index].requiresFlag = event.target.value.trim();
    });
    row.querySelector('[data-topic-field="setsFlag"]').addEventListener("change", (event) => {
      npcTopics[index].setsFlag = event.target.value.trim();
    });
    row.querySelector('[data-topic-field="response"]').addEventListener("change", (event) => {
      npcTopics[index].response = splitLines(event.target.value);
    });
    row.querySelector('[data-topic-action="duplicate"]').addEventListener("click", () => {
      const copy = structuredClone(npcTopics[index]);
      copy.key = uniqueTopicKey(`${copy.key}-copy`);
      npcTopics.splice(index + 1, 0, copy);
      renderNpcTopics();
    });
    row.querySelector('[data-topic-action="remove"]').addEventListener("click", () => {
      npcTopics.splice(index, 1);
      renderNpcTopics();
    });
    npcTopicList.append(row);
  });
}

function fillMerchantItems(itemIds) {
  npcMerchantItemsInput.innerHTML = "";
  const selected = new Set(itemIds);
  for (const item of world.items) {
    const option = new Option(item.name, item.id);
    option.selected = selected.has(item.id);
    npcMerchantItemsInput.append(option);
  }
}

function readMerchantForm() {
  const items = [...npcMerchantItemsInput.selectedOptions].map((option) => option.value);
  const buys = document.querySelector("#npcMerchantBuysInput").checked;
  if (!buys && !items.length) return undefined;
  return {
    buys,
    markup: Math.max(0, Number(getValue("npcMerchantMarkupInput")) || 1),
    markdown: Math.max(0, Math.min(1, Number(getValue("npcMerchantMarkdownInput")) || 0.5)),
    items
  };
}

function renderQuestEditor() {
  questSelect.innerHTML = "";
  for (const quest of world.quests) questSelect.append(new Option(quest.name, quest.id));
  selectedQuestId = selectedQuestId || world.quests[0]?.id || "";
  if (selectedQuestId && world.quests.some((quest) => quest.id === selectedQuestId)) {
    questSelect.value = selectedQuestId;
    fillQuestForm(world.quests.find((quest) => quest.id === selectedQuestId));
  } else if (world.quests[0]) {
    selectQuest(world.quests[0].id);
  }
}

function selectQuest(questId) {
  const quest = world.quests.find((candidate) => candidate.id === questId);
  if (!quest) return;
  selectedQuestId = quest.id;
  creatingQuest = false;
  questSelect.value = quest.id;
  fillQuestForm(quest);
  clearDirty();
}

function fillQuestForm(quest) {
  setValue("questIdInput", quest.id);
  document.querySelector("#questIdInput").disabled = !creatingQuest;
  setValue("questNameInput", quest.name);
  setValue("questTagsInput", (quest.tags ?? []).join(", "));
  setValue("questSummaryInput", quest.summary);
  setValue("questDescriptionInput", quest.description);
  setTriggerValues("quest-start", quest.startsOn);
  setValue("questStartScriptsInput", formatScriptActions(quest.scripts?.onStart ?? []));
  setValue("questCompleteScriptsInput", formatScriptActions(quest.scripts?.onComplete ?? []));
  wireTrigger("quest-start");
  questPrerequisites = (quest.prerequisites ?? []).map((prerequisite) => ({ ...prerequisite }));
  questSteps = (quest.steps ?? []).map((step) => ({ ...step, trigger: { ...step.trigger }, scripts: (step.scripts ?? []).map((action) => structuredClone(action)) }));
  questRewards = (quest.rewards ?? []).map((reward) => ({ ...reward }));
  renderQuestPrerequisites();
  renderQuestSteps();
  renderQuestRewards();
}

function createDraftQuest() {
  if (!world) return;
  if (!confirmDiscardChanges()) return;
  creatingQuest = true;
  const quest = {
    id: uniqueQuestId("new-quest"),
    name: "New Quest",
    summary: "A new task waits to be written.",
    description: "A new quest for Cardbound City.",
    tags: ["side"],
    prerequisites: [],
    startsOn: { type: "talk" },
    scripts: { onStart: [], onComplete: [] },
    steps: [],
    rewards: []
  };
  selectedQuestId = quest.id;
  fillQuestForm(quest);
  clearDirty();
}

function duplicateSelectedQuest() {
  if (!world || !selectedQuestId) return;
  if (!confirmDiscardChanges()) return;
  const source = world.quests.find((quest) => quest.id === selectedQuestId);
  if (!source) return;
  creatingQuest = true;
  const quest = structuredClone(source);
  quest.id = uniqueQuestId(`${source.id}-copy`);
  quest.name = `${source.name} Copy`;
  selectedQuestId = quest.id;
  fillQuestForm(quest);
  clearDirty();
  setStatus(`Duplicating ${source.name}. Edit the draft, then save it as a new quest.`, "");
}

async function saveQuest() {
  if (!world) return;
  if (!confirmValidationSave("quest")) return;
  try {
    const quest = {
      id: getValue("questIdInput"),
      name: getValue("questNameInput"),
      tags: splitList(getValue("questTagsInput")),
      summary: getValue("questSummaryInput"),
      description: getValue("questDescriptionInput"),
      prerequisites: questPrerequisites.map((prerequisite) => cleanObject(prerequisite)),
      startsOn: readTriggerValues("quest-start"),
      scripts: cleanObject({
        onStart: readScriptActions("questStartScriptsInput", "On Start Script"),
        onComplete: readScriptActions("questCompleteScriptsInput", "Completion Script")
      }),
      steps: questSteps.map((step) => ({
        id: step.id,
        label: step.label,
        objective: step.objective,
        trigger: step.trigger,
        scripts: step.scripts ?? []
      })),
      rewards: questRewards.map((reward) => cleanObject(reward))
    };
    const method = creatingQuest ? "POST" : "PUT";
    const url = creatingQuest ? "/api/admin/quests" : `/api/admin/quests/${encodeURIComponent(selectedQuestId)}`;
    setStatus("Saving quest...", "");
    const response = await fetch(adminUrl(url), {
      method,
      headers: adminHeaders(true),
      body: adminBody({ quest })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedQuestId = quest.id;
    creatingQuest = false;
    renderAll();
    recordSave();
    setStatus("Quest saved and live world reloaded.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function renderQuestPrerequisites() {
  questPrereqList.innerHTML = "";
  if (!questPrerequisites.length) {
    questPrereqList.innerHTML = '<div class="placement-empty">No prerequisites.</div>';
    return;
  }

  questPrerequisites.forEach((prerequisite, index) => {
    const row = document.createElement("div");
    row.className = "quest-row prereq-row";
    row.innerHTML = `
      <label>Type
        <select data-prereq-field="type">
          ${["level", "flag", "item", "quest", "binderCards"].map((type) => `<option value="${type}">${type}</option>`).join("")}
        </select>
      </label>
      <label data-prereq-control="level">Level<input data-prereq-field="level" type="number" min="1" value="${prerequisite.level ?? 1}" /></label>
      <label data-prereq-control="flag">Flag<input data-prereq-field="flag" value="${escapeHtml(prerequisite.flag ?? "")}" /></label>
      <label data-prereq-control="item">Item<select data-prereq-field="itemId"></select></label>
      <label data-prereq-control="quest">Quest<select data-prereq-field="questId"></select></label>
      <label data-prereq-control="binderCards">Collection Cards<input data-prereq-field="count" type="number" min="1" value="${prerequisite.count ?? 1}" /></label>
      <button type="button">Remove</button>
    `;
    const type = row.querySelector('[data-prereq-field="type"]');
    const item = row.querySelector('[data-prereq-field="itemId"]');
    const quest = row.querySelector('[data-prereq-field="questId"]');
    item.append(new Option("Choose item", ""));
    for (const worldItem of world.items) item.append(new Option(worldItem.name, worldItem.id));
    quest.append(new Option("Choose quest", ""));
    for (const worldQuest of world.quests) quest.append(new Option(worldQuest.name, worldQuest.id));
    type.value = prerequisite.type ?? "level";
    item.value = prerequisite.itemId ?? "";
    quest.value = prerequisite.questId ?? "";
    const syncPrerequisite = () => {
      const nextType = type.value;
      questPrerequisites[index] = cleanObject({
        type: nextType,
        level: nextType === "level" ? Number(row.querySelector('[data-prereq-field="level"]').value) : undefined,
        flag: nextType === "flag" ? row.querySelector('[data-prereq-field="flag"]').value.trim() : "",
        itemId: nextType === "item" ? item.value : "",
        questId: nextType === "quest" ? quest.value : "",
        count: nextType === "binderCards" ? Number(row.querySelector('[data-prereq-field="count"]').value) : undefined
      });
      updatePrerequisiteFieldVisibility(row);
    };
    row.querySelectorAll("[data-prereq-field]").forEach((input) => input.addEventListener("change", syncPrerequisite));
    row.querySelector("button").addEventListener("click", () => {
      questPrerequisites.splice(index, 1);
      renderQuestPrerequisites();
    });
    questPrereqList.append(row);
    updatePrerequisiteFieldVisibility(row);
  });
}

function renderQuestSteps() {
  questStepList.innerHTML = "";
  if (!questSteps.length) {
    questStepList.innerHTML = '<div class="placement-empty">No steps yet.</div>';
    return;
  }
  questSteps.forEach((step, index) => {
    const row = document.createElement("div");
    row.className = "quest-row";
    row.innerHTML = `
      <label>ID<input value="${escapeHtml(step.id)}" data-step-field="id" /></label>
      <label>Label<input value="${escapeHtml(step.label)}" data-step-field="label" /></label>
      <button type="button">Remove</button>
      <label class="wide">Objective<input value="${escapeHtml(step.objective ?? step.label)}" data-step-field="objective" /></label>
      <div class="trigger-grid" data-step-trigger="${index}"></div>
      <label class="wide">Step Script JSON<textarea rows="4" data-step-field="scripts">${escapeHtml(formatScriptActions(step.scripts ?? []))}</textarea></label>
    `;
    row.querySelector('[data-step-field="id"]').addEventListener("change", (event) => {
      questSteps[index].id = event.target.value.trim();
    });
    row.querySelector('[data-step-field="label"]').addEventListener("change", (event) => {
      questSteps[index].label = event.target.value.trim();
    });
    row.querySelector('[data-step-field="objective"]').addEventListener("change", (event) => {
      questSteps[index].objective = event.target.value.trim();
    });
    row.querySelector('[data-step-field="scripts"]').addEventListener("change", (event) => {
      try {
        questSteps[index].scripts = parseScriptActions(event.target.value, `Step '${step.id}' Script`);
        setStatus("Step script parsed.", "ok");
      } catch (error) {
        setStatus(error.message, "bad");
      }
    });
    row.querySelector("button").addEventListener("click", () => {
      questSteps.splice(index, 1);
      renderQuestSteps();
    });
    questStepList.append(row);
    const triggerContainer = row.querySelector(`[data-step-trigger="${index}"]`);
    const prefix = `quest-step-${index}`;
    renderTriggerFields(triggerContainer, prefix);
    setTriggerValues(prefix, step.trigger);
    triggerContainer.addEventListener("change", () => {
      questSteps[index].trigger = readTriggerValues(prefix);
    });
  });
}

function renderQuestRewards() {
  questRewardList.innerHTML = "";
  if (!questRewards.length) {
    questRewardList.innerHTML = '<div class="placement-empty">No rewards yet.</div>';
    return;
  }
  questRewards.forEach((reward, index) => {
    const row = document.createElement("div");
    row.className = "quest-row reward-row";
    row.innerHTML = `
      <label data-reward-control="type">Type
        <select data-reward-field="type">
          ${[
            ["xp", "xp"],
            ["tickets", "Prize Tickets"],
            ["item", "item"],
            ["classItem", "class item"],
            ["title", "title"],
            ["flag", "flag"]
          ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
        </select>
      </label>
      <label data-reward-control="label">Label<input value="${escapeHtml(reward.label ?? "")}" data-reward-field="label" /></label>
      <label data-reward-control="amount">Amount<input type="number" value="${reward.amount ?? 0}" data-reward-field="amount" /></label>
      <label data-reward-control="preview">Scaled<input value="${escapeHtml(rewardPreview(reward))}" disabled /></label>
      <label data-reward-control="item">Item<select data-reward-field="itemId"></select></label>
      <label data-reward-control="classItems" class="wide">Class Items JSON<textarea rows="4" data-reward-field="classItems">${escapeHtml(formatRewardClassItems(reward.classItems))}</textarea></label>
      <label data-reward-control="flag">Flag<input value="${escapeHtml(reward.flag ?? "")}" data-reward-field="flag" /></label>
      <button type="button">Remove</button>
    `;
    const type = row.querySelector('[data-reward-field="type"]');
    const item = row.querySelector('[data-reward-field="itemId"]');
    item.append(new Option("No item", ""));
    for (const worldItem of world.items) item.append(new Option(worldItem.name, worldItem.id));
    type.value = reward.type ?? "xp";
    item.value = reward.itemId ?? "";
    const syncReward = () => {
      questRewards[index] = cleanObject({
        type: type.value,
        label: row.querySelector('[data-reward-field="label"]').value.trim(),
        amount: Number(row.querySelector('[data-reward-field="amount"]').value) || undefined,
        itemId: item.value,
        classItems: parseRewardClassItems(row.querySelector('[data-reward-field="classItems"]').value),
        flag: row.querySelector('[data-reward-field="flag"]').value.trim()
      });
      updateRewardFieldVisibility(row);
      row.querySelector('[data-reward-control="preview"] input').value = rewardPreview(questRewards[index]);
    };
    row.querySelectorAll("[data-reward-field]").forEach((input) => input.addEventListener("change", syncReward));
    row.querySelector("button").addEventListener("click", () => {
      questRewards.splice(index, 1);
      renderQuestRewards();
    });
    questRewardList.append(row);
    updateRewardFieldVisibility(row);
  });
}

function renderTriggerFields(container, prefix) {
  container.innerHTML = `
    <p class="trigger-help">Talk/ask fire through NPC dialogue, take fires when an item is picked up, enterRoom fires on travel, door triggers fire when a door changes state, defeat fires when a monster is beaten, and binderCards checks Collection count.</p>
    <label data-trigger-control="type">Type
      <select id="${prefix}-type">
        <option value="talk">talk</option>
        <option value="ask">ask</option>
        <option value="take">take</option>
        <option value="enterRoom">enterRoom</option>
        <option value="unlockDoor">unlockDoor</option>
        <option value="openDoor">openDoor</option>
        <option value="defeat">defeat</option>
        <option value="binderCards">binderCards</option>
      </select>
    </label>
    <label data-trigger-control="npc">NPC<select id="${prefix}-npc"></select></label>
    <label data-trigger-control="topic">Topic<input id="${prefix}-topic" /></label>
    <label data-trigger-control="item">Item<select id="${prefix}-item"></select></label>
    <label data-trigger-control="room">Room<select id="${prefix}-room"></select></label>
    <label data-trigger-control="door">Door<select id="${prefix}-door"></select></label>
    <label data-trigger-control="count">Collection Cards<input id="${prefix}-count" type="number" min="1" /></label>
  `;
  fillTriggerOptions(prefix);
  wireTrigger(prefix);
}

function fillTriggerOptions(prefix) {
  if (!world) return;
  fillSelect(`${prefix}-npc`, world.npcs, "No NPC", (npc) => npc.name, (npc) => npc.id);
  fillSelect(`${prefix}-item`, world.items, "No item", (item) => item.name, (item) => item.id);
  fillSelect(`${prefix}-room`, world.rooms, "No room", (room) => room.name, (room) => room.id);
  fillSelect(`${prefix}-door`, world.doors, "No door", (door) => door.name, (door) => door.id);
}

function setTriggerValues(prefix, trigger) {
  setValue(`${prefix}-type`, trigger.type ?? "talk");
  setValue(`${prefix}-npc`, trigger.npcId ?? "");
  setValue(`${prefix}-topic`, trigger.topic ?? "");
  setValue(`${prefix}-item`, trigger.itemId ?? "");
  setValue(`${prefix}-room`, trigger.roomId ?? "");
  setValue(`${prefix}-door`, trigger.doorId ?? "");
  setValue(`${prefix}-count`, trigger.count ?? 1);
  updateTriggerFieldVisibility(prefix);
}

function readTriggerValues(prefix) {
  const type = getValue(`${prefix}-type`);
  return cleanObject({
    type,
    npcId: ["talk", "ask", "defeat"].includes(type) ? getValue(`${prefix}-npc`) : "",
    topic: type === "ask" ? getValue(`${prefix}-topic`) : "",
    itemId: type === "take" ? getValue(`${prefix}-item`) : "",
    roomId: type === "enterRoom" ? getValue(`${prefix}-room`) : "",
    doorId: ["unlockDoor", "openDoor"].includes(type) ? getValue(`${prefix}-door`) : "",
    count: type === "binderCards" ? Number(getValue(`${prefix}-count`)) || 1 : undefined
  });
}

function readScriptActions(id, label) {
  return parseScriptActions(getValue(id), label);
}

function parseScriptActions(value, label) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed;
}

function formatScriptActions(actions) {
  return actions?.length ? JSON.stringify(actions, null, 2) : "";
}

function wireTrigger(prefix) {
  const typeSelect = document.querySelector(`#${prefix}-type`);
  if (!typeSelect) return;
  typeSelect.addEventListener("change", () => updateTriggerFieldVisibility(prefix));
  updateTriggerFieldVisibility(prefix);
}

function updateTriggerFieldVisibility(prefix) {
  const type = getValue(`${prefix}-type`);
  const controls = {
    npc: ["talk", "ask", "defeat"].includes(type),
    topic: type === "ask",
    item: type === "take",
    room: type === "enterRoom",
    door: ["unlockDoor", "openDoor"].includes(type),
    count: type === "binderCards"
  };
  const typeElement = document.querySelector(`#${prefix}-type`);
  const container = typeElement?.closest(".trigger-grid");
  if (!container) return;
  container.querySelectorAll("[data-trigger-control]").forEach((label) => {
    const control = label.dataset.triggerControl;
    label.hidden = control !== "type" && !controls[control];
  });
}

function updateRewardFieldVisibility(row) {
  const type = row.querySelector('[data-reward-field="type"]').value;
  row.querySelector('[data-reward-control="amount"]').hidden = !["xp", "tickets"].includes(type);
  row.querySelector('[data-reward-control="preview"]').hidden = type !== "xp";
  row.querySelector('[data-reward-control="item"]').hidden = type !== "item";
  row.querySelector('[data-reward-control="classItems"]').hidden = type !== "classItem";
  row.querySelector('[data-reward-control="flag"]').hidden = type !== "flag";
}

function updatePrerequisiteFieldVisibility(row) {
  const type = row.querySelector('[data-prereq-field="type"]').value;
  row.querySelectorAll("[data-prereq-control]").forEach((control) => {
    control.hidden = control.dataset.prereqControl !== type;
  });
}

function rewardPreview(reward) {
  if (reward.type === "xp") return `${Math.max(0, Math.round((reward.amount ?? 0) * (characterConfig.leveling?.questXpMultiplier ?? 1)))} XP`;
  return "";
}

function formatRewardClassItems(classItems) {
  return classItems ? JSON.stringify(classItems, null, 2) : "";
}

function parseRewardClassItems(value) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}

async function selectCharacter(characterId) {
  selectedCharacterId = characterId;
  renderCharacters(characters);
  try {
    const response = await fetch(adminUrl(`/api/admin/characters/${characterId}`), adminRequestOptions());
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load character.");
    fillCharacterForm(data.character);
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function fillCharacterRoomOptions() {
  const roomSelect = document.querySelector("#characterRoomInput");
  if (!roomSelect || !world) return;
  const current = roomSelect.value;
  roomSelect.innerHTML = "";
  for (const room of world.rooms) roomSelect.append(new Option(room.name, room.id));
  roomSelect.value = current;

  const sanctuarySelect = document.querySelector("#characterSanctuaryInput");
  if (!sanctuarySelect) return;
  const currentSanctuary = sanctuarySelect.value;
  sanctuarySelect.innerHTML = "";
  for (const room of world.rooms) sanctuarySelect.append(new Option(room.name, room.id));
  sanctuarySelect.value = currentSanctuary;
}

function fillDebugOptions() {
  if (!world) return;
  fillDebugSelect(debugRoomSelect, world.rooms, (room) => room.name, (room) => room.id);
  fillDebugSelect(debugItemSelect, world.items, (item) => item.name, (item) => item.id);
  fillDebugSelect(debugQuestSelect, world.quests, (quest) => quest.name, (quest) => quest.id);
}

function fillDebugSelect(select, entries, labelFor, valueFor) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = "";
  for (const entry of entries) select.append(new Option(labelFor(entry), valueFor(entry)));
  select.value = current || select.options[0]?.value || "";
}

function fillCharacterForm(character) {
  document.querySelector("#characterEditorTitle").textContent = character.name;
  document.querySelector("#characterEditorMeta").textContent = character.jobName;
  setValue("characterNameInput", character.name);
  setValue("characterSpeciesInput", character.speciesName);
  setValue("characterJobInput", character.jobName);
  fillCharacterRoomOptions();
  setValue("characterRoomInput", character.roomId);
  setValue("characterLevelInput", character.level);
  setValue("characterXpInput", character.xp);
  setValue("characterTicketsInput", character.tickets);
  setValue("characterHpInput", character.hp);
  setValue("characterManaInput", character.mana);
  setValue("characterSanctuaryInput", character.sanctuaryRoomId);
  setValue("characterTitlesInput", character.titles.join(", "));
  setValue("characterFlagsInput", character.flags.join(", "));
  setValue("characterInventoryInput", character.inventory.join(", "));
  saveCharacterButton.disabled = false;
  setDebugEnabled(true);
  renderCharacterQuestState(character);
}

function renderCharacterQuestState(character) {
  if (!debugQuestState) return;
  const questRecords = character.quests ?? [];
  if (!questRecords.length) {
    debugQuestState.textContent = "No quest records yet.";
    return;
  }
  debugQuestState.textContent = questRecords
    .map((record) => {
      const quest = world.quests.find((candidate) => candidate.id === record.questId);
      return `${quest?.name ?? record.questId}: ${record.status}, ${record.completedSteps.length}/${quest?.steps.length ?? record.completedSteps.length} steps`;
    })
    .join(" | ");
}

function setDebugEnabled(enabled) {
  for (const button of debugButtons) {
    if (button) button.disabled = !enabled;
  }
}

async function saveCharacter() {
  if (!selectedCharacterId) {
    setStatus("Select a character first.", "bad");
    return;
  }
  const character = {
    roomId: getValue("characterRoomInput"),
    level: Number(getValue("characterLevelInput")),
    xp: Number(getValue("characterXpInput")),
    tickets: Number(getValue("characterTicketsInput")),
    hp: Number(getValue("characterHpInput")),
    mana: Number(getValue("characterManaInput")),
    titles: splitList(getValue("characterTitlesInput")),
    flags: splitList(getValue("characterFlagsInput")),
    inventory: splitList(getValue("characterInventoryInput")),
    sanctuaryRoomId: getValue("characterSanctuaryInput")
  };
  setStatus("Saving character...", "");
  try {
    const response = await fetch(adminUrl(`/api/admin/characters/${selectedCharacterId}`), {
      method: "PUT",
      headers: adminHeaders(true),
      body: adminBody({ character })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    characters = data.characters ?? characters;
    renderCharacters(characters);
    fillCharacterForm(data.character);
    recordSave();
    setStatus("Character saved.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function runCharacterDebug(debug) {
  if (!selectedCharacterId) {
    setStatus("Select a character first.", "bad");
    return;
  }
  if ((debug.action === "grantFlag" || debug.action === "removeFlag") && !debug.flag) {
    setStatus("Enter a flag first.", "bad");
    return;
  }
  setStatus("Running debug action...", "");
  try {
    const response = await fetch(adminUrl(`/api/admin/characters/${selectedCharacterId}/debug`), {
      method: "POST",
      headers: adminHeaders(true),
      body: adminBody({ debug })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    characters = data.characters ?? characters;
    renderCharacters(characters);
    fillCharacterForm(data.character);
    recordSave();
    setStatus("Debug action applied.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function renderNpcDrops() {
  npcDropList.innerHTML = "";
  if (!npcDrops.length) {
    const empty = document.createElement("div");
    empty.className = "placement-empty";
    empty.textContent = "No drops yet.";
    npcDropList.append(empty);
    return;
  }

  npcDrops.forEach((drop, index) => {
    const row = document.createElement("div");
    row.className = "drop-row";
    const itemLabel = document.createElement("label");
    itemLabel.textContent = "Item";
    const itemSelect = document.createElement("select");
    for (const item of world.items) itemSelect.append(new Option(item.name, item.id));
    itemSelect.value = drop.itemId;
    itemSelect.addEventListener("change", () => {
      npcDrops[index].itemId = itemSelect.value;
    });
    itemLabel.append(itemSelect);

    const chanceLabel = document.createElement("label");
    chanceLabel.textContent = "Chance";
    const chanceInput = document.createElement("input");
    chanceInput.type = "number";
    chanceInput.min = "0";
    chanceInput.max = "100";
    chanceInput.value = String(Math.round((drop.chance ?? 0) * 100));
    chanceInput.addEventListener("change", () => {
      npcDrops[index].chance = Number(chanceInput.value) / 100;
    });
    chanceLabel.append(chanceInput);

    const quantityLabel = document.createElement("label");
    quantityLabel.textContent = "Qty";
    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.min = "1";
    quantityInput.value = String(drop.quantity ?? 1);
    quantityInput.addEventListener("change", () => {
      npcDrops[index].quantity = Number(quantityInput.value);
    });
    quantityLabel.append(quantityInput);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      npcDrops.splice(index, 1);
      renderNpcDrops();
    });

    row.append(itemLabel, chanceLabel, quantityLabel, remove);
    npcDropList.append(row);
  });
}

function renderPlacementPickers() {
  if (!world) return;
  renderPlacementPicker({
    container: itemPicker,
    filter: itemFilter.value,
    entries: world.items,
    selected: selectedItemSpawns,
    emptyText: "No matching items.",
    describe: (item) => item.description,
    spawnControls: true
  });
  renderPlacementPicker({
    container: npcPicker,
    filter: npcFilter.value,
    entries: world.npcs,
    selected: selectedNpcs,
    emptyText: "No matching NPCs.",
    describe: (npc) => `${npc.species} | ${npc.disposition}`
  });
}

function renderPlacementPicker({ container, filter, entries, selected, emptyText, describe, spawnControls = false }) {
  container.innerHTML = "";
  const loweredFilter = filter.trim().toLowerCase();
  const matches = entries.filter((entry) => `${entry.name} ${entry.id} ${describe(entry)}`.toLowerCase().includes(loweredFilter));

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "placement-empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const entry of matches) {
    const option = document.createElement("label");
    option.className = "placement-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(entry.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked && spawnControls) selected.set(entry.id, { itemId: entry.id, quantity: 1, respawnSeconds: 0, startsAvailable: true });
      else if (checkbox.checked) selected.add(entry.id);
      else selected.delete(entry.id);
      renderPlacementPickers();
    });

    const text = document.createElement("span");
    const name = document.createElement("strong");
    const meta = document.createElement("small");
    const description = document.createElement("small");
    name.textContent = entry.name;
    meta.textContent = entry.id;
    description.textContent = describe(entry);
    text.append(name, meta, description);
    option.append(checkbox, text);
    if (spawnControls && selected.has(entry.id)) option.append(spawnFieldset(entry.id, selected.get(entry.id)));
    container.append(option);
  }
}

function spawnFieldset(itemId, spawn) {
  const fields = document.createElement("div");
  fields.className = "spawn-fields";
  fields.append(
    numberField("Qty", spawn.quantity, 1, (value) => {
      selectedItemSpawns.set(itemId, { ...spawn, quantity: Math.max(1, value) });
    }),
    numberField("Respawn s", spawn.respawnSeconds ?? 0, 0, (value) => {
      selectedItemSpawns.set(itemId, { ...spawn, respawnSeconds: Math.max(0, value) });
    }),
    checkboxField("Starts", spawn.startsAvailable, (checked) => {
      selectedItemSpawns.set(itemId, { ...spawn, startsAvailable: checked });
    })
  );
  return fields;
}

function numberField(labelText, value, min, onChange) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.value = String(value);
  input.addEventListener("change", () => onChange(Number(input.value)));
  label.append(labelText, input);
  return label;
}

function checkboxField(labelText, value, onChange) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(labelText, input);
  return label;
}

async function quickCreateLinkedRoom() {
  if (!world || !selectedRoomId) return;
  if (!confirmDiscardChanges()) return;
  const source = world.rooms.find((room) => room.id === selectedRoomId);
  if (!source) return;
  const direction = quickRoomDirection.value;
  if (source.exits?.[direction]?.to) {
    setStatus(`${source.name} already has a ${direction} exit.`, "bad");
    return;
  }

  const coords = nextOpenCoordsFrom(source.coords, direction);
  const room = {
    id: uniqueRoomId(`${source.id}-${direction}`),
    zoneId: source.zoneId,
    name: `New ${capitalize(direction)} Room`,
    description: "An unwritten place waits for its first scene.",
    coords,
    tags: [],
    map: { symbol: "?", label: "New" },
    exits: {},
    items: [],
    itemSpawns: [],
    npcs: []
  };
  setStatus("Creating linked room...", "");

  try {
    const response = await fetch(adminUrl("/api/admin/rooms/link"), {
      method: "POST",
      headers: adminHeaders(true),
      body: adminBody({ sourceRoomId: source.id, direction, room })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    world = data;
    selectedRoomId = room.id;
    creatingRoom = false;
    renderAll();
    recordSave();
    setStatus(`Created ${room.name} and linked it ${direction} from ${source.name}.`, "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function renderConfigEditor() {
  if (!characterConfig || !configList || !configEditor) return;
  const sections = [
    ["leveling", "Leveling"],
    ["combat", "Combat"],
    ["stats", "Stats"],
    ["species", "Internal Origin"],
    ["jobs", "Classes & Skills"]
  ];
  configList.innerHTML = "";
  for (const [id, label] of sections) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("active", selectedConfigSection === id);
    button.innerHTML = `<span>${label}</span><small>${configSectionSummary(id)}</small>`;
    button.addEventListener("click", () => {
      if (!confirmDiscardChanges()) return;
      selectedConfigSection = id;
      renderConfigEditor();
      clearDirty();
    });
    configList.append(button);
  }

  configEditorTitle.textContent = sections.find(([id]) => id === selectedConfigSection)?.[1] ?? "Character Config";
  if (selectedConfigSection === "leveling") renderLevelingConfig();
  if (selectedConfigSection === "combat") renderCombatConfig();
  if (selectedConfigSection === "stats") renderStatsConfig();
  if (selectedConfigSection === "species") renderSpeciesConfig();
  if (selectedConfigSection === "jobs") renderJobsConfig();
}

function configSectionSummary(section) {
  if (section === "leveling") return `Max ${characterConfig.leveling?.maxLevel ?? "--"}`;
  if (section === "combat") return "Vitals & crits";
  if (section === "stats") return `${characterConfig.stats?.length ?? 0} stats`;
  if (section === "species") return `${characterConfig.species?.length ?? 0} internal origin`;
  if (section === "jobs") return `${characterConfig.jobs?.length ?? 0} classes`;
  return "";
}

function renderLevelingConfig() {
  const leveling = characterConfig.leveling ?? {};
  configEditor.innerHTML = `
    <form class="room-form">
      <label>Base XP To Level<input data-config-leveling="baseXpToLevel" type="number" min="1" value="${leveling.baseXpToLevel ?? 100}" /></label>
      <label>XP Growth Rate<input data-config-leveling="xpGrowthRate" type="number" min="1" step="0.01" value="${leveling.xpGrowthRate ?? 1.2}" /></label>
      <label>Max Level<input data-config-leveling="maxLevel" type="number" min="1" value="${leveling.maxLevel ?? 50}" /></label>
      <label>Combat XP Multiplier<input data-config-leveling="combatXpMultiplier" type="number" min="0" step="0.05" value="${leveling.combatXpMultiplier ?? 1}" /></label>
      <label>Quest XP Multiplier<input data-config-leveling="questXpMultiplier" type="number" min="0" step="0.05" value="${leveling.questXpMultiplier ?? 1}" /></label>
    </form>
  `;
}

function renderCombatConfig() {
  const combat = characterConfig.combat ?? {};
  configEditor.innerHTML = `
    <form class="room-form">
      <div class="mini-grid">
        <label>Base Max HP<input data-config-combat="baseMaxHp" type="number" min="1" value="${combat.baseMaxHp ?? 18}" /></label>
        <label>HP per Ramp<input data-config-combat="heartMaxHpBonus" type="number" min="0" step="0.1" value="${combat.heartMaxHpBonus ?? 2}" /></label>
        <label>NPC HP per Ramp<input data-config-combat="npcHeartMaxHpBonus" type="number" min="0" step="0.1" value="${combat.npcHeartMaxHpBonus ?? 0.5}" /></label>
        <label>Base Max Energy<input data-config-combat="baseMaxMana" type="number" min="0" value="${combat.baseMaxMana ?? 10}" /></label>
        <label>Energy per Combo<input data-config-combat="witMaxManaBonus" type="number" min="0" step="0.1" value="${combat.witMaxManaBonus ?? 1}" /></label>
        <label>Base Attack Cooldown MS<input data-config-combat="baseAttackCooldownMs" type="number" min="1" value="${combat.baseAttackCooldownMs ?? 4200}" /></label>
        <label>Tempo Cooldown Reduction MS<input data-config-combat="graceCooldownReductionMs" type="number" min="0" value="${combat.graceCooldownReductionMs ?? 180}" /></label>
        <label>Minimum Attack Cooldown MS<input data-config-combat="minimumAttackCooldownMs" type="number" min="1" value="${combat.minimumAttackCooldownMs ?? 1400}" /></label>
        <label>Base Damage Crit Chance<input data-config-combat="baseDamageCritChance" type="number" min="0" max="1" step="0.01" value="${combat.baseDamageCritChance ?? 0.03}" /></label>
        <label>Control Damage Crit Bonus<input data-config-combat="sparkDamageCritChanceBonus" type="number" min="0" max="1" step="0.01" value="${combat.sparkDamageCritChanceBonus ?? 0.01}" /></label>
        <label>Max Damage Crit Chance<input data-config-combat="maximumDamageCritChance" type="number" min="0" max="1" step="0.01" value="${combat.maximumDamageCritChance ?? 0.35}" /></label>
        <label>Damage Crit Multiplier<input data-config-combat="damageCritMultiplier" type="number" min="1" step="0.1" value="${combat.damageCritMultiplier ?? 1.5}" /></label>
        <label>Base Heal Crit Chance<input data-config-combat="baseHealCritChance" type="number" min="0" max="1" step="0.01" value="${combat.baseHealCritChance ?? 0.03}" /></label>
        <label>Synergy Heal Crit Bonus<input data-config-combat="bondHealCritChanceBonus" type="number" min="0" max="1" step="0.01" value="${combat.bondHealCritChanceBonus ?? 0.01}" /></label>
        <label>Max Heal Crit Chance<input data-config-combat="maximumHealCritChance" type="number" min="0" max="1" step="0.01" value="${combat.maximumHealCritChance ?? 0.35}" /></label>
        <label>Heal Crit Multiplier<input data-config-combat="healCritMultiplier" type="number" min="1" step="0.1" value="${combat.healCritMultiplier ?? 1.5}" /></label>
        <label>Base Run Chance<input data-config-combat="baseFleeChance" type="number" min="0" max="1" step="0.01" value="${combat.baseFleeChance ?? 0.35}" /></label>
        <label>Tempo Run Bonus<input data-config-combat="graceFleeBonus" type="number" min="0" max="1" step="0.001" value="${combat.graceFleeBonus ?? 0.035}" /></label>
        <label>Maximum Run Chance<input data-config-combat="maximumFleeChance" type="number" min="0" max="1" step="0.01" value="${combat.maximumFleeChance ?? 0.85}" /></label>
        <label>Death Respawn Seconds<input data-config-combat="deathRespawnSeconds" type="number" min="1" value="${combat.deathRespawnSeconds ?? 20}" /></label>
        <label>Out of Combat Recovery HP<input data-config-combat="outOfCombatRecoveryHp" type="number" min="0" value="${combat.outOfCombatRecoveryHp ?? 1}" /></label>
        <label>Out of Combat Recovery Seconds<input data-config-combat="outOfCombatRecoverySeconds" type="number" min="1" value="${combat.outOfCombatRecoverySeconds ?? 20}" /></label>
        <label>NPC Spawn Seconds<input data-config-combat="npcSpawnSeconds" type="number" min="0" value="${combat.npcSpawnSeconds ?? 20}" /></label>
        <label>NPC Despawn Seconds<input data-config-combat="npcDespawnSeconds" type="number" min="0" value="${combat.npcDespawnSeconds ?? 10}" /></label>
        <label>Players Per NPC<input data-config-combat="npcPlayersPerInstance" type="number" min="1" value="${combat.npcPlayersPerInstance ?? 1}" /></label>
        <label>Max NPCs Per Type<input data-config-combat="npcMaxInstancesPerType" type="number" min="1" value="${combat.npcMaxInstancesPerType ?? 4}" /></label>
        <label>Recover Energy Amount<input data-config-combat="restManaRecoveryAmount" type="number" min="0" value="${combat.restManaRecoveryAmount ?? 3}" /></label>
        <label>Recover Energy Seconds<input data-config-combat="restManaRecoverySeconds" type="number" min="1" value="${combat.restManaRecoverySeconds ?? 6}" /></label>
        <label>Recover HP Amount<input data-config-combat="restHpRecoveryAmount" type="number" min="0" value="${combat.restHpRecoveryAmount ?? 3}" /></label>
        <label>Recover HP Seconds<input data-config-combat="restHpRecoverySeconds" type="number" min="1" value="${combat.restHpRecoverySeconds ?? 6}" /></label>
        <label>Checkpoint Recovery Multiplier<input data-config-combat="sanctuaryRestMultiplier" type="number" min="1" step="0.1" value="${combat.sanctuaryRestMultiplier ?? 2}" /></label>
      </div>
      <fieldset class="drop-editor">
        <legend>Basic Player Damage</legend>
        ${renderDamageFormulaInputs("playerDamage", combat.playerDamage)}
      </fieldset>
      <fieldset class="drop-editor">
        <legend>NPC Damage</legend>
        ${renderDamageFormulaInputs("npcDamage", combat.npcDamage)}
      </fieldset>
    </form>
  `;
}

function renderDamageFormulaInputs(name, formula = {}) {
  return `
    <div class="mini-grid">
      <label>Base<input data-config-formula="${name}" data-formula-field="base" type="number" value="${formula.base ?? 1}" /></label>
      <label>Stat<input data-config-formula="${name}" data-formula-field="stat" value="${escapeHtml(formula.stat ?? "might")}" /></label>
      <label>Divisor<input data-config-formula="${name}" data-formula-field="divisor" type="number" min="1" value="${formula.divisor ?? 3}" /></label>
      <label>Random Min<input data-config-formula="${name}" data-formula-field="randomMin" type="number" value="${formula.randomMin ?? 0}" /></label>
      <label>Random Max<input data-config-formula="${name}" data-formula-field="randomMax" type="number" value="${formula.randomMax ?? 2}" /></label>
    </div>
  `;
}

function renderStatsConfig() {
  configEditor.innerHTML = `<div class="config-stack">${(characterConfig.stats ?? [])
    .map(
      (stat, index) => `
        <fieldset class="drop-editor" data-config-stat="${index}">
          <legend>${escapeHtml(stat.name)}</legend>
          <div class="mini-grid">
            <label>ID<input data-field="id" value="${escapeHtml(stat.id)}" /></label>
            <label>Name<input data-field="name" value="${escapeHtml(stat.name)}" /></label>
            <label>Base<input data-field="base" type="number" value="${stat.base ?? 8}" /></label>
          </div>
          <label>Description<textarea data-field="description" rows="3">${escapeHtml(stat.description ?? "")}</textarea></label>
        </fieldset>
      `
    )
    .join("")}</div>`;
}

function renderSpeciesConfig() {
  configEditor.innerHTML = `<div class="config-stack">${(characterConfig.species ?? [])
    .map(
      (species, index) => `
        <fieldset class="drop-editor" data-config-species="${index}">
          <legend>${escapeHtml(species.name)}</legend>
          <div class="mini-grid">
            <label>ID<input data-field="id" value="${escapeHtml(species.id)}" /></label>
            <label>Name<input data-field="name" value="${escapeHtml(species.name)}" /></label>
            <label>Modifiers<input data-field="modifiers" value="${escapeHtml(formatStatMap(species.modifiers))}" /></label>
            <label>Growth / Level<input data-field="growthPerLevel" value="${escapeHtml(formatStatMap(species.growthPerLevel))}" /></label>
          </div>
          <label>Description<textarea data-field="description" rows="3">${escapeHtml(species.description ?? "")}</textarea></label>
        </fieldset>
      `
    )
    .join("")}</div>`;
}

function renderJobsConfig() {
  configEditor.innerHTML = `<div class="config-stack">${(characterConfig.jobs ?? [])
    .map(
      (job, jobIndex) => `
        <fieldset class="drop-editor" data-config-job="${jobIndex}">
          <legend>${escapeHtml(job.name)} <button class="small-inline-button" data-add-skill="${jobIndex}" type="button">Add Skill</button></legend>
          <div class="mini-grid">
            <label>ID<input data-field="id" value="${escapeHtml(job.id)}" /></label>
            <label>Name<input data-field="name" value="${escapeHtml(job.name)}" /></label>
            <label>Primary Stats<input data-field="primaryStats" value="${escapeHtml((job.primaryStats ?? []).join(", "))}" /></label>
            <label>Starting Modifiers<input data-field="modifiers" value="${escapeHtml(formatStatMap(job.modifiers))}" /></label>
            <label>Growth / Level<input data-field="growthPerLevel" value="${escapeHtml(formatStatMap(job.growthPerLevel))}" /></label>
            <label>Starter Item ID<input data-field="starterItemId" value="${escapeHtml(job.starterItemId ?? "")}" /></label>
            <label>Mechanic ID<input data-field="mechanicId" value="${escapeHtml(job.mechanic?.id ?? "")}" /></label>
            <label>Mechanic Name<input data-field="mechanicName" value="${escapeHtml(job.mechanic?.name ?? "")}" /></label>
            <label>Max Mechanic<input data-field="mechanicMaxStacks" type="number" min="1" value="${job.mechanic?.maxStacks ?? 1}" /></label>
            <label>Basic Attack Gain<input data-field="mechanicBasicAttackGain" type="number" min="0" value="${job.mechanic?.basicAttackGain ?? 0}" /></label>
            <label>Damage / Stack<input data-field="mechanicDamagePerStack" type="number" min="0" step="0.1" value="${job.mechanic?.damagePerStack ?? 0}" /></label>
            <label>Healing / Stack<input data-field="mechanicHealingPerStack" type="number" min="0" step="0.1" value="${job.mechanic?.healingPerStack ?? 0}" /></label>
            <label>Guard / Stack<input data-field="mechanicGuardPerStack" type="number" min="0" step="0.1" value="${job.mechanic?.guardPerStack ?? 0}" /></label>
          </div>
          <label>Description<textarea data-field="description" rows="3">${escapeHtml(job.description ?? "")}</textarea></label>
          <label>Mechanic Description<textarea data-field="mechanicDescription" rows="2">${escapeHtml(job.mechanic?.description ?? "")}</textarea></label>
          <div class="config-skill-list">
            ${(job.skills ?? [])
              .map(
                (skill, skillIndex) => renderSkillEditor(skill, jobIndex, skillIndex)
              )
              .join("")}
          </div>
        </fieldset>
      `
    )
    .join("")}</div>`;
  wireSkillEditorActions();
}

function renderSkillEditor(skill, jobIndex, skillIndex) {
  const effects = skill.effects ?? (skill.effect ? [skill.effect] : []);
  return `
    <fieldset class="drop-editor config-skill" data-config-skill="${skillIndex}">
      <legend>
        ${escapeHtml(skill.name)} L${skill.level}
        <button class="small-inline-button" data-remove-skill="${jobIndex}:${skillIndex}" type="button">Remove</button>
      </legend>
      <div class="mini-grid">
        <label>ID<input data-skill-field="id" value="${escapeHtml(skill.id)}" /></label>
        <label>Name<input data-skill-field="name" value="${escapeHtml(skill.name)}" /></label>
        <label>Level<input data-skill-field="level" type="number" min="1" value="${skill.level ?? 1}" /></label>
        <label>Energy Cost<input data-skill-field="manaCost" type="number" min="0" value="${skill.manaCost ?? 0}" /></label>
        <label>Cooldown<input data-skill-field="cooldownSeconds" type="number" min="0" step="0.1" value="${skill.cooldownSeconds ?? 3}" /></label>
        <label>Scales With
          <select data-skill-field="scalesWith">
            ${(characterConfig.stats ?? []).map((stat) => `<option value="${escapeHtml(stat.id)}"${skill.scalesWith === stat.id ? " selected" : ""}>${escapeHtml(stat.name)}</option>`).join("")}
          </select>
        </label>
        <label><span>Requires Combat</span><input data-skill-field="requiresCombat" type="checkbox"${skill.requiresCombat ? " checked" : ""} /></label>
        <label>Mechanic Gain<input data-skill-field="mechanicGain" type="number" min="0" value="${skill.mechanicGain ?? 0}" /></label>
        <label>Mechanic Cost<input data-skill-field="mechanicCost" type="number" min="0" value="${skill.mechanicCost ?? 0}" /></label>
        <label><span>Spend All Mechanic</span><input data-skill-field="mechanicSpendAll" type="checkbox"${skill.mechanicSpendAll ? " checked" : ""} /></label>
        <label><span>Passive Unlock</span><input data-skill-field="passiveEnabled" type="checkbox"${skill.passive ? " checked" : ""} /></label>
      </div>
      <label>Description<textarea data-skill-field="description" rows="3">${escapeHtml(skill.description ?? "")}</textarea></label>
      <fieldset class="drop-editor" data-passive-fields${skill.passive ? "" : " hidden"}>
        <legend>Passive Mechanic Modifiers</legend>
        <div class="mini-grid">
          <label>Starting Stacks<input data-passive-field="startStacks" type="number" min="0" value="${skill.passive?.startStacks ?? 0}" /></label>
          <label>Max Stacks Bonus<input data-passive-field="maxStacksBonus" type="number" min="0" value="${skill.passive?.maxStacksBonus ?? 0}" /></label>
          <label>Basic Gain Bonus<input data-passive-field="basicAttackGainBonus" type="number" min="0" value="${skill.passive?.basicAttackGainBonus ?? 0}" /></label>
          <label>Damage / Stack Bonus<input data-passive-field="damagePerStackBonus" type="number" min="0" step="0.1" value="${skill.passive?.damagePerStackBonus ?? 0}" /></label>
          <label>Healing / Stack Bonus<input data-passive-field="healingPerStackBonus" type="number" min="0" step="0.1" value="${skill.passive?.healingPerStackBonus ?? 0}" /></label>
          <label>Guard / Stack Bonus<input data-passive-field="guardPerStackBonus" type="number" min="0" step="0.1" value="${skill.passive?.guardPerStackBonus ?? 0}" /></label>
          <label>Energy / Stack Spent<input data-passive-field="energyPerStackSpent" type="number" min="0" step="0.1" value="${skill.passive?.energyPerStackSpent ?? 0}" /></label>
          <label>Healing / Stack Spent<input data-passive-field="healingPerStackSpent" type="number" min="0" step="0.1" value="${skill.passive?.healingPerStackSpent ?? 0}" /></label>
          <label>Retain After Spend All<input data-passive-field="retainStacksOnSpendAll" type="number" min="0" value="${skill.passive?.retainStacksOnSpendAll ?? 0}" /></label>
        </div>
      </fieldset>
      <div class="config-effect-list">
        ${effects.map((effect, effectIndex) => renderEffectEditor(effect, jobIndex, skillIndex, effectIndex, skill.scalesWith)).join("")}
      </div>
      <button class="small-button" data-add-effect="${jobIndex}:${skillIndex}" type="button">Add Effect</button>
    </fieldset>
  `;
}

function renderEffectEditor(effect, jobIndex, skillIndex, effectIndex, defaultStat) {
  const formula = effect.formula ?? { base: 1, stat: defaultStat, divisor: 3, randomMin: 0, randomMax: 1 };
  return `
    <fieldset class="drop-editor config-effect" data-config-effect="${effectIndex}">
      <legend>
        ${escapeHtml(capitalize(effect.type ?? "damage"))} Effect
        <button class="small-inline-button" data-remove-effect="${jobIndex}:${skillIndex}:${effectIndex}" type="button">Remove</button>
      </legend>
      <div class="mini-grid">
        <label>Type
          <select data-effect-field="type">
            ${["damage", "heal", "guard"].map((type) => `<option value="${type}"${effect.type === type ? " selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label class="wide-ish">Message<input data-effect-field="message" value="${escapeHtml(effect.message ?? "")}" /></label>
        <label data-effect-formula>Base<input data-effect-field="base" type="number" value="${formula.base ?? 1}" /></label>
        <label data-effect-formula data-effect-stat>Stat
          <select data-effect-field="stat">
            ${(characterConfig.stats ?? []).map((stat) => `<option value="${escapeHtml(stat.id)}"${formula.stat === stat.id ? " selected" : ""}>${escapeHtml(stat.name)}</option>`).join("")}
          </select>
        </label>
        <label data-effect-formula>Divisor<input data-effect-field="divisor" type="number" min="1" value="${formula.divisor ?? 3}" /></label>
        <label data-effect-formula>Random Min<input data-effect-field="randomMin" type="number" value="${formula.randomMin ?? 0}" /></label>
        <label data-effect-formula>Random Max<input data-effect-field="randomMax" type="number" value="${formula.randomMax ?? 1}" /></label>
        <label data-effect-guard>Guard Amount<input data-effect-field="amount" type="number" min="1" value="${effect.amount ?? 1}" /></label>
        <label data-effect-guard>Charges<input data-effect-field="charges" type="number" min="1" value="${effect.charges ?? 1}" /></label>
      </div>
    </fieldset>
  `;
}

function wireSkillEditorActions() {
  configEditor.querySelectorAll("[data-add-skill]").forEach((button) => {
    button.addEventListener("click", () => {
      characterConfig.jobs = readJobsConfig();
      const job = characterConfig.jobs[Number(button.dataset.addSkill)];
      job.skills.push(newSkillDraft(job));
      renderJobsConfig();
    });
  });
  configEditor.querySelectorAll("[data-remove-skill]").forEach((button) => {
    button.addEventListener("click", () => {
      characterConfig.jobs = readJobsConfig();
      const [jobIndex, skillIndex] = button.dataset.removeSkill.split(":").map(Number);
      characterConfig.jobs[jobIndex].skills.splice(skillIndex, 1);
      renderJobsConfig();
    });
  });
  configEditor.querySelectorAll("[data-add-effect]").forEach((button) => {
    button.addEventListener("click", () => {
      characterConfig.jobs = readJobsConfig();
      const [jobIndex, skillIndex] = button.dataset.addEffect.split(":").map(Number);
      characterConfig.jobs[jobIndex].skills[skillIndex].effects.push(newEffectDraft(characterConfig.jobs[jobIndex].skills[skillIndex].scalesWith));
      renderJobsConfig();
    });
  });
  configEditor.querySelectorAll("[data-remove-effect]").forEach((button) => {
    button.addEventListener("click", () => {
      characterConfig.jobs = readJobsConfig();
      const [jobIndex, skillIndex, effectIndex] = button.dataset.removeEffect.split(":").map(Number);
      characterConfig.jobs[jobIndex].skills[skillIndex].effects.splice(effectIndex, 1);
      renderJobsConfig();
    });
  });
  configEditor.querySelectorAll('[data-effect-field="type"]').forEach((select) => {
    select.addEventListener("change", () => updateEffectFieldVisibility(select.closest("[data-config-effect]")));
    updateEffectFieldVisibility(select.closest("[data-config-effect]"));
  });
  configEditor.querySelectorAll('[data-skill-field="passiveEnabled"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => updatePassiveFieldVisibility(checkbox.closest("[data-config-skill]")));
    updatePassiveFieldVisibility(checkbox.closest("[data-config-skill]"));
  });
}

function newSkillDraft(job) {
  const stat = job.primaryStats?.[0] ?? characterConfig.stats?.[0]?.id ?? "might";
  return {
    id: uniqueSkillId(job, "new-skill"),
    name: "New Skill",
    description: "A new class technique waiting for its place in Cardbound City.",
    level: 1,
    manaCost: 3,
    cooldownSeconds: 3.5,
    requiresCombat: true,
    scalesWith: stat,
    effects: [newEffectDraft(stat)]
  };
}

function newEffectDraft(stat) {
  return {
    type: "damage",
    message: "Your new skill hits {target} for {damage} damage.",
    formula: {
      base: 3,
      stat,
      divisor: 3,
      randomMin: 1,
      randomMax: 2
    }
  };
}

function uniqueSkillId(job, baseId) {
  const existingIds = new Set((job.skills ?? []).map((skill) => skill.id));
  let id = baseId;
  let count = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${count}`;
    count += 1;
  }
  return id;
}

function updateEffectFieldVisibility(row) {
  if (!row) return;
  const type = row.querySelector('[data-effect-field="type"]').value;
  row.querySelectorAll("[data-effect-formula]").forEach((field) => {
    field.hidden = type === "guard";
  });
  row.querySelectorAll("[data-effect-stat]").forEach((field) => {
    field.hidden = type !== "heal";
  });
  row.querySelectorAll("[data-effect-guard]").forEach((field) => {
    field.hidden = type !== "guard";
  });
}

function updatePassiveFieldVisibility(row) {
  if (!row) return;
  const enabled = row.querySelector('[data-skill-field="passiveEnabled"]').checked;
  row.querySelector("[data-passive-fields]").hidden = !enabled;
}

async function saveConfig() {
  if (!characterConfig) return;
  if (!confirmValidationSave("character config")) return;
  const config = readConfigEditor();
  setStatus("Saving character config...", "");
  try {
    const response = await fetch(adminUrl("/api/admin/character-config"), {
      method: "PUT",
      headers: adminHeaders(true),
      body: adminBody({ config })
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" "));
    characterConfig = data;
    renderConfigEditor();
    recordSave();
    setStatus("Character config saved and live characters reloaded.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function readConfigEditor() {
  const config = structuredClone(characterConfig);
  if (selectedConfigSection === "leveling") {
    config.leveling = Object.fromEntries(
      [...configEditor.querySelectorAll("[data-config-leveling]")].map((input) => [input.dataset.configLeveling, Number(input.value)])
    );
  }
  if (selectedConfigSection === "combat") {
    config.combat = {
      ...config.combat,
      ...Object.fromEntries(
        [...configEditor.querySelectorAll("[data-config-combat]")].map((input) => [input.dataset.configCombat, Number(input.value)])
      ),
      playerDamage: readDamageFormula("playerDamage"),
      npcDamage: readDamageFormula("npcDamage")
    };
  }
  if (selectedConfigSection === "stats") {
    config.stats = [...configEditor.querySelectorAll("[data-config-stat]")].map((row) => ({
      id: row.querySelector('[data-field="id"]').value.trim(),
      name: row.querySelector('[data-field="name"]').value.trim(),
      description: row.querySelector('[data-field="description"]').value.trim(),
      base: Number(row.querySelector('[data-field="base"]').value)
    }));
  }
  if (selectedConfigSection === "species") {
    config.species = [...configEditor.querySelectorAll("[data-config-species]")].map((row) => ({
      id: row.querySelector('[data-field="id"]').value.trim(),
      name: row.querySelector('[data-field="name"]').value.trim(),
      description: row.querySelector('[data-field="description"]').value.trim(),
      modifiers: parseStatMap(row.querySelector('[data-field="modifiers"]').value),
      growthPerLevel: parseStatMap(row.querySelector('[data-field="growthPerLevel"]').value)
    }));
  }
  if (selectedConfigSection === "jobs") {
    config.jobs = readJobsConfig();
  }
  return config;
}

function readDamageFormula(name) {
  const fields = Object.fromEntries(
    [...configEditor.querySelectorAll(`[data-config-formula="${name}"]`)].map((input) => [input.dataset.formulaField, input.value])
  );
  return {
    base: Number(fields.base),
    stat: String(fields.stat ?? "").trim(),
    divisor: Number(fields.divisor),
    randomMin: Number(fields.randomMin),
    randomMax: Number(fields.randomMax)
  };
}

function readJobsConfig() {
  return [...configEditor.querySelectorAll("[data-config-job]")].map((row) => cleanObject({
    id: row.querySelector('[data-field="id"]').value.trim(),
    name: row.querySelector('[data-field="name"]').value.trim(),
    description: row.querySelector('[data-field="description"]').value.trim(),
    primaryStats: splitList(row.querySelector('[data-field="primaryStats"]').value),
    modifiers: parseStatMap(row.querySelector('[data-field="modifiers"]').value),
    growthPerLevel: parseStatMap(row.querySelector('[data-field="growthPerLevel"]').value),
    starterItemId: row.querySelector('[data-field="starterItemId"]').value.trim() || undefined,
    mechanic: readJobMechanic(row),
    skills: [...row.querySelectorAll("[data-config-skill]")].map(readSkillEditor)
  }));
}

function readJobMechanic(row) {
  const id = row.querySelector('[data-field="mechanicId"]').value.trim();
  if (!id) return undefined;
  return {
    id,
    name: row.querySelector('[data-field="mechanicName"]').value.trim(),
    description: row.querySelector('[data-field="mechanicDescription"]').value.trim(),
    maxStacks: Number(row.querySelector('[data-field="mechanicMaxStacks"]').value),
    basicAttackGain: Number(row.querySelector('[data-field="mechanicBasicAttackGain"]').value),
    damagePerStack: Number(row.querySelector('[data-field="mechanicDamagePerStack"]').value),
    healingPerStack: Number(row.querySelector('[data-field="mechanicHealingPerStack"]').value),
    guardPerStack: Number(row.querySelector('[data-field="mechanicGuardPerStack"]').value)
  };
}

function readSkillEditor(row) {
  const scalesWith = row.querySelector('[data-skill-field="scalesWith"]').value;
  return cleanObject({
    id: row.querySelector('[data-skill-field="id"]').value.trim(),
    name: row.querySelector('[data-skill-field="name"]').value.trim(),
    description: row.querySelector('[data-skill-field="description"]').value.trim(),
    level: Number(row.querySelector('[data-skill-field="level"]').value),
    manaCost: Number(row.querySelector('[data-skill-field="manaCost"]').value),
    cooldownSeconds: Number(row.querySelector('[data-skill-field="cooldownSeconds"]').value),
    requiresCombat: row.querySelector('[data-skill-field="requiresCombat"]').checked,
    scalesWith,
    mechanicGain: Number(row.querySelector('[data-skill-field="mechanicGain"]').value) || undefined,
    mechanicCost: Number(row.querySelector('[data-skill-field="mechanicCost"]').value) || undefined,
    mechanicSpendAll: row.querySelector('[data-skill-field="mechanicSpendAll"]').checked || undefined,
    passive: readSkillPassive(row),
    effects: [...row.querySelectorAll("[data-config-effect]")].map((effectRow) => readEffectEditor(effectRow, scalesWith))
  });
}

function readSkillPassive(row) {
  if (!row.querySelector('[data-skill-field="passiveEnabled"]').checked) return undefined;
  return cleanNumberObject(
    Object.fromEntries(
      [...row.querySelectorAll("[data-passive-field]")].map((input) => [input.dataset.passiveField, Number(input.value)])
    )
  );
}

function readEffectEditor(row, fallbackStat) {
  const type = row.querySelector('[data-effect-field="type"]').value;
  const message = row.querySelector('[data-effect-field="message"]').value.trim();
  if (type === "guard") {
    return {
      type,
      message,
      amount: Number(row.querySelector('[data-effect-field="amount"]').value),
      charges: Number(row.querySelector('[data-effect-field="charges"]').value)
    };
  }
  return {
    type,
    message,
    formula: {
      base: Number(row.querySelector('[data-effect-field="base"]').value),
      stat: type === "damage" ? fallbackStat : row.querySelector('[data-effect-field="stat"]').value || fallbackStat,
      divisor: Number(row.querySelector('[data-effect-field="divisor"]').value),
      randomMin: Number(row.querySelector('[data-effect-field="randomMin"]').value),
      randomMax: Number(row.querySelector('[data-effect-field="randomMax"]').value)
    }
  };
}

function formatStatMap(map) {
  return Object.entries(map ?? {})
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

function parseStatMap(value) {
  return cleanNumberObject(
    Object.fromEntries(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [key, rawValue] = part.split(":").map((piece) => piece.trim());
          return [key, Number(rawValue)];
        })
        .filter(([key, rawValue]) => key && Number.isFinite(rawValue))
    )
  );
}

function renderValidation() {
  validationList.innerHTML = "";
  const issues = world?.validation?.issues ?? [];
  const warnings = world?.validation?.warnings ?? [];
  const issueCount = issues.length;
  const warningCount = warnings.length;
  builderStatus?.classList.toggle("collapsed", !validationExpanded);
  validationToggle?.setAttribute("aria-expanded", String(validationExpanded));
  if (validationToggle) {
    const counts = [
      issueCount ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : "",
      warningCount ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""
    ].filter(Boolean);
    validationToggle.textContent = counts.length ? `Checks: ${counts.join(", ")}` : "Checks: OK";
  }
  if (!world?.validation) return;
  if (!validationExpanded) return;
  if (!issueCount && !warningCount) {
    const item = document.createElement("li");
    const progression = world.validation.progression;
    item.textContent = progression
      ? `Progression proof passed: ${progression.completedQuests}/${progression.totalQuests} quests, ${progression.reachableRooms}/${progression.totalRooms} rooms, and ${progression.collectibleOpponents} Collection opponents are reachable.`
      : "No builder issues found.";
    item.className = "validation-ok";
    validationList.append(item);
    return;
  }
  for (const issue of issues) {
    const item = document.createElement("li");
    item.textContent = issue;
    item.className = "validation-bad";
    validationList.append(item);
  }
  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    item.className = "validation-warning";
    validationList.append(item);
  }
}

function markDirty() {
  if (dirty) return;
  dirty = true;
  renderSaveMeta();
}

function clearDirty() {
  dirty = false;
  renderSaveMeta();
}

function recordSave() {
  lastSavedAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  clearDirty();
}

function renderSaveMeta() {
  if (!builderSaveMeta) return;
  const saveText = lastSavedAt ? `Last saved ${lastSavedAt}.` : "No saves this session.";
  builderSaveMeta.textContent = dirty ? `${saveText} Unsaved changes.` : saveText;
  builderSaveMeta.classList.toggle("validation-bad", dirty);
}

function confirmDiscardChanges() {
  if (!dirty) return true;
  return window.confirm("Discard unsaved builder changes?");
}

function confirmValidationSave(label) {
  const issueCount = world?.validation?.issues?.length ?? 0;
  if (!issueCount) return true;
  return window.confirm(`Builder validation currently has ${issueCount} issue(s). Save this ${label} anyway?`);
}

function setStatus(message, tone) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("validation-ok", tone === "ok");
  saveStatus.classList.toggle("validation-bad", tone === "bad");
}

function setAdminAuthStatus(message, tone) {
  if (!adminAuthStatus) return;
  adminAuthStatus.textContent = message;
  adminAuthStatus.classList.toggle("validation-ok", tone === "ok");
  adminAuthStatus.classList.toggle("validation-bad", tone === "bad");
}

function setAdminLoading(isLoading) {
  loadAdminButton.disabled = isLoading;
  loadAdminButton.textContent = isLoading ? "Loading..." : "Load";
}

async function downloadAdminExport(path, fallbackName) {
  if (!adminName.value.trim()) {
    setStatus("Enter an admin character name before exporting.", "bad");
    return;
  }
  try {
    const response = await fetch(adminUrl(path), adminRequestOptions());
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? "Export failed.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${filename}.`, "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function uniqueRoomId(baseId) {
  const existingIds = new Set(world.rooms.map((room) => room.id));
  let id = baseId;
  let count = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${count}`;
    count += 1;
  }
  return id;
}

function uniqueZoneId(baseId) {
  const existingIds = new Set(world.zones.map((zone) => zone.id));
  const normalizedBase = baseId || "new-zone";
  let id = normalizedBase;
  let count = 2;
  while (existingIds.has(id)) {
    id = `${normalizedBase}-${count}`;
    count += 1;
  }
  return id;
}

function nextOpenCoords(coords) {
  const occupied = new Set(world.rooms.map((room) => coordKey(room.coords)));
  const candidates = [
    { x: coords.x + 1, y: coords.y, z: coords.z },
    { x: coords.x, y: coords.y + 1, z: coords.z },
    { x: coords.x - 1, y: coords.y, z: coords.z },
    { x: coords.x, y: coords.y - 1, z: coords.z }
  ];
  const open = candidates.find((candidate) => !occupied.has(coordKey(candidate)));
  if (open) return open;
  let offset = 2;
  while (occupied.has(coordKey({ x: coords.x + offset, y: coords.y, z: coords.z }))) offset += 1;
  return { x: coords.x + offset, y: coords.y, z: coords.z };
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextOpenCoordsFrom(coords, direction) {
  const occupied = new Set(world.rooms.map((room) => coordKey(room.coords)));
  const offsets = {
    north: { x: 0, y: 1, z: 0 },
    east: { x: 1, y: 0, z: 0 },
    south: { x: 0, y: -1, z: 0 },
    west: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    down: { x: 0, y: 0, z: -1 }
  };
  const offset = offsets[direction] ?? offsets.east;
  let candidate = { x: coords.x + offset.x, y: coords.y + offset.y, z: coords.z + offset.z };
  let drift = 1;
  while (occupied.has(coordKey(candidate))) {
    candidate = { x: coords.x + offset.x + drift, y: coords.y + offset.y, z: coords.z + offset.z };
    drift += 1;
  }
  return candidate;
}

function coordKey(coords) {
  return `${coords.x},${coords.y},${coords.z}`;
}

function uniqueItemId(baseId) {
  const existingIds = new Set(world.items.map((item) => item.id));
  let id = baseId;
  let count = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${count}`;
    count += 1;
  }
  return id;
}

function uniqueNpcId(baseId) {
  const existingIds = new Set(world.npcs.map((npc) => npc.id));
  let id = baseId;
  let count = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${count}`;
    count += 1;
  }
  return id;
}

function uniqueQuestId(baseId) {
  const existingIds = new Set(world.quests.map((quest) => quest.id));
  let id = baseId;
  let count = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${count}`;
    count += 1;
  }
  return id;
}

function uniqueQuestPartId(baseId, parts) {
  const existingIds = new Set(parts.map((part) => part.id));
  let id = baseId;
  let count = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${count}`;
    count += 1;
  }
  return id;
}

function uniqueTopicKey(baseId) {
  const existingKeys = new Set(npcTopics.map((topic) => topic.key));
  let key = baseId;
  let count = 2;
  while (existingKeys.has(key)) {
    key = `${baseId}-${count}`;
    count += 1;
  }
  return key;
}

function itemSpawnsForRoom(room) {
  const explicit = room.itemSpawns ?? [];
  const explicitItemIds = new Set(explicit.map((spawn) => spawn.itemId));
  const legacy = (room.items ?? [])
    .filter((itemId) => !explicitItemIds.has(itemId))
    .map((itemId) => ({ itemId, quantity: 1, respawnSeconds: 0, startsAvailable: true }));
  return explicit.length ? [...explicit, ...legacy] : legacy;
}

function setValue(id, value) {
  const element = document.querySelector(`#${id}`);
  element.value = value;
}

function getValue(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function setChecked(id, checked) {
  document.querySelector(`#${id}`).checked = checked;
}

function getChecked(id) {
  return document.querySelector(`#${id}`).checked;
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "" && entry !== undefined));
}

function cleanNumberObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => Number.isFinite(entry) && entry !== 0));
}

function adminUrl(path) {
  const params = new URLSearchParams({ name: adminName.value.trim() });
  return `${path}?${params.toString()}`;
}

function adminHeaders(json = false) {
  const headers = {
    "x-admin-name": adminName.value.trim()
  };
  if (adminToken.value.trim()) {
    headers["x-admin-token"] = adminToken.value.trim();
    headers["x-admin-password"] = adminToken.value.trim();
  }
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function adminRequestOptions() {
  return { headers: adminHeaders() };
}

function adminBody(payload) {
  return JSON.stringify({
    adminName: adminName.value.trim(),
    adminToken: adminToken.value.trim(),
    adminPassword: adminToken.value.trim(),
    ...payload
  });
}

function zoneName(zoneId) {
  return world.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[match]);
}
