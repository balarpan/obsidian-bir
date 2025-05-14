import { App, Notice, TFile, TFolder} from 'obsidian';
import { requestUrl } from "obsidian";
import { AbstractETL } from "./AbstractETL";

export class EGRULNalogRuETL extends AbstractETL {
	readonly mainURL = 'https://egrul.nalog.ru/index.html';
	private mainCookiePromise: Promise<string>;
	private mainCookie: Array;

	constructor(app: App, settings: BirSettings) {
		super(app, settings);
		this.mainCookiePromise = this.getMyCookie();
		this.mainCookiePromise.then( (resp) => {this.mainCookie = resp;} );
	}

	async getMyCookie(): Promise<string> {
		return await requestUrl({url:this.mainURL, cmethod: "GET"}).then((response) => {
			return response.headers['set-cookie'][0].split(';')[0].split('=');
		});
	}

	async mainSearchRequest(srchTxt: string): Promise {
		await Promise.all( [this.mainCookiePromise] );

		const params = {
			url:this.mainURL,
			cmethod: 'POST',
			headers: new Record<string, string>(this.mainCookie[0], this.mainCookie[1]),
			body: JSON.stringify({
				vyp3CaptchaToken: '',
				page: '',
				query: srchTxt,
				region: '',
				PreventChromeAutocomplete: ''
			}),
		}
		const ret1 = (await requestUrl(params)).json;
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
