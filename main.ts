import { App, Editor, MarkdownView, Modal, FuzzySuggestModal, Notice, Plugin, PluginManifest, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, BirSettings, BirSettingsTab} from "./settings/SettingsTab"
import { requestUrl, PluginManifest } from "obsidian";
import { BIR, birGetByID } from './bir-tools.ts';

export default class BirPlugin extends Plugin {
	settings: BirSettings;
	private birObj: BIR;
	public manifest: PluginManifest;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.manifest = manifest;
	}

	get plugin_is_enabled() { return this.app?.plugins?.enabledPlugins?.has(this.manifest.id); }
	async onload() {
		await this.loadSettings();
		this.birObj = new BIR(this.app, this);

		// This creates an icon in the left ribbon.
		if (this.settings.ribbonButton) {
			const ribbonIconEl = this.addRibbonIcon('library', 'Сведения о компаниях', (evt: MouseEvent) => {
				// Called when the user clicks the icon.
				this.findCreateCompany();
			});
			// Perform additional things with the ribbon
			// ribbonIconEl.addClass('my-plugin-ribbon-class');
		}

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		this.addCommand({
			id: 'BIR-find-add-company',
			name: 'Найти и добавить компанию',
			callback: () => {this.findCreateCompany();},
		});
		this.addCommand({
			id: 'BIR-selection-find-add-company',
			name: 'Найти и добавить компанию из выделенного текста',
			callback: () => {this.findCreateCompanyBySelection();},
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
			this.birObj.noteCompany_HQ(selected.id, this.settings.companiesFolder);
		}).open();
	}
	/** Opens a dialog to search for a company in external sources and create a note */
	async findCreateCompany() {
		new CompanyFindModal(this.app, (result) => {
			const res = this.birObj.birSearch(result)
			res.then((found) => {
				this.companySelect(found);
			})
		}).open();
	}

	getCurrentSelection(editor?:Editor) {
		if( editor ) return editor.getSelection();
		const selection = window.getSelection().toString();
		return selection;
	}

	/** use user selected text to find company */
	async findCreateCompanyBySelection(editor:(Editor|undefined),view:MarkdownView|undefined,) {
		if( ! view ) view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if( (! editor) && view ) editor = view.editor;
		const selectionTxt = this.getCurrentSelection(editor);
		if ( 2 > selectionTxt.length ) {new Notice("Выделите хотя бы три символа для начала поиска!"); return;}

		const res = this.birObj.birSearch(selectionTxt)
		res.then((found) => {
			this.companySelect(found);
		})
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

class SampleModal extends Modal {
	constructor(app: App, txt: string) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText(txt);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

export class CompanyFindModal extends Modal {
  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
	this.setTitle('БИР Аналитик. Поиск организации.');

	let name = '';
    new Setting(this.contentEl)
      .setName('Название компании, ИНН, ОГРН, ...')
      .setDesc('Введеите минимум три символа для поиска.')
      .addText((text) =>
        text.onChange((value) => {
          name = value;
        }));

    new Setting(this.contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Найти')
          .setCta()
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
    el.innerHTML += `<p><small class="bir_quicksrch_iteminfo">ИНН: ${item.item.inn}&nbsp;&nbsp;ОГРН: ${item.item.ogrn}</small></p>`;
  }

  // // Perform action on the selected suggestion.
  // onChooseSuggestion(record: BirQuickSearch, evt: MouseEvent | KeyboardEvent) {
  //   new Notice(`Selected ${record.shortName}`);
  // }
}
