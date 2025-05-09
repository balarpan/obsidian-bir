import { App, Notice, SuggestModal } from 'obsidian';


class AbstractMultiselectDlg<T> extends SuggestModal<T> {
	private candidates: Array<T>;
	private sendItem = {itemType: "sendBtn"};
	private sendCtrl;
	private onSubmit: (result: []) => void;

	constructor(app: App, candidates: Array<T>) {
		super(app);
		// this.candidates = [this.sendItem].concat(candidates);
		this.candidates = candidates;
		this.setPlaceholder("Выберите интересующие значения");
		this.retPromise = new Promise((resolve) => { return this.getSelectedCandidates(true); });
	}

	getSuggestions(query: string): Array<T> {
		return [this.sendItem].concat(this._getSuggestions(query));
	}
	
	// Override this
	_getSuggestions(query: string): Array<T> {
		return [];
	}
	renderSuggestion(item: T, el: HTMLElement) {
		if ( item.itemType && item.itemType === 'sendBtn') {
			const cont = el.createEl('div', {cls: 'bir_personCandidate_cnt sendBtn'});
			this.sendCtrl = cont.createEl('div', { text: 'Создать', cls:'sendBtnDisabled'});
		} else {
			this._renderSuggestion(item, el);
		}
	}

	// Override this
	_renderSuggestion(item: T, el: HTMLElement) {}

	// Override this
	_getSelectedCandidates(cleanInternalProps: bool = false): [] {
	}

	selectSuggestion(item: T, evt: MouseEvent | KeyboardEvent) {
		if (item.itemType && item.itemType == 'sendBtn') {
			if (!this.getSelectedCandidates().length)
				return;
			this.close();
			this.onChooseSuggestion(item, evt);
		} else {
			item.htmlEl.classList.toggle('selected');
			item.itemSelected = item.htmlEl.classList.contains('selected');
		}
		this.getSelectedCandidates().length ? this.sendCtrl.classList.remove('sendBtnDisabled') : this.sendCtrl.classList.add('sendBtnDisabled');
	}

	onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent) {
		if ( this.onSubmit )
			this.onSubmit(this.getSelectedCandidates(true));
	}

	getSelectedCandidates(cleanInternalProps: bool = false): [] {
		return this._getSelectedCandidates(cleanInternalProps);
	}
	
	open(onSubmit: (result: []) => void) {
		super.open();
		this.onSubmit = onSubmit;
	}

}


interface personCandidate {
  fullName: string;
  inn: string;
  positions: []
}

export class SelectPersonsDlg extends AbstractMultiselectDlg<personCandidate> {
	_getSuggestions(query: string): Array<personCandidate> {
		return this.candidates.filter((pers) => pers.fullName.toLowerCase().includes(query.toLowerCase()));
	}

	_renderSuggestion(item: personCandidate, el: HTMLElement) {
		const cont = el.createEl('div', {cls: item.itemSelected ? 'bir_personCandidate_cnt selected' : 'bir_personCandidate_cnt'});
		cont.createEl('div', { text: item.fullName, cls: 'bir_personCandidate_title'});
		cont.createEl('div', { text: item.positions.join(', '), cls: 'bir_personCandidate_iteminfo'});
		cont.createEl('small', { text: '  ИНН: ' + (item.inn ? item.inn : ''), cls: 'bir_personCandidate_iteminfo'});
		item.htmlEl = cont;
	}

	_getSelectedCandidates(cleanInternalProps: bool = false): [] {
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
}


interface branchCandidate {
  Вышестоящая организация: string;
  Зарегистрирована: string;
  Наименование: string;

  Статус_bool: boolean;
}

export class SelectBranchesDlg extends AbstractMultiselectDlg<branchCandidate> {
	_getSuggestions(query: string): Arrayh<branchCandidate> {
		return this.candidates.filter((i) => i['Наименование'].toLowerCase().includes(query.toLowerCase()));
	}

	_renderSuggestion(item: branchCandidate, el: HTMLElement) {
		const cont = el.createEl('div', {cls: item.itemSelected ? 'bir_personCandidate_cnt selected' : 'bir_personCandidate_cnt'});
		cont.createEl('div', { text: item['Наименование'], cls: 'bir_personCandidate_title'});
		cont.createEl('div', {
			text: (item['Зарегистрирована'] ? 'Зарегистрирована ' + item['Зарегистрирована'] : ''),
			cls: 'bir_personCandidate_iteminfo'});
		cont.createEl('small', {
			text: (!item['Статус_bool'] ? 'Недействующая' : 'Действующая'),
			cls: 'bir_personCandidate_iteminfo'});
		item.htmlEl = cont;
	}

	_getSelectedCandidates(cleanInternalProps: bool = false): [] {
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
}
