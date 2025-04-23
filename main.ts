import { App, Editor, MarkdownView, Modal, FuzzySuggestModal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { requestUrl } from "obsidian";
import { BIR, birGetByID } from './bir-tools.ts';

// Remember to rename these classes and interfaces!

interface BirSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: BirSettings = {
	mySetting: 'default'
}

export default class BirPlugin extends Plugin {
	settings: BirSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'BIR-find-company',
			name: 'Find company',
			callback: () => {
				new CompanyFindModal(this.app, (result) => {
					const res = new BIR(this.app).birSearch(result)
					res.then((found) => {
						if (!found.length) {
							new Notice("Ничего не найдено", 3000);
							return;
						}

						new BirQuickSelect(this.app, found, (selected) => {
							console.log("selected", selected);

							birGetByID(selected.id).then( (birdata) => {
								console.log("got!", birdata);
							});
						}).open();

					})
				}).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new BirSettingsTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
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

class BirSettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
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
		// this.close();
		new Notice(`Selected ${record.shortName}`);
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
    el.innerHTML += `<p><small>ИНН: ${item.item.inn}&nbsp;&nbsp;ОГРН: ${item.item.ogrn}</small></p>`;
  }

  // // Perform action on the selected suggestion.
  // onChooseSuggestion(record: BirQuickSearch, evt: MouseEvent | KeyboardEvent) {
  //   new Notice(`Selected ${record.shortName}`);
  // }
}

