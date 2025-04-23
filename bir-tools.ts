export class BIR {
	readonly quickURL = 'https://svc-5024.birweb.1prime.ru/v2/QuickSearch?term=';
	readonly companyBriefURL = 'https://site.birweb.1prime.ru/company-brief/';
	// readonly http = require('https');

	constructor(app: App) {
		this.app = app;
	}

	async birSearch(searchTxt: string): Promise<array> {
		const srchValue = searchTxt;
		if (!srchValue.length || 2>srchValue.length ) {
			new Notice("Укажите как минимум три символа для начала поиска!")
			new SampleModal(this.app).open("Укажите как минимум три символа для начала поиска!");
			return [];
		}

		try {
			const res = await fetch(this.quickURL + encodeURIComponent(srchValue));
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
			return found;

		} catch (err) {
			console.log(err.message);
			return [];
		}	

	}

}

/** helper function for parsing HTML DOM **/
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


/** Get Company info from BIR according to provided ID **/
export async function birGetByID(birID: string): Promise<dict> {
	const url = 'https://site.birweb.1prime.ru/company-brief/' + encodeURIComponent(birID);

	// We use Obsidian function requestUrl to overcome CORS problem.
	// See https://forum.obsidian.md/t/make-http-requests-from-plugins/15461/12
	//
	return requestUrl({url: url,cmethod: "GET"}).then(function (response) {
		console.debug(url);
		console.debug("got in response", response);
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

		// dsec = doc.querySelector('bir-company-chiefs div.company-main__controlling-persons');
		dsec = doc.querySelector('bir-widget-okveds.company-overview__okveds');
		let okved = {'Основной':[], 'Дополнительные':[]};
		let okved_main = dsec.ownerDocument.evaluate("//header[text()='Основной']", dsec, null, XPathResult.ANY_TYPE, null ).iterateNext();
		if (okved_main) {
			okved['Основной'] = [okved_main.nextElementSibling.textContent, okved_main.nextElementSibling.nextElementSibling.textContent]
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
	});

}
