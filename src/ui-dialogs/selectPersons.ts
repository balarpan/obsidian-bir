import { App, Notice, SuggestModal } from 'obsidian';

interface personCandidate {
  fullName: string;
  inn: string;
  positions: []
}

export class selectPersonsDlg extends SuggestModal<personCandidate> {
	private candidates: personCandidate[];
	private sendItem = {itemType: "sendBtn", fullName: ''};
	private sendCtrl;
	private onSubmit: (result: []) => void;

	constructor(app: App, candidates: []) {
		super(app);
		this.candidates = [this.sendItem].concat(candidates);
		this.setPlaceholder("Выберите интересующие персоны");
		this.retPromise = new Promise((resolve) => { return this.getSelectedCandidates(true); });
	}

	getSuggestions(query: string): personCandidate[] {
		return this.candidates.filter((pers) => pers.fullName.toLowerCase().includes(query.toLowerCase()));
	}

	renderSuggestion(person: personCandidate, el: HTMLElement) {
		if ( person.itemType && person.itemType === 'sendBtn') {
			const cont = el.createEl('div', {cls: 'bir_personCandidate_cnt sendBtn'});
			this.sendCtrl = cont.createEl('div', { text: 'Создать', cls:'sendBtnDisabled'});
		} else {
			const cont = el.createEl('div', {cls: person.itemSelected ? 'bir_personCandidate_cnt selected' : 'bir_personCandidate_cnt'});
			cont.createEl('div', { text: person.fullName, cls: 'bir_personCandidate_title'});
			cont.createEl('div', { text: person.positions.join(', '), cls: 'bir_personCandidate_iteminfo'});
			cont.createEl('small', { text: '  ИНН: ' + (person.inn ? person.inn : ''), cls: 'bir_personCandidate_iteminfo'});
			person.htmlEl = cont;
		}
	}

	selectSuggestion(person: personCandidate, evt: MouseEvent | KeyboardEvent) {
		if (person.itemType && person.itemType == 'sendBtn') {
			if (!this.getSelectedCandidates().length)
				return;
			this.close();
			this.onChooseSuggestion(person, evt);
		} else {
			person.htmlEl.classList.toggle('selected');
			person.itemSelected = person.htmlEl.classList.contains('selected');
		}
		this.getSelectedCandidates().length ? this.sendCtrl.classList.remove('sendBtnDisabled') : this.sendCtrl.classList.add('sendBtnDisabled');
	}

	onChooseSuggestion(person: personCandidate, evt: MouseEvent | KeyboardEvent) {
		new Notice(`Selected ${this.getSelectedCandidates().map( i => i.fullName).join("\n")}`);
		if ( this.onSubmit )
			this.onSubmit(this.getSelectedCandidates(true));
	}

	getSelectedCandidates(cleanInternalProps: bool = false): [] {
		const sel = this.candidates.filter( (item) => item.itemSelected);
		if ( cleanInternalProps ) {
			const newSel = JSON.parse(JSON.stringify(sel));
			return newSel.map( item => {
				delete item.itemSelected;
				delete item.htmlEl;
				return item;
			});
		} else {
			return sel;
		}
	}
	open(onSubmit: (result: []) => void) {
		super.open();
		this.onSubmit = onSubmit;
	}
}