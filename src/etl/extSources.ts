import { App, Notice, PluginManifest, TFile, TFolder, normalizePath } from 'obsidian';
import { BirSettings } from "./src/settings/SettingsTab"
import { requestUrl } from "obsidian";
import { ETL_BIR } from './ETL_BIR';
import { EGRULNalogRuETL } from './EgrulNalogRU';

export class ExternalRegistry {
	private app: App;
	private manifest: PluginManifest;
	private settings: BirSettings;
	private etl: Object;
	private egrul: EGRULNalogRuETL;
	constructor(app: App, manifest: PluginManifest, settings: BirSettings) {
		this.app = app;
		this.manifest = JSON.parse(JSON.stringify(manifest)); // deep copy for safety reasons
		this.settings = settings;
		// TODO: add more external source modules
		// if ('BIR' === settings.extServiceName)
		// 	this.etl = new ETL_BIR(this.app, this.manifest, this.settings);
		this.etl = new ETL_BIR(this.app, this.settings);
		if ('EGRUL' === settings.extServiceName)
			this.egrul = this.obj;
		else
			this.egrul = new EGRULNalogRuETL(this.app, this.settings);
	}

	/**
	 * Search company in exrternal Registry
	 *
	 * @param      {string}                  searchTxt  The search text
	 * @return     {Promise<Array<Object>>}  Array with several properties of the found companies, including ID
	 */
	async searchCompany(searchTxt: string): Promise<Array<Object>> {
		return this.etl.searchCompany(searchTxt);
	}

	/**
	 * Get the company data by ID of current ETL Module.
	 *
	 * @param      {string}     in_ID   Company ID in ETl Module
	 * @return     {Promise<{}>}  The company data dictionary or false if
	 *                            something goes wrong.
	 */
	async getCompanyDataByID(in_ID: string): Promise<Object> {
		return this.etl.getCompanyDataByID(in_ID);
	}

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
	 * @param      {Object}          compData          Dictionary of company data
	 *                                               (from ETL module)
	 * @param      {string}        insideFolderPath  Note will be created inside
	 *                                               this folder
	 * @return     {Promise<boo>}  This promise will be resolved to true or
	 *                             false, based on result of internal processes.
	 */
	async createCompanyNote(compData: Object, insideFolderPath: string): Promise<boolean> {
		const cname = compData['Наименование'].replace(this.settings.formOfPropertyRegexp, '$2 $1');
		const folderPath = insideFolderPath + "/Россия/" + sanitizeName(cname);
		if ( !(await this.createFolder(folderPath)) ) {
			new Notice(`Ошибка создания каталога ${folderPath}!`, 3000);
			return false;
		}
		await this.createFolder(folderPath + "/docs/" + moment().format("YYYY"));
		await this.createFolder(folderPath + "/_media");
		const notePath = normalizePath(folderPath + "/" + sanitizeName(cname + "_HQ") + ".md");
		// const file = app.vault.getAbstractFileByPath(notePath);
		const noteTFile = await app.vault.create(notePath, "");
		const res = await this.runCompanyTemplate(noteTFile, compData);
		if (res) {
			new Notice(`Создана заметка \n${sanitizeName(cname)}`, 5000);
		} else {
			return false;
		}

		//Open in active view
		if (this.settings.openAfterCreation) {
			const active_leaf = this.app.workspace.getLeaf(false);
			if (active_leaf) {
				await active_leaf.openFile(noteTFile, {state: { mode: "source" }, });
			}
		}
		return true;
	}

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
		const note = await this.app.vault.cachedRead(compNote);
		if (taxID)
			compData['ИНН'] = taxID;
		let startPos = note.match(/^## Детальные сведения об организации\s+$/m);
		if (!startPos.index)
			return compData;
		startPos = startPos.index;
		let noteVarsStr = note.slice(startPos);
		let pMatch;
		let pRegexp;

		// At first process string with 3 props in row: ИНН, ОГРН, ОКПО
		let innStr = /^(\*\*ИНН\*\*:: .*)\n/m.exec(noteVarsStr);
		if (innStr) {
			// all other props should be at followed lines
			startPos = innStr.index + innStr[1].length;
			innStr = noteVarsStr.slice(innStr.index, innStr.index + innStr[1].length);
			noteVarsStr = noteVarsStr.slice(startPos);
			pRegexp = /\s*\*\*(\S+)\*\*:: (\d+)\s?/g;
			while ((pMatch = pRegexp.exec(innStr)) !== null) {
				const key = pMatch[1];
				if (!compData.hasOwnProperty(key))
					compData[key] = pMatch[2];
			}
		}

		// Example regexp:  /- \*\*Полное наименование\*\*:: (.*)\n/g
		pRegexp = /\s*-\s+\*\*([^:\*]+)\*\*:: (.*)\n/g;
		while ((pMatch = pRegexp.exec(noteVarsStr)) !== null) {
			const key = pMatch[1];
			if (!compData.hasOwnProperty(key))
				compData[key] = pMatch[2];
		}
		return compData;
	}

	async downloadEGRULexcerptByTaxID(taxID: string): Promise<ArrayBuffer> | Promise<undefined> {
		return this.egrul.downloadEGRULbyTaxID(taxID);
	}

	/** Note: Company without 'ОКОПФ' record is treated as HQ (not a branch, etc.) */
	private isCompanyBranch(compData: Object): boolean {
		const branchOKOPF = ['30001', '30002', '30003', '30004'];
		return compData['ОКОПФ'] && branchOKOPF.some( (i)=> compData['ОКОПФ'].startsWith(i)) ? true : false;
	}


	async getLinkedPersonsForTaxID(taxID: string): Promise<Array> {
		return this.etl.getlinkedPersonsViaTaxID(taxID);
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
		const compData = await this.getCompanyFromNote(compNote);
		// Same TaxID. No need for code below
		// if (isCompanyBranch(compData)) {
		// 	if (!compData['ИНН'])
		// 		return [];
		// 	compData = await this.getHQforTaxID(compData['ИНН']);
		// 	if (!compData || !compData.length || isCompanyBranch(compData)) {
		// 		new Notice("Не удалось найти запись в реестре об открытой компании.", 4000);
		// 		return [];
		// 	}
		// }
		
		return compData['ИНН'] ? this.getlinkedPersonsViaTaxID(compData['ИНН']) : [];

	}

	/** Get company itself, not a company branch */
	async getHQforTaxID(taxID: string): Promise<Object> {
		return taxID.length === 10 ? await this.etl.getHQforTaxID(taxID) : {};
	}

	async getBranchesForTaxID(taxID: string): Promise<Array> {
		return this.etl.getBranchesForTaxID(taxID);
	}
	async getBranchesForNote(compNote: TFile): Promise<Array> {
		if (!this.isFileExists(compNote))
			return [];
		const compData = await this.getCompanyFromNote(compNote);
		return compData['ИНН'] ? this.getBranchesForTaxID(compData['ИНН']) : [];
	}

	getPathToCompanyTemplateDir(): string {
		return "/" + this.manifest.dir + "/resources/templates";
	}
	getPathToCompanyTemplate(): string {
		return this.getPathToCompanyTemplateDir() + "/new_company_HQ_tpl.md";
	}
	isFileExists(target: string | TFile): bool {
		const path = (typeof target === "string") ? normalizePath(target) : target.path;
		const tfile = this.app.vault.getFileByPath(path);
		if (tfile && (tfile instanceof TFile))
			return true;
		return false;
	}
	isFolderExists(target: string | TFile): bool {
		const path = (typeof target === "string") ? normalizePath(target) : target.path;
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

	private isTemplaterEnabled(): boolean {return this.app?.plugins?.enabledPlugins?.has("templater-obsidian");}
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

	async runCompanyTemplate(noteFile: TFile, compData: dict): Promise<boolean> {
		if (!this.isTemplaterEnabled()) {
			new Notice("Для использования шаблонов необходим установленный и запущенный\n Templater!", 3000);
			return false;
		}
		const templatePath = this.getPathToCompanyTemplate();
		return this.app.vault.adapter.read(templatePath).then( async (tplContent) => {
			if (!tplContent.length) {
				new Notice("Ошибка чтения файла шаблона!", 3000);
				console.log("Ошибка чтения шаблона", templatePath);
			} else {
				const tplContentPack = this.getCompanyTplHeader(compData) + tplContent;
				let modified = await this.runTemplater(tplContentPack, noteFile);
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
				const notallowed = Array.prototype.concat.call(
					['ОКВЭД', 'ИНН', 'ОГРН', 'ОКПО', 'Статус_bool', 'Благонадежность', 'Кредитоспособность', 'parentCompany'],
					dopCodesKeys);
				let data2 = Object(compData);
				data2 = Object.keys(compData)
				.filter(key => !notallowed.includes(key))
				.reduce((obj, key) => { obj[key] = data2[key]; return obj; }, {});

				const dopCodes = dopCodesPrint(compData);
				modified += "\n\n## Детальные сведения об организации\n\n";
				modified += ['ИНН', 'ОГРН', 'ОКПО'].map((key) => {
					return key in compData ? `**${key}**:: ${compData[key]} ` : '';
				}).join(' ') + '\n\n';
				modified += Object.entries(data2).map(([key, value]) => `- **${key}**:: ${value}`).join('\n');
				modified += dopCodes.length ? '\n - **Дополнительные коды**:\n' + dopCodes : '';
				modified += okved.length ? '\n\n### ОКВЭД\n' + okved + '\n' : '';
				await this.app.vault.modify(noteFile, modified);

				return true;
			}
		});
	}

	private getCompanyTplHeader(compData: dict): string {
		const name = compData['Наименование'].replace(this.settings.formOfPropertyRegexp, '$2 $1').replaceAll('"', '');
		const okopf_sub = ['30001', '30002', '30003', '30004'];
		const recordType = this.isCompanyBranch(compData) ? 'companyOffice' : 'company_HQ';
		// const name = compData['Наименование'].replace(/^(АО |ООО |ПАО )/g, '').replaceAll('"', '');
		let ret: string = `<%*
function sanitizeName(t) { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/gi,'_').replace(/_+/g, '_');}
const recordType = "${recordType}";
var pname = "${name}";
const pnameCln = sanitizeName(pname);
var country = "Россия";
const titleName = pnameCln + "_HQ";
const shortName = "${compData['Наименование'].replaceAll('"','\\\"')}";
const shortNameEscaped = shortName.replaceAll('"','\\\"');
const fullNameTitle = "${compData['Полное наименование'].replaceAll('"','\\\"')}";
const companyAddress = "${compData['Адрес'] ? compData['Адрес'].replaceAll('"','\\\"') : ''}";
const companyStatus = "${compData['Статус'] ? compData['Статус'].replaceAll('"','\\\"') : ''}";
const parentCompany = "${compData['Вышестоящая организация'] ? compData['Вышестоящая организация'].replaceAll('"','\\\"') : ''}";
const tagsString =  country ? "Company/" + country + "/" + pnameCln  : "Company/" + pnameCln;
const taxID = "${compData['ИНН'] ? compData['ИНН'] : ''}"`;
		ret += "\n-%>";
		return ret;
	}

}

/** prevent * " \ / < > : | ? in file name */
export function sanitizeName(t) {
	return t.replaceAll(" ","_")
		.replace(/[&\/\\#,+()$~%.'":*?<>{}]/gi,'_')
		.replace(/^_+/g, '')
		.replace(/_+$/g, '')
		.replace(/_+/g, '_');
}
