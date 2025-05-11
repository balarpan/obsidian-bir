import { normalizePath, TFolder } from 'obsidian';
import { AbstractRecordNote } from './AbstractRecordNote.ts';


/** Company Note */
export class CompanyRecord extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_company_HQ_tpl_dialog.md";
	readonly templateNewNoteFName = "new_company_HQ_tpl.md";
	readonly propsDefault = {fullName: null, shortName: null, inn: null, country: null, Наименование: null}
	readonly propsRequired_list = ['fullName', 'Наименование'];

	/** Note: if compData is a Branch of Company, then new Note will be created inside 'insideFolder' without creating additional subfolders */
	async AddByProperties(compData: {}, insideFolder: string | TFolder = undefined): Promise<boolean> {
		const insideFolderPath = insideFolder ? (insideFolder instanceof TFolder ? insideFolder.path : insideFolder) : this.settings.companiesFolder;
		const cname = this.companyNameFirst(compData['Наименование']);
		const isBranch: boolean = this.isCompanyBranch(compData);
		const folderPath = insideFolderPath + (isBranch ? '' : "/Россия/" + sanitizeName(cname));
		if ( !(await this.createFolder(folderPath)) ) {
			new Notice(`Ошибка создания каталога ${folderPath}!`, 3000);
			return false;
		}
		await this.createFolder(folderPath + "/docs/" + moment().format("YYYY"));
		await this.createFolder(folderPath + "/_media");
		const notePathSuffix = isBranch ? '_office' : '_HQ'
		const notePath = normalizePath(folderPath + "/" + sanitizeName(cname + notePathSuffix) + ".md");
		// const file = app.vault.getAbstractFileByPath(notePath);
		const noteTFile = await app.vault.create(notePath, "");
		const res = await this.runCompanyTemplate(noteTFile, compData);
		if (res) {
			const notice = () => new Notice(`Создана заметка \n${sanitizeName(cname)}`, 5000);
			//Open in active view
			if (this.settings.openAfterCreation) {
				const active_leaf = this.app.workspace.getLeaf( this.settings.openAfterCreationNewTab ? 'tab' : false);
				if (!active_leaf) { notice(); return true; }
				await active_leaf.openFile(noteTFile, {state: { mode: "source" }, });
			} else {
				notice();
			}
		} else {
			return false;
		}

		return true;
	}

	getPathToCompanyTemplate(): string {
		return this.getPathTemplateDir() + "/" + this.templateNewNoteFName;
	}

	/** Note: Company without 'ОКОПФ' record is treated as HQ (not a branch, etc.) */
	private isCompanyBranch(compData: Object): boolean {
		const branchOKOPF = ['30001', '30002', '30003', '30004'];
		return compData['ОКОПФ'] && branchOKOPF.some( (i)=> compData['ОКОПФ'].startsWith(i)) ? true : false;
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
				const notallowed = Array.prototype.concat.call( ['ОКВЭД', 'ИНН', 'ОГРН', 'ОКПО', 'Статус_bool', 'Благонадежность', 'Кредитоспособность'], dopCodesKeys);
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
		const name = this.companyNameFirst(compData['Наименование']).replaceAll('"', '');
		const parentCompanyName = compData['Вышестоящая организация']?.length ? this.companyNameFirst(compData['Вышестоящая организация']).replaceAll('"', '') : '';
		const okopf_sub = ['30001', '30002', '30003', '30004'];
		const isBranch = this.isCompanyBranch(compData);
		const recordType = isBranch ? 'companyOffice' : 'company_HQ';
		const country = compData['Cтрана'] ? compData['Cтрана'] : '';
		const tagStrPrefix = country ? "Company/" + country + "/" : "Company/";
		console.log("isBranch", isBranch);
		const tagStr = isBranch && parentCompanyName ? (tagStrPrefix + sanitizeName(parentCompanyName) + "/" + sanitizeName(name)) : (tagStrPrefix + sanitizeName(name))
		// const name = compData['Наименование'].replace(/^(АО |ООО |ПАО )/g, '').replaceAll('"', '');
		let ret: string = `<%*
function sanitizeName(t) { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/gi,'_').replace(/_+/g, '_');}
const recordType = "${recordType}";
var pname = "${name}";
const pnameCln = sanitizeName(pname);
var country = "${country}";
const titleName = pnameCln + "_HQ";
const shortName = "${compData['Наименование'].replaceAll('"','\\\"')}";
const shortNameEscaped = shortName.replaceAll('"','\\\"');
const fullNameTitle = "${compData['Полное наименование'].replaceAll('"','\\\"')}";
const companyAddress = "${compData['Адрес'] ? compData['Адрес'].replaceAll('"','\\\"') : ''}";
const companyStatus = "${compData['Статус'] ? compData['Статус'].replaceAll('"','\\\"') : ''}";
const parentCompany = "${parentCompanyName ? (sanitizeName(parentCompanyName) + '_HQ') : ''}";
const tagsString =  "${tagStr}";
const taxID = "${compData['ИНН'] ? compData['ИНН'] : ''}"`;
		ret += "\n-%>";
		return ret;
	}

}


/** Person Note */
export class PersonRecord extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_person_tpl_dialog.md";
	readonly templateNewNoteFName = "new_person_tpl.md";
	readonly propsDefault = {fullName: null, birID: null, inn: null, positions:[], country: null, companyName: null, companyTaxID: null}
	readonly propsRequired_list = ['fullName', 'companyTaxID'];

	async AddByProperties( inProps: {}): Promise<boolean> {
		let props = Object.assign({}, this.propsDefault, inProps);
		const isPropsValid: bool = this.propsRequired_list.filter((it) => inProps.hasOwnProperty(it)).length == this.propsRequired_list.length;
		if (!isPropsValid)
			return false;
		const companyProps = await this.getCompanyNoteByTaxID(inProps.companyTaxID);
		if (Object.keys(companyProps).length === 0)
			return false;
		props.companyName = companyProps.companyName;
		props.companyFileName = companyProps.filename;
		props.companyTaxID = companyProps.taxID;
		props.positions = props?.positions && props.positions.length ? props.positions : [];
		props.countryResidence = null; // Currently we do not have such info. Let's make sure we do not put false data into Note.
		props.companyCountry = companyProps.country;
		
		//creating new Note
		const folderPath = this.settings.personsFolder + (props.companyName && props.companyName.length ? '/' + sanitizeName(this.companyNameFirst(props.companyName)) : '');
		if ( !(await this.createFolder(folderPath)) ) {
			new Notice(`Ошибка создания каталога ${folderPath}!`, 3000);
			return false;
		}
		await this.createFolder(folderPath + "/_media");
		const ename = this.sanitizeLite(props.fullName);
		const cname = props.companyName ? sanitizeName( this.companyNameFirst(props.companyName) ) : '';
		const noteFName = "@" + ename + (cname ? ` ${cname}` : '');
		const notePath = normalizePath(folderPath + "/" + noteFName + ".md");
		const noteTFile = await app.vault.create(notePath, "");
		const tplHeader = this.getNewNoteTplHeader(props);
		return this.app.vault.adapter.read(this.getPathTemplateDir() + "/" + this.templateNewNoteFName).then( async (tplContent) => {
			if (!tplContent.length) {
				new Notice("Ошибка чтения файла шаблона!", 3000);
				console.log("Ошибка чтения шаблона", templatePath);
			} else {
				const tplContentPack = tplHeader + tplContent;
				let modified = await this.runTemplater(tplContentPack, noteTFile);
				await self.app.vault.modify(noteTFile, modified);

				//Open in active view
				if (this.settings.openAfterCreation) {
					const active_leaf = this.app.workspace.getLeaf(this.settings.openAfterCreationNewTab ? 'tab' : false);
					if (!active_leaf) { return true; }
					await active_leaf.openFile(noteTFile, {state: { mode: "source" }, });
				}

				return true;
			}

		});
	}

	sanitizeLite(t :string): string { return t.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}

	getNewNoteTplHeader(props: {}): string {
		const sanitizeName = this.sanitizeName;
		const sanitizeLite = this.sanitizeLite;
		let ret: string = `<%*
function sanitizeName(t) { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}
function sanitizeFIO(t) { return t.replace(/[&\/\\#,+()$~%.'":*?<>{}]/gi,'_').replace(/_+/g, '_');}
const ename = '${sanitizeLite(props.fullName)}';
const companyName = ${props.companyName ? '"' + props.companyName.replaceAll('"', '\\\"') + '"' : 'null'};
const companyNoteFile = ${props.companyFileName ? '"' + props.companyFileName + '"' : 'null'};
const titleName = "@" + ename + (companyName ? ' ' + companyName : '');
const tagStr = ${props.companyName ? '"Person/Company/'  + (props.companyCountry ? props.companyCountry + '/' : '') + sanitizeName(this.companyNameFirst(props.companyName).replaceAll('"', '')) + '"' : 'Person'};
const countryResidence = ${props.countryResidence ? '"' + props.countryResidence + '"' : 'null'};
const company = ${props.companyName ? '"' + sanitizeLite(props.companyName) + '"' : 'null'};
const taxID = ${props.inn ? '"' + props.inn + '"' : ''};
const companyTaxID = ${props.companyTaxID ? '"' + props.companyTaxID + '"' : 'null'};
const birID = ${props.birID ? '"' + props.birID + '"' : ''};
const positions = ${props.positions && props.positions.length ? '"' + props.positions.join(", ") + '"' : 'null'};
`;
		ret += "\n-%>";
		return ret;
	}

}

/** Product Note */
export class ProductRecord extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_product_tpl_dialog.md";
}

/** Project Note */
export class ProjectRecord extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_project_tpl_dialog.md";
}


/** prevent * " \ / < > : | ? in file name */
function sanitizeName(t) {
	return t.replaceAll(" ","_")
		.replace(/[&\/\\#,+()$~%.'":*?<>{}]/gi,'_')
		.replace(/^_+/g, '')
		.replace(/_+$/g, '')
		.replace(/_+/g, '_');
}
