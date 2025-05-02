import { App, Notice, normalizePath, TFile, TFolder } from "obsidian";

/** Abstrcat class for any type of record: Person, Product or Project 
 * TODO: add class for Company Note 
 * */
export class AbstractRecordNote {
	private app: App;
	private myPlugin: BirPlugin;
	private templatesDir: string;
	readonly tempalteDialogFName : string;

	constructor(app: App, birPlugin: BirPlugin) {
		this.app = app;
		this.myPlugin = birPlugin;
		this.templatesDir = "/" + birPlugin.manifest.dir + "/resources/templates";
	}

	async addManually(): Promise<bool> {
		if (!this.isTemplaterEnabled()) {
			new Notice("Для использования шаблонов необходим установленный и запущенный\nTemplater!", 5000);
			return false;
		}
		const srcTemplate = this.templatesDir + "/" + this.tempalteDialogFName;
		if ( !(await this.createFolder(this.myPlugin.settings.personsFolder)) ) {
			new Notice(`Ошибка создания каталога ${this.myPlugin.settings.personsFolder}!`, 3000);
			return false;
		}
		const tmpNoteName = "tmp_note_tpl.md";
		const tmpNoteFile = this.app.vault.getAbstractFileByPath(this.myPlugin.settings.personsFolder + "/" + tmpNoteName);
		if (tmpNoteFile){
			//Temporarily file exists. Try to delete them.
			await app.vault.delete(tmpNoteFile, true); 
		}
		this.app.vault.adapter.read(srcTemplate).then( async (tplContent) => {
			if (!tplContent.length) {
				new Notice("Ошибка чтения файла шаблона!", 3000);
				console.log("Ошибка чтения шаблона", srcTemplate);
			} else {
				const templater = this.getTemplater();
				if (!templater) {
					new Notice("Не найден Templater!");
					return false;
				}
				await templater.create_new_note_from_template(tplContent, this.myPlugin.settings.personsFolder, tmpNoteName, true);
			}
		});
	}

	/** Create appropriate record based on provided properties */
	async AddByProperties( inProps: {}): Promise<bool> {
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

	/** Reformat company name and return safe string to put into Note. I.e. remove any occurrence of '"' and move property form to the end of name. */
	companyCleanName(name: string): string { return name.replace(this.myPlugin.settings.formOfPropertyRegexp, '$2 $1'); }
	sanitizeName(t: string): string { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_'); }

	/** Search in valut Company Record and return Frontmatter of this Note */
	async getCompanyNoteByTaxID(in_taxID: string): Promise<{}> {
		console.log("in_taxID.length", in_taxID.length, in_taxID)
		if (!in_taxID.length == 10)
			return {};
		// enumerate Companies and check that we have a file in the path not a folder with ".md" in the name
		// takes into account that in settings folders begin with '/', i.e. '/Companies'
		const cFiles = this.app.vault.getAllLoadedFiles().filter(i => 'path' in i && 
		 	i.path.startsWith(this.myPlugin.settings.companiesFolder.slice(1)) && 
		 	i.path.endsWith("_HQ.md") && 
		 	this.app.vault.getAbstractFileByPath(i.path) instanceof TFile
		 );
		let companiesData = [];
		for (const noteTFile of cFiles) {
			// let frm = this.app.vault.metadataCache.getFileCache(noteTFile)?.frontmatter || {};
			try {
				const frm = await this.app.fileManager.processFrontMatter(noteTFile, (frm) => {
					if ( frm.record_type && frm.taxID && 'company_HQ' == frm.record_type && frm.taxID == in_taxID) {
						companiesData.push( Object.assign(
							{},
							{filePath: noteTFile.path, filename: noteTFile.basename},
							frm));
					}
				});
			} catch (err) {
				return {};
			}
		}
		return companiesData.length == 1 ? companiesData[0] : {};
	}

	public getPathTemplateDir(): string {
		const path = "/" + this.myPlugin.manifest.dir + "/resources/templates";
		return path;
	}


}