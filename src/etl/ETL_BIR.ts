import { App, Notice, TFile, TFolder} from 'obsidian';
import { BirSettings } from "./src/settings/SettingsTab"
import { requestUrl } from "obsidian";


export class ETL_BIR {
	private app: App;
	private settings: BirSettings;
	private cacheCompByID = {};
	readonly companyBriefURL = 'https://site.birweb.1prime.ru/company-brief/';
	readonly BIRconfigURL = 'https://site.birweb.1prime.ru/runtime-config.json';
	BIRconfigService: Promise;
	private idCache: FIFO_TTL<number, Object>;
	private searchCache: FIFO_TTL<number, Object>;

	constructor(app: App, settings: BirSettings) {
		this.app = app;
		this.settings = settings;
		this.BIRconfigService = requestUrl({url: this.BIRconfigURL,cmethod: "GET"});

		//FIFO queue for 50 records and TTL = 2 hours
		this.idCache = new FIFO_TTL<number, Object>(50, 1000 * 60 * 60 * 2 );
		// 10 minutes for search requests
		this.searchCache = new FIFO_TTL<number, Object>(50, 1000 * 60 * 10 );
	}

	async getBIRconfig(): Promise<Dict> {
		return new Promise((resolve, reject) => {
			this.BIRconfigService.then((resp) => {resolve(resp.json);}).catch((err) => {reject(err);});
		});
	}

	async searchCompany(searchTxt: string): Promise<Array<Object>> {
		const srchValue = searchTxt;
		const cached = this.searchCache.get(srchValue);
		if (cached)
			return Promise.resolve(cached);
		if (!srchValue.length || 2>srchValue.length ) {
			new Notice("Укажите как минимум три символа для начала поиска!", 4000)
			return [];
		}

		const birServices = await this.getBIRconfig();
		const searchURL = birServices.searchApiUrl2 + '/v2/FullSearch?skip=0&take=20&term=';

		try {
			const res = await fetch(searchURL + encodeURIComponent(srchValue));
			let found = await res.json();
			//clean HTML tags from full and short names
			found = found.map( item => {
				var div = document.createElement("div");
				div.innerHTML = item.shortName;
				item.shortName = div.textContent || div.innerText || "";
				div.innerHTML = item.fullName;
				item.fullName = div.textContent || div.innerText || "";
				return item;
			})
			this.searchCache.set(srchValue, found);
			return found;

		} catch (err) {
			new Notice("Ошибка поиска компании...");
			console.log(err.message);
			return [];
		}
	}

	async getHQforTaxID(taxID: string): Promise<Object> {
		let candidates;
		try {
			candidates = (await this.searchCompany(taxID)).filter((i) => i.objectType === 0 && stripHTMLTags(i.inn) === taxID);
		} catch (err) {
			console.log("Error during searching company HQ", err);
			return {};
		}
		const entities = await Promise.all(
			candidates.map(async (i) => {return await this.getCompanyDataByID(i.id);})
			);
		const found = entities.filter( (i) => !this.isCompanyBranch(i));
		return found.length === 1 ? found[0] : {};
	}

	/** Note: Company without 'ОКОПФ' record is treated as HQ (not a branch, etc.) */
	private isCompanyBranch(compData: Object): boolean {
		const branchOKOPF = ['30001', '30002', '30003', '30004'];
		return compData['ОКОПФ'] && branchOKOPF.some( (i)=> compData['ОКОПФ'].startsWith(i)) ? true : false;
	}

	async getCompanyDataByID(in_ID: string): Promise<Object> {
		const cached = this.idCache.get(in_ID);
		if (cached)
			return Promise.resolve(cached);

		const ret = await this._getCompanyDataByID(in_ID);
		this.idCache.set(in_ID, ret);
		return ret;
	}

	async _getCompanyDataByID(birID: string): Promise<Object> {
		const url = this.companyBriefURL + encodeURIComponent(birID);

		/** Helper function for parsing HTML DOM **/
		function nextValidSibling(in_tag, incText=false) {
			//incText - do we detect Text Nodes too
			let acpType = incText ? [1,3] : [1];
			let tag = in_tag.nextSibling;
			while (tag) {
				if (acpType.indexOf(tag.nodeType) >= 0)
					return tag;
				tag = tag.nextSibling;
			}
			return;
		}

		// We use Obsidian function requestUrl to overcome CORS problem.
		// See https://forum.obsidian.md/t/make-http-requests-from-plugins/15461/12
		//
		return requestUrl({url: url,cmethod: "GET"}).then(function (response) {
			return response.text;
		}).then(function (html: string) {
			// Convert the HTML string into a document object
			let parser = new DOMParser();
			let doc = parser.parseFromString(html, 'text/html');
			let dsec;

			let bir = {};

			let parseStngs = {
				'Наименование': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//h1",
				'ИНН': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//div[contains(@class, 'brief-layout-header__info__codes')]//span[text()='ИНН:']/following-sibling::span",
				'ОГРН': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//div[contains(@class, 'brief-layout-header__info__codes')]//span[text()='ОГРН:']/following-sibling::span",
				'ОКПО': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//div[contains(@class, 'brief-layout-header__info__codes')]//span[text()='ОКПО:']/following-sibling::span",
				// 'ОКОПФ': "//bir-company-brief//bir-brief-layout//bir-company-header//bir-brief-layout-header//div[contains(@class, 'brief-layout-header__info__codes')]//span[text()='ОКОПФ:']/following-sibling::span",
				'Статус': "//bir-company-overview//bir-overview-layout//bir-company-status//div[contains(@class, 'company-overview-status__state')]//span"
			};
			for (const [recType, xp] of Object.entries(parseStngs)) {
				let dxp = doc.evaluate(xp, doc, null, XPathResult.ANY_TYPE, null );
				let a;
				if (dxp && (a = dxp.iterateNext()))
					bir[recType] = a.textContent;
			}
			bir['Статус_bool'] = bir['Статус'] && bir['Статус'].startsWith('Действующая')

			dsec = doc.querySelector('bir-company-overview div.company-overview-status__registration-date meta');
			bir['Зарегистрирована'] = dsec.content;
			dsec = doc.querySelector('div.company-main__contacts div.company-main__contacts__address a');
			bir['Адрес'] = '';
			if (dsec) {
				bir['Адрес'] = String(dsec.textContent + nextValidSibling(dsec, true).textContent).trim();
			}
			dsec = doc.querySelector('div.company-main__contacts');
			let contactDetails = {
				'email': "//bir-icon-text[@itemprop='email']//a",
				'тел': "//bir-icon-text[@itemprop='telephone']//a",
				'сайт': "//bir-icon-text[@itemprop='url']//a",
				'Адрес недостоверен': "//bir-warnings-list//div[contains(@class, 'container__warning')]"
			};
			for (const [recType, xp] of Object.entries(contactDetails)) {
				let dxp = dsec.ownerDocument.evaluate(xp, dsec, null, XPathResult.ANY_TYPE, null );
				let a;
				if (dxp && (a = dxp.iterateNext()))
					bir[recType] = a.textContent;
			}

			// let dxp = dsec.ownerDocument.evaluate("//bir-icon-text[@itemprop='email']", dsec, null, XPathResult.ANY_TYPE, null );
			// if (dxp) {
			// 	bir['email'] = dxp.iterateNext().querySelector('a').textContent;
			// }

			dsec = doc.querySelector('bir-company-overview div.overview-layout__content__main');
			// Полное наименование, наименовение на латинице, орг. форма и т.д.
			dsec.querySelectorAll('noindex div.company-main__names__name__title').forEach((el) => {
				let n = el.textContent.slice(0, -1);
				let val = el.parentNode.nextElementSibling.textContent;
				bir[n] = val;
			})
			if (!bir.hasOwnProperty('Полное наименование'))
				bir['Полное наименование'] = '';

			bir['Благонадежность'] = doc.querySelector('div.ranged-card__content__value').textContent;
			// var score_desc = doc.querySelector('div.ranged-card__content__value-description__legend__value').textContent;
			bir['Кредитоспособность'] = doc.querySelector('bir-widget-ranged-card.company-overview__credit').querySelector('div.ranged-card__content__value').textContent;
			
			dsec = doc.querySelector('bir-company-size div.company-size > div.company-size__content');
			// bir['Размер компании'] = dsec.querySelector('a.company-size__content__value').textContent
			// bir['Тип компании'] = dsec.ownerDocument.evaluate("//span[preceding::div[text()='Тип компании']]", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext().textContent;
			// bir['Численность сотрудников'] = dsec.ownerDocument.evaluate("//span[preceding::div[text()='Численность сотрудников']]", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext().textContent;
			dsec.querySelectorAll('div.company-size__content__title').forEach( (el) => {
				bir[el.textContent] = el.nextElementSibling.textContent;
			})

			dsec = doc.querySelector('bir-company-authorized-capital > div.company-card-widget');
			bir['Уставный капитал'] = dsec.querySelector('div.company-card-widget__value').textContent.trim();

			dsec = doc.querySelector('bir-company-tax-mode.company-overview__tax > div.company-card-widget');
			bir['Режим налогообложения'] = dsec.querySelector('div.company-card-widget__value').textContent.trim();

			dsec = doc.querySelector('bir-company-codes.company-overview__codes').querySelector('div.key-value-grid');
			if (dsec) {
				for (let elIndex=0; elIndex < dsec.children.length; elIndex++) {
					const el = dsec.children[elIndex];
					//need a pair of div elements, not an HTML comment, last child in HTMLCollection or etc.
					if (el.tagName != 'DIV' || elIndex == (dsec.children.length - 1) )
						continue;
					const key = el.textContent;
					elIndex += 1;
					while (elIndex < dsec.children.length && dsec.children[elIndex].tagName != 'DIV')
						elIndex += 1;
					const value = dsec.children[elIndex].textContent;

					if (!bir.hasOwnProperty(key))
						bir[key] = value;
				}
			}

			// dsec = doc.querySelector('bir-company-chiefs div.company-main__controlling-persons');
			dsec = doc.querySelector('bir-widget-okveds.company-overview__okveds');
			let okved = {'Основной':[], 'Дополнительные':[]};
			let okved_main = dsec.ownerDocument.evaluate("//header[text()='Основной']", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext();
			if (okved_main) {
				okved['Основной'] = [[okved_main.nextElementSibling.textContent, okved_main.nextElementSibling.nextElementSibling.textContent]];
			}
			let okved_dop = dsec.ownerDocument.evaluate("//header[text()='Дополнительные']", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext();
			if (okved_dop) {
				let el = okved_dop;
				while (el = el.nextElementSibling) {
					let a1= el.textContent;
					el = el.nextElementSibling;
					let a2 = el.textContent;
					okved['Дополнительные'].push([a1,a2]);
				}
			}
			bir['ОКВЭД'] = okved;

			return bir;
		}).catch(function (err) {
			console.warn('BIR by ID. Something went wrong.', err);
			return false;
		});
	}
}

const stripHTMLTags = (str) => str.replace(/<[^>]*>/g, "");

interface FIFO_TTL_item<V> {
	value: V;
	expiration: number;
}
/** FIFO with key-value items and expiring mechanism */
export class FIFO_TTL <K,V>{
	private readonly cache = new Map<K,FIFO_TTL_item<V>>();

	constructor(private readonly maxSize: number, private readonly  max_ttl_ms: number) {}
	public set(key: K, value: V) {
		const exp = Date.now() + this.max_ttl_ms;
		this.cache.delete(key);
		this.cache.set(key, { value, exp });
		if (this.maxSize < this.cache.size ) {
			const toDelete = this.cache.delete( this.cache.keys().next().value ); // Map object use FIFO under the hood.
			this.cache.delete(toDelete);
		}
	}

	public get(key: K): V | undefined { return this._get(key)?.value; }
	public get size(): number { return this.cache.size; }
	public get isEmpty(): boolean { return this.cache.size === 0; }
	public has(key: K): boolean { return !!this._get(key); }
	public delete(key: K): boolean { return this.cache.delete(key); }
	public clear() { this.cache.clear(); }

	private _get(key: K): FIFO_TTL_item<V> | undefined {
		const item = this.cache.get(key);
		const isExpired = item && item.expiration ? (Date.now() >= item.expiration) : false;
		if (!item || isExpired) {
			this.cache.delete(key);
			return undefined;
		}
		return item;
	}
}
