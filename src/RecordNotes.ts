import { normalizePath } from 'obsidian';
import { AbstractRecordNote } from './AbstractRecordNote.ts';

/** Person Note */
export class Person extends AbstractRecordNote {
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
		const folderPath = this.myPlugin.settings.personsFolder;
		if ( !(await this.createFolder(folderPath)) ) {
			new Notice(`Ошибка создания каталога ${folderPath}!`, 3000);
			return false;
		}
		await this.createFolder(folderPath + "/_media");
		const ename = this.sanitizeLite(props.fullName);
		const noteFName = "@" + ename + (props.companyName ? ' ' + this.sanitizeLite(props.companyName) : '');
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
				if (this.myPlugin.settings.openAfterCreation) {
					const active_leaf = this.app.workspace.getLeaf(false);
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
const companyName = ${props.companyName ? '"' + sanitizeLite(props.companyName) + '"' : 'null'};
const companyNoteFile = ${props.companyFileName ? '"' + props.companyFileName + '"' : 'null'};
const titleName = "@" + ename + (companyName ? ' ' + companyName : '');
const tagStr = ${props.companyName ? '"Company/'  + (props.companyCountry ? props.companyCountry+'/' : '') + sanitizeName(props.companyName) + '"' : null};
const countryResidence = ${props.countryResidence ? '"' + props.countryResidence + '"' : 'null'};
const company = ${props.companyName ? '"' + props.companyName + '"' : 'null'};
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
export class Product extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_product_tpl_dialog.md";
}

/** Project Note */
export class Project extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_project_tpl_dialog.md";
}