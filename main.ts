import { App, Editor, MarkdownView, Modal, SuggestModal, FuzzySuggestModal, Notice, Plugin, PluginManifest, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, BirSettings, BirSettingsTab} from "./src/settings/SettingsTab"
import { requestUrl } from "obsidian";
// import { BIR, birGetByID } from './src/bir-tools.ts';
import { ExternalRegistry } from './src/etl/extSources.ts';
import { CompanyRecord, PersonRecord, ProductRecord, ProjectRecord } from './src/RecordNotes.ts';
import { SelectPersonsDlg, SelectBranchesDlg } from './src/ui-dialogs/MultiSelectDlg.ts'
import { ProgressModal } from './src/ui-dialogs/ProgressModal'

export default class BirPlugin extends Plugin {
	settings: BirSettings;
	private etlObj: BIR;
	public manifest: PluginManifest;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.manifest = manifest;
	}

	get plugin_is_enabled() { return this.app?.plugins?.enabledPlugins?.has(this.manifest.id); }
	async onload() {
		await this.loadSettings();
		this.etlObj = new ExternalRegistry(this.app, this.manifest, this.settings);

		// This creates an icon in the left ribbon.
		if (this.settings.ribbonButton) {
			const ribbonIconEl = this.addRibbonIcon('library', 'Сведения о компаниях', (evt: MouseEvent) => {
				const cmdListDlg = new ButtonModal(this.app, this);
				cmdListDlg.open();
			});
			// Perform additional things with the ribbon
			// ribbonIconEl.addClass('my-plugin-ribbon-class');
		}

		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');
		const isNoteHQ = () => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const activeTFile = activeView ? activeView.file : null;
			const meta = activeTFile ? this.app.metadataCache.getFileCache(activeTFile) : null;
			const activeRecordType = meta?.frontmatter?.record_type;
			const taxID = meta?.frontmatter?.taxID;
			return activeRecordType && taxID && taxID.length == 10 && ['company_HQ'].includes(activeRecordType);
		}

		this.addCommand({
			id: 'BIR-find-add-company',
			name: 'Найти и добавить компанию',
			callback: () => {this.findCreateCompany();},
		});
		this.addCommand({
			id: 'BIR-selection-find-add-company',
			name: 'Найти и добавить компанию из выделенного текста',
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				const sel = editor.getSelection();
				if (2 < sel.length) {
				  if (!checking)
				    this.findCreateCompanyBySelection(editor,view);
				  return true
				}
				return false;
		},
		});
		this.addCommand({
			id: 'BIR-add-person-dialog',
			name: 'Добавить персону или сотрудника',
			callback: async () => {await this.addPersonManually(); }
		});
		this.addCommand({
			id: 'BIR-add-product-dialog',
			name: 'Добавить продукт компании',
			callback: async () => { this.addProductManually(); },
		});
		this.addCommand({
			id: 'BIR-add-project-dialog',
			name: 'Добавить проект',
			callback: async () => { this.addProjectManually();},
		});
		this.addCommand({
			id: 'BIR-add-linked-branches',
			name: 'Найти филиалы/обособленные подразделения к открытой организации',
			checkCallback: (checking: boolean) => {
				if (isNoteHQ()) {
					if (!checking)
						this.findBranchesForActiveComp();
					return true;
				}
				return false;
			},
		});
		this.addCommand({
			id: 'BIR-add-linked-persons',
			name: 'Найти связанные с компанией персоны',
			checkCallback: (checking: boolean) => {
				if (isNoteHQ()) {
					if (!checking)
						this.findLinkedPersonsForActiveComp();
					return true;
				}
				return false;
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new BirSettingsTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	async companySelect(found: Array) {
		if (!found.length) {
			new Notice("Ничего не найдено", 3000);
			return;
		}

		new BirQuickSelect(this.app, found, (selected) => {
			// birGetByID(selected.id).then( (birdata) => {
			// 	console.log("got!", birdata);
			// });
			this.etlObj.createCompanyNoteByID(selected.id, this.settings.companiesFolder);
		}).open();
	}

	/** Opens a dialog to search for a company in external sources and create a note */
	async findCreateCompany() {
		new CompanyFindModal(this.app, (result) => {
			const progress = new ProgressModal(this.app, 'Поиск..');
			const res = this.etlObj.searchCompany(result)
			progress.close();
			res.then((found) => {
				//only companies, not linked persons
				const foundCompanies = found.filter( (item)=> 0 == item.objectType );
				this.companySelect(foundCompanies);
			})
		}).open();
	}

	getCurrentSelection(editor?:Editor) {
		if( editor ) return editor.getSelection();
		const selection = window.getSelection().toString();
		return selection;
	}

	/** use user selected text to find company */
	async findCreateCompanyBySelection(editor:(Editor|undefined),view:MarkdownView|undefined) {
		if( !view ) view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if( (!editor) && view ) editor = view.editor;
		const selectionTxt = this.getCurrentSelection(editor);
		if ( 2 > selectionTxt.length ) {new Notice("Выделите хотя бы три символа для начала поиска!"); return;}

		const progress = new ProgressModal(this.app, 'Поиск..');
		const res = this.etlObj.searchCompany(selectionTxt)
		progress.close();
		res.then((found) => {
			this.companySelect(found);
		})
	}

	/** Gets company in active opened note and search branches in external registry */
	async findBranchesForActiveComp(view:MarkdownView|undefined): Promise<bool> {
		const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeTFile = activeView ? activeView.file : null;
		const meta = activeTFile ? this.app.metadataCache.getFileCache(activeTFile) : null;
		const activeRecordType = meta?.frontmatter?.record_type;
		const taxID = meta?.frontmatter?.taxID;
		const isValidView: boolean = activeRecordType && taxID && taxID.length == 10 && ['company_HQ'].includes(activeRecordType);
		if (!isValidView) {
			new Notice("Команда доступна только если в активной вкладке открыта заметка о компании c taxID и record_type='company_HQ'");
			return false;
		}

		const progress = new ProgressModal(this.app, 'Поиск..');
		const candidates = await this.etlObj.getBranchesForTaxID(taxID);
		progress.close();
		if (!candidates.length) {
			new Notice("Не найдены в доступных реестрах филиалы организации");
			return false;
		}
		const dlg = new SelectBranchesDlg(this.app, candidates);
		dlg.open( async (sel) => {
			const compObj = new CompanyRecord(this.app, this.manifest, this.settings);
			for(const comp of sel) {
				await compObj.AddByProperties(comp, activeTFile.parent.path);
			}
		});
		return true;

	}


	/** Gets company in active opened note and search linked persons in external registry */
	async findLinkedPersonsForActiveComp(view:MarkdownView|undefined): Promise<bool>{
		const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeTFile = activeView ? activeView.file : null;
		const meta = activeTFile ? this.app.metadataCache.getFileCache(activeTFile) : null;
		const activeRecordType = meta?.frontmatter?.record_type;
		const taxID = meta?.frontmatter?.taxID;
		const isValidView: boolean= activeRecordType && taxID && taxID.length == 10 && ['company_HQ'].includes(activeRecordType);
		if (!isValidView) {
			new Notice("Команда доступна только если в активной вкладке открыта заметка о компании taxID и record_type='company_HQ'");
			return false;
		}

		const progress = new ProgressModal(this.app, 'Поиск..');
		const candidates = await this.etlObj.getLinkedPersonsForTaxID(taxID);
		progress.close();
		if (!candidates.length) {
			new Notice("Не найдены в доступных реестрах связанные с компанией лица");
			return false;
		}
		const dlg = new SelectPersonsDlg(this.app, candidates);
		dlg.open( async (sel) => {
			const persObj = new PersonRecord(this.app, this.manifest, this.settings);
			for(const pers of sel) {
				await persObj.AddByProperties(pers);
			}
		});
		return true;
	}

	async addPersonManually() {
		const pers = new PersonRecord(this.app, this.manifest, this.settings);
		await pers.addManually();
	}

	async addProductManually() {
		const prod = new ProductRecord(this.app, this.manifest, this.settings);
		await prod.addManually();
	}

	async addProjectManually() {
		const proj = new ProjectRecord(this.app, this.manifest, this.settings);
		await proj.addManually();
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.formOfPropertyRegexp = new RegExp(this.settings.formOfPropertyRegexpStr);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

interface ButtonModalCmd {
	name: string;
	desc: string,
	disabled: bool,
	callback: ()=> any,
	callback_args: null,
}


class ButtonModal extends SuggestModal<ButtonModalCmd> {
	private app: App;
	private myPlugin: BirPlugin;
	private commands: ButtonModalCmd[];

	constructor(app: App, birPlugin: BirPlugin) {
		super(app);

		this.app = app;
		this.myPlugin = birPlugin;
		this.commands = this.getCommands();
		this.setTitle("Ведение заметок о компаниях");
		this.setPlaceholder("Выберите нужную команду");
	}

	getSuggestions(query: string): ButtonModalCmd[] {
		return this.commands.filter((cmd) =>
			cmd.name.includes(query.toLowerCase())
		);
	}

	renderSuggestion(cmd: string, el: HTMLElement) {
		el.createEl('div', { text: cmd.name });
		if ( cmd.desc && cmd.desc.trim().length ) el.createEl('small', { text: cmd.desc.trim(), cls: 'bir_mainbtn_iteminfo' });
	}

	onChooseSuggestion(cmd: string, evt: MouseEvent | KeyboardEvent) {
		if ( cmd.callback )
			cmd.callback();
	}

	getCommands(): string[] {
		const plg = this.myPlugin;
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeTFile = activeView ? activeView.file : null;
		const meta = activeTFile ? this.app.metadataCache.getFileCache(activeTFile) : null;
		const activeRecordType = meta?.frontmatter?.record_type;
		const taxID = meta?.frontmatter?.taxID;
		const cmds = [
			{name: 'Найти и добавить компанию', desc: 'Поиск организации и создание заполненной заметки', disabled:false, callback: plg.findCreateCompany.bind(plg)},
			{name: 'Найти компанию согласно выделенному тексту и добавить', desc: 'Поиск организации на основе выделенного пользователем текста', disabled: plg.getCurrentSelection().length ? false : true, callback: plg.findCreateCompanyBySelection.bind(plg)},
			{name: 'Добавить персону', disabled:false, callback: plg.addPersonManually.bind(plg)},
			{name: 'Добавить продукт', desc: 'Добавить продукт, которым владеет компания', disabled:false, callback: plg.addProductManually.bind(plg)},
			{name: 'Добавить проект', desc: 'Добавить заметку о проекте для последующего самостоятельного заполнения', disabled:false, callback: plg.addProjectManually.bind(plg)},
			{name: 'Найти филиалы/обособленные подразделения к открытой организации', desc: 'Найти и добавить филиалы и обособленные подразделения для организации, открытой сейчас в активной вкладке',
				disabled: (activeRecordType && taxID && taxID.length && ['company_HQ'].includes(activeRecordType)) ? false : true,
				callback: plg.findBranchesForActiveComp.bind(plg)
			},
			{name: 'Найти связанные персоны к открытой организации', desc: 'Найти и добавить связанные персоны для организации, открытой сейчас в активной вкладке',
				disabled: (activeRecordType && taxID && taxID.length && ['company_HQ'].includes(activeRecordType)) ? false : true,
				callback: plg.findLinkedPersonsForActiveComp.bind(plg)
			},
		];
		return cmds.filter( (item)=> !item.disabled );
	}

}

export class CompanyFindModal extends Modal {
	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.setTitle('БИР Аналитик. Поиск организации.');

		let name = '';
		let runBtn;
		new Setting(this.contentEl)
			.setName('Название компании, ИНН, ОГРН, ...')
			.setDesc('Введеите минимум три символа для поиска.');

		const inputFld = document.createElement("input");
		inputFld.type = "text"; inputFld.style.width = "100%";
		inputFld.value = name;
		inputFld.addEventListener("keyup", function(e) {
			if (e.key === "Enter" && name.length > 2) {
				this.close();
				onSubmit(name);
			}
			name = inputFld.value;
			if (runBtn) runBtn.setDisabled(name.length < 3);
		}.bind(this));
		this.contentEl.appendChild( inputFld );

		runBtn = new Setting(this.contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Найти')
					.setCta()
					.setDisabled(name.length < 3)
					.onClick(() => {
						this.close();
						onSubmit(name);
					}));
	}
}


interface BirQuickSearch {
	fullName: string;
	shortName: string;
	inn: string;
	id: string;
	isActive: boolean;
	objectType: int;
	ogrn: string;
}

export class BirQuickSelect extends FuzzySuggestModal<BirQuickSearch> {
	public found: BirQuickSearch[] = [];

	constructor(app: App, found: BirQuickSearch[], readyCallback) {
		super(app);
		this.found = found;
		this.readyCallback = readyCallback
		this.setPlaceholder("Выберите организацию");
	}

	getItems(): BirQuickSearch[] {
		return this.found;
	}

	getItemText(record: BirQuickSearch): string {
		return record.shortName;
	}

	onChooseItem(record: BirQuickSearch, evt: MouseEvent | KeyboardEvent) {
		if (this.readyCallback) { this.readyCallback(record); };
	}

/////
	// getSuggestions(query: string): BirQuickSearch[] {
	// return this.found.filter((record) =>
	//   record.shorName.toLowerCase().includes(query.toLowerCase())
	// );
	// }

	// // Renders each suggestion item.
	renderSuggestion(item: FuzzyMatch<BirQuickSearch>, el: HTMLElement) {
		super.renderSuggestion(item, el);

		// el.createEl('div', { text: item.item.shortName });
		// let div;
		// div = createDiv({ text: item.item.shortName });
		// el.appendChild(div);
		// div = createDiv({ text: "ИНН: " + item.item.inn });
		// el.appendChild(div);
		el.innerHTML += `<p class="bir_quicksrch_iteminfo"><small>ИНН: ${item.item.inn}&nbsp;&nbsp;ОГРН: ${item.item.ogrn}${item.item.suspendDate ? ' <mark>Недействующая c ' + moment(item.item.suspendDate).format('DD.MM.YYYY') +'</mark>' : ''}</small></p>`;
		el.innerHTML += (item.item.address && item.item.address.length) ? `<p class="bir_quicksrch_iteminfo_address"><small>${item.item.address}</small></p>` : '';
	}

	// // Perform action on the selected suggestion.
	// onChooseSuggestion(record: BirQuickSearch, evt: MouseEvent | KeyboardEvent) {
	//   new Notice(`Selected ${record.shortName}`);
	// }
}
