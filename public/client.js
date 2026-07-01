const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/play`);

const logEl = document.querySelector("#log");
const commandForm = document.querySelector("#commandForm");
const commandInput = document.querySelector("#commandInput");
const loginPanel = document.querySelector("#loginPanel");
const gameplayPanels = document.querySelectorAll(".game-only");
const accountInput = document.querySelector("#accountInput");
const passwordInput = document.querySelector("#passwordInput");
const accountLoginButton = document.querySelector("#accountLoginButton");
const accountCreateButton = document.querySelector("#accountCreateButton");
const characterPanel = document.querySelector("#characterPanel");
const characterSelect = document.querySelector("#characterSelect");
const enterCharacterButton = document.querySelector("#enterCharacterButton");
const loginButton = document.querySelector("#loginButton");
const nameInput = document.querySelector("#nameInput");
const speciesSelect = document.querySelector("#speciesSelect");
const jobSelect = document.querySelector("#jobSelect");
const creationPreview = document.querySelector("#creationPreview");
const adminInput = document.querySelector("#adminInput");
const roomName = document.querySelector("#roomName");
const roomMeta = document.querySelector("#roomMeta");
const areaMap = document.querySelector("#areaMap");
const areaMapMeta = document.querySelector("#areaMapMeta");
const hpText = document.querySelector("#hpText");
const hpBar = document.querySelector("#hpBar");
const manaText = document.querySelector("#manaText");
const manaBar = document.querySelector("#manaBar");
const speciesText = document.querySelector("#speciesText");
const jobText = document.querySelector("#jobText");
const levelText = document.querySelector("#levelText");
const xpText = document.querySelector("#xpText");
const ticketsText = document.querySelector("#ticketsText");
const binderCardsText = document.querySelector("#binderCardsText");
const titlesText = document.querySelector("#titlesText");
const statGrid = document.querySelector("#statGrid");
const skillProgress = document.querySelector("#skillProgress");
const profilePanelTitle = document.querySelector("#profilePanelTitle");
const profileFirstButton = document.querySelector("#profileFirstButton");
const profileSecondButton = document.querySelector("#profileSecondButton");
const profileView = document.querySelector("#profileView");
const inventoryView = document.querySelector("#inventoryView");
const equipmentView = document.querySelector("#equipmentView");
const inventoryTicketsText = document.querySelector("#inventoryTicketsText");
const inventoryCountText = document.querySelector("#inventoryCountText");
const equipmentCountText = document.querySelector("#equipmentCountText");
const inventoryList = document.querySelector("#inventoryList");
const equipmentList = document.querySelector("#equipmentList");
const questJournal = document.querySelector("#questJournal");
const activeQuestsButton = document.querySelector("#activeQuestsButton");
const completeQuestsButton = document.querySelector("#completeQuestsButton");
const combatTarget = document.querySelector("#combatTarget");
const attackAction = document.querySelector("#attackAction");
const fleeAction = document.querySelector("#fleeAction");
const restAction = document.querySelector("#restAction");
const skillGrid = document.querySelector("#skillGrid");
const editActionSlots = document.querySelector("#editActionSlots");
const slotEditor = document.querySelector("#slotEditor");
const adminBadge = document.querySelector("#adminBadge");
const ACTION_SLOT_COUNT = 4;
let characterConfig = { stats: [], species: [], jobs: [], defaultSpeciesId: "", defaultJobId: "" };
let currentState;
let accountState;
let serverClockOffset = 0;
let actionSlots = Array(ACTION_SLOT_COUNT).fill("");
let actionSlotKey = "";
let profileMode = "profile";
let lastTypedCommand = "";
let questFilter = "active";

loadCharacterConfig();
setInterval(updateActionPanel, 150);

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "system") appendLog([message.message]);
  if (message.type === "account") renderAccount(message.account);
  if (message.type === "log") appendLog(message.lines);
  if (message.type === "state") renderState(message.state);
});

logEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");
  if (!button) return;
  event.preventDefault();
  sendLinkedCommand(button.dataset.command);
});

accountLoginButton.addEventListener("click", accountLogin);
accountCreateButton.addEventListener("click", accountRegister);
enterCharacterButton.addEventListener("click", selectCharacter);
loginButton.addEventListener("click", createCharacter);
accountInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") accountLogin();
});
passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") accountLogin();
});
nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createCharacter();
});
adminInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createCharacter();
});
jobSelect.addEventListener("change", renderCreationPreview);

commandForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendCommand();
});

commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendCommand();
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (lastTypedCommand) {
      commandInput.value = lastTypedCommand;
      commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
    }
  }
});

attackAction.addEventListener("click", () => {
  if (currentState?.combat?.isDead) {
    appendLog(["You are still inside a rescue sleeve."]);
    return;
  }
  if (!currentState?.combat?.inCombat) {
    appendLog(["Choose a target with strike <npc> first."]);
    return;
  }
  sendActionCommand("strike");
});

fleeAction.addEventListener("click", () => {
  if (currentState?.combat?.inCombat) sendActionCommand("break");
});

restAction.addEventListener("click", () => {
  if (currentState?.combat?.isDead) {
    appendLog(["You are still inside a rescue sleeve."]);
    return;
  }
  if (currentState?.combat?.inCombat) {
    appendLog(["You cannot recover while fighting."]);
    return;
  }
  sendActionCommand("recover");
});

editActionSlots.addEventListener("click", () => {
  slotEditor.hidden = !slotEditor.hidden;
  editActionSlots.textContent = slotEditor.hidden ? "Edit" : "Done";
});

profileFirstButton.addEventListener("click", () => setProfileMode(profileFirstButton.dataset.profileTarget));
profileSecondButton.addEventListener("click", () => setProfileMode(profileSecondButton.dataset.profileTarget));
activeQuestsButton.addEventListener("click", () => setQuestFilter("active"));
completeQuestsButton.addEventListener("click", () => setQuestFilter("completed"));

slotEditor.querySelectorAll("select[data-slot-index]").forEach((select) => {
  select.addEventListener("change", () => {
    actionSlots[Number(select.dataset.slotIndex)] = select.value;
    saveActionSlots();
    renderSkills(currentState?.jobSkills ?? []);
    updateActionPanel();
  });
});

function sendCommand() {
  const input = commandInput.value.trim();
  if (!input) return;
  lastTypedCommand = input;
  appendLog([`> ${input}`]);
  socket.send(JSON.stringify({ type: "command", input }));
  commandInput.value = "";
}

function sendActionCommand(input) {
  appendLog([`> ${input}`]);
  socket.send(JSON.stringify({ type: "command", input }));
}

function sendLinkedCommand(input) {
  if (!input || commandInput.disabled) return;
  appendLog([`> ${input}`]);
  socket.send(JSON.stringify({ type: "command", input }));
  commandInput.focus();
}

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("click", () => {
    const dir = button.dataset.dir;
    if (dir && dir !== "here" && button.classList.contains("available")) {
      socket.send(JSON.stringify({ type: "command", input: dir }));
    }
  });
  button.addEventListener("mouseenter", () => showMinimapTooltip(button));
  button.addEventListener("mouseleave", hideMinimapTooltip);
  button.addEventListener("focus", () => showMinimapTooltip(button));
  button.addEventListener("blur", hideMinimapTooltip);
});

function accountLogin() {
  const username = accountInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) return;
  socket.send(JSON.stringify({ type: "accountLogin", username, password }));
}

function accountRegister() {
  const username = accountInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) return;
  socket.send(JSON.stringify({ type: "accountRegister", username, password }));
}

function createCharacter() {
  if (!accountState) {
    appendLog(["Log into an account before creating a character."]);
    return;
  }
  const name = nameInput.value.trim();
  if (!name) return;
  socket.send(JSON.stringify({ type: "createCharacter", name, species: characterConfig.defaultSpeciesId, job: jobSelect.value, adminCode: adminInput.value.trim() }));
}

function selectCharacter() {
  const characterId = Number(characterSelect.value);
  if (!characterId) return;
  socket.send(JSON.stringify({ type: "selectCharacter", characterId }));
}

async function loadCharacterConfig() {
  const response = await fetch("/api/character");
  characterConfig = await response.json();
  speciesSelect.innerHTML = "";
  jobSelect.innerHTML = "";
  for (const species of characterConfig.species) {
    const option = document.createElement("option");
    option.value = species.id;
    option.textContent = speciesOptionLabel(species);
    speciesSelect.append(option);
  }
  for (const job of characterConfig.jobs) {
    const option = document.createElement("option");
    option.value = job.id;
    option.textContent = jobOptionLabel(job);
    jobSelect.append(option);
  }
  speciesSelect.value = characterConfig.defaultSpeciesId;
  jobSelect.value = characterConfig.defaultJobId;
  renderCreationPreview();
}

function appendLog(lines) {
  for (const line of lines) {
    const p = document.createElement("p");
    p.className = logLineClass(line);
    renderLogLine(p, line);
    if (line && !line.includes(".") && !line.includes(":") && !line.startsWith(">")) p.className = "room-title";
    logEl.append(p);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function renderLogLine(container, line) {
  const linked = logLinksForLine(line);
  if (!linked.length) {
    container.textContent = line;
    return;
  }

  let index = 0;
  for (const link of linked) {
    if (link.start < index) continue;
    container.append(document.createTextNode(line.slice(index, link.start)));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "log-command";
    button.dataset.command = link.command;
    button.textContent = line.slice(link.start, link.end);
    button.title = link.command;
    container.append(button);
    index = link.end;
  }
  container.append(document.createTextNode(line.slice(index)));
}

function logLinksForLine(line) {
  const links = [];
  const used = [];
  const addPhrase = (phrase, command) => {
    if (!phrase) return;
    const start = line.indexOf(phrase);
    const end = start + phrase.length;
    if (start < 0 || used.some((range) => start < range.end && end > range.start)) return;
    used.push({ start, end });
    links.push({ start, end, command });
  };

  if (line.startsWith("Nearby: ")) {
    for (const entry of splitListLine(line.replace(/^Nearby:\s*/, "").replace(/\.$/, ""))) {
      const name = entry.replace(/\s+\([^)]*\)$/g, "");
      addPhrase(name, `talk ${name}`);
    }
  }

  if (line.startsWith("You notice: ")) {
    for (const name of splitListLine(line.replace(/^You notice:\s*/, "").replace(/\.$/, ""))) addPhrase(name, `take ${name}`);
  }

  if (line.startsWith("Also here: ")) {
    for (const entry of splitListLine(line.replace(/^Also here:\s*/, "").replace(/\.$/, ""))) {
      const name = entry.replace(/\s+\([^)]*\)$/g, "");
      addPhrase(name, `look ${name}`);
    }
  }

  const topicMatch = line.match(/^You can ask (.+?) about: (.+)\.$/);
  if (topicMatch) {
    const npcName = topicMatch[1];
    for (const topic of splitListLine(topicMatch[2])) addPhrase(topic, `ask ${npcName} about ${topic}`);
  }

  const workMatch = line.match(/^Work to begin here: (.+)\.$/);
  if (workMatch) {
    for (const entry of workMatch[1].split(";").map((part) => part.trim()).filter(Boolean)) {
      const match = entry.match(/\(([^)]+)\)$/);
      if (match) addPhrase(match[1], match[1]);
    }
  }

  for (const npc of currentState?.room?.npcs ?? []) addPhrase(npc.name, `talk ${npc.name}`);
  for (const item of currentState?.room?.items ?? []) addPhrase(item.name, `take ${item.name}`);

  return links.sort((a, b) => a.start - b.start);
}

function splitListLine(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function logLineClass(line) {
  if (line.startsWith(">")) return "player-command";
  if (isCombatLine(line)) return "combat-line";
  return "";
}

function isCombatLine(line) {
  return /combat|engage|fighting|hits you|strike .* for \d+ damage|clips you|critical|falls|defeated|rescue sleeve catches you/i.test(line);
}

function signalCombatStart() {
  document.body.classList.add("combat-started");
  pulseDamage();
  playCombatCue();
  window.setTimeout(() => document.body.classList.remove("combat-started"), 900);
}

function pulseDamage() {
  document.body.classList.remove("took-damage");
  void document.body.offsetWidth;
  document.body.classList.add("took-damage");
  window.setTimeout(() => document.body.classList.remove("took-damage"), 420);
}

function playCombatCue() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 180;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => context.close());
  } catch {
    // Browsers may block audio before interaction; the visual cues still fire.
  }
}

function renderAccount(account) {
  accountState = account;
  characterPanel.hidden = false;
  characterSelect.innerHTML = "";

  if (!account.characters.length) {
    characterSelect.append(new Option("No characters yet", ""));
    enterCharacterButton.disabled = true;
  } else {
    for (const character of account.characters) {
      characterSelect.append(new Option(characterLabel(character), String(character.id)));
    }
    enterCharacterButton.disabled = false;
  }
}

function renderState(state) {
  const wasInCombat = Boolean(currentState?.combat?.inCombat);
  const previousHp = currentState?.hp ?? state.hp;
  currentState = state;
  loginPanel.style.display = "none";
  gameplayPanels.forEach((panel) => {
    panel.hidden = false;
  });
  commandInput.disabled = false;
  commandInput.focus();
  serverClockOffset = (state.combat?.serverNow ?? Date.now()) - Date.now();
  roomName.textContent = state.room.name;
  roomMeta.textContent = state.zone.name;
  hpText.textContent = `${state.hp}/${state.maxHp}`;
  manaText.textContent = `${state.mana}/${state.maxMana}`;
  speciesText.textContent = state.jobName;
  jobText.textContent = state.jobName;
  levelText.textContent = state.level;
  xpText.textContent = `${state.xp}/${state.xpForNextLevel ?? "--"}`;
  ticketsText.textContent = state.tickets;
  binderCardsText.textContent = state.binderCards?.length ?? 0;
  titlesText.textContent = state.titles.length;
  renderStats(state.stats);
  renderSkillProgress(state);
  renderInventory(state);
  renderProfileMode();
  renderQuestJournal(state.quests ?? []);
  renderAreaMap(state.areaMap);
  hpBar.style.width = `${Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))}%`;
  manaBar.style.width = `${Math.max(0, Math.min(100, (state.mana / state.maxMana) * 100))}%`;
  document.body.classList.toggle("in-combat", Boolean(state.combat?.inCombat));
  if (!wasInCombat && state.combat?.inCombat) signalCombatStart();
  if (state.hp < previousHp) pulseDamage();
  adminBadge.innerHTML = state.isAdmin ? '<a href="/admin.html">Admin Builder</a>' : "";
  if (state.isAdmin) localStorage.setItem("cardbound.adminName", state.name);
  ensureActionSlots(state);
  renderSkills(state.jobSkills ?? []);
  updateActionPanel();

  document.querySelectorAll("[data-dir]").forEach((button) => {
    const dir = button.dataset.dir;
    const info = state.room.minimap[dir];
    button.classList.toggle("available", Boolean(info) && dir !== "here");
    button.classList.toggle("blocked", Boolean(info?.blocked) && dir !== "here");
    button.classList.toggle("current", dir === "here");
    button.disabled = !info || dir === "here";
    button.textContent = labelFor(dir, info);
    button.dataset.tooltip = dir === "here" ? state.room.name : info?.name ?? "";
    button.setAttribute("aria-label", button.dataset.tooltip || button.textContent);
  });
}

function renderAreaMap(map) {
  if (!areaMap || !areaMapMeta) return;
  areaMap.innerHTML = "";
  if (!map?.rooms?.length) {
    areaMapMeta.textContent = "No map loaded";
    const empty = document.createElement("p");
    empty.textContent = "No rooms mapped in this area yet.";
    areaMap.append(empty);
    return;
  }

  areaMapMeta.textContent = `${map.zoneName}${map.layer ? ` | Layer ${map.layer}` : ""}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const cellWidth = 84;
  const cellHeight = 64;
  const roomWidth = 54;
  const roomHeight = 34;
  const padding = 28;
  const questBadgeRadius = 9;
  const width = (map.bounds.maxX - map.bounds.minX + 1) * cellWidth + padding * 2;
  const height = (map.bounds.maxY - map.bounds.minY + 1) * cellHeight + padding * 2;
  const roomById = new Map(map.rooms.map((room) => [room.id, room]));

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${map.zoneName} area map`);

  const links = document.createElementNS("http://www.w3.org/2000/svg", "g");
  links.setAttribute("class", "area-map-links");
  const seenLinks = new Set();
  for (const room of map.rooms) {
    for (const exit of room.exits ?? []) {
      const target = roomById.get(exit.to);
      const key = target ? [room.id, target.id].sort().join(":") : `${room.id}:${exit.direction}:${exit.to}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      const from = areaMapPoint(room, map.bounds, cellWidth, cellHeight, padding);
      const to = target ? areaMapPoint(target, map.bounds, cellWidth, cellHeight, padding) : areaMapExitStubPoint(from, exit.direction, roomWidth, roomHeight);
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x);
      line.setAttribute("y2", to.y);
      line.setAttribute("class", `${exit.blocked ? "blocked" : ""} ${target ? "" : "off-map"}`.trim());
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${room.name} to ${target?.name ?? exit.roomName}${target ? "" : " (off map)"}${exit.blocked ? " (blocked)" : ""}`;
      line.append(title);
      links.append(line);
    }
  }
  svg.append(links);

  const rooms = document.createElementNS("http://www.w3.org/2000/svg", "g");
  rooms.setAttribute("class", "area-map-rooms");
  for (const room of map.rooms) {
    const point = areaMapPoint(room, map.bounds, cellWidth, cellHeight, padding);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", room.current ? "current" : "");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", point.x - roomWidth / 2);
    rect.setAttribute("y", point.y - roomHeight / 2);
    rect.setAttribute("width", roomWidth);
    rect.setAttribute("height", roomHeight);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = areaMapRoomTitle(room);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", point.x);
    label.setAttribute("y", point.y + 4);
    label.textContent = room.current ? "You" : room.map?.symbol ?? "*";
    group.append(title, rect, label);
    if (room.availableQuests?.length) {
      const badge = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      badge.setAttribute("class", "quest-marker");
      badge.setAttribute("cx", point.x + roomWidth / 2 - 2);
      badge.setAttribute("cy", point.y - roomHeight / 2 + 2);
      badge.setAttribute("r", questBadgeRadius);
      const bang = document.createElementNS("http://www.w3.org/2000/svg", "text");
      bang.setAttribute("class", "quest-marker-text");
      bang.setAttribute("x", point.x + roomWidth / 2 - 2);
      bang.setAttribute("y", point.y - roomHeight / 2 + 6);
      bang.textContent = "!";
      group.append(badge, bang);
    }
    rooms.append(group);
  }
  svg.append(rooms);
  areaMap.append(svg);
}

function areaMapRoomTitle(room) {
  const quests = room.availableQuests ?? [];
  if (!quests.length) return room.name;
  return `${room.name}\n${quests.map((quest) => `New quest: ${quest.name} - ${quest.startHint}`).join("\n")}`;
}

function areaMapPoint(room, bounds, cellWidth, cellHeight, padding) {
  return {
    x: (room.coords.x - bounds.minX) * cellWidth + padding + cellWidth / 2,
    y: (bounds.maxY - room.coords.y) * cellHeight + padding + cellHeight / 2
  };
}

function areaMapExitStubPoint(from, direction, roomWidth, roomHeight) {
  const offsetX = roomWidth / 2 + 18;
  const offsetY = roomHeight / 2 + 18;
  return {
    north: { x: from.x, y: from.y - offsetY },
    east: { x: from.x + offsetX, y: from.y },
    south: { x: from.x, y: from.y + offsetY },
    west: { x: from.x - offsetX, y: from.y }
  }[direction] ?? { x: from.x, y: from.y };
}

function characterLabel(character) {
  const admin = character.isAdmin ? " admin" : "";
  const room = character.roomName ? ` at ${character.roomName}` : "";
  return `${character.name} - ${character.jobName}, level ${character.level}${room}${admin}`;
}

function renderCreationPreview() {
  if (!creationPreview || !characterConfig.stats.length) return;
  const species = characterConfig.species.find((candidate) => candidate.id === characterConfig.defaultSpeciesId) ?? characterConfig.species[0];
  const job = characterConfig.jobs.find((candidate) => candidate.id === jobSelect.value) ?? characterConfig.jobs[0];
  if (!species || !job) return;

  const stats = Object.fromEntries(characterConfig.stats.map((stat) => [stat.id, (stat.base ?? 0) + (species.modifiers?.[stat.id] ?? 0)]));
  const levelOneSkills = (job.skills ?? []).filter((skill) => skill.level <= 1);
  const futureSkills = (job.skills ?? []).filter((skill) => skill.level > 1).slice(0, 3);
  creationPreview.innerHTML = `
    <div>
      <strong>${escapeHtml(job.name)}</strong>
      <p>${escapeHtml(job.description)}</p>
    </div>
    <div class="preview-stats">
      ${characterConfig.stats.map((stat) => `<span>${escapeHtml(stat.name)} <b>${stats[stat.id] ?? 0}</b></span>`).join("")}
    </div>
    <div class="preview-skills">
      <span>Starting ${levelOneSkills.map((skill) => escapeHtml(skill.name)).join(", ") || "basic strike"}</span>
      ${futureSkills.length ? `<span>Later ${futureSkills.map((skill) => `${escapeHtml(skill.name)} L${skill.level}`).join(", ")}</span>` : ""}
    </div>
  `;
}

function renderSkills(skills) {
  skillGrid.innerHTML = "";
  const usableSkills = skills.filter((skill) => Boolean(skill.effect || skill.effects?.length));
  renderSlotEditor(usableSkills);

  for (let index = 0; index < ACTION_SLOT_COUNT; index += 1) {
    const skill = usableSkills.find((candidate) => candidate.id === actionSlots[index]);
    const button = document.createElement("button");
    button.className = skill ? "skill-button" : "skill-button empty locked";
    button.type = "button";
    button.textContent = skill?.name ?? `Slot ${index + 1}`;
    button.dataset.manaCost = String(skill?.manaCost ?? 0);
    button.dataset.implemented = skill ? "true" : "false";
    button.title = skill ? `${skill.description} Charge: ${skill.manaCost}. Scales with ${statName(skill.scalesWith)}.` : "Choose a skill for this action slot.";
    button.addEventListener("click", () => {
      if (!skill) {
        slotEditor.hidden = false;
        editActionSlots.textContent = "Done";
        return;
      }
      appendLog([`> ${skill.name}`]);
      socket.send(JSON.stringify({ type: "command", input: skill.name }));
    });
    skillGrid.append(button);
  }
}

function renderSlotEditor(skills) {
  slotEditor.querySelectorAll("select[data-slot-index]").forEach((select) => {
    const currentValue = actionSlots[Number(select.dataset.slotIndex)] ?? "";
    select.innerHTML = "";
    select.append(new Option("Empty", ""));
    for (const skill of skills) {
      select.append(new Option(`${skill.name} (${skill.manaCost ?? 0} charge)`, skill.id));
    }
    select.value = skills.some((skill) => skill.id === currentValue) ? currentValue : "";
  });
}

function ensureActionSlots(state) {
  const key = actionSlotStorageKey(state);
  if (actionSlotKey !== key) {
    const stored = loadActionSlots(key);
    const defaults = (state.jobSkills ?? [])
      .filter((skill) => Boolean(skill.effect || skill.effects?.length))
      .slice(0, ACTION_SLOT_COUNT)
      .map((skill) => skill.id);
    actionSlots = Array.from({ length: ACTION_SLOT_COUNT }, (_, index) => stored[index] ?? defaults[index] ?? "");
    actionSlotKey = key;
    saveActionSlots();
  }

  const availableIds = new Set((state.jobSkills ?? []).filter((skill) => Boolean(skill.effect || skill.effects?.length)).map((skill) => skill.id));
  actionSlots = actionSlots.map((skillId) => (skillId && availableIds.has(skillId) ? skillId : ""));
  saveActionSlots();
}

function loadActionSlots(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) ? stored.slice(0, ACTION_SLOT_COUNT) : [];
  } catch {
    return [];
  }
}

function saveActionSlots() {
  if (!actionSlotKey) return;
  localStorage.setItem(actionSlotKey, JSON.stringify(actionSlots.slice(0, ACTION_SLOT_COUNT)));
}

function actionSlotStorageKey(state) {
  return `cardbound.actionSlots.${state.name.toLowerCase()}.${state.job}`;
}

function updateActionPanel() {
  if (!attackAction || !fleeAction || !restAction || !combatTarget || !currentState) return;

  const combat = currentState.combat ?? { inCombat: false };
  const now = Date.now() + serverClockOffset;
  const readyAt = combat.nextPlayerReadyAt ?? 0;
  const remaining = Math.max(0, readyAt - now);
  const cooldown = Math.max(1, combat.playerCooldownMs ?? 1);
  const progress = combat.inCombat ? Math.max(0, Math.min(1, 1 - remaining / cooldown)) : 0;
  const ready = combat.inCombat && remaining <= 0;

  if (combat.inCombat) {
    combatTarget.textContent = combat.targetName ?? "Target";
  } else if (combat.isDead) {
    combatTarget.textContent = `Resleeving in ${formatRemaining(Math.max(0, (combat.respawnAt ?? now) - now))}`;
  } else {
    combatTarget.textContent = "No duel target";
  }

  attackAction.style.setProperty("--cooldown", `${progress * 100}%`);
  attackAction.classList.toggle("ready", ready);
  attackAction.classList.toggle("cooling", combat.inCombat && !ready);
  attackAction.classList.toggle("locked", !combat.inCombat || combat.isDead);
  attackAction.textContent = combat.inCombat && !ready ? `Strike ${formatRemaining(remaining)}` : "Strike";
  attackAction.title = combat.isDead
    ? "You are waiting for the rescue sleeve to return you."
    : !combat.inCombat
    ? "Type strike <npc> to choose a target."
    : ready
      ? "Strike your current target."
      : "Still getting ready. Click or type strike to try anyway.";

  fleeAction.disabled = !combat.inCombat || combat.isDead;
  fleeAction.classList.toggle("locked", !combat.inCombat || combat.isDead);

  const needsRest = currentState.hp < currentState.maxHp || currentState.mana < currentState.maxMana;
  restAction.disabled = combat.inCombat || combat.isDead || !needsRest;
  restAction.classList.toggle("ready", !combat.inCombat && !combat.isDead && needsRest);
  restAction.classList.toggle("locked", combat.inCombat || combat.isDead || !needsRest);
  restAction.title = combat.inCombat
    ? "You cannot recover while fighting."
    : combat.isDead
      ? "You are waiting for the rescue sleeve to return you."
      : needsRest
        ? "Recover HP and charge over time."
        : "You are already fully recovered.";

  document.querySelectorAll(".skill-button").forEach((button) => {
    const implemented = button.dataset.implemented === "true";
    const canPay = currentState.mana >= Number(button.dataset.manaCost ?? 0);
    button.classList.toggle("ready", implemented && ready && canPay);
    button.classList.toggle("cooling", implemented && combat.inCombat && !ready);
    button.classList.toggle("locked", !implemented || !combat.inCombat || combat.isDead || !canPay);
  });
}

function renderStats(stats) {
  statGrid.innerHTML = "";
  const statDefinitions = characterConfig.stats.length ? characterConfig.stats : Object.keys(stats).map((id) => ({ id, name: id }));
  for (const stat of statDefinitions) {
    const item = document.createElement("div");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    name.textContent = stat.name;
    value.textContent = stats[stat.id] ?? 0;
    item.append(name, value);
    statGrid.append(item);
  }
}

function renderSkillProgress(state) {
  if (!skillProgress) return;
  const unlocked = state.jobSkills ?? [];
  const locked = state.lockedJobSkills ?? [];
  skillProgress.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Skills";
  skillProgress.append(title);

  const list = document.createElement("div");
  list.className = "skill-progress-list";
  for (const skill of unlocked) list.append(skillProgressItem(skill, false));
  for (const skill of locked) list.append(skillProgressItem(skill, true));
  if (!unlocked.length && !locked.length) {
    const empty = document.createElement("p");
    empty.textContent = "No class skills listed yet.";
    list.append(empty);
  }
  skillProgress.append(list);
}

function renderProfileMode() {
  const modes = ["profile", "inventory", "equipment"];
  const alternates = modes.filter((mode) => mode !== profileMode);
  profilePanelTitle.textContent = profileModeLabel(profileMode);
  updateProfileModeButton(profileFirstButton, alternates[0]);
  updateProfileModeButton(profileSecondButton, alternates[1]);
  profileView.hidden = profileMode !== "profile";
  inventoryView.hidden = profileMode !== "inventory";
  equipmentView.hidden = profileMode !== "equipment";
}

function setProfileMode(mode) {
  if (!["profile", "inventory", "equipment"].includes(mode)) return;
  profileMode = mode;
  renderProfileMode();
}

function updateProfileModeButton(button, mode) {
  button.dataset.profileTarget = mode;
  button.textContent = profileModeLabel(mode);
}

function profileModeLabel(mode) {
  return {
    profile: "Profile",
    inventory: "Inventory",
    equipment: "Equipment"
  }[mode] ?? "Profile";
}

function renderInventory(state) {
  const inventory = state.inventory ?? [];
  const equipment = Object.entries(state.equipment ?? {}).filter(([, item]) => Boolean(item));

  inventoryTicketsText.textContent = state.tickets;
  inventoryCountText.textContent = inventory.length;
  equipmentCountText.textContent = equipment.length;
  inventoryList.innerHTML = "";
  equipmentList.innerHTML = "";

  if (!inventory.length) {
    inventoryList.append(emptyInventoryText("You are carrying nothing."));
  } else {
    for (const item of inventory) inventoryList.append(inventoryCard(item));
  }

  if (!equipment.length) {
    equipmentList.append(emptyInventoryText("Nothing equipped."));
  } else {
    for (const [slot, item] of equipment) equipmentList.append(inventoryCard(item, slot));
  }
}

function emptyInventoryText(text) {
  const empty = document.createElement("p");
  empty.className = "inventory-empty";
  empty.textContent = text;
  return empty;
}

function inventoryCard(item, slot) {
  const card = document.createElement("article");
  card.className = "inventory-item";

  const title = document.createElement("strong");
  title.textContent = item.name;

  const meta = document.createElement("small");
  meta.textContent = itemMeta(item, slot);

  const description = document.createElement("p");
  description.textContent = item.description;

  card.append(title, meta, description);
  return card;
}

function itemMeta(item, slot) {
  const parts = [];
  if (slot) parts.push(`Equipped: ${slot}`);
  parts.push(item.type);
  if (Number.isFinite(item.value)) parts.push(`${item.value} tickets`);
  const bonuses = Object.entries(item.equipment?.statBonuses ?? {})
    .filter(([, value]) => value)
    .map(([statId, value]) => `${value > 0 ? "+" : ""}${value} ${statName(statId)}`);
  if (bonuses.length) parts.push(bonuses.join(", "));
  const consumable = [];
  if (item.consumable?.hp) consumable.push(`${item.consumable.hp} HP`);
  if (item.consumable?.mana) consumable.push(`${item.consumable.mana} charge`);
  if (consumable.length) parts.push(`Restores ${consumable.join(", ")}`);
  return parts.join(" | ");
}

function skillProgressItem(skill, locked) {
  const item = document.createElement("div");
  item.className = locked ? "locked" : "";
  const label = document.createElement("span");
  const meta = document.createElement("small");
  label.textContent = skill.name;
  meta.textContent = locked ? `Unlocks at level ${skill.level}` : `${skill.manaCost ?? 0} charge | ${statName(skill.scalesWith)}`;
  item.title = skill.description;
  item.append(label, meta);
  return item;
}

function renderQuestJournal(quests) {
  if (!questJournal) return;
  questJournal.innerHTML = "";
  renderQuestFilterButtons();
  if (!quests.length) {
    const empty = document.createElement("p");
    empty.textContent = "No quests recorded yet.";
    questJournal.append(empty);
    return;
  }

  const active = quests.filter((quest) => quest.status !== "completed");
  const completed = quests.filter((quest) => quest.status === "completed");
  const summary = document.createElement("div");
  summary.className = "quest-summary";
  summary.append(questSummaryItem("Active", active.length), questSummaryItem("Complete", completed.length));
  questJournal.append(summary);

  const shownQuests = questFilter === "completed" ? completed : active;
  if (!shownQuests.length) {
    const empty = document.createElement("p");
    empty.textContent = questFilter === "completed" ? "No completed quests yet." : "No active quests right now.";
    questJournal.append(empty);
    return;
  }

  for (const quest of shownQuests) questJournal.append(questCard(quest));
}

function setQuestFilter(filter) {
  questFilter = filter;
  renderQuestJournal(currentState?.quests ?? []);
}

function renderQuestFilterButtons() {
  activeQuestsButton.classList.toggle("active", questFilter === "active");
  completeQuestsButton.classList.toggle("active", questFilter === "completed");
}

function questSummaryItem(label, count) {
  const item = document.createElement("span");
  const value = document.createElement("strong");
  const text = document.createElement("small");
  value.textContent = count;
  text.textContent = label;
  item.append(value, text);
  return item;
}

function questCard(quest) {
  const card = document.createElement("article");
  const completed = quest.completedSteps?.length ?? 0;
  const total = quest.steps?.length ?? 0;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const rewards = (quest.rewards ?? []).map(formatQuestReward).filter(Boolean);
  card.className = `quest-card ${quest.status}`;

  const header = document.createElement("div");
  header.className = "quest-card-header";
  const title = document.createElement("strong");
  title.textContent = quest.name;
  const badge = document.createElement("small");
  badge.className = "quest-badge";
  badge.textContent = quest.status;
  header.append(title, badge);

  const progressWrap = document.createElement("div");
  progressWrap.className = "quest-progress";
  const progressBar = document.createElement("span");
  progressBar.style.width = `${progress}%`;
  progressWrap.append(progressBar);

  const meta = document.createElement("small");
  meta.className = "quest-meta";
  meta.textContent = `${completed}/${total} steps`;

  const objective = document.createElement("p");
  objective.className = "quest-objective";
  objective.textContent = quest.currentObjective ?? (quest.status === "completed" ? "Completed." : quest.summary);

  const steps = document.createElement("div");
  steps.className = "quest-steps";
  for (const step of quest.steps ?? []) {
    const done = quest.completedSteps?.includes(step.id);
    const row = document.createElement("span");
    row.className = done ? "complete" : "";
    row.textContent = `${done ? "[x]" : "[ ]"} ${step.label}`;
    steps.append(row);
  }

  card.append(header, progressWrap, meta, objective, steps);

  if (rewards.length) {
    const rewardText = document.createElement("small");
    rewardText.className = "quest-rewards";
    rewardText.textContent = `Rewards: ${rewards.join(", ")}`;
    card.append(rewardText);
  }

  return card;
}

function formatQuestReward(reward) {
  if (reward.type === "xp") return `${scaledQuestXp(reward.amount ?? 0)} XP`;
  if (reward.type === "tickets") return `${reward.amount ?? 0} tickets`;
  if (reward.type === "item") return reward.label || reward.itemId;
  if (reward.type === "title") return `Title: ${reward.label}`;
  if (reward.type === "flag") return "";
  return reward.label ?? "";
}

function scaledQuestXp(amount) {
  return Math.max(0, Math.round(amount * (characterConfig.leveling?.questXpMultiplier ?? 1)));
}

function speciesOptionLabel(species) {
  const modifiers = Object.entries(species.modifiers ?? {})
    .filter(([, value]) => value !== 0)
    .map(([statId, value]) => `${value > 0 ? "+" : ""}${value} ${statName(statId)}`);
  return modifiers.length ? `${species.name} (${modifiers.join(", ")})` : species.name;
}

function statName(statId) {
  return characterConfig.stats.find((stat) => stat.id === statId)?.name ?? statId;
}

function jobOptionLabel(job) {
  const stats = (job.primaryStats ?? []).map(statName);
  return stats.length ? `${job.name} (${stats.join(", ")})` : job.name;
}

function labelFor(dir, info) {
  if (dir === "here") return "Here";
  const short = { north: "N", east: "E", south: "S", west: "W" }[dir] ?? dir;
  return info ? short : "";
}

function showMinimapTooltip(button) {
  const text = button.dataset.tooltip;
  if (!text) return;
  button.setAttribute("data-show-tooltip", "true");
}

function hideMinimapTooltip() {
  document.querySelectorAll("[data-show-tooltip]").forEach((button) => {
    button.removeAttribute("data-show-tooltip");
  });
}

function formatRemaining(ms) {
  if (ms <= 0) return "";
  return `${Math.ceil(ms / 1000)}s`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
