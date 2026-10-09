let electron = require("electron");
let node_path = require("node:path");
let _electron_toolkit_utils = require("@electron-toolkit/utils");
let node_fs = require("node:fs");
//#region src/main/store.ts
var DEFAULTS = {
	theme: "light",
	splitRatio: .5,
	recentFiles: []
};
var SETTINGS_FILE = "settings.json";
var SettingsStore = class {
	cache = { ...DEFAULTS };
	file;
	loaded;
	constructor() {
		this.file = (0, node_path.join)(electron.app.getPath("userData"), SETTINGS_FILE);
		this.loaded = this.load();
	}
	async load() {
		try {
			const raw = await node_fs.promises.readFile(this.file, "utf-8");
			const parsed = JSON.parse(raw);
			this.cache = {
				...DEFAULTS,
				...parsed
			};
		} catch {
			this.cache = { ...DEFAULTS };
		}
	}
	get(key) {
		return this.cache[key];
	}
	set(key, value) {
		this.cache[key] = value;
		this.persist();
	}
	async persist() {
		await this.loaded;
		try {
			await node_fs.promises.mkdir(electron.app.getPath("userData"), { recursive: true });
			await node_fs.promises.writeFile(this.file, JSON.stringify(this.cache, null, 2), "utf-8");
		} catch (err) {
			console.error("Failed to persist settings", err);
		}
	}
};
var settingsStore = new SettingsStore();
//#endregion
//#region src/main/file-handlers.ts
function registerFileHandlers() {
	electron.ipcMain.handle("file:open", async (event) => {
		const win = electron.BrowserWindow.fromWebContents(event.sender);
		if (!win) return {
			ok: false,
			canceled: true
		};
		const result = await electron.dialog.showOpenDialog(win, {
			title: "Open Markdown File",
			properties: ["openFile"],
			filters: [{
				name: "Markdown",
				extensions: [
					"md",
					"markdown",
					"mdown",
					"mkd"
				]
			}, {
				name: "All Files",
				extensions: ["*"]
			}]
		});
		if (result.canceled || result.filePaths.length === 0) return {
			ok: false,
			canceled: true
		};
		const filePath = result.filePaths[0];
		try {
			const content = await node_fs.promises.readFile(filePath, "utf-8");
			electron.app.addRecentDocument(filePath);
			pushRecent(filePath);
			return {
				ok: true,
				path: filePath,
				content
			};
		} catch (err) {
			return {
				ok: false,
				canceled: false,
				error: err.message
			};
		}
	});
	electron.ipcMain.handle("file:open-path", async (_event, filePath) => {
		try {
			const content = await node_fs.promises.readFile(filePath, "utf-8");
			electron.app.addRecentDocument(filePath);
			pushRecent(filePath);
			return {
				ok: true,
				path: filePath,
				content
			};
		} catch (err) {
			return {
				ok: false,
				canceled: false,
				error: err.message
			};
		}
	});
	electron.ipcMain.handle("file:reload", async (_event, filePath) => {
		if (!filePath) return {
			ok: false,
			canceled: true
		};
		try {
			return {
				ok: true,
				path: filePath,
				content: await node_fs.promises.readFile(filePath, "utf-8")
			};
		} catch (err) {
			return {
				ok: false,
				canceled: false,
				error: err.message
			};
		}
	});
	electron.ipcMain.handle("file:save", async (event, payload) => {
		const win = electron.BrowserWindow.fromWebContents(event.sender);
		if (!win) return {
			ok: false,
			canceled: true
		};
		let filePath = payload.path;
		if (!filePath) {
			const result = await electron.dialog.showSaveDialog(win, {
				title: "Save Markdown File",
				defaultPath: "untitled.md",
				filters: [{
					name: "Markdown",
					extensions: ["md"]
				}]
			});
			if (result.canceled || !result.filePath) return {
				ok: false,
				canceled: true
			};
			filePath = result.filePath;
		}
		try {
			await node_fs.promises.writeFile(filePath, payload.content, "utf-8");
			electron.app.addRecentDocument(filePath);
			pushRecent(filePath);
			return {
				ok: true,
				path: filePath
			};
		} catch (err) {
			return {
				ok: false,
				canceled: false,
				error: err.message
			};
		}
	});
	electron.ipcMain.handle("recent:list", () => settingsStore.get("recentFiles"));
}
function pushRecent(filePath) {
	const recent = settingsStore.get("recentFiles").filter((p) => p !== filePath);
	recent.unshift(filePath);
	settingsStore.set("recentFiles", recent.slice(0, 10));
}
//#endregion
//#region src/main/export-handlers.ts
function registerExportHandlers() {
	electron.ipcMain.handle("export:tex", async (event, payload) => {
		const win = electron.BrowserWindow.fromWebContents(event.sender);
		if (!win) return {
			ok: false,
			canceled: true
		};
		const result = await electron.dialog.showSaveDialog(win, {
			title: "Export to LaTeX",
			defaultPath: `${payload.suggestName ?? "export"}.tex`,
			filters: [{
				name: "LaTeX",
				extensions: ["tex"]
			}]
		});
		if (result.canceled || !result.filePath) return {
			ok: false,
			canceled: true
		};
		try {
			await node_fs.promises.writeFile(result.filePath, payload.tex, "utf-8");
			return {
				ok: true,
				path: result.filePath
			};
		} catch (err) {
			return {
				ok: false,
				canceled: false,
				error: err.message
			};
		}
	});
	electron.ipcMain.handle("export:pdf", async (event, payload) => {
		const win = electron.BrowserWindow.fromWebContents(event.sender);
		if (!win) return {
			ok: false,
			canceled: true
		};
		const result = await electron.dialog.showSaveDialog(win, {
			title: "Export to PDF",
			defaultPath: `${payload.suggestName ?? "export"}.pdf`,
			filters: [{
				name: "PDF",
				extensions: ["pdf"]
			}]
		});
		if (result.canceled || !result.filePath) return {
			ok: false,
			canceled: true
		};
		try {
			const data = await win.webContents.printToPDF({
				printBackground: true,
				pageSize: "A4",
				margins: {
					marginType: "custom",
					top: 0,
					bottom: 0,
					left: 0,
					right: 0
				}
			});
			await node_fs.promises.writeFile(result.filePath, data);
			return {
				ok: true,
				path: result.filePath
			};
		} catch (err) {
			return {
				ok: false,
				canceled: false,
				error: err.message
			};
		}
	});
}
//#endregion
//#region src/main/menu.ts
var THEME_NAMES = [
	"light",
	"dark",
	"plainWhite",
	"plainBlack",
	"sepia",
	"ocean",
	"forest"
];
function sendToFocused(channel, ...args) {
	const win = electron.BrowserWindow.getFocusedWindow() ?? electron.BrowserWindow.getAllWindows()[0];
	if (win) win.webContents.send("menu-action", channel.replace(/^menu:/, ""), ...args);
}
function buildAppMenu(onNewWindow) {
	const isMac = process.platform === "darwin";
	const template = [
		...isMac ? [{
			label: electron.app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" }
			]
		}] : [],
		{
			label: "File",
			submenu: [
				{
					label: "New File",
					accelerator: "CmdOrCtrl+N",
					click: () => onNewWindow()
				},
				{
					label: "New Window",
					accelerator: "CmdOrCtrl+Shift+N",
					click: () => onNewWindow()
				},
				{
					label: "Open…",
					accelerator: "CmdOrCtrl+O",
					click: () => sendToFocused("menu:open")
				},
				{
					label: "Open Recent",
					role: "recentDocuments",
					submenu: [{ role: "clearRecentDocuments" }]
				},
				{ type: "separator" },
				{
					label: "Save",
					accelerator: "CmdOrCtrl+S",
					click: () => sendToFocused("menu:save")
				},
				{
					label: "Save As…",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendToFocused("menu:save-as")
				},
				{
					label: "Reload from Disk",
					click: () => sendToFocused("menu:reload")
				},
				{ type: "separator" },
				{
					label: "Export to LaTeX…",
					accelerator: "CmdOrCtrl+Shift+E",
					click: () => sendToFocused("menu:export-tex")
				},
				{
					label: "Export to PDF…",
					accelerator: "CmdOrCtrl+P",
					click: () => sendToFocused("menu:export-pdf")
				},
				{ type: "separator" },
				isMac ? { role: "close" } : { role: "quit" }
			]
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" }
			]
		},
		{
			label: "View",
			submenu: [
				{
					label: "Toggle Editor Pane",
					accelerator: "CmdOrCtrl+E",
					click: () => sendToFocused("menu:toggle-editor")
				},
				{
					label: "Toggle Preview Pane",
					accelerator: "CmdOrCtrl+Shift+P",
					click: () => sendToFocused("menu:toggle-preview")
				},
				{
					label: "Reset Split",
					accelerator: "CmdOrCtrl+0",
					click: () => sendToFocused("menu:reset-split")
				},
				{ type: "separator" },
				{
					label: "Theme",
					submenu: [
						{
							label: "Cycle Theme",
							accelerator: "CmdOrCtrl+Shift+T",
							click: () => sendToFocused("menu:cycle-theme")
						},
						{ type: "separator" },
						...THEME_NAMES.map((name) => ({
							label: name,
							click: () => sendToFocused("menu:set-theme", name)
						}))
					]
				},
				{ type: "separator" },
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" }
			]
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				...isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]
			]
		},
		{
			role: "help",
			submenu: [{
				label: "Learn More",
				click: () => void electron.shell.openExternal("https://www.markdownguide.org/")
			}]
		}
	];
	electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
//#endregion
//#region src/main/index.ts
var pendingOpenPaths = [];
electron.app.on("open-file", (event, filePath) => {
	event.preventDefault();
	if (electron.app.isReady()) createWindow(filePath);
	else pendingOpenPaths.push(filePath);
});
function createWindow(openPath) {
	const win = new electron.BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 640,
		minHeight: 480,
		show: false,
		autoHideMenuBar: false,
		title: "Markdown Editor",
		backgroundColor: "#f6f6f6",
		webPreferences: {
			preload: (0, node_path.join)(__dirname, "../preload/index.js"),
			sandbox: false,
			contextIsolation: true
		}
	});
	win.on("ready-to-show", () => {
		win.show();
	});
	win.webContents.setWindowOpenHandler((details) => {
		electron.shell.openExternal(details.url);
		return { action: "deny" };
	});
	if (openPath) win.webContents.once("did-finish-load", () => {
		if (!win.isDestroyed()) win.webContents.send("file:opened", openPath);
	});
	if (_electron_toolkit_utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	else win.loadFile((0, node_path.join)(__dirname, "../renderer/index.html"));
	return win;
}
electron.app.whenReady().then(() => {
	_electron_toolkit_utils.electronApp.setAppUserModelId("com.hacker.markdown-editor");
	electron.app.on("browser-window-created", (_, window) => {
		_electron_toolkit_utils.optimizer.watchWindowShortcuts(window);
	});
	registerFileHandlers();
	registerExportHandlers();
	buildAppMenu(() => createWindow());
	electron.ipcMain.handle("shell:openExternal", (_event, url) => {
		if (/^(https?:|mailto:)/.test(url)) electron.shell.openExternal(url);
	});
	electron.ipcMain.handle("settings:get", (_event, key) => settingsStore.get(key));
	electron.ipcMain.handle("settings:set", (_event, key, value) => {
		settingsStore.set(key, value);
	});
	if (pendingOpenPaths.length > 0) {
		for (const filePath of pendingOpenPaths) createWindow(filePath);
		pendingOpenPaths = [];
	} else createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") electron.app.quit();
});
//#endregion
