import { App, Notice, TFile, TFolder} from 'obsidian';
import { requestUrl } from "obsidian";
import { AbstractETL, FIFO_TTL } from "./AbstractETL";

export class EGRULNalogRuETL extends AbstractETL {
	private cachePDF: FIFO_TTL<string, ArrayBuffer>;
	private cacheSearch: FIFO_TTL<string, Array>;
	readonly mainURL = 'https://egrul.nalog.ru/';
	private mainCookiePromise: Promise<string>;
	private mainCookie: string;
	private mainCookieExpires: number;
	private readonly mainCookieTTL: number = 1000 * 60 * 60 * 1; // 1 hour

	constructor(app: App, settings: BirSettings) {
		super(app, settings);
		this.mainCookiePromise = this.getMyCookie();
		this.mainCookiePromise.then( (resp) => {this.mainCookie = resp; this.mainCookieExpires = Date.now() + this.mainCookieTTL; } );
		// FIFO queue for 20 records and TTL = 4 hours
		this.cachePDF = new FIFO_TTL<string, ArrayBuffer>(20, 1000 * 60 * 60 * 4 );
		this.cacheSearch = new FIFO_TTL<string, ArrayBuffer>(20, 1000 * 60 * 60 * 4 );
	}

	async getMyCookie(): Promise<string> {
		if (this.mainCookie)
			if (Date.now() >= this.mainCookieExpires )
				this.mainCookie = undefined;
			else
				return Promise.resolve(this.mainCookie);
		return await requestUrl({url:this.mainURL + 'index.html', method: "GET"}).then((response) => {
			const cook = response.headers['set-cookie'][0].split(';')[0].split('=');
			const val = `${cook[0]}=${cook[1]}`;
			this.mainCookie = val; this.mainCookieExpires = Date.now() + this.mainCookieTTL;
			return val;
		});
	}

	async mainSearchRequest(srchTxt: string): Promise<Array> {
		const cached = this.cacheSearch.get(srchTxt);
		if (cached)
			return Promise.resolve(cached);
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
				url: this.mainURL + 'search-result/' + res1.t + '?r=' + tm + '&_=' + tm,
				method: 'GET',
				headers: {
					'Cookie': cookie + '; uniI18nLang=RUS',
					'Accept': 'application/json, text/javascript, */*; q=0.01'
				},
			}
			const res2 = await requestUrl(params2).json;
			const ret = res2.rows.map( (i) => this.mapSearchToStandardKeys(i));
			this.cacheSearch.set(srchTxt, ret);
			return ret;
		} catch (err) {
			console.log("Error happens when fetching egrul. ", err);
			console.log(JSON.stringify(err));
			new Notice("Error fetching from egrul.nalog.ru");
		}
	}

	async downloadEGRULbyTaxID(taxID: string): Promise<ArrayBuffer> | Promise<undefined> {
		let entity;
		if ( 10 !== taxID.length || !(entity = await this.mainSearchRequest(taxID)) || 1 !== entity.length || !entity[0].id)
			return Promise.resolve(undefined);
		return this.downloadEGRULbyID(entity[0].id);
	}

	async downloadEGRULbyID(id: string): Promise<ArrayBuffer> | Promise<undefined> {
		const cached = this.cachePDF.get(id);
		if (cached)
			return Promise.resolve(cached);
		const cookie = await this.getMyCookie();
		
		const url1 = this.mainURL + 'vyp-request/' + encodeURIComponent(id);
		try {
			const res1 = await requestUrl({url: url1, method: 'GET', headers: {'Cookie': cookie + '; uniI18nLang=RUS'}}).json;
			if (!res1?.t)
				return;
			const url2 = this.mainURL + 'vyp-download/' + encodeURIComponent(res1.t);
			const res2 = await requestUrl({url: url2, method: 'GET', headers: {'Cookie': cookie + '; uniI18nLang=RUS'}});
			if ('application/pdf' == res2.headers['content-type']) {
				this.cachePDF.set(id, res2.arrayBuffer);
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
