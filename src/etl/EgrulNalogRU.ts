import { App, Notice, TFile, TFolder} from 'obsidian';
import { requestUrl } from "obsidian";
import { AbstractETL } from "./AbstractETL";

export class EGRULNalogRuETL extends AbstractETL {
	readonly mainURL = 'https://egrul.nalog.ru/';
	private mainCookiePromise: Promise<string>;
	private mainCookie: string;

	constructor(app: App, settings: BirSettings) {
		super(app, settings);
		this.mainCookiePromise = this.getMyCookie();
		this.mainCookiePromise.then( (resp) => {this.mainCookie = resp;} );
	}

	async getMyCookie(): Promise<string> {
		if (this.mainCookie)
			return this.mainCookie;
		return await requestUrl({url:this.mainURL + 'index.html', method: "GET"}).then((response) => {
			const cook = response.headers['set-cookie'][0].split(';')[0].split('=');
			return `${cook[0]}=${cook[1]}`;
		});
	}

	async mainSearchRequest(srchTxt: string): Promise<Array> {
		const cookie = await this.getMyCookie();

		const params1 = {
			url:this.mainURL,
			method: 'POST',
			headers: {
				'Cookie': cookie + '; uniI18nLang=RUS',
				'Accept': 'application/json, text/javascript, */*; q=0.01'
			},
			contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			body: 'vyp3CaptchaToken=&page=&query=' + encodeURIComponent(srchTxt) +'&nameEq=on&region=&PreventChromeAutocomplete=',
		}
		try {
			const res1 = await requestUrl(params1).json;	

			const tm = new Date().getTime();
			const params2 = {
				url:this.mainURL+'search-result/'+res1.t+'?r='+tm+'&_='+tm,
				method: 'GET',
				headers: {
					'Cookie': cookie + '; uniI18nLang=RUS',
					'Accept': 'application/json, text/javascript, */*; q=0.01'
				},
			}
			const res2 = await requestUrl(params2).json;
			return res2.rows.map( (i) => this.mapSearchToStandardKeys(i));
		} catch (err) {
			console.log("Error happens when fetching egrul. ", err);
			console.log(JSON.stringify(err));
			new Notice("Error fetching from egrul.nalog.ru");
		}
	}

	async downloadEGRULbyID(id: string): Promise<ArrayBuffer> | Promise<undefined> {
		const cookie = await this.getMyCookie();
		
		const url1 = this.mainURL + 'vyp-request/' + encodeURIComponent(id);
		try {
			const res1 = await requestUrl({url: url1, method: 'GET', headers: {'Cookie': cookie + '; uniI18nLang=RUS'}}).json;
			if (!res1?.t)
				return;
			const url2 = this.mainURL + 'vyp-download/' + encodeURIComponent(res1.t);
			const res2 = await requestUrl({url: url2, method: 'GET', headers: {'Cookie': cookie + '; uniI18nLang=RUS'}});
			console.log("pdf res2", res2);
			if ('application/pdf' == res2.headers['content-type']) {
				return res2.arrayBuffer;
			}
			return;
		} catch (err) {
			console.log("Error happens when downloading egrul PDF. for id " + id, err);
			console.log(JSON.stringify(err));
			new Notice("Error fetching PDF from egrul.nalog.ru");
		}
	}

	private mapSearchToStandardKeys(inp: Object): Object {
		const i = JSON.parse(JSON.stringify(inp));
		const z = {
			c: 'Сокращенное наименование',
			n: 'Полное наименование',
			g: 'Руководитель',
			i: 'ИНН', o: 'ОГРН',
			// p: 'КПП',
			// r: 'Дата присвоения ОГРН',
			rn: 'Регион',
			t: 'id'
		}
		let r = {}
		for (const [key1, key2] of Object.entries(z)) {
			if (i.hasOwnProperty(key1))
				r[key2] = i[key1];
		}
		r['Статус'] = i.hasOwnProperty('e') ?  'Прекратила деятельность ' + i.e : 'Действующая на ' + moment().format('DD.MM.YYYY');
		r['Статус_bool'] = !(i.e && i.e?.length);
		return r;
	}

	// Override this
	private async _getCompanyDataByID(birID: string): Promise<Object> {
	}

	// Override this
	private async _searchCompany(searchTxt: string): Promise<Array<Object>> {
	}

	// Override this
	async getHQforTaxID(taxID: string): Promise<Object> {
	}

	// Override this
	async getlinkedPersonsViaTaxID(taxID: string): Promise<Array> {
	}

	// Override this
	async getBranchesForTaxID(taxID: string): Promise<Array> {
	}
}
