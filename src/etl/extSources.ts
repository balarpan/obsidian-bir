import { App, Notice, PluginManifest, TFile, TFolder} from 'obsidian';
import { BirSettings } from "./src/settings/SettingsTab"
import { requestUrl } from "obsidian";

export class ExternalRegistry {
	private app: App;
	private manifest: PluginManifest;
	private settings: BirSettings;
	constructor(app: App, manifest: PluginManifest, settings: BirSettings) {
		this.app = app;
		this.manifest = JSON.parse(JSON.stringify(manifest)); // deep copy for safety reasons
		this.settings = settings;
	}

	/**
	 * Search company in exrternal Registry
	 *
	 * @param      {string}                  searchTxt  The search text
	 * @return     {Promise<Array<Object>>}  Array with several properties of the found companies, including ID
	 */
	async searchCompany(searchTxt: string): Promise<Array<Object>> {}

	/**
	 * Get the company data by ID of current ETL Module.
	 *
	 * @param      {string}     in_ID   Company ID in ETl Module
	 * @return     {Promise<{}>}  The company data dictionary or false is
	 *                          something goes wrong.
	 */
	async getCompanyDataByID(in_ID: string): Promise<Object>

	/**
	 * Creates a company note by their id in current ETL module.
	 *
	 * @param      {string}         company_id        The compnay identifier in ETL module,
	 * 													for example returned from this.searchCompany().
	 * @param      {string}         insideFolderPath  Create note insside this folder
	 * @return     {Promise<boolean>}  { description_of_the_return_value }
	 */
	async createCompanyNoteByID(company_id: string, insideFolderPath: string): Promise<boolean> {
		const compData = await this.getCompanyDataByID(company_id);
		if (!compData)
			return false;
		return this.createCompanyNote(compData, insideFolderPath);
	}

	/**
	 * Creates a company note.
	 *
	 * @param      {dict}          compData          Dictionary of compnay data
	 *                                               (from ETL module)
	 * @param      {string}        insideFolderPath  Note will be created inside
	 *                                               this folder
	 * @return     {Promise<boo>}  This promise will be resolved to true or
	 *                             false, based on result of internal processes.
	 */
	async createCompanyNote(compData: dict, insideFolderPath: string): Promise<boolean> {}

	/**
	 * Fill Company propreties from previously created Company Note
	 *
	 * @param      {TFile}            compNote  TFile object that points to the Note in Obsidian Vault
	 * @return     {Promise<Object>}  Dictionary of Company properties.
	 */
	async getCompanyFromNote(compNote: TFile): Promise<Object> {
		if (!this.isFileExists(compNote))
			return {};
		let compData = {};
		const meta = this.app.metadataCache.getFileCache(compNote);
		const taxID = meta?.frontmatter?.taxID;
		const recordType = meta?.frontmatter?.record_type;
		if (!recordType || !['company_HQ', 'companyOffice'].includes(recordType))
			return {};
		const note = await this.app.cachedRead(compNote);
		let regexp = {}
		[
			'ОГРН', 'ОКПО',
			'Полное наименование', 'Сокращенное наименование', 'Наименование', 'Зарегистрирована',
			'Адрес', 'email', 'Наименование на латинице', 'Организационно-правовая форма', 'Размер компании',
			'Тип компании', 'Численность сотрудников', 'Уставный капитал', 'Режим налогообложения'
		].forEach( (i) => regexp[i]=new RegExp(`- \*\*${i}\*\*:: (.*)\n`), "i");
		// const regexp = {
		// 	'fullName': /- \*\*Полное наименование\*\*:: (.*)\n/ig,
		// 	'shortName': /- \*\*Сокращенное наименование\*\*:: (.*)\n/ig,
		// 	'Наименование': /- \*\*Наименование\*\*:: (.*)\n/ig,
		// 	'Зарегистрирована': /- \*\*Зарегистрирована\*\*:: (.*)\n/ig,
		// 	'Адрес': /- \*\*Адрес\*\*:: (.*)\n/ig,
		// 	'Адрес': /- \*\*Адрес\*\*:: (.*)\n/ig,
		// }
		let startPos = note.match(/^## Детальные сведения об организации\s+$/m);
		if (!startPos.index)
			return compData;
		startPos = startPos.index;
		const noteVarsStr = note.slice(startPos);
		let pMatch;
		// Example regexp:  /- \*\*Полное наименование\*\*:: (.*)\n/ig
		const pRegexp = /-\s+\*\*([^:\*]+)\*\*:: (.*)\n/ig;
		while ((pMatch = pRegexp.exec(noteVarsStr)) !== null) {
			const key = pMatch[1];
			if (!compData.hasOwnProperty(key))
				compData[key] = pMatch[2];
		}
		
	}

	/**
	 * Get all relevant persons for existing Company Note.
	 *
	 * @param      {TFile}           compNote  TFile object that points to the Note in Obsidian Vault
	 * @return     {Promise<Array>}  Dictionary of found persons with their properties
	 */
	async getLinkedPersonsForNote(compNote: TFile): Promise<Array> {
		if (!this.isFileExists(compNote))
			return [];
	}

	getPathToComapnyTemplateDir(): string {
		return "/" + this.manifest.dir + "/resources/templates";
	}
	getPathToComapnyTemplate(): string {
		return this.getPathToComapnyTemplateDir() + "/new_company_HQ_tpl.md";
	}
	isFileExists(target: string | TFile): bool {
		const path = (target instanceof string) ? normalizePath(target) : target.path;
		const tfile = this.app.vault.getAbstractFileByPath(path);
		if (tfile && (tfile instanceof TFIle))
			return true;
		return false;
	}
	isFolderExists(target: string | TFile): bool {
		const path = (target instanceof string) ? normalizePath(target) : target.path;
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (folder && (folder instanceof TFolder))
			return true;
		return false;
	}

	/** Create folder by path. If intermediate folders do not exist, they will also be created. */
	async createFolder(folderPath: string): Promise<boolean> {
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
	private async runTemplater(templateStr: string, dstFile: TFile): string {
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

	async runCompanyTemplate(noteFile: TFile, compData: dict): Promise {
		if (!this.isTemplaterEnabled()) {
			new Notice("Для использования шаблонов необходим установленный и запущенный Templater!", 3000);
			return false;
		}
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
				function okvedPrint(obj): string { return obj.map(function(e, i){return '> - ' + e[0] + ' - ' + e[1]}).join('\n');}
				function dopCodesPrint(obj): string { let ret =''; for(const k of dopCodesKeys) ret += '    - **' + k + '**:: ' + obj[k] + '\n'; return ret;}
				if (compData['ОКВЭД']) {
					okved += compData['ОКВЭД']['Основной'] ? "\n> [!info] Основной\n" + okvedPrint(compData['ОКВЭД']['Основной']) + "\n" : '';
					okved += compData['ОКВЭД']['Дополнительные'] ? "\n> [!info]- Дополнительный\n" + okvedPrint(compData['ОКВЭД']['Дополнительные']) + "\n" : '';
				}
				const dopCodesKeys = ['ОКАТО', 'ОКТМО', 'ОКФС', 'ОКОГУ', 'ОКОПФ'].filter( (k)=> compData.hasOwnProperty(k));
				const notallowed = Array.prototype.concat.call( ['ОКВЭД', 'ИНН', 'ОГРН', 'ОКПО', 'Статус_bool', 'Благонадежность', 'Кредитоспособность'], dopCodesKeys);
				let data2 = Object(compData);
				data2 = Object.keys(compData)
				.filter(key => !notallowed.includes(key))
				.reduce((obj, key) => { obj[key] = data2[key]; return obj;
				}, {});

				const dopCodes = dopCodesPrint(compData);
				modified += "\n\n## Детальные сведения об организации\n\n";
				modified += ['ИНН', 'ОГРН', 'ОКПО'].map((key) => {
					return key in compData ? `**${key}**:: ${compData[key]} ` : '';
				}).join(' ') + '\n\n';
				modified += Object.entries(data2).map(([key, value]) => `- **${key}**:: ${value}`).join('\n');
				modified += dopCodes.length ? '\n - **Дополнительные коды**:\n' + dopCodes : '';
				modified += okved.length ? '\n\n### ОКВЭД\n' + okved + '\n' : '';
				await self.app.vault.modify(noteFile, modified);

				return true;
			}
		});
	}

	private getCompanyTplHeader(compData: dict): string {
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

}