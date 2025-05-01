import { App, Notice, TFile, TFolder, normalizePath, PluginManifest, DataAdapter } from "obsidian";

export class BIR {
	readonly quickURL = 'https://svc-5024.birweb.1prime.ru/v2/QuickSearch?term=';
	readonly fullSearchURL = 'https://svc-5024.birweb.1prime.ru/v2/FullSearch?skip=0&take=20&term=';
	readonly companyBriefURL = 'https://site.birweb.1prime.ru/company-brief/';
	readonly BIRconfigURL = 'https://site.birweb.1prime.ru/runtime-config.json';
	BIRconfigService: Promise;

	// readonly http = require('https');

	constructor(app: App, birPlugin: BirPlugin) {
		this.app = app;
		this.myPlugin = birPlugin;
		this.BIRconfigService = requestUrl({url: this.BIRconfigURL,cmethod: "GET"});
	}

	async getBIRconfig(): Promise<Dict> {
		return new Promise((resolve, reject) => {
			this.BIRconfigService.then((resp) => {resolve(resp.json);}).catch((err) => {reject(err);});
		});
	}

	/** Use native BIR quicksearch and show returned results */
	async birSearch(searchTxt: string): Promise<array> {
		const srchValue = searchTxt;
		if (!srchValue.length || 2>srchValue.length ) {
			new Notice("Укажите как минимум три символа для начала поиска!", 4000)
			return [];
		}

		try {
			const res = await fetch(this.fullSearchURL + encodeURIComponent(srchValue));
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

	async noteCompany_HQ(bir_id: string, insideFolderPath: string): Promise<bool> {
		const comp_data = await birGetByID(bir_id);
		if (!comp_data || comp_data.constructor != Object || !Object.keys(comp_data).length) {
			new Notice(`Ошибка при получении сведений о компании с id=${bir_id}`, 3000);
			return false;
		}

		// const cname = comp_data['Наименование'].replace(/^(АО |ООО |ПАО )/g, '');
		const cname = comp_data['Наименование'].replace(this.myPlugin.settings.formOfPropertyRegexp, '$2 $1');
		const folderPath = insideFolderPath + "/Россия/" + sanitizeName(cname);
		if ( !(await this.createFolder(folderPath)) ) {
			new Notice(`Ошибка создания каталога ${folderPath}!`, 3000);
			return false;
		}
		await this.createFolder(folderPath + "/docs/" + moment().format("YYYY"));
		await this.createFolder(folderPath + "/_media");
		const notePath = normalizePath(folderPath + "/" + sanitizeName(cname + "_HQ") + ".md");
		// const file = app.vault.getAbstractFileByPath(notePath);
		const file = await app.vault.create(notePath, "");
		const res = this.runCompanyTemplate(file, comp_data);
		if (res) { new Notice(`Создана заметка \n${cname}`, 5000); }

		//Open in active view
		if (this.myPlugin.settings.openAfterCreation) {
			const active_leaf = this.app.workspace.getLeaf(false);
			if (!active_leaf) { return; }
			await active_leaf.openFile(file, {state: { mode: "source" }, });
		}
	}

	isFolderExists(folderPath: string): bool {
		const vault = this.app.vault;
		const pathCln = normalizePath(folderPath);
		const folder = vault.getAbstractFileByPath(pathCln)
		if (folder && (folder instanceof TFolder)) {
			return true;
		}
		return false;
	}

	/** Create folder by path. If intermediate folders do not exist, they will also be created. */
	async createFolder(folderPath: string): Promise<bool> {
		const pathArr = normalizePath(folderPath).split('/');
		const pathParent = pathArr.slice(0, -1).join('/');
		if (pathParent.length && !this.isFolderExists(pathParent)) {
			await this.createFolder(pathParent);
		}
		const pathCln = normalizePath(pathArr.join('/'));
		if( this.isFolderExists(pathCln) ) { return true; }
		try {
			await this.app.vault.createFolder(pathCln);
		} catch(err) { return false; }
		return true;
	}

	private isTemplaterEnabled(): bool {return this.app?.plugins?.enabledPlugins?.has("templater-obsidian");}
	private getTemplater() {
		const plugObj = this.app.plugins.plugins["templater-obsidian"];
		if (!plugObj)
			return undefined;
		//@ts-ignore
		return plugObj?.templater;
	}

	/** run Templater plugin and return result as a string */
	async runTemplater(templateStr: string, dstFile: TFile): string {
		const templater = this.getTemplater();
		if (!templater) return '';

		return await (
			//@ts-ignore
			templater as {
				parse_template: (
					opt: { target_file: TFile; run_mode: number },
					content: string
				) => Promise<string>;
			}
		).parse_template({ target_file: dstFile, run_mode: 4 }, templateStr);
	}

	public getPathToComapnyTemplateDir(): string {
		const path = "/" + this.myPlugin.manifest.dir + "/resources/templates";
		return path;
	}
	public getPathToComapnyTemplate(): string {
		const path = this.getPathToComapnyTemplateDir() + "/new_company_HQ_tpl.md";
		return path;
	}

	async runCompanyTemplate(noteFile: TFile, compData: dict): Promise<bool> {
		if (!this.isTemplaterEnabled()) {
			new Notice("Для использования шаблонов необходим установленный и запущенный Templater!", 3000);
			return false;
		}
		const tplHeader = "<%*\n-%>";
		const templatePath = this.getPathToComapnyTemplate();
		const self = this;
		this.app.vault.adapter.read(templatePath).then( async (tplContent) => {
			if (!tplContent.length) {
				new Notice("Ошибка чтения файла шаблона!", 3000);
				console.log("Ошибка чтения шаблона", templatePath);
			} else {
				const tplContentPack = self.getCompanyTplHeader(compData) + tplContent;
				let modified = await self.runTemplater(tplContentPack, noteFile);
				if (compData['сайт'] && compData['сайт'].length) {
					modified = modified.replace('Официальный сайт: ', `Официальный сайт: https://${compData['сайт'].trim()}/`);
				}

				let okved = '';
				function okvedPrint(obj) { return obj.map(function(e, i){return '> - ' + e[0] + ' - ' + e[1]}).join('\n');}
				if (compData['ОКВЭД']) {
					okved += compData['ОКВЭД']['Основной'] ? "\n> [!info] Основной\n" + okvedPrint(compData['ОКВЭД']['Основной']) + "\n" : '';
					okved += compData['ОКВЭД']['Дополнительные'] ? "\n> [!info]- Дополнительный\n" + okvedPrint(compData['ОКВЭД']['Дополнительные']) + "\n" : '';
				}
				const notallowed = ['ОКВЭД', 'ИНН', 'ОГРН', 'ОКПО', 'Статус_bool', 'Благонадежность', 'Кредитоспособность'];
				let data2 = Object(compData);
				data2 = Object.keys(compData)
				.filter(key => !notallowed.includes(key))
				.reduce((obj, key) => { obj[key] = data2[key]; return obj;
				}, {});

				modified += "\n\n## Детальные сведения об организации\n\n";
				modified += ['ИНН', 'ОГРН', 'ОКПО'].map((key) => {
					return key in compData ? `**${key}**:: ${compData[key]} ` : '';
				}).join(' ') + '\n\n';
				modified += Object.entries(data2).map(([key, value]) => `- **${key}**:: ${value}`).join('\n');
				modified += okved.length ? '\n\n### ОКВЭД\n' + okved + '\n' : '';
				await self.app.vault.modify(noteFile, modified);

				return true;
			}
		});

		// const tplFile = this.app.vault.getAbstractFileByPath(templatePath);
		// if (!tplFile || !(tplFile instanceof TFile)) {
		// 	new Notice("Ошибка чтения файла шаблона!", 3000);
		// 	console.log("Ошибка шаблона", templatePath, tplFile);
		// 	console.log(this.app.vault.configDir)
		// 	return false;
		// }
		// const tplContent = await this.app.vault.read(tplFile);
		//Launch Templater plugin on our own template file and get result as string
		// const modified = await this.runTemplater(tplContent, noteFile);
		// await this.app.vault.modify(noteFile, modified);
	}

	getCompanyTplHeader(compData: dict): string {
		const name = compData['Наименование'].replace(this.myPlugin.settings.formOfPropertyRegexp, '$2 $1').replaceAll('"', '');
		// const name = compData['Наименование'].replace(/^(АО |ООО |ПАО )/g, '').replaceAll('"', '');
		let ret: string = `<%*
function sanitizeName(t) { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/gi,'_').replace(/_+/g, '_');}
var pname = "${name}";
const pnameCln = sanitizeName(pname);
var country = "Россия";
const titleName = pnameCln + "_HQ";
const shortName = "${compData['Наименование'].replaceAll('"','\\\"')}";
const fullNameTitle = "${compData['Полное наименование'].replaceAll('"','\\\"')}";
const companyAddress = "${compData['Адрес'] ? compData['Адрес'].replaceAll('"','\\\"') : ''}";
const companyStatus = "${compData['Статус'] ? compData['Статус'].replaceAll('"','\\\"') : ''}";
const tagsString =  country ? "Company/" + country + "/" + pnameCln  : "Company/" + pnameCln;
const taxID = "${compData['ИНН'] ? compData['ИНН'] : ''}"`;
		ret += "\n-%>";
		return ret;
	}

	async getlinkedPersonsViaTaxID(taxID: string): [] {
		try {
			const birServices = await this.getBIRconfig();
			const searchURL = birServices.searchApiUrl2 + '/v2/FullSearch?skip=0&take=20&term=' + taxID;
			const searchRes = await requestUrl({url: searchURL, cmethod: 'GET'}).json;
			let company = searchRes.filter((item) => (item.objectType == 0 && stripHTMLTags(item.inn) == taxID) );
			if (company.length !== 1 || !company[0]?.linkedPositions)
				return [];
			company = company[0];
			const companyID = company.id;
			const candidateFilter = (linkedPos) => linkedPos.filter(
				(pos) => pos.linkedCompanies && pos.linkedCompanies.filter((cp) => cp.companyId == companyID).length
				);
			const candidates = searchRes.filter(
				(item) => (item.objectType == 1 && item?.linkedPositions && candidateFilter(item?.linkedPositions))
				);
			let persons = [];
			for (let pers of candidates) {
				const positions_set = new Set( pers.linkedPositions.map((pos) => pos.position) );
				persons.push({
					fullName: pers.fullName,
					birID: pers.id,
					inn: pers.inn,
					positions: positions_set
				});
			}
			return persons;
		} catch (error) {
			console.error("Error getting BIR config params. Stopping", error);
			return [];
		}
	}
}

const stripHTMLTags = (str) => str.replace(/<[^>]*>/g, "");

/** prevent * " \ / < > : | ? in file name*/
function sanitizeName(t) {
	return t.replaceAll(" ","_")
		.replace(/[&\/\\#,+()$~%.'":*?<>{}]/gi,'_')
		.replace(/^_+/g, '')
		.replace(/_+$/g, '')
		.replace(/_+/g, '_');
}

/** Helper function for parsing HTML DOM **/
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


/**
 * Get Company info from BIR according to provided ID
 * @param  {string} birID - id of Company record in BIR Service
 * @return {Promise<dict>}
 */
export async function birGetByID(birID: string): Promise<dict> {
	const url = 'https://site.birweb.1prime.ru/company-brief/' + encodeURIComponent(birID);

	// We use Obsidian function requestUrl to overcome CORS problem.
	// See https://forum.obsidian.md/t/make-http-requests-from-plugins/15461/12
	//
	return requestUrl({url: url,cmethod: "GET"}).then(function (response) {
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
			okved['Основной'] = [[okved_main.nextElementSibling.textContent, okved_main.nextElementSibling.nextElementSibling.textContent]];
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
