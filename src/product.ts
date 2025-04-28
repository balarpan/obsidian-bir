import { App, Notice, TFile, TFolder, normalizePath, PluginManifest, DataAdapter } from "obsidian";

export class Product {
	private app: App;
	private myPlugin: BirPlugin;
	private templatesDir: string;
	readonly tempalteDialogFName = "new_product_tpl_dialog.md";

	constructor(app: App, birPlugin: BirPlugin) {
		this.app = app;
		this.myPlugin = birPlugin;
		this.templatesDir = "/" + birPlugin.manifest.dir + "/resources/templates";
	}

	async addManually(): Promise<bool> {
		if (!this.isTemplaterEnabled()) {
			new Notice("Для использования шаблонов необходим установленный и запущенный Templater!", 3000);
			return false;
		}
		const srcTemplate = this.templatesDir + "/" + this.tempalteDialogFName;
		if ( !(await this.createFolder(this.myPlugin.settings.personsFolder)) ) {
			new Notice(`Ошибка создания каталога ${this.myPlugin.settings.personsFolder}!`, 3000);
			return false;
		}
		const tmpNoteName = "tmp_person_tpl.md";
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

	private isTemplaterEnabled(): bool {return this.app?.plugins?.enabledPlugins?.has("templater-obsidian");}
	private getTemplater() {
		const plugObj = this.app.plugins.plugins["templater-obsidian"];
		if (!plugObj)
			return undefined;
		//@ts-ignore
		return plugObj?.templater;
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

}