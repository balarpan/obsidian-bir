import { App, Notice, TFile, TFolder} from 'obsidian';
import { requestUrl } from "obsidian";
import { AbstractETL } from "./AbstractETL";

export class EGRULNalogRuETL extends AbstractETL {
	readonly mainURL = 'https://egrul.nalog.ru/';
	private mainCookiePromise: Promise<string>;
	private mainCookie: Array;

	constructor(app: App, settings: BirSettings) {
		super(app, settings);
		this.mainCookiePromise = this.getMyCookie();
		this.mainCookiePromise.then( (resp) => {this.mainCookie = resp;} );
	}

	async getMyCookie(): Promise<string> {
		return await requestUrl({url:this.mainURL + 'index.html', method: "GET"}).then((response) => {
			const cook = response.headers['set-cookie'][0].split(';')[0].split('=');
			return `${cook[0]}=${cook[1]}`;
		});
	}


	async mainSearchRequest(srchTxt: string): Promise {
		await Promise.all( [this.mainCookiePromise] );

		const params1 = {
			url:this.mainURL,
			method: 'POST',
			headers: {
				'Cookie': this.mainCookie + '; uniI18nLang=RUS',
				'Accept': 'application/json, text/javascript, */*; q=0.01'
			},
			contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			body: 'vyp3CaptchaToken=&page=&query=' + encodeURIComponent(srchTxt) +'&nameEq=on&region=&PreventChromeAutocomplete=',
		}
		try {
			const res1 = await requestUrl(params1).json;	
			console.log("res1", res1);

			const tm = new Date().getTime();
			const params2 = {
				url:this.mainURL + 'search-result/'+res1.t+'?r='+time+'&_='+time,
				method: 'GET',
				headers: {
					'Cookie': this.mainCookie + '; uniI18nLang=RUS',
					'Accept': 'application/json, text/javascript, */*; q=0.01'
				},
			}
			const res2 = await requestUrl(params2).json;	
			console.log("res2", res2);
		} catch (err) {
			console.log("Error happens when fetching egrul. ", err);
			console.log(JSON.stringify(err));
			new Notice("Error fetching from egrul.nalog.ru");
		}
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
