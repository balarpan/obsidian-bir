import { App, Notice, TFile, TFolder} from 'obsidian';
import { requestUrl } from "obsidian";
import { AbstractETL } from "./AbstractETL";


/** ETL module to get data from БИР Аналитик system. */
export class ETL_BIR extends AbstractETL {
	readonly companyBriefURL = 'https://site.birweb.1prime.ru/company-brief/';
	readonly BIRconfigURL = 'https://site.birweb.1prime.ru/runtime-config.json';
	BIRconfigService: Promise;

	constructor(app: App, settings: BirSettings) {
		super(app, settings);
		this.BIRconfigService = requestUrl({url: this.BIRconfigURL, method: "GET"});
	}

	async getBIRconfig(): Promise<Dict> {
		return new Promise((resolve, reject) => {
			this.BIRconfigService.then((resp) => {
				resolve(resp.json);
			}).catch((err) => {
				new Notice("Error fetching config for BIR Service. Further work will be difficult or impossible.", 7000);
				console.log("Error fetching config for BIR Service. Further work will be difficult or impossible.");
				reject(err);
			});
		});
	}

	async getBIRSearchURL(): Promise<string> | Promise<undefined> {
		const birServices = await this.getBIRconfig();
		return (birServices && birServices?.searchApiUrl?.length) ? birServices.searchApiUrl : undefined;
	}

	private async _searchCompany(searchTxt: string): Promise<Array<Object>> | Promise<undefined> {
		const srchValue = searchTxt;
		try {
			const searchApiUrl = await this.getBIRSearchURL();
			if (!searchApiUrl)
				throw new Error("BIR Service URL is Invalid!");
			const searchURL = searchApiUrl + '/v2/FullSearch?skip=0&take=20&term=';

			const res = await requestUrl({url: searchURL + encodeURIComponent(srchValue), method: 'GET'});
			if ( !res || !res.json )
				return undefined;
			let found = await res.json;
			//clean HTML tags from full and short names
			found = found.filter(  i => i?.inn && i?.shortName ).map( item => {
				var div = document.createElement("div");
				div.innerHTML = item.shortName;
				item.shortName = div.textContent || div.innerText || "";
				div.innerHTML = item.fullName;
				item.fullName = div.textContent || div.innerText || "";
				div.innerHTML = item.suspendDate;
				item.suspendDate = div.textContent || div.innerText || "";
				return item;
			})
			this.searchCache.set(srchValue, found);
			return found;

		} catch (err) {
			new Notice("Ошибка поиска компании...\n" + err.message, 5000);
			console.log('Error searching company. Error is: ', err.message);
			return undefined;
		}
	}

	async getHQforTaxID(taxID: string): Promise<Object> {
		let candidates;
		try {
			candidates = (await this.searchCompany(taxID)).filter((i) => i.objectType === "Company" && stripHTMLTags(i.inn) === taxID);
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

	private async _getCompanyDataByID(birID: string): Promise<Object> {
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
		return requestUrl({url: url, method: "GET"}).then(function (response) {
			return response.text;
		}).then(function (html: string) {
			// Convert the HTML string into a document object
			let parser = new DOMParser();
			let doc = parser.parseFromString(html, 'text/html');
			let dsec;

			let bir = {'Cтрана': 'Россия'};

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

	async getlinkedPersonsViaTaxID(taxID: string): Promise<Array> {
		try {
			const searchApiUrl = await this.getBIRSearchURL();
			if (!searchApiUrl)
				throw new Error("BIR Service URL is Invalid!");
			const searchURL = searchApiUrl + '/v2/FullSearch?skip=0&subjectType=0&take=20&term=' + taxID;
			let searchRes = await requestUrl({url: searchURL, method: 'GET'}).json;
			const companies = searchRes.filter((item) => ("Company" == item.objectType && stripHTMLTags(item.inn) == taxID) );
			if (!companies.length)
				return [];
			const companyIDs = companies.map((i) => i.id);
			const candidateFilter = (linkedPos) => linkedPos.filter(
				(pos) => pos.linkedCompanies && pos.linkedCompanies.filter((cp) => companyIDs.includes(cp.companyId)).length
				);

			searchRes = await requestUrl({
				url: searchApiUrl + '/v2/FullSearch?skip=0&subjectType=1&take=20&term=' + taxID,
				method: 'GET'
			}).json;
			const candidates = searchRes.filter(
				(item) => ("Person" == item.objectType && item?.linkedPositions && candidateFilter(item?.linkedPositions))
				);
			let persons = [];
			for (let pers of candidates) {
				const positions_set = new Set( pers.linkedPositions.map((pos) => pos.position) );
				persons.push({
					fullName: pers.fullName,
					birID: pers.id,
					inn: stripHTMLTags(pers.inn),
					positions: Array.from(positions_set),
					// companyFullName: company.fullName,
					companyTaxID: taxID,
					country: 'Россия',
				});
			}
			return persons;
		} catch (error) {
			console.error("Error getting BIR config params. Stopping", error);
			return [];
		}
	}

	async getBranchesForTaxID(taxID: string): Promise<Array> {
		try {
			const searchApiUrl = await this.getBIRSearchURL();
			if (!searchApiUrl)
				throw new Error("BIR Service URL is Invalid!");
			const searchURL = searchApiUrl + '/v2/FullSearch?skip=0&subjectType=0&take=20&term=' + taxID;
			let searchRes = await requestUrl({url: searchURL, method: 'GET'}).json;
			const companies = searchRes.filter((item) => ("Company" == item.objectType && stripHTMLTags(item.inn) == taxID) );
			if (!companies.length || companies.length === 1)
				return [];
			const companiesData = await Promise.all( companies.map( async (i) => await this.getCompanyDataByID(i.id)) );
			if (!companiesData.filter((i) => !this.isCompanyBranch(i)).length)
				return [];
			const parentData = companiesData.filter((i) => !this.isCompanyBranch(i))[0];
			const candidates = companiesData.filter((i) => this.isCompanyBranch(i)).map((i) => {i.parentCompany = parentData; return i;});

			return candidates;
		} catch (error) {
			console.error("Error getting BIR config params. Stopping", error);
			return [];
		}

	}
}

const stripHTMLTags = (str) => str.replace(/<[^>]*>/g, "");