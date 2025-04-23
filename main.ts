import { App, Editor, MarkdownView, Modal, FuzzySuggestModal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { requestUrl } from "obsidian";

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
			name: 'find company',
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

class BIR {
	readonly quickURL = 'https://svc-5024.birweb.1prime.ru/v2/QuickSearch?term=';
	readonly companyBriefURL = 'https://site.birweb.1prime.ru/company-brief/';
	// readonly http = require('https');

	constructor(app: App) {
		this.app = app;
	}

	async birSearch(searchTxt: string): Promise<array> {
		const srchValue = searchTxt;
		if (!srchValue.length || 2>srchValue.length ) {
			new Notice("Укажите как минимум три символа для начала поиска!")
			new SampleModal(this.app).open("Укажите как минимум три символа для начала поиска!");
			return [];
		}

		try {
			const res = await fetch(this.quickURL + encodeURIComponent(srchValue));
			let found = await res.json();
			//clean HTML tags from full and short names
			found = found.map( item => {
				var div = document.createElement("div");
				div.innerHTML = item.shortName;
				item.shortName = div.textContent || div.innerText || "";
				div.innerHTML = item.fullName;
				item.fullName = div.textContent || div.innerText || "";
				return item;
			})
			return found;

		} catch (err) {
			console.log(err.message);
			return [];
		}	

	}

}

/** helper function for parsing HTML DOM **/
function nextValidSibling(in_tag, incText=false) {
	//incText - do we detect Text Nodes too
	let acpType = incText ? [1,3] : [1];
	let tag = in_tag.nextSibling;
	while (tag) {
		if (acpType.indexOf(tag.nodeType) >= 0)
			return tag;
		tag = tag.nextSibling;
	}
	return;
}


async function birGetByID(birID: string): Promise<dict> {
	const url = 'https://site.birweb.1prime.ru/company-brief/' + encodeURIComponent(birID);

	// We use Obsidian function requestUrl to overcome CORS problem.
	// See https://forum.obsidian.md/t/make-http-requests-from-plugins/15461/12
	//
	return requestUrl({url: url,cmethod: "GET"}).then(function (response) {
		console.debug(url);
		console.debug("got in response", response);
		return response.text;
	}).then(function (html: string) {
		// Convert the HTML string into a document object
		let parser = new DOMParser();
		let doc = parser.parseFromString(html, 'text/html');
		let dsec;

		let bir = {};

		let parseStngs = {
			'Наименование': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//h1",
			'ИНН': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//div[contains(@class, 'brief-layout-header__info__codes')]//span[text()='ИНН:']/following-sibling::span",
			'ОГРН': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//div[contains(@class, 'brief-layout-header__info__codes')]//span[text()='ОГРН:']/following-sibling::span",
			'ОКПО': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//div[contains(@class, 'brief-layout-header__info__codes')]//span[text()='ОКПО:']/following-sibling::span",
			'Статус': "//bir-company-overview//bir-overview-layout//bir-company-status//div[contains(@class, 'company-overview-status__state')]//span"
		};
		for (const [recType, xp] of Object.entries(parseStngs)) {
			let dxp = doc.evaluate(xp, doc, null, XPathResult.ANY_TYPE, null );
			let a;
			if (dxp && (a = dxp.iterateNext()))
				bir[recType] = a.textContent;
		}
		bir['Статус_bool'] = bir['Статус'] && bir['Статус'].startsWith('Действующая')

		dsec = doc.querySelector('bir-company-overview div.company-overview-status__registration-date meta');
		bir['Зарегистрирована'] = dsec.content;
		dsec = doc.querySelector('div.company-main__contacts div.company-main__contacts__address a');
		bir['Адрес'] = '';
		if (dsec) {
			bir['Адрес'] = String(dsec.textContent + nextValidSibling(dsec, true).textContent).trim();
		}
		dsec = doc.querySelector('div.company-main__contacts');
		let contactDetails = {
			'email': "//bir-icon-text[@itemprop='email']//a",
			'тел': "//bir-icon-text[@itemprop='telephone']//a",
			'сайт': "//bir-icon-text[@itemprop='url']//a",
			'Адрес недостоверен': "//bir-warnings-list//div[contains(@class, 'container__warning')]"
		};
		for (const [recType, xp] of Object.entries(contactDetails)) {
			let dxp = dsec.ownerDocument.evaluate(xp, dsec, null, XPathResult.ANY_TYPE, null );
			let a;
			if (dxp && (a = dxp.iterateNext()))
				bir[recType] = a.textContent;
		}

		// let dxp = dsec.ownerDocument.evaluate("//bir-icon-text[@itemprop='email']", dsec, null, XPathResult.ANY_TYPE, null );
		// if (dxp) {
		// 	bir['email'] = dxp.iterateNext().querySelector('a').textContent;
		// }

		dsec = doc.querySelector('bir-company-overview div.overview-layout__content__main');
		// Полное наименование, наименовение на латинице, орг. форма и т.д.
		dsec.querySelectorAll('noindex div.company-main__names__name__title').forEach((el) => {
			let n = el.textContent.slice(0, -1);
			let val = el.parentNode.nextElementSibling.textContent;
			bir[n] = val;
		})

		bir['Благонадежность'] = doc.querySelector('div.ranged-card__content__value').textContent;
		// var score_desc = doc.querySelector('div.ranged-card__content__value-description__legend__value').textContent;
		bir['Кредитоспособность'] = doc.querySelector('bir-widget-ranged-card.company-overview__credit').querySelector('div.ranged-card__content__value').textContent;
		
		dsec = doc.querySelector('bir-company-size div.company-size > div.company-size__content');
		// bir['Размер компании'] = dsec.querySelector('a.company-size__content__value').textContent
		// bir['Тип компании'] = dsec.ownerDocument.evaluate("//span[preceding::div[text()='Тип компании']]", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext().textContent;
		// bir['Численность сотрудников'] = dsec.ownerDocument.evaluate("//span[preceding::div[text()='Численность сотрудников']]", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext().textContent;
		dsec.querySelectorAll('div.company-size__content__title').forEach( (el) => {
			bir[el.textContent] = el.nextElementSibling.textContent;
		})

		dsec = doc.querySelector('bir-company-authorized-capital > div.company-card-widget');
		bir['Уставный капитал'] = dsec.querySelector('div.company-card-widget__value').textContent.trim();

		dsec = doc.querySelector('bir-company-tax-mode.company-overview__tax > div.company-card-widget');
		bir['Режим налогообложения'] = dsec.querySelector('div.company-card-widget__value').textContent.trim();

		// dsec = doc.querySelector('bir-company-chiefs div.company-main__controlling-persons');
		dsec = doc.querySelector('bir-widget-okveds.company-overview__okveds');
		let okved = {'Основной':[], 'Дополнительные':[]};
		let okved_main = dsec.ownerDocument.evaluate("//header[text()='Основной']", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext();
		if (okved_main) {
			okved['Основной'] = [okved_main.nextElementSibling.textContent, okved_main.nextElementSibling.nextElementSibling.textContent]
		}
		let okved_dop = dsec.ownerDocument.evaluate("//header[text()='Дополнительные']", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext();
		if (okved_dop) {
			let el = okved_dop;
			while (el = el.nextElementSibling) {
				let a1= el.textContent;
				el = el.nextElementSibling;
				let a2 = el.textContent;
				okved['Дополнительные'].push([a1,a2]);
			}
		}
		bir['ОКВЭД'] = okved;

		return bir;
	}).catch(function (err) {
		console.warn('BIR by ID. Something went wrong.', err);
	});

}
