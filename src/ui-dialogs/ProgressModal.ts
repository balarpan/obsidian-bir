import { App, Modal } from 'obsidian';

export class ProgressModal extends Modal {
	private progTitle: string;

	constructor(app: App, private progTitle: string = 'Подождите..', preventOpen: boolean = false) {
		super(app);
		this.progTitle = progTitle;
		const div = this.contentEl.createEl('div', {cls: 'bir_progress_modal_cnt'});
		div.createEl('span', {text:this.progTitle});
		div.createEl('div', {cls: 'bir_progress_inf_cnt'}).createEl('div', {cls: 'bir_progress_inf'});
		if (!preventOpen)
			this.open();
	}

	// onClose() { this.open(); }
}
